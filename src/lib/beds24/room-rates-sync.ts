import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveBeds24AccessToken } from "@/lib/beds24/access-token";
import { getOptionalBeds24ApiEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Beds24 객실 × 날짜별 요금·재고를 `room_daily_rates` 로 가져온다.
 *
 * 도메인 계약: docs/product/33-calendar-write-features.md
 * 표 설계: supabase/migrations/202609170002_room_daily_rates.sql
 *
 * ## 응답은 날짜별이 아니라 **구간별**이다
 *
 * ```json
 * {"from":"2026-09-23","to":"2026-09-24","numAvail":0,"minStay":2,"maxStay":50,
 *  "override":"none","price1":23671}
 * ```
 *
 * 값이 같은 날이 이어지면 한 덩어리로 온다(2026-09-17 실측: 59구간 중 26구간이 이틀 이상).
 * **여기서 날짜 단위로 펼친다** — 캘린더 격자가 날짜 칸으로 그려지기 때문이다.
 *
 * ## `includeLinkedPrices` 가 있어야 값이 다 온다
 *
 * `includePrices=true` 만 붙이면 **그 유닛에 직접 박아 둔 값만** 온다. Beds24 에서 가격은
 * 연결(link)로 퍼지는데 — 같은 물리적 방의 다른 유닛, 그리고 채널별 파생가 — 그 연결분은
 * 별도 파라미터를 켜야 나온다. 저쪽 원본은 처음부터 둘 다 보낸다.
 *
 * 2026-09-17 실측(오쿠보C · 10/1):
 *
 * ```
 * includeLinkedPrices 없이   648399(판매 중) p1=—            450096 p1=79000 p2=— p3=—
 * includeLinkedPrices 켜고   648399(판매 중) p1=79000        450096 p1=79000 p2=116920 p3=102700
 * ```
 *
 * 없이 받으면 두 가지가 동시에 빈다 — **파생가로 파는 유닛의 가격 전부**(오쿠보C 는 10/1 에
 * 판매 유닛이 450096 → 648399 로 바뀌어서 그날부터 화면이 통째로 비었다), 그리고 **모든 방의
 * price2(부킹닷컴)·price3(대체가)** — 33,306행 전부 비어 있었다.
 *
 * ## 읽기 전용이다
 *
 * 이 모듈은 **Beds24 에 쓰지 않는다.** 병행 기간에는 쓰기를 켜지 않는다는 전체 원칙 그대로다
 * (docs/product/33-calendar-write-features.md → 「켜기 전까지 쓰지 않는다」).
 */

type JsonRecord = Record<string, unknown>;

export type RoomRatesSyncResult = {
  /** 펼쳐서 저장한 날짜 행 수. */
  rows: number;
  /** 응답에서 읽은 구간 수. */
  segments: number;
  /** 값을 받은 객실 수(우리 `rooms` 에 매칭된 것만). */
  matchedRooms: number;
  /** Beds24 는 줬지만 우리 방 마스터에 없어 버린 roomId. */
  unmatchedRoomIds: string[];
  properties: number;
  skipped: string[];
  window: { from: string; to: string };
};

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

function readInt(record: JsonRecord, key: string): number | null {
  const value = record[key];
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/**
 * Beds24 캘린더 응답의 쪽 수 상한. 한 건물 12개월이 여기까지 갈 일은 없지만, 없으면 응답이
 * 이상할 때 무한히 돈다.
 */
const CALENDAR_MAX_PAGES = 20;

class CalendarHttpError extends Error {
  constructor(readonly status: number) {
    super(`calendar http ${status}`);
  }
}

/**
 * `pages.nextPageExists` 를 따라 **끝까지** 읽는다.
 *
 * 저쪽 프로젝트는 이 처리가 가격 조회에만 빠져 있었고, 「잘린 뒤쪽은 조용히 사라져 영구
 * 미동기화」가 됐다고 주석에 적어 두었다. 우리는 건물 단위로 나눠 부르므로 아직 한 쪽에
 * 들어오지만, 객실이 늘면 같은 자리에서 같은 식으로 조용히 끊긴다.
 */
async function fetchCalendarPages(
  firstUrl: string,
  headers: Record<string, string>,
): Promise<JsonRecord[]> {
  const pages: JsonRecord[] = [];
  let url: string | null = firstUrl;
  while (url && pages.length < CALENDAR_MAX_PAGES) {
    const response: Response = await fetch(url, { headers, cache: "no-store" });
    if (!response.ok) throw new CalendarHttpError(response.status);
    const root = asRecord(await response.json());
    if (!root) break;
    pages.push(root);
    const paging = asRecord(root.pages);
    url = paging?.nextPageExists === true ? readString(paging, ["nextPageLink"]) : null;
  }
  return pages;
}

/**
 * 기본 창 — **어제부터 12개월**.
 *
 * 가격은 몇 달 앞을 미리 잡는 일이라 판매 캘린더가 12개월 이상을 본다
 * (docs/product/32-ops-admin-area.md 「기간도 분리한다」). 어제를 포함하는 이유는 30일 뷰의
 * 시작일이 어제이기 때문이다.
 */
export function buildRoomRatesWindow(now = new Date()): { from: string; to: string } {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = jst.getUTCFullYear();
  const month = jst.getUTCMonth();
  const day = jst.getUTCDate();
  const from = new Date(Date.UTC(year, month, day - 1));
  const to = new Date(Date.UTC(year, month + 12, day));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function eachDate(from: string, to: string): string[] {
  const dates: string[] = [];
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const end = Date.UTC(ty, tm - 1, td);
  for (let cursor = Date.UTC(fy, fm - 1, fd); cursor <= end; cursor += 86_400_000) {
    dates.push(new Date(cursor).toISOString().slice(0, 10));
    // 한 구간이 비정상적으로 길면(응답 오류 등) 여기서 멈춘다 — 1년치를 한 구간으로 받는 일은 없다.
    if (dates.length > 400) break;
  }
  return dates;
}

type RateRow = {
  organization_id: string;
  room_id: string;
  stay_date: string;
  price1: number | null;
  price2: number | null;
  price3: number | null;
  min_stay: number | null;
  max_stay: number | null;
  num_avail: number | null;
  override_kind: string | null;
  synced_at: string;
};

export type RoomRatesSyncOptions = {
  /**
   * 이 건물만 동기화한다. 가격 웹훅이 한 건물을 가리킬 때 나머지 8곳까지 부르지 않기 위해서다.
   * 없으면 전 건물.
   */
  externalPropertyIds?: string[];
};

/**
 * @param window 없으면 `buildRoomRatesWindow()` (어제 ~ +12개월).
 */
export async function syncBeds24RoomRates(
  organizationId: string,
  supabase: SupabaseClient<Database>,
  window = buildRoomRatesWindow(),
  options: RoomRatesSyncOptions = {},
): Promise<RoomRatesSyncResult> {
  const propertyFilter = options.externalPropertyIds?.length
    ? new Set(options.externalPropertyIds.map(String))
    : null;
  const empty: RoomRatesSyncResult = {
    rows: 0,
    segments: 0,
    matchedRooms: 0,
    unmatchedRoomIds: [],
    properties: 0,
    skipped: [],
    window,
  };

  const env = getOptionalBeds24ApiEnv();
  if (!env) return { ...empty, skipped: ["room-rates:missing-env"] };
  // 토큰 캐시는 `access-token.ts` 가 프로세스 전체에서 하나만 들고 있다 — 모듈마다 따로 두면
  // 한 요청 안에서 갱신이 여러 번 일어나고 실패 지점이 그만큼 늘어난다.
  const tokenState = await resolveBeds24AccessToken("room-rates");
  if (!tokenState.ok) return { ...empty, skipped: [tokenState.skipped] };

  const base = env.baseUrl.replace(/\/$/, "");
  const headers = { accept: "application/json", token: tokenState.token };

  // 우리 방 마스터에 있는 roomId 만 저장한다. Beds24 가 준 방이 우리에게 없으면 **조용히 버리지
  // 않고** `unmatchedRoomIds` 에 남긴다 — 그게 곧 방 마스터가 뒤처졌다는 신호다.
  const roomsResult = await supabase
    .from("rooms")
    .select("id, external_room_id")
    .eq("organization_id", organizationId)
    .eq("external_provider", "beds24")
    .not("external_room_id", "is", null);
  if (roomsResult.error) {
    return { ...empty, skipped: [`room-rates:rooms-read-${roomsResult.error.code ?? "error"}`] };
  }
  const roomIdByExternal = new Map<string, string>();
  for (const row of (roomsResult.data ?? []) as Array<{ id: string; external_room_id: string | null }>) {
    if (row.external_room_id) roomIdByExternal.set(String(row.external_room_id), row.id);
  }

  // 네트워크 예외를 **던지지 않는다.** 이 함수는 크론이 돌리는 안전망이라, 한 번의 순간적인
  // 실패로 500 을 내면 그 주기의 갱신이 통째로 사라진다(2026-09-17 실제로 한 번 겪었다).
  let propertiesRoot: JsonRecord | null = null;
  try {
    const propertiesResponse = await fetch(`${base}/properties?includeAllRooms=true`, {
      headers,
      cache: "no-store",
    });
    if (!propertiesResponse.ok) {
      return { ...empty, skipped: [`room-rates:properties-http-${propertiesResponse.status}`] };
    }
    propertiesRoot = asRecord(await propertiesResponse.json());
  } catch (error) {
    console.error("[beds24/rates] properties fetch failed", error);
    return { ...empty, skipped: ["room-rates:properties-request-error"] };
  }
  const propertyRows = Array.isArray(propertiesRoot?.data) ? propertiesRoot.data : [];

  const skipped: string[] = [];
  const unmatched = new Set<string>();
  const matched = new Set<string>();
  const rows: RateRow[] = [];
  const syncedAt = new Date().toISOString();
  let properties = 0;
  let segments = 0;

  for (const propertyValue of propertyRows) {
    const property = asRecord(propertyValue);
    const externalPropertyId = property ? readString(property, ["id", "propertyId"]) : null;
    if (!externalPropertyId) continue;
    if (propertyFilter && !propertyFilter.has(externalPropertyId)) continue;
    properties += 1;

    const url =
      `${base}/inventory/rooms/calendar?propertyId=${encodeURIComponent(externalPropertyId)}` +
      `&startDate=${window.from}&endDate=${window.to}` +
      `&includePrices=true&includeLinkedPrices=true` +
      `&includeNumAvail=true&includeMinStay=true&includeMaxStay=true` +
      `&includeOverride=true`;

    // 건물 하나가 실패해도 **나머지 여덟 곳은 갱신된다.** 실패한 건물은 `skipped` 로 남아
    // 다음 주기에 다시 시도된다 — 전부 upsert 라 재시도가 안전하다.
    let pages: JsonRecord[];
    try {
      pages = await fetchCalendarPages(url, headers);
    } catch (error) {
      if (error instanceof CalendarHttpError) {
        skipped.push(`room-rates:calendar-${externalPropertyId}-http-${error.status}`);
        continue;
      }
      console.error("[beds24/rates] calendar fetch failed", { externalPropertyId, error });
      skipped.push(`room-rates:calendar-${externalPropertyId}-request-error`);
      continue;
    }
    if (pages.length >= CALENDAR_MAX_PAGES) {
      // 조용히 넘기지 않는다 — 다음 쪽이 남아 있으면 그 날짜들은 옛 값으로 굳는다.
      console.warn("[beds24/rates] calendar paging hit the cap", { externalPropertyId });
      skipped.push(`room-rates:calendar-${externalPropertyId}-paging-capped`);
    }
    const data = pages.flatMap((page) => (Array.isArray(page.data) ? page.data : []));

    for (const roomValue of data) {
      const room = asRecord(roomValue);
      if (!room) continue;
      const externalRoomId = readString(room, ["roomId", "id"]);
      if (!externalRoomId) continue;
      const roomUuid = roomIdByExternal.get(externalRoomId);
      if (!roomUuid) {
        unmatched.add(externalRoomId);
        continue;
      }
      matched.add(externalRoomId);

      const calendar = Array.isArray(room.calendar) ? room.calendar : [];
      for (const segmentValue of calendar) {
        const segment = asRecord(segmentValue);
        if (!segment) continue;
        const from = readString(segment, ["from"]);
        const to = readString(segment, ["to"]);
        if (!from || !to) continue;
        segments += 1;

        const shared = {
          organization_id: organizationId,
          room_id: roomUuid,
          price1: readInt(segment, "price1"),
          price2: readInt(segment, "price2"),
          price3: readInt(segment, "price3"),
          min_stay: readInt(segment, "minStay"),
          max_stay: readInt(segment, "maxStay"),
          num_avail: readInt(segment, "numAvail"),
          override_kind: readString(segment, ["override"]),
          synced_at: syncedAt,
        };
        for (const stayDate of eachDate(from, to)) {
          rows.push({ ...shared, stay_date: stayDate });
        }
      }
    }
  }

  // 한 번에 다 넣으면 요청이 너무 커진다(90객실 × 366일 ≈ 33,000행).
  const CHUNK = 1000;
  let written = 0;
  for (let index = 0; index < rows.length; index += CHUNK) {
    const chunk = rows.slice(index, index + CHUNK);
    const result = await supabase
      .from("room_daily_rates")
      .upsert(chunk, { onConflict: "room_id,stay_date" });
    if (result.error) {
      skipped.push(`room-rates:upsert-${result.error.code ?? "error"}`);
      console.error("[beds24/rates] upsert failed", { at: index, error: result.error });
      break;
    }
    written += chunk.length;
  }

  if (unmatched.size > 0) {
    console.warn("[beds24/rates] rooms missing from master", [...unmatched]);
  }

  return {
    rows: written,
    segments,
    matchedRooms: matched.size,
    unmatchedRoomIds: [...unmatched],
    properties,
    skipped,
    window,
  };
}
