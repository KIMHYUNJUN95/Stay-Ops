/**
 * 1박 갭 감지 — **이 기능이 업무 시간을 줄인다.**
 *
 * 도메인 계약: docs/product/33-calendar-write-features.md 「1박 갭 감지」
 * 원본: STAY ARI Manager `BuildingCalendar.jsx` → `getCheckInGapInfo` · `gapCellSet`
 *
 * ## 무엇을 찾는가
 *
 * **「하루만 비어 있는데 최소 2박이라 아무도 살 수 없는 날」.**
 *
 * ```txt
 * 11/20        11/21         11/22
 * 예약 있음  │  비어 있음  │  예약 있음
 *            └ 팔 수 있는 밤은 1박인데 minStay = 2
 *              → 아무도 못 산다. 그 밤은 그냥 버려진다
 * ```
 *
 * 객실 90개 × 12개월을 눈으로 훑어 이런 날을 찾는 것이 원래 업무였다.
 *
 * ## 이 모듈은 순수하다
 *
 * DB·네트워크를 모른다. 판정식이 곧 규칙이라 **테스트로 고정**해야 하기 때문이다
 * (`src/lib/__tests__/ops-gap-detection.test.ts`).
 */

/** 그 밤을 팔 수 있는가. `unknown` 은 **모른다**는 뜻이고 「팔 수 있다」도 「없다」도 아니다. */
export type OpsCellStatus = "available" | "blocked" | "unknown";

/** 판정에 필요한 한 칸의 값. `null` 은 그 날 데이터가 아예 없다는 뜻이다. */
export type OpsGapCellInput = {
  minStay: number | null;
  numAvail: number | null;
  overrideKind: string | null;
  /** 그 밤에 예약 또는 블락이 있는가. */
  occupied: boolean;
};

/**
 * 비활성 유닛 판정 기준.
 *
 * 저쪽 `INACTIVE_MINSTAY_THRESHOLD = 50` 과 **같은 값**이어야 한다. StayOps 의
 * `BEDS24_INACTIVE_MIN_STAY_THRESHOLD` 도 50 이다 — 세 곳이 갈라지면 같은 방이 한쪽에서만
 * 팔리는 상태가 된다.
 */
export const OPS_INACTIVE_MIN_STAY_THRESHOLD = 50;

/**
 * 그 날짜에 **팔고 있는 유닛인가** — `1 ≤ minStay < 50`.
 *
 * 저쪽 `getActiveUnitInfosForDate` 와 같은 판정이다. 주의할 점 둘:
 *
 * **① 방이 아니라 날짜의 속성이다.** `rooms.status` 는 `inventory-sync` 가 읽은 **오늘 하루의
 * 스냅샷**이라 「10월 3일에 이 유닛이 살아 있었나」에는 답하지 못한다.
 *
 * **② `numAvail`·`blackout` 은 보지 않는다.** 그 둘은 「그 밤을 팔 수 있는가」이고, 이건
 * 「이 유닛이 운영 중인가」다. 예약이 차서 `numAvail: 0` 인 방도 **운영 중인 방**이다 —
 * 섞으면 예약이 찬 날마다 비활성 유닛의 값(minStay 99)이 화면으로 올라온다.
 */
export function isActiveUnitMinStay(minStay: number | null): boolean {
  if (minStay === null || !Number.isFinite(minStay)) return false;
  return minStay >= 1 && minStay < OPS_INACTIVE_MIN_STAY_THRESHOLD;
}

/**
 * 「팔 수 있는가」의 정의 — **다섯 가지가 전부 참이어야 한다.**
 *
 * | # | 검사 | 아니면 |
 * | --- | --- | --- |
 * | 1 | `minStay` 를 숫자로 읽을 수 있다 | `unknown` — **갭으로 세지 않는다** |
 * | 2 | `override !== "blackout"` | blocked |
 * | 3 | `1 ≤ minStay < 50` | blocked (비활성 유닛) |
 * | 4 | `numAvail > 0` | blocked |
 * | 5 | 예약·블락이 없다 | blocked |
 *
 * **1번이 중요하다.** 데이터가 안 온 칸을 「비었다」고 하면, minStay 를 바꿨을 때 실제로는
 * 팔리면 안 되는 방이 팔린다. 모르는 것을 갭이라고 하지 않는다.
 *
 * 5번은 저쪽에는 없는 우리 쪽 안전장치다. `numAvail` 은 요금 동기화 시점의 값이라 그 뒤에 들어온
 * 예약을 모른다(예약은 웹훅으로 실시간, 요금은 주기 동기화). 예약·블락을 함께 보면 그 틈이 막힌다.
 */
export function opsCellStatus(cell: OpsGapCellInput | null): OpsCellStatus {
  if (!cell) return "unknown";
  const minStay = cell.minStay;
  if (minStay === null || !Number.isFinite(minStay)) return "unknown";
  if ((cell.overrideKind ?? "").toLowerCase() === "blackout") return "blocked";
  if (!(minStay >= 1 && minStay < OPS_INACTIVE_MIN_STAY_THRESHOLD)) return "blocked";
  if (cell.numAvail !== null && cell.numAvail <= 0) return "blocked";
  if (cell.occupied) return "blocked";
  return "available";
}

export type OpsGapArgs = {
  /** 판정할 날짜. 보통 화면에 보이는 창. */
  dates: readonly string[];
  /** 날짜 → 그 칸의 값. 창 **바깥 하루씩**도 들어와야 가장자리에서 헛돌지 않는다. */
  cellAt: (date: string) => OpsGapCellInput | null;
  /** 도쿄 기준 오늘. 이전은 「과거」로 본다. */
  today: string;
};

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * 한 객실에서 1박 갭인 날짜를 고른다.
 *
 * ```js
 * availableNightsFromDate =
 *     next === "blocked"   ? 1
 *   : next === "available" ? 2
 *   : 0;                                  // unknown → 모른다 → 갭 아님
 *
 * isSegmentEntry = (prev === "blocked" || prev < today);
 *
 * isOneNightMinStayGap =
 *   availableNightsFromDate === 1 && cellMinStay === 2 && isSegmentEntry;
 * ```
 *
 * 세 조건이 **전부** 맞아야 한다.
 *
 * - `내일이 막혔다` — 이틀 이상 이어지면 2박으로 팔 수 있다
 * - `최소 숙박일이 정확히 2` — 1이면 이미 팔리고, 3 이상은 다른 정책이다
 * - `어제가 막혔거나 과거` — **구간의 첫날만** 센다. 안 그러면 같은 공실을 여러 번 센다
 */
export function detectOneNightGaps(args: OpsGapArgs): string[] {
  const statusCache = new Map<string, OpsCellStatus>();
  const statusOf = (date: string): OpsCellStatus => {
    const cached = statusCache.get(date);
    if (cached) return cached;
    const status = opsCellStatus(args.cellAt(date));
    statusCache.set(date, status);
    return status;
  };

  const gaps: string[] = [];
  for (const date of args.dates) {
    if (statusOf(date) !== "available") continue;

    const cell = args.cellAt(date);
    if (cell?.minStay !== 2) continue;

    const nextStatus = statusOf(addDays(date, 1));
    const availableNights = nextStatus === "blocked" ? 1 : nextStatus === "available" ? 2 : 0;
    if (availableNights !== 1) continue;

    const previousDate = addDays(date, -1);
    const isSegmentEntry = previousDate < args.today || statusOf(previousDate) === "blocked";
    if (!isSegmentEntry) continue;

    gaps.push(date);
  }
  return gaps;
}
