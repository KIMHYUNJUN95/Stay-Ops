// Beds24 properties/rooms room master sync helpers.
// Called opportunistically from the Beds24 webhook route on every booking event.
//
// Design decisions:
//   - Property upsert key: prefer (organization_id, external_provider, external_property_id)
//     when an external property ID is present. Fall back to (organization_id, name) only
//     for payloads that do not include a Beds24 property ID.
//   - Room upsert key: (organization_id, room_label) - the stable cross-table join key.
//     Beds24 room ID (external_room_id) can rotate over the year for the same physical room;
//     upsert on room_label keeps the row stable while external_room_id is updated.
//   - Failure policy: property/room sync failures are logged but do not block reservation upsert.
//   - inactive rooms are stored with status='inactive' (not omitted) for traceability.
//
// Company internal active/inactive classification rule (not a Beds24 standard):
//   minimum_stay >= 50 nights -> inactive room ID for that period.
//   minimum_stay in 1..49     -> active room ID for that period.
//   minimum_stay = NULL       -> active (unknown). Webhook booking payloads do NOT carry
//                                minimumStay, so a freshly-synced room would otherwise be
//                                hidden (and its reservations dropped from the calendar)
//                                until a separate inventory sync populates minStay. We must
//                                never hide a real room just because minStay is not yet
//                                known — only an explicit >= 50 signal marks it inactive.
//                                See docs/engineering/01-beds24-integration.md.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { BEDS24_INACTIVE_MIN_STAY_THRESHOLD } from "@/lib/rooms";

type RawPayload = Record<string, unknown>;

// Classify a Beds24 room based on its minimum stay value.
// Only an explicit minimum_stay >= 50 marks a room inactive. NULL (unknown, e.g. not yet
// inventory-synced) stays active so the room — and its reservations — are never hidden.
export function classifyBeds24Room(minimumStay: number | null): "active" | "inactive" {
  if (minimumStay !== null && minimumStay >= BEDS24_INACTIVE_MIN_STAY_THRESHOLD) {
    return "inactive";
  }
  return "active";
}

function readStr(record: RawPayload, keys: string[]): string | null {
  for (const key of keys) {
    const v = record[key];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

function readNum(record: RawPayload, keys: string[]): number | null {
  for (const key of keys) {
    const v = record[key];
    if (typeof v === "number" && isFinite(v)) return Math.round(v);
    if (typeof v === "string") {
      const n = parseInt(v, 10);
      if (!isNaN(n)) return n;
    }
  }
  return null;
}

export type Beds24RoomSyncFields = {
  propertyName: string | null;
  externalPropertyId: string | null;
  roomLabel: string | null;
  externalRoomId: string | null;
  minimumStay: number | null;
};

// NOTE: minimumStay is NOT present in Beds24 v2 booking webhook payloads.
// It is a room inventory setting available only via GET /v2/inventory/rooms.
// Rooms synced from booking webhooks will always have minimumStay=null -> stored as inactive.
// To activate authoritative mode, minimumStay must be populated from a separate inventory API call.
export function extractBeds24RoomSyncFields(payload: RawPayload): Beds24RoomSyncFields {
  return {
    propertyName: readStr(payload, [
      "propName",         // Beds24 v2 native
      "prop_name",
      "propertyName",
      "property_name",
    ]),
    externalPropertyId: readStr(payload, [
      "propId",           // Beds24 v2 native (integer ID sent as number, readStr handles it)
      "prop_id",
      "propertyId",
      "property_id",
    ]),
    roomLabel: readStr(payload, [
      "unitName",         // Beds24 v2 native
      "unit_name",
      "unitLabel",
      "unit_label",
      "roomName",
      "room_name",
      "roomLabel",
      "room",
    ]),
    externalRoomId: readStr(payload, [
      "roomId",
      "room_id",
    ]),
    // minimumStay is absent from booking webhooks (it's an inventory field).
    // Searching anyway in case a future payload format includes it.
    minimumStay: readNum(payload, [
      "minimumStay",
      "minimum_stay",
      "minStay",
      "min_stay",
      "minNights",
      "min_nights",
    ]),
  };
}

async function upsertPropertyByExternalId(
  organizationId: string,
  name: string | null,
  externalPropertyId: string,
  supabase: SupabaseClient<Database>,
): Promise<string | null> {
  const existingByExternalId = await supabase
    .from("properties")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("external_provider", "beds24")
    .eq("external_property_id", externalPropertyId)
    .maybeSingle();

  if (existingByExternalId.error) {
    console.error("[beds24/sync] property lookup failed (external id)", existingByExternalId.error);
    return null;
  }

  if (existingByExternalId.data) {
    const existingProperty = existingByExternalId.data as { id: string };
    // Only overwrite the display name when the payload actually carried one.
    // A booking without propName must NEVER rename an existing property to its raw
    // external id — that is exactly what produced the duplicate "176431" building
    // (see docs/planning/01-decision-log.md → 2026-07-22). We still (re)activate it.
    const patch: { status: "active"; name?: string } = { status: "active" };
    if (name) patch.name = name;
    const updateResult = await supabase
      .from("properties")
      .update(patch as never)
      .eq("id", existingProperty.id)
      .select("id")
      .single();

    if (updateResult.error) {
      console.error("[beds24/sync] property update failed (external id)", updateResult.error);
      return null;
    }

    return (updateResult.data as { id: string } | null)?.id ?? null;
  }

  // Brand-new property (external id not seen before). We need SOME display name to
  // create the row; use the payload name when present, otherwise fall back to the raw
  // external id purely as a last-resort placeholder for the initial insert.
  const effectiveName = name ?? externalPropertyId;

  const existingByName = await supabase
    .from("properties")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("name", effectiveName)
    .maybeSingle();

  if (existingByName.error) {
    console.error("[beds24/sync] property lookup failed (name fallback)", existingByName.error);
    return null;
  }

  if (existingByName.data) {
    const existingProperty = existingByName.data as { id: string };
    const attachResult = await supabase
      .from("properties")
      .update(
        {
          status: "active",
          external_provider: "beds24",
          external_property_id: externalPropertyId,
        } as never,
      )
      .eq("id", existingProperty.id)
      .select("id")
      .single();

    if (attachResult.error) {
      console.error("[beds24/sync] property attach failed (name -> external id)", attachResult.error);
      return null;
    }

    return (attachResult.data as { id: string } | null)?.id ?? null;
  }

  const result = await supabase
    .from("properties")
    .insert(
      {
        organization_id: organizationId,
        name: effectiveName,
        status: "active",
        external_provider: "beds24",
        external_property_id: externalPropertyId,
      } as never,
    )
    .select("id")
    .single();

  if (result.error) {
    console.error("[beds24/sync] property upsert failed (external id)", result.error);
    return null;
  }

  return (result.data as { id: string } | null)?.id ?? null;
}

async function upsertPropertyByName(
  organizationId: string,
  name: string,
  externalPropertyId: string | null,
  supabase: SupabaseClient<Database>,
): Promise<string | null> {
  const result = await supabase
    .from("properties")
    .upsert(
      {
        organization_id: organizationId,
        name,
        status: "active",
        external_provider: "beds24",
        external_property_id: externalPropertyId,
      } as never,
      { onConflict: "organization_id,name" },
    )
    .select("id")
    .single();

  if (result.error) {
    console.error("[beds24/sync] property upsert failed (name fallback)", result.error);
    return null;
  }

  return (result.data as { id: string } | null)?.id ?? null;
}

// Upsert a Beds24 property.
// Prefer external property ID as the stable key; only fall back to name when the payload omits it.
async function upsertProperty(
  organizationId: string,
  name: string | null,
  externalPropertyId: string | null,
  supabase: SupabaseClient<Database>,
): Promise<string | null> {
  if (externalPropertyId) {
    return upsertPropertyByExternalId(organizationId, name, externalPropertyId, supabase);
  }

  if (!name) {
    console.warn("[beds24/sync] property has neither name nor external id -> skipped");
    return null;
  }

  console.log(`[beds24/sync] property "${name}" missing external_property_id -> using name fallback`);
  return upsertPropertyByName(organizationId, name, externalPropertyId, supabase);
}

// Upsert a Beds24 room by (organization_id, room_label).
// On conflict (same org + room_label), updates external_room_id, external_minimum_stay, and status.
// This handles the rotating room ID scenario: room_label stays stable; external fields rotate.
async function upsertRoom(
  organizationId: string,
  propertyId: string,
  roomLabel: string,
  externalRoomId: string | null,
  minimumStay: number | null,
  supabase: SupabaseClient<Database>,
): Promise<string | null> {
  const status = classifyBeds24Room(minimumStay);

  const result = await supabase
    .from("rooms")
    .upsert(
      {
        organization_id: organizationId,
        property_id: propertyId,
        name: roomLabel,
        room_label: roomLabel,
        status,
        external_provider: "beds24",
        external_room_id: externalRoomId,
        external_minimum_stay: minimumStay,
      } as never,
      { onConflict: "organization_id,room_label" },
    )
    .select("id")
    .single();

  if (result.error) {
    console.error("[beds24/sync] room upsert failed", { roomLabel, externalRoomId, minimumStay, error: result.error });
    return null;
  }

  if (status === "inactive") {
    console.log(`[beds24/sync] room "${roomLabel}" stored as inactive (min_stay=${minimumStay ?? "null"})`);
  }

  return (result.data as { id: string } | null)?.id ?? null;
}

export type Beds24SyncResult = {
  propertyId: string | null;
  roomId: string | null;
  roomStatus: "active" | "inactive" | null;
  skipped: string[];
};

export type Beds24PropertyRoomSnapshot = {
  externalPropertyId: string;
  propertyName: string;
  rooms: Array<{
    externalRoomId: string;
    minimumStay: number | null;
    roomLabel: string;
  }>;
};

export type Beds24RoomMasterSyncResult = {
  activeRooms: number;
  inactiveRooms: number;
  processedProperties: number;
  processedRooms: number;
  skipped: string[];
};

export async function syncBeds24PropertyAndRoom(
  organizationId: string,
  fields: Beds24RoomSyncFields,
  supabase: SupabaseClient<Database>,
): Promise<Beds24SyncResult> {
  const skipped: string[] = [];

  // Pass the payload name as-is (may be null). upsertProperty resolves by external id
  // first and will NOT clobber an existing property's name with the raw external id
  // when the payload omits propName.
  const propertyName = fields.propertyName;
  if (!propertyName && !fields.externalPropertyId) {
    skipped.push("property:no-name-or-id");
    skipped.push("room:property-skipped");
    return { propertyId: null, roomId: null, roomStatus: null, skipped };
  }

  const propertyId = await upsertProperty(
    organizationId,
    propertyName,
    fields.externalPropertyId,
    supabase,
  );

  if (!propertyId) {
    skipped.push("room:property-upsert-failed");
    return { propertyId: null, roomId: null, roomStatus: null, skipped };
  }

  if (!fields.roomLabel) {
    skipped.push("room:no-room-label");
    return { propertyId, roomId: null, roomStatus: null, skipped };
  }

  if (fields.minimumStay === null) {
    console.log(`[beds24/sync] room "${fields.roomLabel}" minimum_stay absent from payload -> stored as inactive (conservative policy)`);
  }

  const roomId = await upsertRoom(
    organizationId,
    propertyId,
    fields.roomLabel,
    fields.externalRoomId,
    fields.minimumStay,
    supabase,
  );

  const roomStatus = classifyBeds24Room(fields.minimumStay);

  return { propertyId, roomId, roomStatus, skipped };
}

export async function syncBeds24PropertyRoomSnapshotForOrganization(
  organizationId: string,
  snapshot: Beds24PropertyRoomSnapshot[],
  supabase: SupabaseClient<Database>,
): Promise<Beds24RoomMasterSyncResult> {
  let processedProperties = 0;
  let processedRooms = 0;
  let activeRooms = 0;
  let inactiveRooms = 0;
  const skipped: string[] = [];

  for (const property of snapshot) {
    if (!property.propertyName || !property.externalPropertyId) {
      skipped.push("property:missing-name-or-id");
      continue;
    }

    const propertyId = await upsertProperty(
      organizationId,
      property.propertyName,
      property.externalPropertyId,
      supabase,
    );

    if (!propertyId) {
      skipped.push(`property:upsert-failed:${property.externalPropertyId}`);
      continue;
    }
    processedProperties += 1;

    for (const room of property.rooms) {
      if (!room.roomLabel || !room.externalRoomId) {
        skipped.push(`room:missing-label-or-id:${property.externalPropertyId}`);
        continue;
      }

      const roomId = await upsertRoom(
        organizationId,
        propertyId,
        room.roomLabel,
        room.externalRoomId,
        room.minimumStay,
        supabase,
      );

      if (!roomId) {
        skipped.push(`room:upsert-failed:${room.externalRoomId}`);
        continue;
      }

      processedRooms += 1;
      if (classifyBeds24Room(room.minimumStay) === "active") {
        activeRooms += 1;
      } else {
        inactiveRooms += 1;
      }
    }
  }

  return {
    activeRooms,
    inactiveRooms,
    processedProperties,
    processedRooms,
    skipped,
  };
}
