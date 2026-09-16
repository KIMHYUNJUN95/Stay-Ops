// Beds24 properties/rooms room master sync helpers.
// Called opportunistically from the Beds24 webhook route on every booking event.
//
// Design decisions:
//   - Property upsert key: prefer (organization_id, external_provider, external_property_id)
//     when an external property ID is present. Fall back to (organization_id, name) only
//     for payloads that do not include a Beds24 property ID.
//   - Room identity key: (organization_id, external_provider, external_room_id).
//     같은 이름의 방 둘이 들어오면 라벨로 맞추던 예전 방식이 한쪽을 조용히 덮어썼다
//     (2026-09-17 아라키초A 401호). 라벨이 겹치면 `_2` 를 붙여 각자 행을 갖는다.
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
import { roomLabelCandidates } from "@/lib/beds24/room-label-candidates";

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
      .update(patch)
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
        },
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
      },
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
      },
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

/**
 * 같은 이름의 방이 이미 있으면 `_2`, `_3` … 을 붙여 비어 있는 라벨을 찾는다.
 *
 * 접미사는 우리가 발명한 규칙이 아니라 **Beds24 가 이미 쓰는 규칙**이다 — 아라키초A 의 듀얼
 * 유닛이 `201` / `201_2`, `501` / `501_2` 로 내려온다. 표시 계층이 `_N` 을 떼므로
 * (`getDisplayRoomLabel`) 두 유닛은 캘린더에서 한 행으로 합쳐진다.
 */
async function findFreeRoomLabel(
  organizationId: string,
  desiredLabel: string,
  selfRoomUuid: string | null,
  supabase: SupabaseClient<Database>,
): Promise<string | null> {
  for (const candidate of roomLabelCandidates(desiredLabel)) {
    const existing = await supabase
      .from("rooms")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("room_label", candidate)
      .maybeSingle();

    if (existing.error) {
      console.error("[beds24/sync] room label probe failed", { candidate, error: existing.error });
      return null;
    }
    const holder = (existing.data as { id: string } | null)?.id ?? null;
    if (!holder || holder === selfRoomUuid) return candidate;
  }

  console.error("[beds24/sync] no free room label", { desiredLabel });
  return null;
}

/**
 * Beds24 방 하나를 `rooms` 에 반영한다. **기준은 `external_room_id` 다.**
 *
 * ## 왜 라벨로 맞추지 않는가 (2026-09-17)
 *
 * 예전에는 `onConflict: "organization_id,room_label"` 로 upsert 했다. 그런데 `rooms` 에는
 * `UNIQUE (organization_id, room_label)` 이 걸려 있고, Beds24 가 **같은 이름의 방 둘**을
 * 내려주면 두 번째 upsert 가 **첫 번째 행을 덮어썼다** — 에러도 없고 `skipped` 에도 안 남아
 * 방 하나가 조용히 증발했다.
 *
 * 실제로 아라키초A 401호가 그랬다: Beds24 에 `440617` 과 `515300` 두 유닛이 있는데 우리 표에는
 * 하나뿐이었고, `515300` 으로 들어온 예약 78건이 방을 못 찾아 `room_label = "(unknown)"` 으로
 * 쌓였다. 더 나쁜 것은 **어느 쪽이 살아남는지가 Beds24 의 응답 순서에 달려 있었다는 점**이다 —
 * 순서가 바뀌면 주 유닛의 예약이 `(unknown)` 이 되기 시작한다.
 *
 * 이제 `external_room_id` 로 기존 행을 찾고, 라벨이 겹치면 `_2` 를 붙여 **두 방이 각자의 행을
 * 갖는다.** 라벨 유니크 제약은 그대로 지킨다.
 *
 * ## 회전하는 roomId 는 어떻게 되는가
 *
 * 예전 주석이 말하던 「roomId 가 회전해도 라벨은 그대로」는 **이제 반대로 처리된다** —
 * roomId 가 바뀌면 새 방으로 들어온다. 그편이 안전하다: 우리 예약 데이터는 `raw_payload.roomId`
 * 로 방을 찾으므로, **roomId 가 곧 정체성**이다. 라벨을 정체성으로 삼으면 서로 다른 유닛이
 * 한 행에 겹쳐 앉는다.
 */
async function upsertRoom(
  organizationId: string,
  propertyId: string,
  roomLabel: string,
  externalRoomId: string | null,
  minimumStay: number | null,
  supabase: SupabaseClient<Database>,
): Promise<string | null> {
  const status = classifyBeds24Room(minimumStay);
  const shared = {
    organization_id: organizationId,
    property_id: propertyId,
    status,
    external_provider: "beds24" as const,
    external_room_id: externalRoomId,
    external_minimum_stay: minimumStay,
  };

  // external_room_id 가 없는 방은 예전처럼 라벨로 맞출 수밖에 없다(구분할 다른 값이 없다).
  if (!externalRoomId) {
    const result = await supabase
      .from("rooms")
      .upsert(
        { ...shared, name: roomLabel, room_label: roomLabel },
        { onConflict: "organization_id,room_label" },
      )
      .select("id")
      .single();
    if (result.error) {
      console.error("[beds24/sync] room upsert failed (no external id)", {
        roomLabel,
        error: result.error,
      });
      return null;
    }
    return (result.data as { id: string } | null)?.id ?? null;
  }

  const existing = await supabase
    .from("rooms")
    .select("id, room_label")
    .eq("organization_id", organizationId)
    .eq("external_provider", "beds24")
    .eq("external_room_id", externalRoomId)
    .maybeSingle();

  if (existing.error) {
    console.error("[beds24/sync] room lookup failed", { externalRoomId, error: existing.error });
    return null;
  }

  const existingRow = existing.data as { id: string; room_label: string } | null;
  // 이미 있는 방이면 **라벨을 함부로 바꾸지 않는다.** 청소 기록·교통비 등 다른 표가 라벨로
  // 붙어 있어서, Beds24 쪽 이름이 흔들릴 때마다 따라가면 그 연결이 끊긴다.
  const targetLabel = existingRow
    ? existingRow.room_label
    : await findFreeRoomLabel(organizationId, roomLabel, null, supabase);

  if (!targetLabel) return null;

  if (existingRow) {
    // **이미 있는 방에는 minStay 를 덮어쓰지 않는다** (2026-09-16 사고).
    //
    // `/properties` 의 `roomTypes[].minStay` 는 방의 **기본 설정값**이고, 활성/비활성을 가르는
    // 값은 `GET /inventory/rooms` 에서 오는 **기간별 값**이다(`inventory-sync.ts`). 여기서
    // 기본값으로 덮으면 은퇴한 유닛(minStay 50/99)이 전부 `1` 이 되어 **되살아난다** —
    // 실제로 한 번 돌렸다가 비활성 24개가 전부 활성이 됐다.
    //
    // minStay 와 status 의 주인은 inventory-sync 다. 이 동기화는 **방의 존재와 소속만** 맞춘다.
    const identity = {
      organization_id: shared.organization_id,
      property_id: shared.property_id,
      external_provider: shared.external_provider,
      external_room_id: shared.external_room_id,
    };
    const updated = await supabase
      .from("rooms")
      .update({ ...identity, name: targetLabel, room_label: targetLabel })
      .eq("id", existingRow.id)
      .select("id")
      .single();
    if (updated.error) {
      console.error("[beds24/sync] room update failed", {
        externalRoomId,
        roomLabel: targetLabel,
        error: updated.error,
      });
      return null;
    }
    return (updated.data as { id: string } | null)?.id ?? null;
  }

  if (targetLabel !== roomLabel) {
    // 조용히 넘어가지 않는다. 새 유닛이 접미사를 받았다는 사실은 사람이 알아야 한다.
    console.warn(
      `[beds24/sync] room label "${roomLabel}" already taken -> storing ${externalRoomId} as "${targetLabel}"`,
    );
  }

  const inserted = await supabase
    .from("rooms")
    .insert({ ...shared, name: targetLabel, room_label: targetLabel })
    .select("id")
    .single();

  if (inserted.error) {
    console.error("[beds24/sync] room insert failed", {
      externalRoomId,
      roomLabel: targetLabel,
      error: inserted.error,
    });
    return null;
  }

  if (status === "inactive") {
    console.log(`[beds24/sync] room "${targetLabel}" stored as inactive (min_stay=${minimumStay ?? "null"})`);
  }

  return (inserted.data as { id: string } | null)?.id ?? null;
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
    // 이 줄은 오래 **거짓말을 하고 있었다** (2026-08-07 정정). 예전에는 min_stay 가 없으면
    // inactive 로 저장했지만, 그 정책은 실제 운영 객실을 캘린더에서 숨겨 버려 2026-06-18 에
    // 폐기됐다 — `classifyBeds24Room(null)` 은 **active** 를 돌려준다. 그런데 로그 문구만 옛
    // 정책 그대로 남아, 장애 조사 때마다 "웹훅이 방을 비활성으로 바꾸고 있다"는 잘못된 단서를
    // 흘리고 있었다. 실제 동작과 맞춘다.
    console.log(
      `[beds24/sync] room "${fields.roomLabel}" minimum_stay absent from payload -> stored as active (unknown min-stay must not hide a real room)`,
    );
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
