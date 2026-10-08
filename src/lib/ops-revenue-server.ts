import "server-only";

import { toJstDateString } from "@/lib/admin-calendar-dashboard";
import { readOpsSalesInputs } from "@/lib/ops-calendar";
import {
  addCell,
  anchorMonth,
  chartMonths,
  emptyCell,
  lastDayOfMonth,
  previousYearRange,
  splitByMonth,
  type RevenueCell,
  type RevenueMode,
  type RevenueRange,
} from "@/lib/ops-revenue";
import { shiftMonthKey } from "@/components/admin/shared/admin-month-key";
import { buildOpsSalesSummary, defaultSalesExcluded, type SalesRawPayload } from "@/lib/ops-sales-summary";
import type { AppSession } from "@/lib/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * 매출 화면의 읽기 — 판매 캘린더 「매출 요약」과 **같은 읽기(`readOpsSalesInputs`) · 같은 식(`buildOpsSalesSummary`)**.
 *
 * 도메인 계약: docs/product/34-metrics-and-automation.md 「매출 화면」
 *
 * 한 번 읽어(그래프 15달 + 전년 15달 + 고른 기간 + 전년 기간을 덮는 창) 달 조각마다 요약을 낸다. 조각마다 그 달
 * 판매가 없는 건물은 분모(객실박)를 0 으로 둔다(「문 열기 전」 — `ops-revenue.ts`). 비율은 화면이 합을 다시 나눠 낸다.
 */

export type OpsRevenueRoom = { key: string; label: string };

export type OpsRevenueProperty = {
  name: string;
  /** 객실 목록(카탈로그)의 방 수. */
  roomCount: number;
  /** 합계에서 기본으로 빼는 건물(오쿠보A · 사노 — 판매 캘린더 매출 요약과 같다). */
  defaultExcluded: boolean;
  rooms: OpsRevenueRoom[];
};

export type OpsRevenueCells = Record<string, RevenueCell>;

export type OpsRevenueData = {
  today: string;
  mode: RevenueMode;
  range: RevenueRange;
  previousRange: RevenueRange;
  /** 그래프 · 매트릭스 15칸(기준 달 앞 11 ~ 뒤 3). */
  months: string[];
  properties: OpsRevenueProperty[];
  /** 달 → 건물 → 칸. 그래프 15달과 그 전년 15달. */
  monthCells: Record<string, OpsRevenueCells>;
  /** 달 → 객실 키 → 칸. 그래프 15달만(매트릭스 칸을 눌렀을 때의 객실 목록). */
  monthRoomCells: Record<string, OpsRevenueCells>;
  rangeCells: OpsRevenueCells;
  previousRangeCells: OpsRevenueCells;
  rangeRoomCells: OpsRevenueCells;
  previousRangeRoomCells: OpsRevenueCells;
  /**
   * 가동률 「앞으로」 탭(2026-10-07) — 이번 달부터 `forward` 달. 부를 때 `forward` 를 줄 때만 채운다.
   * **문 열기 전 규칙을 쓰지 않는다**(분모 = 객실 수 × 일수) — 앞날은 예약이 0 이어도 팔 방이다.
   */
  forwardMonths: string[];
  forwardCells: Record<string, OpsRevenueCells>;
  /** 앞으로 달의 전년 같은 달(끝난 값 · 문 열기 전 규칙 그대로). */
  forwardPreviousCells: Record<string, OpsRevenueCells>;
};

type Piece = { start: string; endExclusive: string };
type PieceResult = { properties: Map<string, RevenueCell>; rooms: Map<string, RevenueCell> };

export async function getOpsRevenueData(
  session: AppSession,
  args: { mode: RevenueMode; range: RevenueRange; forward?: number },
): Promise<OpsRevenueData> {
  const today = toJstDateString(new Date());
  const { mode, range } = args;
  const previousRange = previousYearRange(range);
  const months = chartMonths(anchorMonth(range, today));
  const forwardMonths = Array.from({ length: args.forward ?? 0 }, (_, index) => shiftMonthKey(today.slice(0, 7), index));
  const allMonths = [
    ...months.map((month) => shiftMonthKey(month, -12)),
    ...months,
    ...forwardMonths,
    ...forwardMonths.map((month) => shiftMonthKey(month, -12)),
  ];

  const monthPiece = (month: string): Piece => ({ endExclusive: nextDay(lastDayOfMonth(month)), start: `${month}-01` });
  const rangePieces = splitByMonth(range);
  const previousPieces = splitByMonth(previousRange);
  const everything: Piece[] = [...allMonths.map(monthPiece), ...rangePieces, ...previousPieces];
  const window = {
    endExclusive: everything.reduce((max, piece) => (piece.endExclusive > max ? piece.endExclusive : max), everything[0].endExclusive),
    start: everything.reduce((min, piece) => (piece.start < min ? piece.start : min), everything[0].start),
  };

  const { cache, inputs, summarize } = await createRevenueSummarizer(session, window, today);

  const toRecord = (map: Map<string, RevenueCell>): OpsRevenueCells => Object.fromEntries(map);
  const sumPieces = (pieces: Piece[]) => {
    const properties = new Map<string, RevenueCell>();
    const rooms = new Map<string, RevenueCell>();
    for (const piece of pieces) {
      const result = summarize(piece);
      for (const [key, cell] of result.properties) addCell(properties.get(key) ?? setNew(properties, key), cell);
      for (const [key, cell] of result.rooms) addCell(rooms.get(key) ?? setNew(rooms, key), cell);
    }
    return { properties: toRecord(properties), rooms: toRecord(rooms) };
  };

  const monthCells: Record<string, OpsRevenueCells> = {};
  for (const month of allMonths) monthCells[month] = toRecord(summarize(monthPiece(month)).properties);
  const monthRoomCells: Record<string, OpsRevenueCells> = {};
  for (const month of months) monthRoomCells[month] = toRecord(summarize(monthPiece(month)).rooms);
  const forwardCells: Record<string, OpsRevenueCells> = {};
  const forwardPreviousCells: Record<string, OpsRevenueCells> = {};
  for (const month of forwardMonths) {
    forwardCells[month] = toRecord(summarize(monthPiece(month), true).properties);
    forwardPreviousCells[month] = toRecord(summarize(monthPiece(shiftMonthKey(month, -12))).properties);
  }
  const current = sumPieces(rangePieces);
  const previous = sumPieces(previousPieces);

  // 건물 · 객실 목록 — 캘린더 행 순서. 목록 밖 방은 이 창 어딘가에 매출이 있을 때만(빈 줄은 소음이다).
  const withRevenue = new Set<string>();
  for (const [cacheKey, result] of cache) {
    if (cacheKey.endsWith("|raw")) continue;
    for (const [key, cell] of result.rooms) if (cell.revenue > 0) withRevenue.add(key);
  }
  const excluded = new Set(defaultSalesExcluded(inputs.properties));
  const properties: OpsRevenueProperty[] = inputs.properties.map((name) => {
    const rooms = inputs.rooms.filter((room) => room.propertyName === name && (room.inCatalog || withRevenue.has(room.key)));
    return {
      defaultExcluded: excluded.has(name),
      name,
      roomCount: rooms.filter((room) => room.inCatalog).length,
      rooms: rooms.map((room) => ({ key: room.key, label: room.label ?? room.key })),
    };
  });

  return {
    forwardCells,
    forwardMonths,
    forwardPreviousCells,
    mode,
    monthCells,
    monthRoomCells,
    months,
    previousRange,
    previousRangeCells: previous.properties,
    previousRangeRoomCells: previous.rooms,
    properties,
    range,
    rangeCells: current.properties,
    rangeRoomCells: current.rooms,
    today,
  };
}

// ── 비교(A vs B) ─────────────────────────────────────────────────────────

export type OpsRevenueComparePeriod = { mode: RevenueMode; range: RevenueRange };

export type OpsRevenueCompareData = {
  today: string;
  a: OpsRevenueComparePeriod;
  b: OpsRevenueComparePeriod;
  properties: Array<{ name: string; roomCount: number; defaultExcluded: boolean }>;
  /** 건물 → 칸. 기간을 달로 잘라 요약한 합(문 열기 전 규칙은 달마다). */
  aCells: OpsRevenueCells;
  bCells: OpsRevenueCells;
  /** 두 기간을 덮는 월별 추이(최대 24달, 끝 = 늦은 쪽 기간의 마지막 달). */
  trendMonths: string[];
  trendCells: Record<string, OpsRevenueCells>;
};

const COMPARE_TREND_MAX = 24;

/**
 * 매출 비교 — 두 기간 A · B 를 같은 읽기 · 같은 식으로(2026-10-08, 시안 「매출 비교」 1번 v4).
 * 도메인 계약: docs/product/34-metrics-and-automation.md 「매출 비교」
 */
export async function getOpsRevenueCompareData(
  session: AppSession,
  args: { a: OpsRevenueComparePeriod; b: OpsRevenueComparePeriod },
): Promise<OpsRevenueCompareData> {
  const today = toJstDateString(new Date());
  const aPieces = splitByMonth(args.a.range);
  const bPieces = splitByMonth(args.b.range);
  const firstMonth = [args.a.range.from, args.b.range.from].sort()[0].slice(0, 7);
  const lastMonth = [args.a.range.to, args.b.range.to].sort()[1].slice(0, 7);
  const trendMonths: string[] = [];
  for (let month = firstMonth; month <= lastMonth; month = shiftMonthKey(month, 1)) trendMonths.push(month);
  const trimmed = trendMonths.slice(-COMPARE_TREND_MAX);
  const monthPiece = (month: string): Piece => ({ endExclusive: nextDay(lastDayOfMonth(month)), start: `${month}-01` });

  const everything: Piece[] = [...aPieces, ...bPieces, ...trimmed.map(monthPiece)];
  const window = {
    endExclusive: everything.reduce((max, piece) => (piece.endExclusive > max ? piece.endExclusive : max), everything[0].endExclusive),
    start: everything.reduce((min, piece) => (piece.start < min ? piece.start : min), everything[0].start),
  };
  const { inputs, summarize } = await createRevenueSummarizer(session, window, today);
  const sum = (pieces: Piece[]) => {
    const out = new Map<string, RevenueCell>();
    for (const piece of pieces) for (const [key, cell] of summarize(piece).properties) addCell(out.get(key) ?? setNew(out, key), cell);
    return Object.fromEntries(out) as OpsRevenueCells;
  };
  const trendCells: Record<string, OpsRevenueCells> = {};
  for (const month of trimmed) trendCells[month] = Object.fromEntries(summarize(monthPiece(month)).properties);

  const excluded = new Set(defaultSalesExcluded(inputs.properties));
  return {
    a: args.a,
    aCells: sum(aPieces),
    b: args.b,
    bCells: sum(bPieces),
    properties: inputs.properties.map((name) => ({
      defaultExcluded: excluded.has(name),
      name,
      roomCount: inputs.rooms.filter((room) => room.propertyName === name && room.inCatalog).length,
    })),
    today,
    trendCells,
    trendMonths: trimmed,
  };
}

/**
 * 한 번 읽고(`readOpsSalesInputs`) 기간 조각마다 매출 요약을 내는 함수 — 매출 화면 · 가동률 · 비교가 같이 쓴다.
 * 조각마다 그 달 판매가 없는 건물은 분모(객실박)를 0 으로 둔다(「문 열기 전」). `raw` 면 그 규칙 없이.
 */
async function createRevenueSummarizer(session: AppSession, window: { start: string; endExclusive: string }, today: string) {
  const supabase = await getSupabaseServerClient();
  const inputs = await readOpsSalesInputs({ organizationId: session.organization.id, properties: [], supabase, window });
  const reservations = inputs.reservations.map((reservation) => ({ ...reservation, raw: reservation.raw as SalesRawPayload }));

  const cache = new Map<string, PieceResult>();
  /** `raw` = 문 열기 전 규칙 없이(분모 = 객실 수 × 일수) — 「앞으로」 탭. */
  const summarize = (piece: Piece, raw = false): PieceResult => {
    const cacheKey = `${piece.start}|${piece.endExclusive}|${raw ? "raw" : "open"}`;
    const hit = cache.get(cacheKey);
    if (hit) return hit;
    const summary = buildOpsSalesSummary({
      // 차단은 「오늘 이후 빈방」에만 쓰인다 — 매출 화면에는 없다.
      blocks: [],
      endExclusive: piece.endExclusive,
      // 저쪽 매출 화면(`RevenueDashboard`)은 마이너스 금액 예약도 그대로 더한다 — 그 화면과 숫자를 맞춘다(2026-10-07).
      negativeAmounts: "include",
      properties: inputs.properties,
      reservations,
      rooms: inputs.rooms,
      start: piece.start,
      today,
    });
    const result: PieceResult = { properties: new Map(), rooms: new Map() };
    for (const row of summary.byProperty) {
      const open = raw || row.occupiedNights > 0;
      const channel = Object.fromEntries(row.channels.map((part) => [part.channel, part.revenue])) as Record<string, number>;
      result.properties.set(row.propertyName, {
        airbnb: channel.airbnb ?? 0,
        availableNights: open ? row.availableNights : 0,
        booking: channel.booking ?? 0,
        commission: row.commission,
        direct: channel.direct ?? 0,
        occupiedNights: row.occupiedNights,
        other: channel.other ?? 0,
        revenue: row.revenue,
      });
      for (const room of row.rooms) {
        result.rooms.set(room.key, {
          airbnb: room.channelRevenue.airbnb,
          availableNights: open ? room.availableNights : 0,
          booking: room.channelRevenue.booking,
          commission: room.commission,
          direct: room.channelRevenue.direct,
          occupiedNights: room.occupiedNights,
          other: room.channelRevenue.other,
          revenue: room.revenue,
        });
      }
    }
    cache.set(cacheKey, result);
    return result;
  };

  return { cache, inputs, summarize };
}

function setNew(map: Map<string, RevenueCell>, key: string): RevenueCell {
  const cell = emptyCell();
  map.set(key, cell);
  return cell;
}

function nextDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}
