import type { SupabaseClient } from "@supabase/supabase-js";
import { getOptionalBeds24ApiEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Beds24 캘린더 「블락」을 가져온다 (2026-09-11).
 *
 * ## 블락은 예약이 아니다
 *
 * Beds24 캘린더에서 객실을 막으면 채널 판매가 멈춘다. 그 표현은 **인벤토리 오버라이드**다 —
 * `GET /inventory/rooms/calendar?includeOverride=true` 의 `override` 가 `blackout` 이 된다.
 * 명세 enum: `none | blackout | exception | noCheckIn | noCheckOut | noCheckInOrCheckOut`.
 *
 * Beds24 에는 `status: "black"` 예약으로 막는 길도 있지만 이 계정은 쓰지 않는다(전 기간 조회
 * 0건). 그래서 블락은 `/bookings` 로 **절대 들어오지 않는다** — 우리 캘린더에 안 보이던 이유다.
 *
 * ## `numAvail` 로는 안 된다
 *
 * 같은 응답의 `numAvail: 0` 은 「팔 수 없음」이라 **예약이 차 있어도 0** 이다. 실측으로 확인했다
 * (O103 2026-09월: 빈 밤 15·23·24 만 `numAvail: 1`, 나머지는 전부 예약분). 그래서 판별은
 * `override === "blackout"` 하나로만 한다.
 *
 * ## 끝이 열린 blackout 은 버린다
 *
 * 조회 구간 끝까지 이어지는 blackout 은 「차단」이 아니라 **판매를 아직 안 연 기간**인 경우가
 * 많다. 실제로 2026-09-11 기준 여러 건물이 2027-03-01 부터 같은 모양으로 잡혀 있었다. 그것까지
 * 그리면 그 달이 통째로 빗금이 되어 진짜 차단이 묻힌다. 그래서 **구간의 끝이 조회 끝에 닿으면
 * 건너뛴다.** 판매 기간을 늘리면 자연히 사라질 값이지 운영자가 알아야 할 차단이 아니다.
 *
 * ## 예약과 겹치는 것은 정상이다
 *
 * 채널 판매를 막아 두고(blackout) 그 자리에 수기 예약을 넣는 운영이 실제로 쓰인다(2026-09-23
 * O202·O203). 겹친다고 해서 블락이 아닌 게 아니므로 예약과 대조해 걸러내지 않는다.
 *
 * 도메인 계약: docs/product/15-reservation-calendar.md
 */

type JsonRecord = Record<string, unknown>;

type Beds24AccessTokenState = { ok: true; token: string } | { ok: false; skipped: string };

export type RoomBlockSyncResult = {
  /** Beds24 에서 읽은 건물 수. */
  properties: number;
  /** `override === "blackout"` 로 잡힌 구간 수(열린 꼬리 제외 후). */
  blocks: number;
  /** 판매 미오픈으로 보고 버린 열린 꼬리 구간 수. */
  openEndedSkipped: number;
  /** 방 마스터에서 방 이름을 못 찾아 버린 구간 수. */
  unresolvedRooms: number;
  /** 이번 창에서 사라져 삭제한 기존 구간 수. */
  removed: number;
  skipped: string[];
};

let cachedBeds24AccessToken: { token: string; expiresAt: number } | null = null;

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function readString(record: JsonRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

async function resolveBeds24AccessToken(): Promise<Beds24AccessTokenState> {
  const env = getOptionalBeds24ApiEnv();
  if (!env) return { ok: false, skipped: "room-blocks:missing-env" };
  if (env.accessToken) return { ok: true, token: env.accessToken };
  if (!env.refreshToken) return { ok: false, skipped: "room-blocks:missing-token" };

  if (cachedBeds24AccessToken && cachedBeds24AccessToken.expiresAt > Date.now() + 60_000) {
    return { ok: true, token: cachedBeds24AccessToken.token };
  }

  try {
    const response = await fetch(`${env.baseUrl.replace(/\/$/, "")}/authentication/token`, {
      headers: { accept: "application/json", refreshToken: env.refreshToken },
      cache: "no-store",
    });
    if (!response.ok) {
      return {
        ok: false,
        skipped:
          response.status === 401 || response.status === 403
            ? "room-blocks:refresh-token-invalid"
            : `room-blocks:refresh-http-${response.status}`,
      };
    }
    const json = (await response.json()) as { token?: unknown; expiresIn?: unknown };
    const token = typeof json.token === "string" && json.token.trim().length > 0 ? json.token.trim() : null;
    if (!token) return { ok: false, skipped: "room-blocks:refresh-missing-token" };
    const expiresIn = typeof json.expiresIn === "number" && Number.isFinite(json.expiresIn) ? json.expiresIn : 3600;
    cachedBeds24AccessToken = { token, expiresAt: Date.now() + expiresIn * 1000 };
    return { ok: true, token };
  } catch {
    return { ok: false, skipped: "room-blocks:refresh-request-error" };
  }
}

/** 예약 백필과 같은 운영 창을 쓴다 — 당월 1일부터 2개월 뒤 1일 전날까지. */
export function buildRoomBlockWindow(now = new Date()): { from: string; to: string } {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = jst.getUTCFullYear();
  const month = jst.getUTCMonth();
  const from = new Date(Date.UTC(year, month, 1));
  // 2개월 뒤 1일의 전날 = 창의 마지막 날(포함).
  const to = new Date(Date.UTC(year, month + 3, 0));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

type FetchedBlock = {
  externalPropertyId: string;
  externalRoomId: string;
  beds24RoomName: string;
  startDate: string;
  endDate: string;
};

type FetchOutcome = {
  blocks: FetchedBlock[];
  properties: number;
  openEndedSkipped: number;
  skipped: string[];
};

async function fetchBlackoutSegments(window: { from: string; to: string }): Promise<FetchOutcome> {
  const env = getOptionalBeds24ApiEnv();
  if (!env) return { blocks: [], properties: 0, openEndedSkipped: 0, skipped: ["room-blocks:missing-env"] };

  const tokenState = await resolveBeds24AccessToken();
  if (!tokenState.ok) {
    return { blocks: [], properties: 0, openEndedSkipped: 0, skipped: [tokenState.skipped] };
  }

  const base = env.baseUrl.replace(/\/$/, "");
  const headers = { accept: "application/json", token: tokenState.token };

  // 건물 목록을 먼저 받는다. 캘린더는 건물 단위로만 물어볼 수 있어서, 방을 하나씩 도는 것보다
  // 요청 수가 훨씬 적다(= Beds24 크레딧을 덜 쓴다).
  const propertiesResponse = await fetch(`${base}/properties?includeAllRooms=false`, {
    headers,
    cache: "no-store",
  });
  if (!propertiesResponse.ok) {
    return {
      blocks: [],
      properties: 0,
      openEndedSkipped: 0,
      skipped: [`room-blocks:properties-http-${propertiesResponse.status}`],
    };
  }
  const propertiesRoot = asRecord(await propertiesResponse.json());
  const propertyRows = Array.isArray(propertiesRoot?.data) ? propertiesRoot.data : [];

  const blocks: FetchedBlock[] = [];
  const skipped: string[] = [];
  let openEndedSkipped = 0;
  let properties = 0;

  for (const propertyValue of propertyRows) {
    const property = asRecord(propertyValue);
    const externalPropertyId = property ? readString(property, ["id", "propertyId"]) : null;
    if (!externalPropertyId) continue;
    properties++;

    const url =
      `${base}/inventory/rooms/calendar?propertyId=${externalPropertyId}` +
      `&startDate=${window.from}&endDate=${window.to}&includeNumAvail=true&includeOverride=true`;

    const response = await fetch(url, { headers, cache: "no-store" });
    if (!response.ok) {
      skipped.push(`room-blocks:calendar-${externalPropertyId}-http-${response.status}`);
      continue;
    }

    const root = asRecord(await response.json());
    const rooms = Array.isArray(root?.data) ? root.data : [];
    for (const roomValue of rooms) {
      const room = asRecord(roomValue);
      if (!room) continue;
      const externalRoomId = readString(room, ["roomId", "id"]);
      const beds24RoomName = readString(room, ["name", "roomName"]) ?? externalRoomId ?? "";
      if (!externalRoomId) continue;

      const calendar = Array.isArray(room.calendar) ? room.calendar : [];
      for (const segmentValue of calendar) {
        const segment = asRecord(segmentValue);
        if (!segment) continue;
        if (readString(segment, ["override"]) !== "blackout") continue;

        const startDate = readString(segment, ["from"]);
        const endDate = readString(segment, ["to"]);
        if (!startDate || !endDate) continue;

        // 조회 끝에 닿는 구간은 「판매 미오픈」이지 차단이 아니다. 위 주석 참고.
        if (endDate >= window.to) {
          openEndedSkipped++;
          continue;
        }

        blocks.push({ externalPropertyId, externalRoomId, beds24RoomName, startDate, endDate });
      }
    }
  }

  return { blocks, properties, openEndedSkipped, skipped };
}

/**
 * Beds24 블락을 `room_blocks` 에 반영한다.
 *
 * 창 안의 기존 행을 **전부 지우고 다시 넣는다.** 블락은 예약과 달리 「취소」 이벤트가 없다 —
 * Beds24 에서 풀면 응답에서 그냥 사라진다. 그래서 upsert 만 하면 **한번 생긴 블락이 영원히 남는다.**
 * 창 단위 교체가 그 문제를 원천적으로 없앤다(행 수가 적어 비용도 무시할 만하다).
 */
export async function syncBeds24RoomBlocks(
  supabase: SupabaseClient<Database>,
  options?: { organizationId?: string; now?: Date },
): Promise<RoomBlockSyncResult> {
  const window = buildRoomBlockWindow(options?.now);
  const fetched = await fetchBlackoutSegments(window);

  const result: RoomBlockSyncResult = {
    properties: fetched.properties,
    blocks: 0,
    openEndedSkipped: fetched.openEndedSkipped,
    unresolvedRooms: 0,
    removed: 0,
    skipped: [...fetched.skipped],
  };

  // Beds24 roomId → (organization, property_name, room_label). 방 마스터가 유일한 기준이다 —
  // 여기서 못 찾는 방은 애초에 우리 캘린더에 행이 없으므로 블락을 그릴 자리도 없다.
  let roomQuery = supabase
    .from("rooms")
    .select("organization_id, external_room_id, room_label, properties(name)")
    .eq("external_provider", "beds24")
    .not("external_room_id", "is", null);
  if (options?.organizationId) {
    roomQuery = roomQuery.eq("organization_id", options.organizationId);
  }
  const roomResult = await roomQuery;
  if (roomResult.error) {
    result.skipped.push(`room-blocks:rooms-${roomResult.error.message}`);
    return result;
  }

  type RoomRow = {
    organization_id: string;
    external_room_id: string | null;
    room_label: string;
    properties: { name: string } | { name: string }[] | null;
  };
  const roomMap = new Map<string, { organizationId: string; propertyName: string; roomLabel: string }>();
  for (const row of (roomResult.data ?? []) as RoomRow[]) {
    if (!row.external_room_id) continue;
    const property = Array.isArray(row.properties) ? row.properties[0] : row.properties;
    if (!property?.name) continue;
    roomMap.set(row.external_room_id, {
      organizationId: row.organization_id,
      propertyName: property.name,
      roomLabel: row.room_label,
    });
  }

  const rows: Database["public"]["Tables"]["room_blocks"]["Insert"][] = [];
  for (const block of fetched.blocks) {
    const room = roomMap.get(block.externalRoomId);
    if (!room) {
      result.unresolvedRooms++;
      continue;
    }
    rows.push({
      organization_id: room.organizationId,
      source: "beds24",
      property_name: room.propertyName,
      room_label: room.roomLabel,
      external_room_id: block.externalRoomId,
      start_date: block.startDate,
      end_date: block.endDate,
      override_kind: "blackout",
      synced_at: new Date().toISOString(),
    });
  }
  result.blocks = rows.length;

  // Beds24 를 못 읽었으면(토큰·HTTP 실패) 기존 블락을 지우지 않는다. 빈 결과와 「못 읽음」을
  // 구분하지 않으면 장애 한 번에 캘린더의 차단 표시가 통째로 사라진다.
  if (fetched.skipped.length > 0 && rows.length === 0) {
    return result;
  }

  let deleteQuery = supabase
    .from("room_blocks")
    .delete()
    .eq("source", "beds24")
    .gte("start_date", window.from)
    .lte("start_date", window.to);
  if (options?.organizationId) {
    deleteQuery = deleteQuery.eq("organization_id", options.organizationId);
  }
  const deleteResult = await deleteQuery.select("id");
  if (deleteResult.error) {
    result.skipped.push(`room-blocks:delete-${deleteResult.error.message}`);
    return result;
  }
  result.removed = (deleteResult.data ?? []).length;

  if (rows.length > 0) {
    const insertResult = await supabase.from("room_blocks").insert(rows);
    if (insertResult.error) {
      result.skipped.push(`room-blocks:insert-${insertResult.error.message}`);
      result.blocks = 0;
    }
  }

  return result;
}
