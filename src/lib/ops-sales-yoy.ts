import type { OpsSalesSummary } from "@/lib/ops-sales-summary";

/**
 * 매출 요약 「전년 동기」 비교 — **순수하다**(2026-10-05 사용자 요청).
 *
 * 도메인 계약: docs/product/33-calendar-write-features.md 「매출 요약」 → 전년 동기
 *
 * 저쪽 STAY ARI Manager 매출 대시보드(`src/RevenueDashboard.jsx` `getDateRange(…, isCompare)` · `getGrowthRate`)가
 * 같은 날짜 1년 전을 비교 기간으로 두고 증감률만 보여 준다. 여기서는 그걸 **객실 단위로 쪼개** 「왜 늘었나」를 보인다:
 *
 * - **전년 동기 매출** = 같은 날짜 1년 전 창에서, 지금 합계에 넣은 건물의 매출(식은 매출 요약과 같다).
 * - **전년 매출이 없던 객실** = 지금은 매출이 있는데 1년 전 창에는 0원인 객실. 건물마다 묶고, 그 건물의 첫 손님이
 *   1년 전 창이 끝난 뒤면 「운영 전」(건물이 없었다), 아니면 「그 기간 매출 없음」(운영 중이었다).
 * - **기존 객실만 비교** = 1년 전에 매출이 있던 객실끼리 — 새로 연 건물 · 객실을 빼고 본 증감.
 *
 * 차이 분해: 지금 매출 − 전년 매출 = (기존 객실 증감) + (전년 매출 없던 객실의 지금 매출).
 */

export type SalesYoyPreviousRoom = { key: string; propertyName: string; revenue: number };

export type SalesYoyPrevious = {
  start: string;
  endExclusive: string;
  rooms: SalesYoyPreviousRoom[];
  /** 건물(요약의 건물 이름) → 첫 손님 체크인 날짜. 기록이 없으면 `null`. */
  firstStay: Record<string, string | null>;
};

export type SalesYoyNewGroup = {
  propertyName: string;
  /** `not_open` = 1년 전 창이 끝날 때까지 첫 손님이 없었다(건물 운영 전). `no_sales` = 운영 중인데 그 기간 매출 0. */
  reason: "not_open" | "no_sales";
  firstStay: string | null;
  revenue: number;
  rooms: { key: string; label: string; revenue: number }[];
  /** 그 건물 객실 전부가 이 목록에 있다 — 화면은 객실을 한 줄로 접는다. */
  wholeBuilding: boolean;
};

export type SalesYoy = {
  previousStart: string;
  previousEndExclusive: string;
  currentRevenue: number;
  previousRevenue: number;
  /** 전년 매출이 0 이면 `null`(비교 불가). */
  changePct: number | null;
  comparable: { current: number; previous: number; changePct: number | null; roomCount: number };
  newRooms: { count: number; revenue: number; groups: SalesYoyNewGroup[] };
};

const pct = (current: number, previous: number) => (previous > 0 ? ((current - previous) / previous) * 100 : null);

/** 같은 날짜 1년 전. 2/29 → 2/28. */
export function shiftDateYear(date: string, years: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const target = y + years;
  const lastDay = new Date(Date.UTC(target, m, 0)).getUTCDate();
  return `${target}-${String(m).padStart(2, "0")}-${String(Math.min(d, lastDay)).padStart(2, "0")}`;
}

export function buildSalesYoy(args: {
  current: Pick<OpsSalesSummary, "byProperty">;
  previous: SalesYoyPrevious;
  included: (propertyName: string) => boolean;
}): SalesYoy {
  const previousByKey = new Map<string, number>();
  let previousRevenue = 0;
  for (const room of args.previous.rooms) {
    if (!args.included(room.propertyName)) continue;
    previousByKey.set(room.key, (previousByKey.get(room.key) ?? 0) + room.revenue);
    previousRevenue += room.revenue;
  }

  let currentRevenue = 0;
  let comparableCurrent = 0;
  let comparableRooms = 0;
  const groups: SalesYoyNewGroup[] = [];
  for (const property of args.current.byProperty) {
    if (!args.included(property.propertyName)) continue;
    const fresh: SalesYoyNewGroup["rooms"] = [];
    for (const room of property.rooms) {
      currentRevenue += room.revenue;
      const before = previousByKey.get(room.key) ?? 0;
      if (before > 0) {
        comparableCurrent += room.revenue;
        comparableRooms += 1;
      } else if (room.revenue > 0) {
        fresh.push({ key: room.key, label: room.label, revenue: room.revenue });
      }
    }
    if (fresh.length === 0) continue;
    const firstStay = args.previous.firstStay[property.propertyName] ?? null;
    const notOpen = firstStay === null || firstStay >= args.previous.endExclusive;
    const withRevenue = property.rooms.filter((room) => room.revenue > 0).length;
    groups.push({
      firstStay,
      propertyName: property.propertyName,
      reason: notOpen ? "not_open" : "no_sales",
      revenue: fresh.reduce((sum, room) => sum + room.revenue, 0),
      rooms: fresh,
      wholeBuilding: fresh.length === withRevenue,
    });
  }

  // 1년 전에 매출이 있었는데 지금 목록에 없는 방(목록 밖으로 빠진 방)은 전년 쪽에만 남는다 — 그대로 둔다(합은 맞다).
  return {
    changePct: pct(currentRevenue, previousRevenue),
    comparable: {
      changePct: pct(comparableCurrent, previousRevenue),
      current: comparableCurrent,
      previous: previousRevenue,
      roomCount: comparableRooms,
    },
    currentRevenue,
    newRooms: {
      count: groups.reduce((sum, group) => sum + group.rooms.length, 0),
      groups,
      revenue: groups.reduce((sum, group) => sum + group.revenue, 0),
    },
    previousEndExclusive: args.previous.endExclusive,
    previousRevenue,
    previousStart: args.previous.start,
  };
}
