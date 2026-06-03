import type { SupabaseClient } from "@supabase/supabase-js";
import {
  beds24LastNightToCheckout,
  isLikelyNumericRoomLabel,
  readBeds24ExternalRoomId,
  readBeds24String,
  toBeds24IsoDate,
  type Beds24JsonRecord,
} from "@/lib/beds24/booking-payload";
import { syncBeds24InventoryMinimumStay } from "@/lib/beds24/inventory-sync";
import {
  cancelReservationRowsByOriginalBookingId,
  finalizeCancelledBookingConsistency,
  findReservationRowsByOriginalBookingId,
} from "@/lib/beds24/reservation-lookup";
import { toOriginalReservationId, toStoredReservationId } from "@/lib/beds24/reservation-id";
import { recoverReservationRoomLabelById } from "@/lib/beds24/reservations-backfill";
import { resolveReservationStatusFromBeds24Record } from "@/lib/beds24/reservation-status";
import { extractBeds24RoomSyncFields, syncBeds24PropertyAndRoom } from "@/lib/beds24/room-sync";
import { normalizeReservationSource } from "@/lib/beds24/source-normalization";
import type { Database } from "@/types/database";

export type ProcessWebhookBookingResult =
  | {
      ok: true;
      mode:
        | "upserted"
        | "cancelled_existing_rows"
        | "cancelled_fallback_upsert"
        | "cancelled_no_local_row";
      sourceReservationId: string;
      originalReservationId: string;
      mappedStatus: Database["public"]["Enums"]["reservation_status"];
      reservationId?: string;
      updatedRows?: number;
      cleanedRows?: number;
      roomLabelResolvedFrom?: "payload" | "room_master" | "recovery" | "unknown_fallback";
      roomSync?: {
        propertyId: string | null;
        roomId: string | null;
        roomStatus: string | null;
        skipped: string[];
      };
    }
  | {
      ok: false;
      mode: "missing_required_fields" | "upsert_failed";
      sourceReservationId: string | null;
      missing?: string[];
      error?: string;
    };

function sanitizeRawPayload(value: unknown) {
  try {
    return JSON.parse(JSON.stringify(value)) as Database["public"]["Tables"]["reservations"]["Insert"]["raw_payload"];
  } catch {
    return {};
  }
}

async function resolveRoomLabel(params: {
  supabase: SupabaseClient<Database>;
  organizationId: string;
  payload: Beds24JsonRecord;
  syncFields: ReturnType<typeof extractBeds24RoomSyncFields>;
}) {
  const payloadRoomLabelRaw = readBeds24String(params.payload, [
    "unitName",
    "unit_name",
    "unitLabel",
    "unit_label",
    "roomName",
    "room_name",
    "roomLabel",
    "room",
  ]);
  const payloadRoomLabel =
    payloadRoomLabelRaw && !isLikelyNumericRoomLabel(payloadRoomLabelRaw) ? payloadRoomLabelRaw : null;

  const externalRoomId = readBeds24ExternalRoomId(params.payload) ?? params.syncFields.externalRoomId;
  let resolvedRoomLabel = payloadRoomLabel ?? params.syncFields.roomLabel;
  let resolvedFromValue: "payload" | "room_master" | "unknown_fallback" = payloadRoomLabel
    ? "payload"
    : "unknown_fallback";

  if (externalRoomId) {
    const existingRoomResult = await params.supabase
      .from("rooms")
      .select("room_label")
      .eq("organization_id", params.organizationId)
      .eq("external_room_id", externalRoomId)
      .limit(1)
      .maybeSingle();

    const existingRoom = existingRoomResult.data as { room_label: string } | null;
    if (existingRoom?.room_label) {
      resolvedRoomLabel = existingRoom.room_label;
      params.syncFields.roomLabel = existingRoom.room_label;
      params.syncFields.externalRoomId = externalRoomId;
      resolvedFromValue = "room_master";
    }
  }

  return {
    payloadRoomLabel,
    externalRoomId,
    resolvedRoomLabel,
    resolvedFromValue,
  };
}

async function deleteStaleRowsForSameBooking(params: {
  supabase: SupabaseClient<Database>;
  organizationId: string;
  originalId: string;
  keepReservationId: string;
  keepStoredReservationId: string;
}) {
  const relatedRows = await findReservationRowsByOriginalBookingId(
    params.supabase,
    params.organizationId,
    params.originalId,
  );

  for (const staleRow of relatedRows) {
    if (staleRow.id === params.keepReservationId) continue;
    if (staleRow.source_reservation_id === params.keepStoredReservationId) continue;

    const isUnknownRow =
      staleRow.room_label === "(unknown)" || staleRow.source_reservation_id.includes("::room::(unknown)");
    const isActiveDuplicate =
      staleRow.status === "confirmed" ||
      staleRow.status === "checked_in" ||
      staleRow.status === "checked_out";

    if (!isUnknownRow && !isActiveDuplicate) continue;

    console.warn("[beds24/webhook] dedup: deleting stale row for same booking", {
      staleId: staleRow.id,
      keptId: params.keepReservationId,
      originalId: params.originalId,
      staleSourceReservationId: staleRow.source_reservation_id,
      staleStatus: staleRow.status,
    });
    await params.supabase.from("reservations").delete().eq("id", staleRow.id);
  }
}

async function processCancelledWebhookBooking(params: {
  supabase: SupabaseClient<Database>;
  organizationId: string;
  sourceReservationId: string;
  originalReservationId: string;
  source: string;
  sanitizedPayload: Database["public"]["Tables"]["reservations"]["Insert"]["raw_payload"];
  payload: Beds24JsonRecord;
  storedRoomLabel: string;
  propertyName: string | null;
  guestName: string | null;
  checkInDate: string | null;
  checkOutDate: string | null;
  roomSync: {
    propertyId: string | null;
    roomId: string | null;
    roomStatus: string | null;
    skipped: string[];
  };
}): Promise<ProcessWebhookBookingResult> {
  const cancelledExisting = await cancelReservationRowsByOriginalBookingId({
    organizationId: params.organizationId,
    sourceReservationId: params.sourceReservationId,
    supabase: params.supabase,
    rawPayload: params.sanitizedPayload,
  });

  const finalized = await finalizeCancelledBookingConsistency({
    organizationId: params.organizationId,
    sourceReservationId: params.sourceReservationId,
    supabase: params.supabase,
    rawPayload: params.sanitizedPayload,
  });

  const hadLocalImpact =
    cancelledExisting.updatedRows > 0 ||
    finalized.activeCleaned > 0 ||
    finalized.staleRemoved > 0;

  if (hadLocalImpact) {
    return {
      ok: true,
      mode: "cancelled_existing_rows",
      sourceReservationId: params.sourceReservationId,
      originalReservationId: params.originalReservationId,
      mappedStatus: "cancelled",
      updatedRows: cancelledExisting.updatedRows + finalized.activeCleaned,
      cleanedRows: finalized.activeCleaned + finalized.staleRemoved,
      roomSync: params.roomSync,
    };
  }

  if (!params.checkInDate || !params.checkOutDate || !params.guestName || !params.propertyName) {
    console.warn("[beds24/webhook] cancel: sparse payload with no local rows", {
      sourceReservationId: params.originalReservationId,
      hasCheckIn: !!params.checkInDate,
      hasCheckOut: !!params.checkOutDate,
      hasGuest: !!params.guestName,
      hasProperty: !!params.propertyName,
    });
    return {
      ok: true,
      mode: "cancelled_no_local_row",
      sourceReservationId: params.sourceReservationId,
      originalReservationId: params.originalReservationId,
      mappedStatus: "cancelled",
      updatedRows: 0,
      cleanedRows: 0,
      roomSync: params.roomSync,
    };
  }

  const upsertResult = await upsertReservationByBookingIdentity({
    supabase: params.supabase,
    organizationId: params.organizationId,
    source: params.source,
    sourceReservationId: params.sourceReservationId,
    storedRoomLabel: params.storedRoomLabel,
    propertyName: params.propertyName,
    guestName: params.guestName,
    checkInDate: params.checkInDate,
    checkOutDate: params.checkOutDate,
    status: "cancelled",
    rawPayload: params.sanitizedPayload,
  });

  const saved = upsertResult.saved;
  if (upsertResult.error || !saved?.id) {
    console.error("[beds24/webhook] cancelled fallback upsert failed", upsertResult.error);
    return {
      ok: false,
      mode: "upsert_failed",
      sourceReservationId: params.sourceReservationId,
      error: upsertResult.error?.message ?? "upsert_failed",
    };
  }

  const postFinalized = await finalizeCancelledBookingConsistency({
    organizationId: params.organizationId,
    sourceReservationId: params.sourceReservationId,
    supabase: params.supabase,
    rawPayload: params.sanitizedPayload,
    keepReservationId: saved.id,
  });

  return {
    ok: true,
    mode: "cancelled_fallback_upsert",
    sourceReservationId: params.sourceReservationId,
    originalReservationId: params.originalReservationId,
    mappedStatus: "cancelled",
    reservationId: saved.id,
    updatedRows: 1,
    cleanedRows: postFinalized.activeCleaned + postFinalized.staleRemoved,
    roomSync: params.roomSync,
  };
}

async function upsertReservationByBookingIdentity(params: {
  supabase: SupabaseClient<Database>;
  organizationId: string;
  source: string;
  sourceReservationId: string;
  storedRoomLabel: string;
  propertyName: string;
  guestName: string;
  checkInDate: string;
  checkOutDate: string;
  status: Database["public"]["Enums"]["reservation_status"];
  rawPayload: Database["public"]["Tables"]["reservations"]["Insert"]["raw_payload"];
}) {
  const storedReservationId = toStoredReservationId(params.sourceReservationId, params.storedRoomLabel);

  const existingResult = await params.supabase
    .from("reservations")
    .select("id, source")
    .eq("organization_id", params.organizationId)
    .eq("source_reservation_id", storedReservationId)
    .limit(1)
    .maybeSingle();

  const existing = existingResult.data as { id: string; source: string } | null;
  const reservationFields = {
    property_name: params.propertyName,
    room_label: params.storedRoomLabel,
    guest_name: params.guestName,
    check_in_date: params.checkInDate,
    check_out_date: params.checkOutDate,
    status: params.status,
    raw_payload: params.rawPayload,
  };

  if (existing?.id) {
    const updateResult = await params.supabase
      .from("reservations")
      .update(reservationFields as never)
      .eq("id", existing.id)
      .select("id")
      .single();

    return {
      saved: updateResult.data as { id: string } | null,
      error: updateResult.error,
      mode: "updated_existing" as const,
      preservedSource: existing.source,
    };
  }

  const upsertResult = await params.supabase
    .from("reservations")
    .upsert(
      {
        organization_id: params.organizationId,
        source: params.source,
        source_reservation_id: storedReservationId,
        ...reservationFields,
      } as never,
      { onConflict: "organization_id,source,source_reservation_id" },
    )
    .select("id")
    .single();

  return {
    saved: upsertResult.data as { id: string } | null,
    error: upsertResult.error,
    mode: "inserted" as const,
    preservedSource: params.source,
  };
}

export async function processBeds24WebhookBooking(params: {
  payload: Beds24JsonRecord;
  organizationIdDefault: string | null;
  supabase: SupabaseClient<Database>;
}): Promise<ProcessWebhookBookingResult> {
  const { payload, supabase } = params;
  const sanitizedPayload = sanitizeRawPayload(payload);

  const organizationId =
    readBeds24String(payload, ["organizationId", "organization_id", "orgId", "org_id"]) ??
    params.organizationIdDefault ??
    null;

  const sourceReservationId = readBeds24String(payload, [
    "bookId",
    "book_id",
    "apiReference",
    "api_reference",
    "reservationId",
    "reservation_id",
    "bookingId",
    "booking_id",
    "id",
  ]);

  const checkInDate = toBeds24IsoDate(
    readBeds24String(payload, [
      "firstNight",
      "first_night",
      "checkIn",
      "check_in",
      "arrival",
      "arrivalDate",
      "startDate",
    ]),
  );

  const checkOutDate =
    beds24LastNightToCheckout(readBeds24String(payload, ["lastNight", "last_night"])) ??
    toBeds24IsoDate(
      readBeds24String(payload, ["checkOut", "check_out", "departure", "departureDate", "endDate"]),
    );

  const guestFirstName = readBeds24String(payload, ["guestFirstName", "guest_first_name", "firstName", "first_name"]);
  const guestLastName = readBeds24String(payload, ["guestLastName", "guest_last_name", "lastName", "last_name"]);
  const guestFullName = [guestFirstName, guestLastName].filter(Boolean).join(" ").trim();
  const guestName =
    (guestFullName.length > 0 ? guestFullName : null) ??
    readBeds24String(payload, ["guestName", "guest_name", "customerName", "customer_name", "name"]);

  const propertyName = readBeds24String(payload, [
    "propName",
    "prop_name",
    "propertyName",
    "property_name",
    "propId",
    "prop_id",
    "propertyId",
    "property_id",
  ]);

  const source = normalizeReservationSource(
    readBeds24String(payload, ["referer", "source", "channel", "bookingSource", "booking_source"]) ?? "beds24",
  );
  const status = resolveReservationStatusFromBeds24Record(payload);
  const originalReservationId = sourceReservationId ? toOriginalReservationId(sourceReservationId) : null;

  if (!organizationId || !sourceReservationId || !originalReservationId) {
    const missing = [
      !organizationId && "organizationId",
      !sourceReservationId && "sourceReservationId",
    ].filter(Boolean) as string[];

    console.warn("[beds24/webhook] skip:missing_required_fields", {
      sourceReservationId,
      missing,
      payloadKeys: Object.keys(payload),
    });

    return {
      ok: false,
      mode: "missing_required_fields",
      sourceReservationId,
      missing,
    };
  }

  const syncFields = extractBeds24RoomSyncFields(payload);
  const roomResolution = await resolveRoomLabel({
    supabase,
    organizationId,
    payload,
    syncFields,
  });

  syncFields.roomLabel =
    syncFields.roomLabel && !isLikelyNumericRoomLabel(syncFields.roomLabel) ? syncFields.roomLabel : null;

  const roomSync = await syncBeds24PropertyAndRoom(organizationId, syncFields, supabase);
  if (roomSync.skipped.length > 0) {
    console.log("[beds24/webhook] room sync skipped", roomSync.skipped);
  }

  await syncBeds24InventoryMinimumStay(organizationId, syncFields.externalPropertyId, supabase);

  let storedRoomLabel = roomResolution.resolvedRoomLabel ?? "(unknown)";
  let roomLabelResolvedFrom: "payload" | "room_master" | "recovery" | "unknown_fallback" = roomResolution.resolvedFromValue;

  if (!roomResolution.resolvedRoomLabel) {
    console.warn("[beds24/webhook] warn:room_label_unresolved — storing as (unknown)", {
      sourceReservationId: originalReservationId,
      propertyName,
      guestName,
      payloadRoomLabel: roomResolution.payloadRoomLabel,
      externalRoomId: roomResolution.externalRoomId,
      checkInDate,
      checkOutDate,
    });
  }

  const roomSyncSummary = {
    propertyId: roomSync.propertyId,
    roomId: roomSync.roomId,
    roomStatus: roomSync.roomStatus,
    skipped: roomSync.skipped,
  };

  if (status === "cancelled") {
    return processCancelledWebhookBooking({
      supabase,
      organizationId,
      sourceReservationId,
      originalReservationId,
      source,
      sanitizedPayload,
      payload,
      storedRoomLabel,
      propertyName,
      guestName,
      checkInDate,
      checkOutDate,
      roomSync: roomSyncSummary,
    });
  }

  if (!checkInDate || !checkOutDate || !guestName || !propertyName) {
    const missing = [
      !checkInDate && "checkInDate",
      !checkOutDate && "checkOutDate",
      !guestName && "guestName",
      !propertyName && "propertyName",
    ].filter(Boolean) as string[];

    console.warn("[beds24/webhook] skip:missing_required_fields", {
      sourceReservationId,
      propertyName,
      guestName,
      checkInDate,
      checkOutDate,
      missing,
      payloadKeys: Object.keys(payload),
    });

    return {
      ok: false,
      mode: "missing_required_fields",
      sourceReservationId,
      missing,
    };
  }

  const upsertResult = await upsertReservationByBookingIdentity({
    supabase,
    organizationId,
    source,
    sourceReservationId,
    storedRoomLabel,
    propertyName,
    guestName,
    checkInDate,
    checkOutDate,
    status,
    rawPayload: sanitizedPayload,
  });

  const saved = upsertResult.saved;
  if (upsertResult.error || !saved?.id) {
    console.error("[beds24/webhook] reservation upsert failed", upsertResult.error);
    return {
      ok: false,
      mode: "upsert_failed",
      sourceReservationId,
      error: upsertResult.error?.message ?? "upsert_failed",
    };
  }

  if (storedRoomLabel === "(unknown)") {
    const recovery = await recoverReservationRoomLabelById(supabase, saved.id, organizationId);
    if (recovery.recovered && recovery.roomLabel) {
      storedRoomLabel = recovery.roomLabel;
      roomLabelResolvedFrom = "recovery";
    }
  }

  await deleteStaleRowsForSameBooking({
    supabase,
    organizationId,
    originalId: originalReservationId,
    keepReservationId: saved.id,
    keepStoredReservationId: toStoredReservationId(sourceReservationId, storedRoomLabel),
  });

  return {
    ok: true,
    mode: "upserted",
    sourceReservationId,
    originalReservationId,
    mappedStatus: status,
    reservationId: saved.id,
    roomLabelResolvedFrom,
    roomSync: {
      propertyId: roomSync.propertyId,
      roomId: roomSync.roomId,
      roomStatus: roomSync.roomStatus,
      skipped: roomSync.skipped,
    },
  };
}
