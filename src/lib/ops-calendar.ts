import { normalizeReservationSource } from "@/lib/beds24/source-normalization";
import {
  getCanonicalPropertyName,
  getCanonicalRoomLabel,
  getDisplayRoomLabel,
  isExcludedOperationalRoom,
} from "@/lib/room-label-normalization";
import {
  buildGlobalExternalRoomToCanonical,
  buildPropertyRoomLookups,
  getActiveRoomCatalog,
  resolveReservationCanonicalRoomLabel,
} from "@/lib/rooms";
import { sortBuildings, toJstDateString } from "@/lib/admin-calendar-dashboard";
import {
  detectOneNightGaps,
  isActiveUnitMinStay,
  type OpsGapCellInput,
} from "@/lib/ops-gap-detection";
import {
  buildHistoryByCell,
  type PriceHistoryRow,
} from "@/lib/ops-price-history";
import { mergeOpsRateUnits, type OpsMergedRate } from "@/lib/ops-rate-merge";
import { buildBlockRanges } from "@/lib/ops-block-ranges";
import {
  attributePriceConversions,
  OPS_PRICE_ATTRIBUTION_LOOKBACK_DAYS,
  PRICE_ATTRIBUTION_WINDOW_HOURS,
  type AttributionCell,
  type AttributionReservation,
} from "@/lib/ops-price-attribution";
import type { AppSession } from "@/lib/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * 운영 관리자 「판매 캘린더」의 읽기 계층.
 *
 * 도메인 계약: docs/product/33-calendar-write-features.md
 *
 * ## 기존 예약 캘린더와 무엇이 다른가
 *
 * | | `/admin/calendar` (읽기) | 여기 |
 * | --- | --- | --- |
 * | 가로축 | 그 달 1일~말일 | **어제부터 30일** (또는 월간) |
 * | 범위 | 당월 + 2개월로 **막혀 있다** | 막지 않는다 |
 * | 목적 | 오늘 누가 어디 있나 | 몇 달 앞을 팔 준비 |
 *
 * 기존 화면의 3개월 제한은 실수가 아니라 **그 화면의 전제**다(현장 전원이 매일 보는 화면).
 * 그래서 넓히지 않고 이쪽을 따로 만든다 → docs/product/32-ops-admin-area.md
 *
 * ## 사노는 여기에 **있다**
 *
 * 청소·예약 캘린더는 사노를 뺀다(`isExcludedOperationalProperty`). 그건 **현장 운영 기준**이다.
 * 그런데 사노는 예약 338건에 2027-05-03 까지 잡혀 있는 **파는 건물**이라, 판매 캘린더에서
 * 빠지면 그 방은 가격을 고칠 방법이 없어진다(2026-09-17 사용자 결정).
 * 저쪽 프로젝트도 캘린더에는 사노를 두고 매출에서만 뺀다.
 *
 * **객실 단위 제외는 그대로다** — 다카다노바바 `401_2` 는 여기서도 숨긴다.
 *
 * ## 가격은 `room_daily_rates` 에서 온다
 *
 * 2026-09-17 에 저장소를 만들었다(마이그레이션 `202609170002_room_daily_rates`). Beds24 의
 * `GET /inventory/rooms/calendar` 는 **구간**으로 주지만 표에는 **날짜별로 펼쳐** 들어가 있어서
 * 여기서는 창 범위를 한 번에 집어 온다.
 *
 * **값이 없는 칸은 그대로 비운다.** 0원처럼 보이게 하면 그것이 곧 잘못된 가격표다 —
 * 비활성 유닛은 애초에 가격이 없고, 그건 「0원」이 아니라 「안 판다」는 뜻이다.
 */

/**
 * PostgREST 는 **한 번에 1,000행까지만** 준다(Supabase `db-max-rows` 기본값). 초과분은
 * 오류가 아니라 **조용히 잘린다** — 화면은 그대로 그려지고 데이터만 사라진다.
 *
 * 2026-09-17 에 판매 캘린더에서 실제로 터졌다: 30일 창에 요금이 2,730행 필요한데 1,000행만
 * 와서 **9/28 부터 가격이 통째로 비어 보였다.** 값이 없는 칸은 「안 판다」로 그리므로,
 * 잘린 것이 「팔지 않는 날」처럼 보인다 — 화면만 보고는 구별할 수 없다.
 *
 * 예약도 같은 벽에 있다(30일 창 716건). 지금은 밑이지만 넘는 순간 **예약 막대가 조용히
 * 사라지고**, 그건 이미 팔린 방을 비었다고 보여준다는 뜻이다.
 */
const SUPABASE_PAGE_SIZE = 1000;

/** 한 페이지가 꽉 차면 다음 장을 더 읽는다. 덜 차면 그게 마지막이다. */
async function readAllPages<Row>(
  build: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>,
): Promise<{ data: Row[]; error: { message: string } | null }> {
  const rows: Row[] = [];
  for (let offset = 0; ; offset += SUPABASE_PAGE_SIZE) {
    const page = await build(offset, offset + SUPABASE_PAGE_SIZE - 1);
    if (page.error) return { data: rows, error: page.error };
    const batch = page.data ?? [];
    rows.push(...batch);
    if (batch.length < SUPABASE_PAGE_SIZE) return { data: rows, error: null };
  }
}

type ReservationRow = Pick<
  Database["public"]["Tables"]["reservations"]["Row"],
  | "id"
  | "check_in_date"
  | "check_out_date"
  | "guest_name"
  | "property_name"
  | "raw_payload"
  | "room_label"
  | "source"
  | "status"
>;

/**
 * 예약 원본(`raw_payload`)에서 **이 화면이 읽는 키만** 받는다(2026-09-30 속도).
 *
 * 원본을 통째로 받으면 30일 창에 1.4MB, 가격 개입 판정 범위에 2.8MB 였다(실측) — 쓰는 것은 객실 매칭
 * 키(`resolveReservationCanonicalRoomLabel`)와 예약 시각(`bookingTime`)뿐이다. PostgREST 의 JSON 경로
 * 선택(`raw_payload->key`)으로 그 키만 받고, 받은 값으로 작은 `raw_payload` 를 다시 만든다 — 호출부는
 * 그대로 `raw_payload` 를 읽는다. **매칭에 새 키를 쓰게 되면 여기에도 넣어야 한다.**
 */
const SLIM_PAYLOAD_KEYS = [
  "roomId",
  "room_id",
  "unitId",
  "unit_id",
  "unitName",
  "unit_name",
  "roomName",
  "room_name",
  "roomLabel",
  "unitLabel",
  "unit_label",
  "room_label",
  "bookingTime",
] as const;

const RESERVATION_SELECT = [
  "id, check_in_date, check_out_date, guest_name, property_name, room_label, source, status",
  ...SLIM_PAYLOAD_KEYS.map((key) => `rp_${key}:raw_payload->${key}`),
].join(", ");

function toReservationRow(raw: Record<string, unknown>): ReservationRow {
  const payload: Record<string, unknown> = {};
  for (const key of SLIM_PAYLOAD_KEYS) {
    const value = raw[`rp_${key}`];
    if (value !== null && value !== undefined) payload[key] = value;
  }
  return {
    check_in_date: raw.check_in_date as string,
    check_out_date: raw.check_out_date as string,
    guest_name: raw.guest_name as string,
    id: raw.id as string,
    property_name: raw.property_name as string,
    raw_payload: payload as ReservationRow["raw_payload"],
    room_label: raw.room_label as string,
    source: raw.source as ReservationRow["source"],
    status: raw.status as ReservationRow["status"],
  };
}

/** JSON 경로 선택은 타입 추론이 안 된다 — 한 쪽의 모양을 직접 적는다. */
type SlimReservationPage = PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>;

/** 쪽을 나눠 읽은 결과를 예약 행으로(원본은 필요한 키만 — `RESERVATION_SELECT`). */
function toReservationRows(result: {
  data: Record<string, unknown>[];
  error: { message: string } | null;
}): { data: ReservationRow[]; error: { message: string } | null } {
  return { data: result.data.map(toReservationRow), error: result.error };
}

type BlockRow = Pick<
  Database["public"]["Tables"]["room_blocks"]["Row"],
  "id" | "property_name" | "room_label" | "start_date" | "end_date"
>;

type RoomRow = {
  id: string;
  room_label: string;
  properties: { name: string } | { name: string }[] | null;
};

type RateRow = Pick<
  Database["public"]["Tables"]["room_daily_rates"]["Row"],
  | "room_id"
  | "stay_date"
  | "price1"
  | "price2"
  | "price3"
  | "min_stay"
  | "max_stay"
  | "num_avail"
  | "override_kind"
>;

export type OpsCalendarChannel = "airbnb" | "booking" | "manual";

/** 가로축 한 칸. `key` 는 `YYYY-MM-DD`. */
export type OpsCalendarDay = {
  /** 도쿄 기준 오늘인가. 30일 뷰에서는 보통 두 번째 칸이다. */
  isToday: boolean;
  /**
   * 사내 기준 주말 = **금·토·일**. 일반적인 토·일이 아니다 —
   * 요금 체계가 그 기준으로 짜여 있다(저쪽 원본 주석: 「금·토·일(사내 주말가) / 월~목」).
   */
  isWeekend: boolean;
  /** 이 칸에서 달이 바뀌는가. 30일 뷰는 달을 넘어가므로 경계를 표시해야 한다. */
  startsMonth: boolean;
  date: string;
  day: number;
  /** 0=일 ~ 6=토. */
  weekday: number;
};

export type OpsCalendarRoom = {
  displayRoomLabel: string;
  key: string;
  propertyName: string;
  /**
   * 이 행 뒤에 있는 우리 `rooms.id` 전부. **한 행에 Beds24 유닛이 여럿일 수 있다.**
   *
   * 쓰기에서 필요하다 — 가격은 소스 유닛으로, 최소숙박은 그 날짜에 운영 중인 유닛으로
   * 가는데, 그 판정을 하려면 후보를 전부 넘겨야 한다(`price-job-queue.ts`).
   * 비어 있으면 그 행은 **고칠 수 없다**(Beds24 에 대응하는 유닛이 없다는 뜻).
   */
  roomIds: string[];
};

/**
 * 격자에 그릴 막대 하나.
 *
 * **`checkIn`~`checkOut` 은 날짜이고, 묵는 밤은 그 사이다.** 화면에서는 체크인 날짜 칸의
 * *가운데*에서 시작해 체크아웃 날짜 칸의 *가운데*에서 끝난다 — 같은 날 나가는 예약과 들어오는
 * 예약이 그 칸 가운데에서 만나야 하루에 둘이 보인다.
 */
/**
 * 가격 개입 전환 한 건 — 격자 토글(막대 강조)과 목록 패널이 같이 쓴다.
 * 판정은 `ops-price-attribution.ts`. 표시용 값만 담는다(원본 예약 JSON 은 안 싣는다).
 */
export type OpsPriceConversion = {
  reservationId: string;
  roomKey: string;
  roomLabel: string;
  propertyName: string;
  guestName: string;
  channel: OpsCalendarChannel;
  checkIn: string;
  checkOut: string;
  /** ISO(UTC). 화면이 도쿄로 바꾼다. */
  appliedAt: string;
  bookedAt: string;
  hoursToBooking: number;
  oldAverage: number | null;
  newAverage: number | null;
  delta: number | null;
  percent: number | null;
  nights: number;
  changedBy: string | null;
};

export type OpsCalendarBar = {
  channel: OpsCalendarChannel;
  checkIn: string;
  checkOut: string;
  guestName: string;
  id: string;
  isCancelled: boolean;
  roomKey: string;
};

/** Beds24 `override: "blackout"`. 양끝 포함이라 9/23~9/26 이면 네 밤이다. */
export type OpsCalendarBlock = {
  endDate: string;
  id: string;
  roomKey: string;
  startDate: string;
};

/** 한 칸의 요금·재고. 값이 없으면 `null` 이고, 그건 0 이 아니다. */
/** 한 칸의 최종 값. 유닛 병합 규칙은 `src/lib/ops-rate-merge.ts` 에 있다. */
export type OpsCalendarRate = OpsMergedRate;

export type OpsCalendarViewMode = "rolling" | "monthly";

export const OPS_CALENDAR_ROLLING_DAYS = 30;

const ROOM_AXIS_SEPARATOR = "::";

function toRoomAxisKey(propertyName: string, displayRoomLabel: string) {
  return `${propertyName}${ROOM_AXIS_SEPARATOR}${displayRoomLabel}`;
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return next.toISOString().slice(0, 10);
}

/**
 * 30일 뷰의 시작일 = **도쿄 기준 어제**.
 *
 * 저쪽 원본은 `new Date(); setDate(getDate() - 1)` 로 **브라우저 로컬 기준**이라 밤에 열면 하루
 * 어긋난다. 우리는 도쿄 운영일에서 하루를 뺀다 — 이 저장소는 UTC 자정 기준으로 날짜를 잘랐다가
 * 9시간 밀린 사고를 이미 겪었다(CLAUDE.md §7).
 */
export function opsRollingStartDate(todayJst: string): string {
  return addDays(todayJst, -1);
}

export function opsCalendarWindow(args: {
  mode: OpsCalendarViewMode;
  /** 30일 뷰의 시작일. 월간 뷰에서는 무시된다. */
  start: string;
  /** 월간 뷰의 대상 달(`YYYY-MM`). */
  month: string;
}): { start: string; endExclusive: string } {
  if (args.mode === "monthly") {
    const [y, m] = args.month.split("-").map(Number);
    const start = `${args.month}-01`;
    const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
    return { start, endExclusive: next };
  }
  return { start: args.start, endExclusive: addDays(args.start, OPS_CALENDAR_ROLLING_DAYS) };
}

export function buildOpsCalendarDays(args: {
  start: string;
  endExclusive: string;
  today: string;
}): OpsCalendarDay[] {
  const days: OpsCalendarDay[] = [];
  let cursor = args.start;
  let previousMonth = "";
  while (cursor < args.endExclusive) {
    const [y, m, d] = cursor.split("-").map(Number);
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const month = cursor.slice(0, 7);
    days.push({
      date: cursor,
      day: d,
      isToday: cursor === args.today,
      // 금(5) · 토(6) · 일(0) — 사내 주말가 기준.
      isWeekend: weekday === 5 || weekday === 6 || weekday === 0,
      startsMonth: previousMonth !== "" && month !== previousMonth,
      weekday,
    });
    previousMonth = month;
    cursor = addDays(cursor, 1);
  }
  return days;
}

/** 예약 출처 → 격자의 채널 칸. 예약 수정이 「채널 예약인가」를 가를 때도 쓴다. */
export function opsChannelOf(source: string | null | undefined): OpsCalendarChannel {
  const normalized = normalizeReservationSource(source);
  if (normalized === "Airbnb") return "airbnb";
  if (normalized === "Booking.com") return "booking";
  return "manual";
}

function sortRooms(rooms: OpsCalendarRoom[]): OpsCalendarRoom[] {
  const order = sortBuildings([...new Set(rooms.map((room) => room.propertyName))]);
  const rank = new Map(order.map((name, index) => [name, index]));
  return [...rooms].sort((a, b) => {
    const byBuilding = (rank.get(a.propertyName) ?? 0) - (rank.get(b.propertyName) ?? 0);
    if (byBuilding !== 0) return byBuilding;
    return a.displayRoomLabel.localeCompare(b.displayRoomLabel, "ko", { numeric: true });
  });
}

/**
 * 예약 한 건 → 캘린더의 **객실 행**.
 *
 * 격자와 수동 예약의 겹침 검사가 **같은 함수**를 쓴다 — 둘이 다르게 매칭하면 격자에는 빈
 * 칸인데 서버는 막거나, 그 반대로 격자에는 찬 칸에 예약이 들어간다.
 */
function makeReservationRoomAxis(roomCatalog: Awaited<ReturnType<typeof getActiveRoomCatalog>>) {
  const lookups = buildPropertyRoomLookups(roomCatalog ?? []);
  const globalExternalRoomToCanonical = buildGlobalExternalRoomToCanonical(roomCatalog ?? []);
  return (row: Pick<ReservationRow, "property_name" | "raw_payload" | "room_label">) => {
    const propertyName = getCanonicalPropertyName(row.property_name);
    const resolved = resolveReservationCanonicalRoomLabel(
      {
        property_name: row.property_name,
        raw_payload: row.raw_payload,
        room_label: row.room_label,
      },
      { globalExternalRoomToCanonical, isAuthoritative: roomCatalog !== undefined, lookups },
    );
    const canonicalRoomKey =
      resolved ?? getCanonicalRoomLabel(propertyName, row.room_label) ?? row.room_label.trim();
    const displayRoomLabel =
      getDisplayRoomLabel(propertyName, canonicalRoomKey) || canonicalRoomKey;
    return { displayRoomLabel, propertyName, roomKey: toRoomAxisKey(propertyName, displayRoomLabel) };
  };
}

/** 블록 한 건 → 객실 행 키. 블록은 우리 표에 사람이 읽는 이름으로 들어 있다. */
function blockRoomAxisKey(row: Pick<BlockRow, "property_name" | "room_label">): string {
  const propertyName = getCanonicalPropertyName(row.property_name);
  const canonicalRoomKey =
    getCanonicalRoomLabel(propertyName, row.room_label) || row.room_label.trim();
  const displayRoomLabel = getDisplayRoomLabel(propertyName, canonicalRoomKey) || canonicalRoomKey;
  return toRoomAxisKey(propertyName, displayRoomLabel);
}

/**
 * 한 객실 행에서 **팔 수 없는 밤**(`from` 이상 `toExclusive` 미만).
 *
 * 수동 예약 패널의 날짜 피커가 회색으로 칠할 날, 그리고 서버가 만들기 직전에 겹침을 막는
 * 근거다. 두 가지를 합친다 —
 *
 * - **이미 찬 밤**: 살아 있는 예약(취소·노쇼 제외) 또는 블록(`room_blocks` + 요금 표의 blackout — 12개월).
 * - **파는 유닛이 없는 밤**: 그 행의 유닛이 하나도 활성(`1 ≤ minStay < 50`)이 아니다. 만들어도
 *   Beds24 가 받지 않거나 잠긴 유닛에 붙는다 — 서버가 어차피 거절하는 밤이다. 요금 행이
 *   없는 밤도 여기에 든다(모르는 밤은 팔 수 있다고 하지 않는다).
 *
 * `booked` 와 `unsellable` 을 나눠 돌려준다 — 겹침 검사는 앞의 것만 본다(뒤의 것은 유닛 결정이
 * 더 자세한 사유와 함께 막는다).
 */
export async function readOpsRoomUnavailableNights(args: {
  organizationId: string;
  supabase: SupabaseClient<Database>;
  roomKey: string;
  /** 이 행의 우리 `rooms.id`. 호출부가 조직 소속을 확인한 값이어야 한다. */
  roomIds: string[];
  from: string;
  toExclusive: string;
  /** 이 예약은 세지 않는다 — 예약 수정에서 **자기 자신과 겹친다**고 막으면 안 된다. */
  excludeReservationId?: string;
}): Promise<{ booked: string[]; unsellable: string[] }> {
  const { organizationId, supabase } = args;
  const [roomCatalog, reservationsResult, blocksResult, ratesResult] = await Promise.all([
    getActiveRoomCatalog(organizationId, supabase, { includeNonOperationalProperties: true }),
    readAllPages<Record<string, unknown>>((from, to) =>
      supabase
        .from("reservations")
        .select(RESERVATION_SELECT)
        .eq("organization_id", organizationId)
        .lt("check_in_date", args.toExclusive)
        // 체크아웃 날은 밤이 아니다 — `from` 에 나가는 손님은 겹치지 않는다.
        .gt("check_out_date", args.from)
        .order("check_in_date", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to) as unknown as SlimReservationPage,
    ).then(toReservationRows),
    readAllPages<BlockRow>((from, to) =>
      supabase
        .from("room_blocks")
        .select("id, property_name, room_label, start_date, end_date")
        .eq("organization_id", organizationId)
        .lt("start_date", args.toExclusive)
        .gte("end_date", args.from)
        .order("start_date", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
    args.roomIds.length === 0
      ? Promise.resolve({
          data: [] as Array<Pick<RateRow, "room_id" | "stay_date" | "min_stay" | "override_kind">>,
          error: null,
        })
      : readAllPages<Pick<RateRow, "room_id" | "stay_date" | "min_stay" | "override_kind">>((from, to) =>
          supabase
            .from("room_daily_rates")
            .select("room_id, stay_date, min_stay, override_kind")
            .eq("organization_id", organizationId)
            .in("room_id", args.roomIds)
            .gte("stay_date", args.from)
            .lt("stay_date", args.toExclusive)
            .order("room_id", { ascending: true })
            .order("stay_date", { ascending: true })
            .range(from, to),
        ),
  ]);
  // 모르면 막는다 — 읽기에 실패했는데 「비어 있다」고 하면 그대로 초과예약이 된다.
  if (reservationsResult.error) throw new Error(reservationsResult.error.message);
  if (blocksResult.error) throw new Error(blocksResult.error.message);
  if (ratesResult.error) throw new Error(ratesResult.error.message);

  const nights: string[] = [];
  for (let cursor = args.from; cursor < args.toExclusive; cursor = addDays(cursor, 1)) {
    nights.push(cursor);
  }

  const booked = new Set<string>();
  const reservationRoomAxis = makeReservationRoomAxis(roomCatalog);
  for (const row of reservationsResult.data) {
    if (row.status === "cancelled" || row.status === "no_show") continue;
    if (row.id === args.excludeReservationId) continue;
    if (isExcludedOperationalRoom(row.property_name, row.room_label)) continue;
    if (reservationRoomAxis(row).roomKey !== args.roomKey) continue;
    for (const night of nights) {
      if (night >= row.check_in_date && night < row.check_out_date) booked.add(night);
    }
  }
  for (const row of blocksResult.data) {
    if (isExcludedOperationalRoom(row.property_name, row.room_label)) continue;
    if (blockRoomAxisKey(row) !== args.roomKey) continue;
    // 블록은 양끝을 포함한다.
    for (const night of nights) {
      if (night >= row.start_date && night <= row.end_date) booked.add(night);
    }
  }

  const activeNights = new Set<string>();
  for (const row of ratesResult.data) {
    if (!isActiveUnitMinStay(row.min_stay)) continue;
    activeNights.add(row.stay_date);
    // **Beds24 에서 막아 둔 밤도 찬 밤이다** — 격자의 BLOCK 막대와 같은 기준(운영 중 유닛의
    // blackout). `room_blocks` 는 3개월 창뿐이라 그 너머 차단을 여기서 잡는다(2026-09-29).
    if ((row.override_kind ?? "").toLowerCase() === "blackout" && nights.includes(row.stay_date)) {
      booked.add(row.stay_date);
    }
  }
  const unsellable = nights.filter((night) => !booked.has(night) && !activeNights.has(night));

  return { booked: nights.filter((night) => booked.has(night)), unsellable };
}

export async function getOpsCalendarData(
  session: AppSession,
  filters: {
    mode?: string;
    month?: string;
    property?: string;
    start?: string;
    /** 취소된 예약도 함께 볼 것인가. 기본은 꺼짐 — 저쪽 `showCancelled` 와 같다. */
    showCancelled?: boolean;
  },
) {
  const today = toJstDateString(new Date());
  const mode: OpsCalendarViewMode = filters.mode === "monthly" ? "monthly" : "rolling";
  const start =
    filters.start && /^\d{4}-\d{2}-\d{2}$/.test(filters.start)
      ? filters.start
      : opsRollingStartDate(today);
  const month =
    filters.month && /^\d{4}-\d{2}$/.test(filters.month) ? filters.month : today.slice(0, 7);
  const window = opsCalendarWindow({ mode, start, month });
  const days = buildOpsCalendarDays({ ...window, today });

  const supabase = await getSupabaseServerClient();
  /*
   * **서로 기다릴 필요 없는 조회는 한꺼번에 시작한다**(2026-09-30 속도). 예전에는 10개 가까운 조회가
   * 하나씩 차례로 돌아 1.5초 넘게 쌓였다 — 건물을 옮길 때마다 전부 다시 돈다. 아래에서는 필요한
   * 자리에서 결과만 기다린다. 요금은 객실 목록이, 판정용 예약은 90일 이력이 있어야 해서 그 둘만 뒤에 온다.
   */
  const allRoomsPromise = readAllPages<RoomRow>((from, to) =>
    supabase
      .from("rooms")
      .select("id, room_label, properties(name)")
      .eq("organization_id", session.organization.id)
      .order("id", { ascending: true })
      .range(from, to),
  );
  // Supabase 빌더는 `then` 이 불려야 요청을 보낸다 — `Promise.resolve` 로 감싸야 **지금** 시작한다.
  const freshnessPromise = Promise.resolve(supabase
    .from("room_daily_rates")
    .select("synced_at")
    .eq("organization_id", session.organization.id)
    .gte("stay_date", window.start)
    .lt("stay_date", window.endExclusive)
    .order("synced_at", { ascending: true })
    .limit(1)
    .maybeSingle());
  const historyPromise = readAllPages<{
    room_label: string | null;
    stay_date: string;
    field: string;
    old_value: number | null;
    new_value: number | null;
    created_at: string;
    changed_by_name: string | null;
    adjust_mode: string | null;
    percent_value: number | null;
    room_id: string | null;
  }>((from, to) =>
    supabase
      .from("price_change_logs")
      .select(
        "room_id, room_label, stay_date, field, old_value, new_value, created_at, changed_by_name, adjust_mode, percent_value",
      )
      .eq("organization_id", session.organization.id)
      .gte("stay_date", window.start)
      .lt("stay_date", window.endExclusive)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to),
  );
  const since = new Date(Date.now() - OPS_PRICE_ATTRIBUTION_LOOKBACK_DAYS * 86_400_000).toISOString();
  const attributionLogsPromise = readAllPages<{
      id: string;
      job_id: string | null;
      room_id: string | null;
      stay_date: string;
      old_value: number | null;
      new_value: number | null;
      created_at: string;
      changed_by_name: string | null;
    }>((from, to) =>
      supabase
        .from("price_change_logs")
        .select("id, job_id, room_id, stay_date, old_value, new_value, created_at, changed_by_name")
        .eq("organization_id", session.organization.id)
        .eq("field", "price1")
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    );
  const propertyIdPromise = Promise.resolve(supabase
    .from("properties")
    .select("name, external_property_id")
    .eq("organization_id", session.organization.id)
    .not("external_property_id", "is", null));
  const [roomCatalog, reservationsResult, blocksResult] = await Promise.all([
    // 사노 포함. 객실 단위 제외(다카다노바바 401_2)는 카탈로그 안에서 그대로 걸린다.
    getActiveRoomCatalog(session.organization.id, supabase, {
      includeNonOperationalProperties: true,
    }),
    // 쪽을 나눠 읽으므로 **정렬이 유일해야 한다** — 같은 값이 여럿이면 쪽 경계에서 어떤 행은
    // 두 번, 어떤 행은 한 번도 안 온다. `id` 를 마지막 기준으로 붙여 순서를 못 박는다.
    readAllPages<Record<string, unknown>>((from, to) =>
      supabase
        .from("reservations")
        .select(RESERVATION_SELECT)
        .eq("organization_id", session.organization.id)
        .lt("check_in_date", window.endExclusive)
        .gte("check_out_date", window.start)
        .order("check_in_date", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to) as unknown as SlimReservationPage,
    ).then(toReservationRows),
    readAllPages<BlockRow>((from, to) =>
      supabase
        .from("room_blocks")
        .select("id, property_name, room_label, start_date, end_date")
        .eq("organization_id", session.organization.id)
        // 창 밖에서 시작해 안으로 들어오는 블락도 잡아야 한다.
        .lt("start_date", window.endExclusive)
        .gte("end_date", window.start)
        .order("start_date", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
  ]);

  if (reservationsResult.error) throw new Error(reservationsResult.error.message);

  const reservationRoomAxis = makeReservationRoomAxis(roomCatalog);
  const roomsByKey = new Map<string, OpsCalendarRoom>();

  for (const entry of roomCatalog ?? []) {
    const key = toRoomAxisKey(entry.propertyName, entry.displayRoomLabel);
    roomsByKey.set(key, {
      displayRoomLabel: entry.displayRoomLabel,
      key,
      propertyName: entry.propertyName,
      roomIds: [],
    });
  }

  const bars: OpsCalendarBar[] = [];
  for (const row of reservationsResult.data) {
    // 건물 단위 제외는 여기서 하지 않는다(사노가 보여야 한다). 객실 단위는 그대로 건다.
    if (isExcludedOperationalRoom(row.property_name, row.room_label)) continue;

    const isCancelled = row.status === "cancelled" || row.status === "no_show";
    if (isCancelled && !filters.showCancelled) continue;

    const { displayRoomLabel, propertyName, roomKey } = reservationRoomAxis(row);

    if (!roomsByKey.has(roomKey)) {
      roomsByKey.set(roomKey, { displayRoomLabel, key: roomKey, propertyName, roomIds: [] });
    }
    bars.push({
      channel: opsChannelOf(row.source),
      checkIn: row.check_in_date,
      checkOut: row.check_out_date,
      guestName: row.guest_name,
      id: row.id,
      isCancelled,
      roomKey,
    });
  }

  let blocks: OpsCalendarBlock[] = [];
  if (blocksResult.error) {
    console.error("[ops-calendar] room block read failed", blocksResult.error);
  } else {
    for (const row of blocksResult.data) {
      if (isExcludedOperationalRoom(row.property_name, row.room_label)) continue;
      const roomKey = blockRoomAxisKey(row);
      // 그릴 행이 없으면 조용히 버린다 — 캘린더를 깨뜨리는 것보다 낫다.
      if (!roomsByKey.has(roomKey)) continue;
      blocks.push({ endDate: row.end_date, id: row.id, roomKey, startDate: row.start_date });
    }
  }

  // 요금은 **그 행의 유닛 전부**에서 읽는다. 한 캘린더 행에 Beds24 유닛이 둘일 수 있고
  // (예: 401 + 401_2_2), 저쪽 원본은 그럴 때 「하나라도 팔 수 있으면 팔 수 있다」로 본다
  // (`getDualRoomPhysicalStatus` — 물리적으로 같은 방이면 이어진 것이다).
  //
  // 2026-09-17 기준 우리 데이터에는 활성 유닛이 둘인 행이 **없지만**, Beds24 에서 유닛이
  // 교체되면 생긴다. 그때 가짜 갭이 쏟아지지 않게 처음부터 이렇게 짠다.
  const roomKeyByUuid = new Map<string, string>();
  const allRoomsResult = await allRoomsPromise;
  if (allRoomsResult.error) {
    console.error("[ops-calendar] room read failed", allRoomsResult.error);
  } else {
    for (const row of allRoomsResult.data) {
      const propertyRow = Array.isArray(row.properties) ? row.properties[0] : row.properties;
      const propertyName = getCanonicalPropertyName(propertyRow?.name?.trim() || "Unknown");
      if (isExcludedOperationalRoom(propertyName, row.room_label)) continue;
      const canonical = getCanonicalRoomLabel(propertyName, row.room_label) || row.room_label.trim();
      const displayRoomLabel = getDisplayRoomLabel(propertyName, canonical) || canonical;
      roomKeyByUuid.set(row.id, toRoomAxisKey(propertyName, displayRoomLabel));
    }
  }

  // 쓰기에 필요하다 — 한 행 뒤의 유닛 후보 전부를 행에 달아 둔다.
  for (const [roomUuid, roomKey] of roomKeyByUuid) {
    const room = roomsByKey.get(roomKey);
    if (room && !room.roomIds.includes(roomUuid)) room.roomIds.push(roomUuid);
  }

  // 창의 **하루 바깥까지** 읽는다. 갭 판정이 어제·내일을 보기 때문에, 가장자리에서 데이터가
  // 끊기면 실제 갭을 「모른다」로 흘려보낸다.
  const rateFrom = addDays(window.start, -1);
  const rateToExclusive = addDays(window.endExclusive, 1);
  const rates = new Map<string, OpsCalendarRate>();
  /*
   * 건물을 골랐으면 **그 건물 객실의 요금만** 읽는다(2026-09-30 속도). 전에는 건물 하나를 봐도 91실 전부
   * (2,912행)를 읽고 마지막에 걸렀다. 건물 이름이 맞지 않으면(없는 건물) 전부 읽는다 — 화면이 전체로
   * 떨어지므로.
   */
  const propertyPrefix = filters.property ? `${filters.property}${ROOM_AXIS_SEPARATOR}` : null;
  const scopedRateRoomIds = [...roomKeyByUuid]
    .filter(([, roomKey]) => !propertyPrefix || roomKey.startsWith(propertyPrefix))
    .map(([roomUuid]) => roomUuid);
  const rateRoomIds = scopedRateRoomIds.length > 0 ? scopedRateRoomIds : [...roomKeyByUuid.keys()];
  if (rateRoomIds.length > 0) {
    // 객실 91 × 32일 = 2,912행. **한 번에 못 온다** — 쪽을 나눠 전부 읽는다.
    // `(room_id, stay_date)` 는 유니크라 정렬이 확정된다.
    const ratesResult = await readAllPages<RateRow>((from, to) =>
      supabase
        .from("room_daily_rates")
        .select(
          "room_id, stay_date, price1, price2, price3, min_stay, max_stay, num_avail, override_kind",
        )
        .eq("organization_id", session.organization.id)
        .in("room_id", rateRoomIds)
        .gte("stay_date", rateFrom)
        .lt("stay_date", rateToExclusive)
        .order("room_id", { ascending: true })
        .order("stay_date", { ascending: true })
        .range(from, to),
    );
    if (ratesResult.error) {
      console.error("[ops-calendar] rate read failed", ratesResult.error);
    } else {
      const unitsByCell = new Map<string, RateRow[]>();
      for (const row of ratesResult.data) {
        const roomKey = roomKeyByUuid.get(row.room_id);
        if (!roomKey) continue;
        const cellKey = `${roomKey}|${row.stay_date}`;
        const bucket = unitsByCell.get(cellKey);
        if (bucket) bucket.push(row);
        else unitsByCell.set(cellKey, [row]);
      }
      // 유닛 병합 규칙은 순수 모듈에 있다 — 두 번 틀렸고 둘 다 화면에서는 「안 파는 날」처럼
      // 보여 눈으로 못 잡는다(`src/lib/ops-rate-merge.ts`).
      for (const [cellKey, units] of unitsByCell) {
        const merged = mergeOpsRateUnits(units);
        if (merged) rates.set(cellKey, merged);
      }
    }
  }

  /*
   * ── 이 창의 요금이 얼마나 오래됐나 ───────────────────────────────────
   *
   * **가장 오래된 값**이 기준이다. 한 칸이라도 낡았으면 그 화면은 낡은 것이다 — 평균이나
   * 최신값으로 재면 「3분 전」이라고 적어 놓고 실제로는 5시간 된 칸을 보여주게 된다.
   *
   * 얼마나 오래된 값인지 모르는 채로 가격을 조정하는 것이 이 화면에서 제일 위험하다.
   */
  const freshness = await freshnessPromise;
  const ratesSyncedAt = (freshness.data as { synced_at: string } | null)?.synced_at ?? null;
  /**
   * 몇 분 전 값인가. **여기서 센다** — 화면은 렌더 중에 시계를 읽으면 안 된다
   * (React 컴파일러가 막는다). 분 단위로만 센다: 초까지 재면 새로고침마다 숫자가 달라져
   * **값이 바뀐 것처럼** 보인다.
   */
  const ratesAgeMinutes = ratesSyncedAt
    ? Math.max(0, Math.floor((Date.now() - new Date(ratesSyncedAt).getTime()) / 60_000))
    : null;

  /*
   * ── 가격 변경 이력 ───────────────────────────────────────────────────
   *
   * 가격이 이상하면 제일 먼저 나오는 질문이 「누가 언제 얼마에서 얼마로 바꿨나」다.
   * 창 범위만 읽는다 — 화면에 없는 칸의 이력은 보여줄 자리도 없다.
   *
   * **객실은 `room_label` 로 잇는다.** 가격은 소스 유닛, 최소숙박은 그날 운영 중인 유닛으로
   * 가서 `room_id` 가 서로 다를 수 있는데, 사람이 보는 행은 하나다.
   */
  const historyResult = await historyPromise;
  if (historyResult.error) {
    console.error("[ops-calendar] price history read failed", historyResult.error);
  }
  const historyRows: PriceHistoryRow[] = [];
  for (const row of historyResult.data) {
    /*
     * **행 키(건물::표시 라벨)로 붙인다**(2026-09-29). 예전에는 로그에 적힌 라벨 그대로 붙여, Beds24 유닛
     * 라벨로 남은 줄(STAY ARI `O302` · 가부키초 `203#`)이 격자의 「302」·「203」 칸을 못 찾았고, 건물이
     * 달라도 번호가 같으면 섞일 수 있었다. 방을 모르는 줄은 건너뛴다.
     */
    const roomKey = row.room_id ? roomKeyByUuid.get(row.room_id) : undefined;
    if (!roomKey) continue;
    historyRows.push({
      at: row.created_at,
      by: row.changed_by_name,
      field: row.field,
      mode: row.adjust_mode,
      newValue: row.new_value,
      oldValue: row.old_value,
      percent: row.percent_value,
      roomLabel: roomKey,
      stayDate: row.stay_date,
    });
  }
  const history = buildHistoryByCell(historyRows);

  // ── 가격 개입 전환 ────────────────────────────────────────────────────
  //
  // 「가격을 바꾼 뒤 48시간 안에 그 방·그 날짜로 들어온 예약」. 판정은 순수 모듈
  // (`ops-price-attribution.ts`, 저쪽 `priceAttribution.js` 와 같은 규칙).
  //
  // 저쪽은 **캘린더에 보이는 기간의 숙박만** 봐서 목록이 두 화면(캘린더 · Price History)으로
  // 나뉘었다. 우리는 **가격을 바꾼 시각 기준 최근 90일 전체**를 판정한다 — 창과 무관하다.
  const priceConversions: OpsPriceConversion[] = [];
  {
    const logsResult = await attributionLogsPromise;
    if (logsResult.error) {
      console.error("[ops-calendar] price attribution log read failed", logsResult.error);
    }
    const cells: AttributionCell[] = [];
    // 우리 작업이 쓴 칸(방·날짜·값 → 시각). 워커가 Beds24 에 쓰고 **우리 표를 고치기 전 몇 초 사이**에
    // 요금 동기화가 돌면 같은 변경이 「Beds24」로 한 번 더 남는다 — 그건 우리 개입이다.
    const jobWrites = new Map<string, number[]>();
    for (const row of logsResult.data ?? []) {
      if (!row.job_id || !row.room_id) continue;
      const key = `${row.room_id}|${row.stay_date}|${row.new_value}`;
      jobWrites.set(key, [...(jobWrites.get(key) ?? []), Date.parse(row.created_at)]);
    }
    const DUPLICATE_WINDOW_MS = 15 * 60 * 1000;
    for (const row of logsResult.data ?? []) {
      const roomKey = row.room_id ? roomKeyByUuid.get(row.room_id) : undefined;
      if (!roomKey) continue;
      if (!row.job_id) {
        const ours = jobWrites.get(`${row.room_id}|${row.stay_date}|${row.new_value}`) ?? [];
        const at = Date.parse(row.created_at);
        if (ours.some((jobAt) => at >= jobAt && at - jobAt < DUPLICATE_WINDOW_MS)) continue;
      }
      cells.push({
        appliedAtMs: Date.parse(row.created_at),
        changedBy: row.changed_by_name,
        // 우리 앱 변경은 작업(job) 단위, Beds24 쪽 변경은 **한 번의 동기화가 같은 시각으로 남긴다**
        // (`room-rates-sync.ts`) — 시각으로 묶어 한 번의 개입으로 본다.
        groupId: row.job_id ?? `beds24:${row.created_at}`,
        newValue: row.new_value,
        oldValue: row.old_value,
        roomKey,
        stayDate: row.stay_date,
      });
    }

    if (cells.length > 0) {
      const stayDates = cells.map((cell) => cell.stayDate).sort();
      // 바꾼 날짜를 덮는 확정 예약 전부 — 「그때 비어 있었나」를 재려면 창 밖 예약도 필요하다.
      const bookingsResult = await readAllPages<Record<string, unknown>>((from, to) =>
        supabase
          .from("reservations")
          .select(RESERVATION_SELECT)
          .eq("organization_id", session.organization.id)
          .lte("check_in_date", stayDates[stayDates.length - 1])
          .gt("check_out_date", stayDates[0])
          .order("check_in_date", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to) as unknown as SlimReservationPage,
      ).then(toReservationRows);
      if (bookingsResult.error) {
        console.error("[ops-calendar] price attribution booking read failed", bookingsResult.error);
      }
      const attributionBookings: AttributionReservation[] = [];
      const shown = new Map<string, { row: ReservationRow; roomKey: string; propertyName: string; label: string }>();
      for (const row of bookingsResult.data ?? []) {
        if (row.status === "cancelled" || row.status === "no_show") continue;
        if (isExcludedOperationalRoom(row.property_name, row.room_label)) continue;
        const axis = reservationRoomAxis(row);
        const raw =
          row.raw_payload && typeof row.raw_payload === "object" && !Array.isArray(row.raw_payload)
            ? (row.raw_payload as Record<string, unknown>)
            : {};
        const bookedAt = typeof raw.bookingTime === "string" ? Date.parse(raw.bookingTime) : NaN;
        attributionBookings.push({
          checkIn: row.check_in_date,
          checkOut: row.check_out_date,
          createdAtMs: Number.isFinite(bookedAt) ? bookedAt : null,
          id: row.id,
          roomKey: axis.roomKey,
        });
        shown.set(row.id, {
          label: axis.displayRoomLabel,
          propertyName: axis.propertyName,
          roomKey: axis.roomKey,
          row,
        });
      }

      for (const conversion of attributePriceConversions({
        cells,
        reservations: attributionBookings,
        windowHours: PRICE_ATTRIBUTION_WINDOW_HOURS,
      })) {
        const booking = shown.get(conversion.reservationId);
        if (!booking) continue;
        priceConversions.push({
          appliedAt: new Date(conversion.appliedAtMs).toISOString(),
          bookedAt: new Date(conversion.bookingCreatedAtMs).toISOString(),
          changedBy: conversion.changedBy,
          channel: opsChannelOf(booking.row.source),
          checkIn: booking.row.check_in_date,
          checkOut: booking.row.check_out_date,
          delta: conversion.delta,
          guestName: booking.row.guest_name,
          hoursToBooking: conversion.hoursToBooking,
          newAverage: conversion.newAverage,
          nights: conversion.nights.length,
          oldAverage: conversion.oldAverage,
          percent: conversion.percent,
          propertyName: booking.propertyName,
          reservationId: conversion.reservationId,
          roomKey: booking.roomKey,
          roomLabel: booking.label,
        });
      }
    }
  }

  // ── 1박 갭 감지 ───────────────────────────────────────────────────────
  //
  // 「하루만 비어 있는데 최소 2박이라 아무도 살 수 없는 날」. 판정식은 순수 모듈에 있다
  // (`ops-gap-detection.ts`) — 규칙이 곧 돈이라 테스트로 고정해 둔다.
  //
  // 점유 여부는 **예약·블락에서 직접** 본다. `numAvail` 은 요금 동기화 시점의 값이라 그 뒤에
  // 들어온 예약을 모른다(예약은 웹훅으로 실시간, 요금은 주기 동기화).
  /*
   * ── BLOCK 막대는 **12개월 전부** (2026-09-29) ─────────────────────────
   *
   * `room_blocks` 는 현장 예약 캘린더용 동기화라 **이번 달 + 2개월**만 채운다. 그 너머의 Beds24
   * 차단은 빈 칸처럼 보였다. 이미 읽은 요금 칸의 `overrideKind`(운영 중 유닛 기준 — `ops-rate-merge`)와
   * `room_blocks`(앱이 방금 건 차단은 요금 표보다 먼저 들어간다)를 **합쳐** 구간으로 다시 묶는다.
   * 끝이 열린 「판매 전」 차단도 숨기지 않는다(사용자 결정 — 전부 보이게).
   */
  {
    const fromRoomBlocks = new Set<string>();
    for (const block of blocks) {
      for (const day of days) {
        if (day.date >= block.startDate && day.date <= block.endDate) {
          fromRoomBlocks.add(`${block.roomKey}|${day.date}`);
        }
      }
    }
    blocks = buildBlockRanges({
      dates: days.map((day) => day.date),
      // **요금 칸이 있으면 그게 정답이다** — 걸고 풀 때 바로 고쳐 두므로(`block-write.ts`
      // `patchLocalOverride`) 가장 최신이다. `room_blocks` 는 요금 칸이 없는 날에만 쓴다: 구간의
      // 일부만 풀면 `room_blocks` 의 원래 행이 남아, 합집합이면 푼 날도 막힌 채 보인다.
      isBlocked: (roomKey, date) => {
        const rate = rates.get(`${roomKey}|${date}`);
        return rate ? rate.overrideKind === "blackout" : fromRoomBlocks.has(`${roomKey}|${date}`);
      },
      roomKeys: [...roomsByKey.keys()],
    });
  }

  const occupiedCells = new Set<string>();
  for (const bar of bars) {
    if (bar.isCancelled) continue;
    for (let date = bar.checkIn; date < bar.checkOut; date = addDays(date, 1)) {
      occupiedCells.add(`${bar.roomKey}|${date}`);
      if (occupiedCells.size > 200_000) break;
    }
  }
  for (const block of blocks) {
    for (let date = block.startDate; date <= block.endDate; date = addDays(date, 1)) {
      occupiedCells.add(`${block.roomKey}|${date}`);
      if (occupiedCells.size > 200_000) break;
    }
  }

  const windowDates = days.map((day) => day.date);
  const gapCells = new Set<string>();
  for (const roomKey of new Set(days.length > 0 ? [...roomsByKey.keys()] : [])) {
    const cellAt = (date: string): OpsGapCellInput | null => {
      const rate = rates.get(`${roomKey}|${date}`);
      if (!rate) return null;
      return {
        minStay: rate.minStay,
        numAvail: rate.numAvail,
        overrideKind: rate.overrideKind,
        occupied: occupiedCells.has(`${roomKey}|${date}`),
      };
    };
    for (const date of detectOneNightGaps({ dates: windowDates, cellAt, today })) {
      gapCells.add(`${roomKey}|${date}`);
    }
  }

  const allRooms = sortRooms([...roomsByKey.values()]);
  const propertyOptions = sortBuildings([
    ...new Set(allRooms.map((room) => room.propertyName)),
  ]);
  /*
   * 표시 이름 → Beds24 `propertyId`.
   *
   * 건물 하나만 당겨 오려면 필요하다 — 우리 이름(`아라키초A`)과 Beds24 이름(`Arakicho A`)이
   * 달라서 이름으로는 못 찾는다.
   */
  const propertyIdResult = await propertyIdPromise;
  const propertyExternalIds: Record<string, string> = {};
  for (const row of (propertyIdResult.data ?? []) as Array<{
    name: string;
    external_property_id: string;
  }>) {
    propertyExternalIds[getCanonicalPropertyName(row.name.trim())] = String(
      row.external_property_id,
    );
  }
  const selectedProperty =
    filters.property && propertyOptions.includes(filters.property) ? filters.property : null;
  const rooms = selectedProperty
    ? allRooms.filter((room) => room.propertyName === selectedProperty)
    : allRooms;
  const visibleRoomKeys = new Set(rooms.map((room) => room.key));
  // 화면으로 보내는 요금·이력도 **보이는 객실 것만**(2026-09-30 속도) — 건물 하나를 봐도 전 객실 것을
  // 실어 보내던 것. 키는 둘 다 `행키|YYYY-MM-DD` 다.
  const isVisibleCell = (cellKey: string) => visibleRoomKeys.has(cellKey.slice(0, cellKey.lastIndexOf("|")));
  const visibleRates = new Map([...rates].filter(([cellKey]) => isVisibleCell(cellKey)));
  const visibleHistory = new Map([...history].filter(([cellKey]) => isVisibleCell(cellKey)));

  return {
    bars: bars.filter((bar) => visibleRoomKeys.has(bar.roomKey)),
    blocks: blocks.filter((block) => visibleRoomKeys.has(block.roomKey)),
    /** 요금이 한 칸이라도 있는가. 하나도 없으면 화면이 「아직 안 들어옴」을 알린다. */
    hasRates: rates.size > 0,
    /** `roomKey|YYYY-MM-DD` — 1박 갭인 칸. */
    gapCells: new Set([...gapCells].filter((key) => visibleRoomKeys.has(key.split("|")[0]))),
    /** `행키|YYYY-MM-DD` → 그 칸의 변경 이력(최신순). 보이는 객실만. */
    history: visibleHistory,
    /** 가격 개입 전환(최근 90일, 최근 예약 먼저). 건물 필터를 따른다. */
    priceConversions: priceConversions.filter((conversion) => visibleRoomKeys.has(conversion.roomKey)),
    /** 이 창에서 **가장 오래된** 요금 동기화가 몇 분 전인가. `null` 이면 요금이 아예 없다. */
    ratesAgeMinutes,
    /** 이 창에서 **가장 오래된** 요금 동기화 시각. `null` 이면 요금이 아예 없다. */
    ratesSyncedAt,
    rates: visibleRates,
    days,
    mode,
    month,
    propertyExternalIds,
    propertyOptions,
    rooms,
    roomTotal: allRooms.length,
    selectedProperty,
    start,
    today,
    window,
  };
}

export type OpsCalendarData = Awaited<ReturnType<typeof getOpsCalendarData>>;
