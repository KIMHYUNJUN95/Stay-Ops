import type { SupabaseClient } from "@supabase/supabase-js";
import { toOriginalReservationId } from "@/lib/beds24/reservation-id";
import type { Database } from "@/types/database";

type ReservationLookupRow = {
  id: string;
  source: string;
  source_reservation_id: string;
  status: Database["public"]["Enums"]["reservation_status"];
  room_label: string;
};

const ACTIVE_STATUSES = new Set<Database["public"]["Enums"]["reservation_status"]>([
  "confirmed",
  "checked_in",
  "checked_out",
]);

function isActiveReservationStatus(status: Database["public"]["Enums"]["reservation_status"]) {
  return ACTIVE_STATUSES.has(status);
}

/**
 * Finds reservation rows for the same Beds24 booking, regardless of channel source.
 * Matches exact original id and `originalId::room::*` suffix variants.
 */
export async function findReservationRowsByOriginalBookingId(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  sourceReservationId: string,
  options?: { activeOnly?: boolean },
): Promise<ReservationLookupRow[]> {
  const originalId = toOriginalReservationId(sourceReservationId).trim();
  if (!originalId) return [];

  const prefix = `${originalId}::room::`;
  const [exactResult, prefixedResult] = await Promise.all([
    supabase
      .from("reservations")
      .select("id, source, source_reservation_id, status, room_label")
      .eq("organization_id", organizationId)
      .eq("source_reservation_id", originalId),
    supabase
      .from("reservations")
      .select("id, source, source_reservation_id, status, room_label")
      .eq("organization_id", organizationId)
      .like("source_reservation_id", `${prefix}%`),
  ]);

  if (exactResult.error) {
    throw new Error(`reservation exact lookup failed: ${exactResult.error.message}`);
  }
  if (prefixedResult.error) {
    throw new Error(`reservation prefix lookup failed: ${prefixedResult.error.message}`);
  }

  const byId = new Map<string, ReservationLookupRow>();
  for (const row of [...(exactResult.data ?? []), ...(prefixedResult.data ?? [])] as ReservationLookupRow[]) {
    byId.set(row.id, row);
  }

  const rows = [...byId.values()];
  if (options?.activeOnly) {
    return rows.filter((row) => isActiveReservationStatus(row.status));
  }
  return rows;
}

export async function cancelReservationRowsByOriginalBookingId(params: {
  supabase: SupabaseClient<Database>;
  organizationId: string;
  sourceReservationId: string;
  rawPayload: Database["public"]["Tables"]["reservations"]["Insert"]["raw_payload"];
}) {
  const originalId = toOriginalReservationId(params.sourceReservationId).trim();
  const matchedRows = await findReservationRowsByOriginalBookingId(
    params.supabase,
    params.organizationId,
    params.sourceReservationId,
  );

  if (matchedRows.length === 0) {
    return {
      originalReservationId: originalId,
      matchedRows: 0,
      updatedRows: 0,
      reservationIds: [] as string[],
    };
  }

  const reservationIds = matchedRows.map((row) => row.id);
  const updateResult = await params.supabase
    .from("reservations")
    .update(
      {
        status: "cancelled",
        raw_payload: params.rawPayload,
      } as never,
    )
    .in("id", reservationIds)
    .select("id");

  if (updateResult.error) {
    console.error("[beds24/reservation-lookup] cancel update failed", {
      originalReservationId: originalId,
      reservationIds,
      error: updateResult.error.message,
    });
    return {
      originalReservationId: originalId,
      matchedRows: matchedRows.length,
      updatedRows: 0,
      reservationIds,
    };
  }

  return {
    originalReservationId: originalId,
    matchedRows: matchedRows.length,
    updatedRows: updateResult.data?.length ?? 0,
    reservationIds,
  };
}

/**
 * Ensures no active rows remain for a cancelled Beds24 booking (source-agnostic).
 */
export async function cleanupActiveRowsForCancelledBooking(params: {
  supabase: SupabaseClient<Database>;
  organizationId: string;
  sourceReservationId: string;
  rawPayload: Database["public"]["Tables"]["reservations"]["Insert"]["raw_payload"];
}) {
  const activeRows = await findReservationRowsByOriginalBookingId(
    params.supabase,
    params.organizationId,
    params.sourceReservationId,
    { activeOnly: true },
  );

  if (activeRows.length === 0) {
    return { cleanedRows: 0 };
  }

  const reservationIds = activeRows.map((row) => row.id);
  const updateResult = await params.supabase
    .from("reservations")
    .update(
      {
        status: "cancelled",
        raw_payload: params.rawPayload,
      } as never,
    )
    .in("id", reservationIds)
    .select("id");

  if (updateResult.error) {
    console.error("[beds24/reservation-lookup] cleanup active rows failed", {
      sourceReservationId: toOriginalReservationId(params.sourceReservationId),
      reservationIds,
      error: updateResult.error.message,
    });
    return { cleanedRows: 0 };
  }

  return { cleanedRows: updateResult.data?.length ?? 0 };
}

function isUnknownRoomRow(row: ReservationLookupRow) {
  return row.room_label === "(unknown)" || row.source_reservation_id.includes("::room::(unknown)");
}

function pickPreferredCancelledRow(rows: ReservationLookupRow[], keepReservationId?: string) {
  if (keepReservationId) {
    const kept = rows.find((row) => row.id === keepReservationId);
    if (kept) return kept;
  }
  const resolved = rows.find((row) => !isUnknownRoomRow(row));
  return resolved ?? rows[0] ?? null;
}

/**
 * Post-cancel consistency pass: cancel any remaining active rows and remove stale
 * duplicate rows for the same original Beds24 booking id (unknown/room suffix variants).
 */
export async function finalizeCancelledBookingConsistency(params: {
  supabase: SupabaseClient<Database>;
  organizationId: string;
  sourceReservationId: string;
  rawPayload: Database["public"]["Tables"]["reservations"]["Insert"]["raw_payload"];
  keepReservationId?: string;
}) {
  const originalId = toOriginalReservationId(params.sourceReservationId).trim();

  const activeCleanup = await cleanupActiveRowsForCancelledBooking({
    supabase: params.supabase,
    organizationId: params.organizationId,
    sourceReservationId: params.sourceReservationId,
    rawPayload: params.rawPayload,
  });

  let allRows = await findReservationRowsByOriginalBookingId(
    params.supabase,
    params.organizationId,
    params.sourceReservationId,
  );

  let activeRows = allRows.filter((row) => isActiveReservationStatus(row.status));
  let additionallyCancelled = 0;

  if (activeRows.length > 0) {
    const updateResult = await params.supabase
      .from("reservations")
      .update(
        {
          status: "cancelled",
          raw_payload: params.rawPayload,
        } as never,
      )
      .in(
        "id",
        activeRows.map((row) => row.id),
      )
      .select("id");

    if (!updateResult.error) {
      additionallyCancelled = updateResult.data?.length ?? 0;
    }
    allRows = await findReservationRowsByOriginalBookingId(
      params.supabase,
      params.organizationId,
      params.sourceReservationId,
    );
    activeRows = allRows.filter((row) => isActiveReservationStatus(row.status));
  }

  const cancelledRows = allRows.filter((row) => row.status === "cancelled");
  const preferred = pickPreferredCancelledRow(cancelledRows, params.keepReservationId);
  let staleRemoved = 0;

  if (preferred) {
    for (const row of allRows) {
      if (row.id === preferred.id) continue;

      const shouldRemoveStaleUnknown =
        isUnknownRoomRow(row) && cancelledRows.some((candidate) => candidate.id === preferred.id);
      const shouldRemoveStaleActiveDuplicate = isActiveReservationStatus(row.status);

      if (!shouldRemoveStaleUnknown && !shouldRemoveStaleActiveDuplicate) {
        continue;
      }

      console.warn("[beds24/reservation-lookup] removing stale duplicate row after cancel", {
        originalReservationId: originalId,
        staleId: row.id,
        keptId: preferred.id,
        staleSourceReservationId: row.source_reservation_id,
        staleStatus: row.status,
      });

      const deleteResult = await params.supabase.from("reservations").delete().eq("id", row.id);
      if (!deleteResult.error) {
        staleRemoved += 1;
      }
    }
  } else if (activeRows.length > 0) {
    for (const row of activeRows) {
      console.warn("[beds24/reservation-lookup] removing remaining active row after cancel", {
        originalReservationId: originalId,
        staleId: row.id,
        staleSourceReservationId: row.source_reservation_id,
      });
      const deleteResult = await params.supabase.from("reservations").delete().eq("id", row.id);
      if (!deleteResult.error) {
        staleRemoved += 1;
      }
    }
  }

  const remainingActive = (
    await findReservationRowsByOriginalBookingId(
      params.supabase,
      params.organizationId,
      params.sourceReservationId,
      { activeOnly: true },
    )
  ).length;

  return {
    originalReservationId: originalId,
    activeCleaned: activeCleanup.cleanedRows + additionallyCancelled,
    staleRemoved,
    activeRemaining: remainingActive,
  };
}
