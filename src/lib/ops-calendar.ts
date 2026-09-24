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
import { detectOneNightGaps, type OpsGapCellInput } from "@/lib/ops-gap-detection";
import { mergeOpsRateUnits, type OpsMergedRate } from "@/lib/ops-rate-merge";
import type { AppSession } from "@/lib/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
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

function toChannel(source: string | null | undefined): OpsCalendarChannel {
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
  const [roomCatalog, reservationsResult, blocksResult] = await Promise.all([
    // 사노 포함. 객실 단위 제외(다카다노바바 401_2)는 카탈로그 안에서 그대로 걸린다.
    getActiveRoomCatalog(session.organization.id, supabase, {
      includeNonOperationalProperties: true,
    }),
    // 쪽을 나눠 읽으므로 **정렬이 유일해야 한다** — 같은 값이 여럿이면 쪽 경계에서 어떤 행은
    // 두 번, 어떤 행은 한 번도 안 온다. `id` 를 마지막 기준으로 붙여 순서를 못 박는다.
    readAllPages<ReservationRow>((from, to) =>
      supabase
        .from("reservations")
        .select(
          "id, check_in_date, check_out_date, guest_name, property_name, raw_payload, room_label, source, status",
        )
        .eq("organization_id", session.organization.id)
        .lt("check_in_date", window.endExclusive)
        .gte("check_out_date", window.start)
        .order("check_in_date", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
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

  const lookups = buildPropertyRoomLookups(roomCatalog ?? []);
  const globalExternalRoomToCanonical = buildGlobalExternalRoomToCanonical(roomCatalog ?? []);
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
    const roomKey = toRoomAxisKey(propertyName, displayRoomLabel);

    if (!roomsByKey.has(roomKey)) {
      roomsByKey.set(roomKey, { displayRoomLabel, key: roomKey, propertyName, roomIds: [] });
    }
    bars.push({
      channel: toChannel(row.source),
      checkIn: row.check_in_date,
      checkOut: row.check_out_date,
      guestName: row.guest_name,
      id: row.id,
      isCancelled,
      roomKey,
    });
  }

  const blocks: OpsCalendarBlock[] = [];
  if (blocksResult.error) {
    console.error("[ops-calendar] room block read failed", blocksResult.error);
  } else {
    for (const row of blocksResult.data) {
      if (isExcludedOperationalRoom(row.property_name, row.room_label)) continue;
      const propertyName = getCanonicalPropertyName(row.property_name);
      const canonicalRoomKey =
        getCanonicalRoomLabel(propertyName, row.room_label) || row.room_label.trim();
      const displayRoomLabel =
        getDisplayRoomLabel(propertyName, canonicalRoomKey) || canonicalRoomKey;
      const roomKey = toRoomAxisKey(propertyName, displayRoomLabel);
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
  const allRoomsResult = await readAllPages<RoomRow>((from, to) =>
    supabase
      .from("rooms")
      .select("id, room_label, properties(name)")
      .eq("organization_id", session.organization.id)
      .order("id", { ascending: true })
      .range(from, to),
  );
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
  if (roomKeyByUuid.size > 0) {
    // 객실 91 × 32일 = 2,912행. **한 번에 못 온다** — 쪽을 나눠 전부 읽는다.
    // `(room_id, stay_date)` 는 유니크라 정렬이 확정된다.
    const ratesResult = await readAllPages<RateRow>((from, to) =>
      supabase
        .from("room_daily_rates")
        .select(
          "room_id, stay_date, price1, price2, price3, min_stay, max_stay, num_avail, override_kind",
        )
        .eq("organization_id", session.organization.id)
        .in("room_id", [...roomKeyByUuid.keys()])
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

  // ── 1박 갭 감지 ───────────────────────────────────────────────────────
  //
  // 「하루만 비어 있는데 최소 2박이라 아무도 살 수 없는 날」. 판정식은 순수 모듈에 있다
  // (`ops-gap-detection.ts`) — 규칙이 곧 돈이라 테스트로 고정해 둔다.
  //
  // 점유 여부는 **예약·블락에서 직접** 본다. `numAvail` 은 요금 동기화 시점의 값이라 그 뒤에
  // 들어온 예약을 모른다(예약은 웹훅으로 실시간, 요금은 주기 동기화).
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
  const selectedProperty =
    filters.property && propertyOptions.includes(filters.property) ? filters.property : null;
  const rooms = selectedProperty
    ? allRooms.filter((room) => room.propertyName === selectedProperty)
    : allRooms;
  const visibleRoomKeys = new Set(rooms.map((room) => room.key));

  return {
    bars: bars.filter((bar) => visibleRoomKeys.has(bar.roomKey)),
    blocks: blocks.filter((block) => visibleRoomKeys.has(block.roomKey)),
    /** 요금이 한 칸이라도 있는가. 하나도 없으면 화면이 「아직 안 들어옴」을 알린다. */
    hasRates: rates.size > 0,
    /** `roomKey|YYYY-MM-DD` — 1박 갭인 칸. */
    gapCells: new Set([...gapCells].filter((key) => visibleRoomKeys.has(key.split("|")[0]))),
    rates,
    days,
    mode,
    month,
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
