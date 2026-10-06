import "server-only";

import { toJstDateString } from "@/lib/admin-calendar-dashboard";
import { readOpsSalesInputs } from "@/lib/ops-calendar";
import {
  addCell,
  anchorMonth,
  chartMonths,
  emptyCell,
  lastDayOfMonth,
  splitByMonth,
  type RevenueCell,
  type RevenueCompare,
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
  /** 비교 기간 — 기본 1년 전 같은 날짜(`comparisonRange`). 표 · 숫자 6개의 증감이 이것과 비교한다. */
  compare: RevenueCompare;
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
};

type Piece = { start: string; endExclusive: string };
type PieceResult = { properties: Map<string, RevenueCell>; rooms: Map<string, RevenueCell> };

export async function getOpsRevenueData(
  session: AppSession,
  args: { mode: RevenueMode; range: RevenueRange; compare: RevenueCompare; previousRange: RevenueRange },
): Promise<OpsRevenueData> {
  const today = toJstDateString(new Date());
  const { compare, mode, previousRange, range } = args;
  const months = chartMonths(anchorMonth(range, today));
  const allMonths = [...months.map((month) => shiftMonthKey(month, -12)), ...months];

  const monthPiece = (month: string): Piece => ({ endExclusive: nextDay(lastDayOfMonth(month)), start: `${month}-01` });
  const rangePieces = splitByMonth(range);
  const previousPieces = splitByMonth(previousRange);
  const everything: Piece[] = [...allMonths.map(monthPiece), ...rangePieces, ...previousPieces];
  const window = {
    endExclusive: everything.reduce((max, piece) => (piece.endExclusive > max ? piece.endExclusive : max), everything[0].endExclusive),
    start: everything.reduce((min, piece) => (piece.start < min ? piece.start : min), everything[0].start),
  };

  const supabase = await getSupabaseServerClient();
  const inputs = await readOpsSalesInputs({ organizationId: session.organization.id, properties: [], supabase, window });
  const reservations = inputs.reservations.map((reservation) => ({ ...reservation, raw: reservation.raw as SalesRawPayload }));

  const cache = new Map<string, PieceResult>();
  const summarize = (piece: Piece): PieceResult => {
    const cacheKey = `${piece.start}|${piece.endExclusive}`;
    const hit = cache.get(cacheKey);
    if (hit) return hit;
    const summary = buildOpsSalesSummary({
      // 차단은 「오늘 이후 빈방」에만 쓰인다 — 매출 화면에는 없다.
      blocks: [],
      endExclusive: piece.endExclusive,
      properties: inputs.properties,
      reservations,
      rooms: inputs.rooms,
      start: piece.start,
      today,
    });
    const result: PieceResult = { properties: new Map(), rooms: new Map() };
    for (const row of summary.byProperty) {
      const open = row.occupiedNights > 0;
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
  const current = sumPieces(rangePieces);
  const previous = sumPieces(previousPieces);

  // 건물 · 객실 목록 — 캘린더 행 순서. 목록 밖 방은 이 창 어딘가에 매출이 있을 때만(빈 줄은 소음이다).
  const withRevenue = new Set<string>();
  for (const result of cache.values()) for (const [key, cell] of result.rooms) if (cell.revenue > 0) withRevenue.add(key);
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
    compare,
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

function setNew(map: Map<string, RevenueCell>, key: string): RevenueCell {
  const cell = emptyCell();
  map.set(key, cell);
  return cell;
}

function nextDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}
