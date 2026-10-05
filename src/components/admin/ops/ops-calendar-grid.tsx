"use client";

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  OpsCalendarBar,
  OpsCalendarDay,
  OpsCalendarRoom,
  OpsPriceConversion,
  OpsReservationPlacement,
} from "@/lib/ops-calendar";
import {
  buildRowRateLookup,
  dayFlagAt,
  decodeRowRate,
  reuseStableRows,
  rowGapCellKeys,
  sameOpsDays,
  type OpsGridRowData,
} from "@/lib/ops-calendar-rows";
import { loadOpsCellHistory, loadOpsPriceConversions } from "@/app/admin/ops/calendar/actions";
import { OpsPriceWinsPanel, type PriceWinsCopy } from "@/components/admin/ops/ops-price-wins-panel";
import {
  OpsRecentBookingsPanel,
  recentRangeLabel,
  type RecentBookingsCopy,
} from "@/components/admin/ops/ops-recent-bookings-panel";
import { useRecentBookings } from "@/components/admin/ops/use-recent-bookings";
import { OpsCellHistoryCard, type CellHistoryCardCopy } from "@/components/admin/ops/ops-cell-history-card";
import { OpsHistoryPanel, type HistoryPanelCopy } from "@/components/admin/ops/ops-history-panel";
import {
  OpsSalesSummaryModal,
  prefetchSalesSummary,
  type SalesSummaryCopy,
} from "@/components/admin/ops/ops-sales-summary-modal";
import { ChartColumn, Timer } from "lucide-react";
import { opsUrgentVacantCells } from "@/lib/ops-urgent-vacant";
import { buildOpsScopeSummary } from "@/lib/ops-scope-summary";
import { OpsBlockPanel, type BlockPanelCopy } from "@/components/admin/ops/ops-block-panel";
import {
  OpsMinStayPanel,
  type MinStayPanelCopy,
} from "@/components/admin/ops/ops-minstay-panel";
import { OpsPricePanel, type PanelCopy, type PanelCell } from "@/components/admin/ops/ops-price-panel";
import { stayNights } from "@/lib/ops-manual-booking";
import { OpsBookingDraft } from "@/components/admin/ops/ops-booking-draft";
import {
  watchOpsWriteJob,
  type OpsWriteKind,
  type RunOpsWrite,
} from "@/components/admin/ops/ops-write-tracker";
import { formatGridPrice } from "@/lib/ops-price-format";
import { assignBarLanes, assignBlockLanes } from "@/lib/ops-bar-lanes";
import {
  OpsReservationPanel,
  type ReservationCardCopy,
} from "@/components/admin/ops/ops-reservation-panel";
import {
  OpsBookingPanel,
  type BookingPanelCopy,
  type BookingPanelRoom,
} from "@/components/admin/ops/ops-booking-panel";
import { buildGapContext } from "@/lib/ops-gap-context";
import type { CellHistory, HistoryCopy } from "@/lib/ops-price-history";
import {
  applyDragRect,
  applyScopeToSelection,
  buildScopeCells,
  buildSelectableWeeks,
  EMPTY_SCOPE,
  isExactCellSelection,
  isPriceEditBlocked,
  removeCells,
  selectionCellKey,
  toggleCellGroup,
  toggleInList,
  toggleWeekdayPreset,
  WEEKDAY_WEEKDAYS,
  WEEKEND_WEEKDAYS,
  type OpsSelectionCell,
  type OpsSelectionScope,
} from "@/lib/ops-calendar-selection";
import { hasOpsLargeRooms, isOpsLargeRoom, orderOpsLargeRoomsFirst } from "@/lib/ops-large-rooms";
import { opsVacantRoomKeys } from "@/lib/ops-vacant-today";
import { OPS_GAP_OPEN_EVENT } from "@/components/admin/ops/ops-gap-button";
import { OPS_OPEN_RESERVATION_EVENT } from "@/components/shell/admin-guest-search";
import { loadOpsReservationPlacement } from "@/app/admin/ops/calendar/search-actions";

/**
 * 판매 캘린더 격자.
 *
 * ## 한 객실은 가로 트랙 세 줄이다
 *
 * ```txt
 * │ 402호 │ 42.7K  34.0K  21.4K …  ← 가격 (가장 중요)
 * │       │   2      2     2   …   ← 최소 숙박일 (아주 흐리게)
 * │       │ ▓▓ Sy Yeow ▓▓          ← 예약 막대 / BLOCK
 * ```
 *
 * 한 칸에 셋을 우겨넣지 않는다 — 저쪽 원본과 같은 구조다.
 *
 * ## 가로축이 반 칸 어긋난다
 *
 * 가격·최소숙박은 **그 날 밤의 값**이라 칸에 속한다. 예약 막대는 **날짜와 날짜 사이**를 잇는
 * 것이라 체크인 칸의 가운데에서 체크아웃 칸의 가운데까지 그린다. 그래야 같은 날 나가는 예약과
 * 들어오는 예약이 그 칸 가운데에서 만나 하루에 둘이 보인다.
 */

type Copy = {
  blockLabel: string;
  /** BLOCK 막대 툴팁의 「누가 · 언제」(`{name}` · `{date}`). */
  blockNoteBy: string;
  emptyBody: string;
  emptyTitle: string;
  roomCount: string;
  roomsHeader: string;
  /** 일요일(0)부터. `Date.getUTCDay()` 인덱스와 그대로 맞춘다. */
  weekDaysFromSunday: readonly string[];
  editMode: string;
  editModeExit: string;
  scopeRooms: string;
  scopeWeeks: string;
  scopeDays: string;
  scopeAll: string;
  scopeWeekend: string;
  scopeWeekday: string;
  scopeClear: string;
  selectedCount: string;
  andMore: string;
  selectHint: string;
  minStayMode: string;
  blockMode: string;
  localeTag: string;
  gapSelectAll: string;
} & PanelCopy &
  MinStayPanelCopy &
  BlockPanelCopy &
  BookingPanelCopy & { mbPickCheckout: string } &
  ReservationCardCopy &
  HistoryCopy & { historyMore: string } &
  CellHistoryCardCopy &
  HistoryPanelCopy & { hsButton: string; hsAlertTitle: string } &
  SalesSummaryCopy & { ssButton: string } &
  PriceWinsCopy &
  RecentBookingsCopy & {
    rbToggle: string;
    pwToggle: string;
    pwList: string;
    largeFirst: string;
    vacantToday: string;
    urgentVacant: string;
    urgentVacantHint: string;
    vacantEmpty: string;
    msMixed: string;
  };


/** 낙관적으로 먼저 그린 값. `token` 이 어느 쓰기에서 왔는지 가른다. */
type PendingValue = { value: number; token: number };

/** 그 쓰기들에서 온 흐린 값을 거둔다. */
function dropTokens(map: Map<string, PendingValue>, tokens: Set<number>): Map<string, PendingValue> {
  const next = new Map<string, PendingValue>();
  for (const [key, entry] of map) if (!tokens.has(entry.token)) next.set(key, entry);
  return next;
}

/** 행에 내려주는 낙관값 — `token` 대신 **이미 반영이 끝났는가**(`pend`)로 바꿔 둔다. */
type PendingCell = { value: number; pend: boolean };
const EMPTY_ROW_PENDING: Map<string, PendingCell> = new Map();

/**
 * 전체 쓰기 상태를 **행별로** 쪼갠다.
 *
 * 안 바뀐 행은 **Map 참조까지 그대로** 돌려줘야 `React.memo`(`OpsGridRow`)가 그 행의 재렌더를
 * 막는다 — 통째로 넘기면 칸 하나만 써도 「전체」 보기 9,000칸짜리 격자가 전부 다시 그려진다
 * (2026-09-30 속도).
 */
function sliceRowPending(
  pending: Map<string, PendingValue>,
  settledTokens: Set<number>,
  previous: Map<string, Map<string, PendingCell>>,
): Map<string, Map<string, PendingCell>> {
  const byRoom = new Map<string, Map<string, PendingCell>>();
  for (const [key, entry] of pending) {
    const separator = key.indexOf("|");
    const roomKey = key.slice(0, separator);
    const cell: PendingCell = { pend: !settledTokens.has(entry.token), value: entry.value };
    const bucket = byRoom.get(roomKey);
    if (bucket) bucket.set(key, cell);
    else byRoom.set(roomKey, new Map([[key, cell]]));
  }
  const result = new Map<string, Map<string, PendingCell>>();
  for (const [roomKey, bucket] of byRoom) {
    const prevBucket = previous.get(roomKey);
    result.set(roomKey, samePendingBucket(prevBucket, bucket) ? (prevBucket as Map<string, PendingCell>) : bucket);
  }
  return result;
}

function samePendingBucket(
  a: Map<string, PendingCell> | undefined,
  b: Map<string, PendingCell>,
): boolean {
  if (!a || a.size !== b.size) return false;
  for (const [key, cell] of b) {
    const existing = a.get(key);
    if (!existing || existing.value !== cell.value || existing.pend !== cell.pend) return false;
  }
  return true;
}

/**
 * `sliceRowPending` 이 돌려준 **바깥** Map 은 매번 새로 만들어진다 — 그래도 안 바뀐 방의
 * **버킷 참조**는 그대로다. 그 버킷들이 전부 같으면(참조까지) 실제로는 바뀐 게 없는 것이다 —
 * 그때는 `setState` 를 건너뛰어 쓸데없는 재렌더를 막는다.
 */
function sameRoomBuckets(
  a: Map<string, Map<string, PendingCell>>,
  b: Map<string, Map<string, PendingCell>>,
): boolean {
  if (a.size !== b.size) return false;
  for (const [roomKey, bucket] of b) if (a.get(roomKey) !== bucket) return false;
  return true;
}

/** `2026-10-20` → `10/20`. */
function shortDate(date: string): string {
  return date.slice(5).replace("-", "/");
}

/** 가로축에서 `date` 가 몇 번째 칸인가. 창 밖이면 `null`. */
function columnOf(days: OpsCalendarDay[], date: string): number | null {
  const index = days.findIndex((day) => day.date === date);
  return index === -1 ? null : index;
}

/**
 * 막대의 가로 위치.
 *
 * 체크인/체크아웃이 창 밖이면 가장자리로 자른다 — 1년 전에 들어온 손님도 이 창에 걸치면
 * 그려야 한다. 자른 쪽은 반 칸 오프셋을 주지 않는다(가장자리에 딱 붙어야 「밖에서 이어진다」로
 * 읽힌다).
 */
function barGeometry(days: OpsCalendarDay[], checkIn: string, checkOut: string) {
  const total = days.length;
  if (total === 0) return null;
  const first = days[0].date;
  const lastExclusive = days[total - 1].date;

  const inColumn = columnOf(days, checkIn);
  const outColumn = columnOf(days, checkOut);

  // 창 전체를 지나가거나 한쪽이 밖인 경우를 먼저 정리한다.
  const startUnits = inColumn === null ? (checkIn < first ? 0 : null) : inColumn + 0.5;
  const endUnits =
    outColumn === null ? (checkOut > lastExclusive ? total : null) : outColumn + 0.5;
  if (startUnits === null || endUnits === null) return null;
  if (endUnits <= startUnits) return null;

  return {
    left: `calc(${(startUnits / total) * 100}% + 1px)`,
    width: `calc(${((endUnits - startUnits) / total) * 100}% - 2px)`,
  };
}

/**
 * 자동 스크롤 속도 — 화면 위·아래 `EDGE`px 안에 들어오면 가장자리에 가까울수록 빨라진다.
 * 밖이면 0(=자동 스크롤 없음). 드래그 루프와 포인터 이동 핸들러가 같은 판정을 쓴다.
 */
const AUTO_SCROLL_EDGE = 56;
function autoScrollSpeed(y: number): number {
  if (y < AUTO_SCROLL_EDGE) return -Math.ceil((AUTO_SCROLL_EDGE - y) / 4);
  if (y > window.innerHeight - AUTO_SCROLL_EDGE) return Math.ceil((y - (window.innerHeight - AUTO_SCROLL_EDGE)) / 4);
  return 0;
}

/** BLOCK 은 **밤의 범위이며 양끝을 포함한다.** 9/23~9/26 이면 네 밤이다. */
/** BLOCK 막대 툴팁 — 사유 · 메모 · 건 사람 · 날짜. 아무것도 없으면 `undefined`(툴팁 없음). */
function blockNoteTitle(
  block: { purpose?: string | null; memo?: string | null; by?: string | null; at?: string | null },
  copy: { bkPurposes: Record<string, string>; blockNoteBy: string },
): string | undefined {
  const lines: string[] = [];
  const purpose = block.purpose ? copy.bkPurposes[block.purpose] : null;
  if (purpose) lines.push(purpose);
  if (block.memo) lines.push(block.memo);
  if (block.by || block.at) {
    lines.push(
      copy.blockNoteBy
        .replace("{name}", block.by ?? "")
        .replace("{date}", block.at ? toTokyoDateLabel(block.at) : "")
        .replace(/^ · | · $/g, ""),
    );
  }
  return lines.length > 0 ? lines.join("\n") : undefined;
}

/** `YYYY-MM-DD HH:mm`(도쿄). 툴팁에만 쓴다. */
function toTokyoDateLabel(iso: string) {
  return new Intl.DateTimeFormat("sv-SE", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Tokyo",
    year: "numeric",
  }).format(new Date(iso));
}

/** 층 하나의 높이. 막대(19px)보다 커야 층끼리 맞닿지 않는다. */
const OPS_LANE_STEP_PX = 22;

function blockGeometry(days: OpsCalendarDay[], startDate: string, endDate: string) {
  const total = days.length;
  if (total === 0) return null;
  const startColumn = columnOf(days, startDate);
  const endColumn = columnOf(days, endDate);
  const from = startColumn ?? (startDate < days[0].date ? 0 : null);
  const to = endColumn ?? (endDate > days[total - 1].date ? total - 1 : null);
  if (from === null || to === null || to < from) return null;
  return {
    left: `calc(${(from / total) * 100}% + 1px)`,
    width: `calc(${((to - from + 1) / total) * 100}% - 2px)`,
  };
}


/** 행이 부르는 동작. **참조가 안 바뀌는** 한 객체(ref)로 넘겨 행 메모가 깨지지 않게 한다. */
type GridRowActions = {
  toggleRoomRow: (roomKey: string) => void;
  startDraft: (room: BookingPanelRoom, date: string) => void;
  cancelDraft: () => void;
  commitDraft: (room: BookingPanelRoom, checkIn: string, checkOut: string) => void;
  openBar: (bar: OpsCalendarBar, room: OpsCalendarRoom) => void;
};

type GridRowProps = {
  /**
   * 이 행의 데이터(`ops-calendar-rows.ts`) — 요금(날짜 순 배열)·이력 표시·갭·막대·블록. 내용이 같으면
   * 새로고침 뒤에도 **직전 객체 그대로**라(`reuseStableRows`) 메모가 걸린다.
   */
  row: OpsGridRowData;
  days: OpsCalendarDay[];
  dates: string[];
  /** 날짜 → 순번(`row` 배열의 인덱스). `dates` 와 함께 바뀐다. */
  dayIndex: Map<string, number>;
  today: string;
  copy: Copy;
  editMode: boolean;
  showCancelled: boolean;
  priceWinsOnly: boolean;
  /** 큰방 강조선(`ops-large-rooms.ts`). */
  large: boolean;
  /** 객실 축 선택에 이 행이 들어 있나. */
  scopeOn: boolean;
  /** 이 행의 가격 개입 성공 막대 id(`|` 로 이음). 「가격 개입 성공」을 켰을 때만 채운다. */
  winIds: string;
  /** 이 행에서 고른 날짜들(`|` 로 이음). **문자열이라** 다른 행의 선택이 바뀌어도 이 행은 안 다시 그린다. */
  selectedDates: string;
  /** 이 행 몫만 자른 낙관값(`sliceRowPending`) — 안 바뀐 행은 참조까지 같다. */
  pendingPrices: Map<string, PendingCell>;
  pendingMinStay: Map<string, PendingCell>;
  drafting: { room: BookingPanelRoom; checkIn: string } | null;
  actions: { current: GridRowActions };
};

/**
 * 격자의 객실 한 줄 — **메모된다**(2026-09-30 속도).
 *
 * 예전에는 버튼 하나·칸 하나를 눌러도 격자 전체(「전체」 보기 91실 × 32일 × 3줄 ≈ 9,000칸)를 다시
 * 그렸다. 이제 행마다 바뀐 것만 다시 그린다 — 선택은 이 행의 날짜 문자열(`selectedDates`)로, 동작은
 * 참조가 고정된 ref 로 받아 다른 행의 변화가 이 행의 메모를 깨지 않는다.
 *
 * 이력 호버는 칸마다 핸들러를 달지 않는다 — 이력이 있는 칸에 `data-hc` 만 붙이고 격자가 한 곳에서
 * 받는다(`ops-cell-history-card.tsx`).
 */
const OpsGridRow = memo(function OpsGridRow({
  actions,
  copy,
  dates,
  dayIndex,
  days,
  drafting,
  editMode,
  large,
  pendingMinStay,
  pendingPrices,
  priceWinsOnly,
  row,
  scopeOn,
  selectedDates,
  showCancelled,
  today,
  winIds,
}: GridRowProps) {
  const { room } = row;
  const allRoomBars = row.bars;
  const roomBlocks = row.blocks;
  const selected = new Set(selectedDates ? selectedDates.split("|") : []);
  const wins = new Set(winIds ? winIds.split("|") : []);
  // **켜면 취소만, 끄면 일반만.** 둘을 같이 그리면 같은 밤에 겹쳐 못 읽는다.
  const roomBars = allRoomBars.filter((bar) => bar.isCancelled === showCancelled);
  /**
   * 취소 막대는 **같은 밤에 여러 건이 겹친다.** 한 줄에 그리면 서로 덮어 못 읽는다 —
   * 실측(2026-09-28)으로 취소가 걸린 방-밤의 20%가 2건 이상, 최대 5건이다.
   * 그래서 층을 나누고 그만큼 트랙을 키운다(저쪽 `cancelledBarLaneMap` 과 같다). 층은 방마다 따로
   * 세므로 행 안에서 센다.
   */
  const barLanes = showCancelled
    ? assignBarLanes(
        allRoomBars
          .filter((bar) => bar.isCancelled)
          .map((bar) => ({ checkIn: bar.checkIn, checkOut: bar.checkOut, id: bar.id, roomKey: bar.roomKey })),
      )
    : null;
  /*
   * 차단은 예약이 있는 밤에도 건다(남은 판매만 멈추려고). 같은 줄이면 예약 이름을 덮어 못 읽는다 —
   * 예약이 먼저 자리를 잡고 차단은 겹치지 않는 첫 층에 놓는다(`assignBlockLanes`). 겹치지 않으면 0층.
   */
  const blockLanes = assignBlockLanes(
    roomBars.map((bar) => ({
      checkIn: bar.checkIn,
      checkOut: bar.checkOut,
      lane: barLanes?.laneById.get(bar.id) ?? 0,
    })),
    roomBlocks.map((block) => ({ endDate: block.endDate, id: block.id, startDate: block.startDate })),
  );
  const laneCount = Math.max(barLanes?.laneCountByRoom.get(room.key) ?? 1, blockLanes.laneCount);
  /** 팔린 밤(살아 있는 예약). 가격 수정에서 막히는 유일한 조건이다(블록은 막지 않는다). */
  const sold = new Set<string>();
  // 점유는 **항상** 일반 예약으로만 센다 — 「취소만 보기」를 켜도 팔린 밤은 팔린 밤이다.
  for (const bar of allRoomBars) {
    if (bar.isCancelled) continue;
    for (const day of days) {
      if (day.date >= bar.checkIn && day.date < bar.checkOut) {
        sold.add(day.date);
      }
    }
  }
  const rateAtIndex = (index: number) => decodeRowRate(row.rates, index);

  const bookingRoom: BookingPanelRoom = {
    key: room.key,
    label: room.displayRoomLabel,
    propertyName: room.propertyName,
    roomIds: room.roomIds,
  };
  // **팔 수 없는 밤**은 예약도 못 만든다 — 팔린 밤(살아 있는 예약)과, 파는 유닛이 없는 밤
  // (요금 칸이 비어 있다 = 활성 유닛 0, `mergeOpsRateUnits`). 서버와 패널 피커가
  // 같은 두 가지를 막는다 — 여기만 느슨하면 격자에서 끈 기간이 패널에서 막힌다.
  // **차단(BLOCK)은 막지 않는다**(2026-10-06 사용자 결정 — Beds24 처럼 차단한 날에도 수기 예약을 넣는다).
  const nightTaken = (date: string) => sold.has(date) || !dayFlagAt(row.rates.has, dayIndex.get(date) ?? -1);
  // 빈 칸의 `+`. **「취소만 보기」에서는 숨긴다** — 그 모드에서는 일반 막대가 안 보여
  // 팔린 밤도 빈칸처럼 보이는데, 거기에 `+` 가 뜨면 이미 찬 방에 예약을 넣으려 하게 된다.
  const canStart = (date: string) => !editMode && !showCancelled && !nightTaken(date) && date >= today;
  const startDraft = (date: string) => actions.current.startDraft(bookingRoom, date);

  const cellClass = (day: OpsCalendarDay, index: number, withRoom: boolean) => {
    return [
      "opsg__cell",
      day.isWeekend ? "we" : "",
      day.date < today ? "past" : "",
      day.startsMonth ? "m1" : "",
      withRoom && dayFlagAt(row.gap, index) ? "gap" : "",
      withRoom && selected.has(day.date) ? "sel" : "",
      // 가격 수정에서 고를 수 있는 칸(오늘 이후 · 안 팔린 밤) — `canSelect` 와 같은 기준.
      editMode && withRoom && day.date >= today && !sold.has(day.date) ? "pick" : "",
      // 선택 모드에서 **팔린 밤**은 고를 수 없다는 것이 보여야 한다.
      editMode && withRoom && sold.has(day.date) ? "sold" : "",
    ]
      .filter(Boolean)
      .join(" ");
  };

  return (
    <div
      className={`opsg__row${drafting ? " drafting" : ""}${large ? " large" : ""}`}
      data-ops-row={room.key}
    >
      <div
        className={`opsg__label${editMode ? " pick" : ""}${editMode && scopeOn ? " on" : ""}`}
        onClick={editMode ? () => actions.current.toggleRoomRow(room.key) : undefined}
      >
        {/* 선택 모드에서만 나오는 네모. 누를 수 있다는 것과 켜졌다는 것을
            한 번에 말한다 — 객실명만으로는 눌러도 되는지 알 수 없다. */}
        {editMode && <span className="opsg__rbox" />}
        <span className="opsg__rn">{room.displayRoomLabel}</span>
      </div>
      <div className="opsg__tracks">
        {/* 가격. 값이 없으면 대시 — **0원이 아니다.** */}
        <div className="opsg__track">
          {days.map((day, index) => {
            const cellKey = selectionCellKey(room.key, day.date);
            const pendingEntry = pendingPrices.get(cellKey);
            // 반영이 확인된 값은 **바로 진하게** — 데이터 다시 받기를 기다리지 않는다.
            const pricePending = !!pendingEntry && pendingEntry.pend;
            const price = pendingEntry?.value ?? row.rates.price[index] ?? null;
            // 「누가 언제 얼마에서 얼마로」. 값이 이상할 때 제일 먼저 찾는 정보다.
            // 목록은 호버 카드가 뜰 때 받는다 — 여기에는 「있다」만 온다.
            const hasHistory = dayFlagAt(row.history, index);
            return (
              <div
                className={cellClass(day, index, true)}
                data-hc={hasHistory ? day.date : undefined}
                key={`p-${day.date}`}
              >
                <span className={`opsg__price${price === null ? " none" : ""}${pricePending ? " pend" : ""}`}>
                  {price === null ? "–" : formatGridPrice(price)}
                </span>
                {/* 사람이 손댄 칸이라는 표시. 점 하나면 격자를 어지럽히지 않는다. */}
                {hasHistory && <span className="opsg__hdot" />}
              </div>
            );
          })}
        </div>
        {/* 최소 숙박일. **가격보다 얇게** 간다 — 이 줄이 두꺼우면 한 객실이
            차지하는 세로가 늘어 화면에 담기는 객실 수가 줄고, 정작 중요한 가격이
            멀어진다. 숫자는 작아도 색으로 구분되므로 읽힌다. */}
        <div className="opsg__track min">
          {days.map((day, index) => {
            const pendingMin = pendingMinStay.get(selectionCellKey(room.key, day.date));
            const rate = rateAtIndex(index);
            const minStay = pendingMin?.value ?? rate?.minStay ?? null;
            // 운영 중 유닛끼리 최소숙박이 다르다(예: 802# 1박 · K802 2박) — 짧은 값을 보이되 모서리로 알리고
            // 유닛별 값을 적는다. 방금 보낸 값이 흐리게 보이는 동안은 표시하지 않는다(보낸 값이 둘 다에 간다).
            const mixed = !pendingMin && rate?.minStayByUnit ? rate.minStayByUnit : null;
            // **2박이 기본이라 조용히 둔다.** 구분은 글자 굵기가 아니라 칸 바탕색으로 한다
            // (실측 2026-09-25: 12,412칸이 2박, 1박은 388칸 — 기본값을 강조하면 예외가 안 보인다).
            const minTone = minStay === 1 ? " ms1" : minStay !== null && minStay >= 3 ? " ms3" : "";
            // 같은 칸의 이력(가격·최소숙박이 한 목록이다) — 가격 줄과 같은 카드를 띄운다.
            const hasHistory = dayFlagAt(row.history, index);
            return (
              <div
                className={`${cellClass(day, index, true)}${minTone}${mixed ? " mixed" : ""}`}
                data-hc={hasHistory ? day.date : undefined}
                key={`m-${day.date}`}
                title={
                  mixed
                    ? `${copy.msMixed}: ${mixed
                        .map((unit) => `${unit.label} ${copy.minStay.replace("{n}", String(unit.minStay))}`)
                        .join(" · ")}`
                    : undefined
                }
              >
                <span className={`opsg__min${pendingMin?.pend ? " pend" : ""}`}>
                  {minStay ?? ""}
                </span>
              </div>
            );
          })}
        </div>
        {/* 예약 · BLOCK. 「취소만 보기」에서는 층 수만큼 키운다. */}
        <div
          className="opsg__track"
          style={laneCount > 1 ? { height: `calc(var(--ops-track) + ${(laneCount - 1) * OPS_LANE_STEP_PX}px)` } : undefined}
        >
          {days.map((day, index) => (
            <div className={cellClass(day, index, false)} key={`r-${day.date}`}>
              {/* 고르는 중인 줄에는 `+` 를 안 그린다 — 위에 기간 레이어가 덮인다. */}
              {!drafting && canStart(day.date) && (
                <button
                  className="opsg__plus"
                  // **누르는 순간** 체크인을 찍는다 — 그래야 누른 채 끌어서 기간을
                  // 잡을 수 있다. 떼기만 하면 클릭 두 번 방식으로 이어진다.
                  onClick={(event) => {
                    // 키보드(Enter/Space)는 포인터 이벤트가 없다 — 여기서 찍는다.
                    if (event.detail === 0) startDraft(day.date);
                  }}
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    // 끄는 동안 글자가 선택되거나 포커스가 튀지 않게.
                    event.preventDefault();
                    startDraft(day.date);
                  }}
                  type="button"
                >
                  +
                </button>
              )}
            </div>
          ))}
          {drafting && (
            <OpsBookingDraft
              checkIn={drafting.checkIn}
              checkInLabel={copy.mbCheckIn}
              dates={dates}
              geometry={(from, to) => barGeometry(days, from, to)}
              isOccupied={nightTaken}
              key={drafting.checkIn}
              nightsLabel={copy.mbNights}
              onCancel={() => actions.current.cancelDraft()}
              onCommit={(checkOut) => actions.current.commitDraft(bookingRoom, drafting.checkIn, checkOut)}
              onRestart={(date) => {
                if (canStart(date)) startDraft(date);
              }}
            />
          )}
          {roomBlocks.map((block) => {
            const geometry = blockGeometry(days, block.startDate, block.endDate);
            if (!geometry) return null;
            const lane = blockLanes.laneById.get(block.id) ?? 0;
            return (
              <div
                className="opsg__block"
                key={block.id}
                style={lane > 0 ? { ...geometry, top: `calc(3px + ${lane * OPS_LANE_STEP_PX}px)` } : geometry}
                // 사유·메모·건 사람은 막대 위에 올리면 보인다. 사유는 막대에도 짧게 붙인다(2026-10-01).
                title={blockNoteTitle(block, copy)}
              >
                {block.purpose && block.purpose in copy.bkPurposes
                  ? `${copy.blockLabel} · ${copy.bkPurposes[block.purpose as keyof typeof copy.bkPurposes]}`
                  : copy.blockLabel}
              </div>
            );
          })}
          {days.map((day, index) =>
            dayFlagAt(row.gap, index) ? (
              <div
                className="opsg__gap"
                key={`g-${day.date}`}
                style={{
                  left: `calc(${(index / days.length) * 100}% + 1px)`,
                  width: `calc(${(1 / days.length) * 100}% - 2px)`,
                }}
              />
            ) : null,
          )}
          {roomBars.map((bar) => {
            const geometry = barGeometry(days, bar.checkIn, bar.checkOut);
            if (!geometry) return null;
            // 층이 있으면 그만큼 내려 그린다. 층 0 은 평소 자리 그대로다.
            const lane = barLanes?.laneById.get(bar.id) ?? 0;
            return (
              <div
                className={`opsg__bar ${bar.channel}${bar.isCancelled ? " cancelled" : ""}${
                  priceWinsOnly && !showCancelled ? (wins.has(bar.id) ? " pw-win" : " pw-dim") : ""
                }`}
                key={bar.id}
                // 편집 모드에서는 칸 선택이 먼저다 — 막대를 누르다 상세가 뜨면 드래그 선택이 끊긴다.
                onClick={editMode ? undefined : () => actions.current.openBar(bar, room)}
                style={lane > 0 ? { ...geometry, top: `calc(3px + ${lane * OPS_LANE_STEP_PX}px)` } : geometry}
                // 브라우저 툴팁(이름 · 기간)은 두지 않는다(2026-10-01 사용자) — 막대를 지나갈 때마다 떠서 격자를
                // 가린다. 자세한 것은 눌러서 예약 상세로.
              >
                {bar.guestName}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});


/**
 * 날짜 머리 위 **달 줄** — 이어진 같은 달 날짜를 한 칸으로 묶는다(2026-09-30).
 * 날짜 칸에 달 이름을 얹으면 좁은 칸에서 날짜를 가린다(사용자 지적) — 줄을 따로 둔다.
 */
function monthSegments(days: OpsCalendarDay[]): { key: string; year: number; month: number; span: number }[] {
  const segments: { key: string; year: number; month: number; span: number }[] = [];
  for (const day of days) {
    const key = day.date.slice(0, 7);
    const last = segments[segments.length - 1];
    if (last && last.key === key) last.span += 1;
    else segments.push({ key, month: Number(key.slice(5, 7)), span: 1, year: Number(key.slice(0, 4)) });
  }
  return segments;
}

/** 로케일 달 이름. 폭이 넉넉하면 연도까지(2026년 10월 · 2026年10月 · Oct 2026). */
function monthLabelOf(year: number, month: number, withYear: boolean, localeTag: string): string {
  return new Intl.DateTimeFormat(localeTag, {
    month: withYear ? "long" : "short",
    timeZone: "UTC",
    ...(withYear ? { year: "numeric" } : {}),
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export function OpsCalendarGrid({
  copy: copyProp,
  days: daysProp,
  historyAlerts,
  properties,
  rows,
  showCancelled,
  today,
}: {
  copy: Copy;
  days: OpsCalendarDay[];
  /** 최근 7일 Beds24 전송 실패 + 멈춘 대기 작업 수 — 「이력」 버튼에 빨간 숫자로. */
  historyAlerts: number;
  /**
   * 고른 건물(탭 순서, 빈 목록 = 전체). 가격 개입 목록을 그 건물(들) 것만 받는 데 쓴다(2026-09-30 다중 선택).
   */
  properties: string[];
  /**
   * 보이는 객실의 행(격자 순서) — `ops-calendar-rows.ts`. 요금(날짜 순 배열)·이력이 있는 칸·갭·막대·
   * 블록을 행마다 묶고 내용 해시(`sig`)를 단다.
   */
  rows: OpsGridRowData[];
  /**
   * **「취소만 보기」다.** 켜면 일반 예약이 사라지고 취소된 것만 남는다 — 저쪽과 같다
   * (`isCancelled === showCancelled`). 겹쳐 그리면 못 읽기 때문이다.
   * 점유·갭 판정은 이 값과 **무관하게** 항상 취소를 뺀다.
   */
  showCancelled: boolean;
  today: string;
}) {
  /*
   * ── 새로고침이 와도 **안 바뀐 것은 참조를 유지한다**(2026-09-30 속도) ─────────────
   *
   * 라이브 신호·쓰기 반영·건물 전환으로 서버 데이터를 다시 받으면 모든 prop 이 새 객체로 온다.
   * 그대로 넘기면 메모된 행(`OpsGridRow`)이 전부 다시 그려진다(「전체」 91행). 그래서:
   *
   * - 행: 내용 해시(`sig`)가 같으면 직전 객체를 그대로 쓴다(`reuseStableRows`).
   * - 가로축(`days`)·문구(`copy`): 내용이 같으면 직전 것을 쓴다.
   *
   * 효과가 아니라 **렌더 중에 비교하고 다를 때만 setState** 한다(아래 `seenRows` — React 가 공식 지원하는
   * 「이전 렌더 값 저장」 패턴. React Compiler 규칙상 렌더 중 ref 를 읽고 쓸 수 없다).
   */
  const [rowsState, setRowsState] = useState({ seen: rows, stable: rows });
  let stableRows = rowsState.stable;
  const rowsArrived = rowsState.seen !== rows;
  if (rowsArrived) {
    stableRows = reuseStableRows(rowsState.stable, rows);
    setRowsState({ seen: rows, stable: stableRows });
  }
  const [stableDays, setStableDays] = useState(daysProp);
  const days = sameOpsDays(stableDays, daysProp) ? stableDays : daysProp;
  if (days !== stableDays) setStableDays(days);
  const [copyState, setCopyState] = useState({ seen: copyProp, stable: copyProp });
  let copy = copyState.stable;
  if (copyState.seen !== copyProp) {
    // 문구는 언어를 바꿀 때만 달라진다 — 받은 객체가 바뀔 때 한 번만 비교한다.
    copy = JSON.stringify(copyProp) === JSON.stringify(copyState.stable) ? copyState.stable : copyProp;
    setCopyState({ seen: copyProp, stable: copy });
  }
  const dates = useMemo(() => days.map((day) => day.date), [days]);
  const dayIndex = useMemo(() => new Map(dates.map((date, index) => [date, index])), [dates]);
  const serverRooms = useMemo(() => stableRows.map((row) => row.room), [stableRows]);
  const rowsByKey = useMemo(() => new Map(stableRows.map((row) => [row.room.key, row])), [stableRows]);
  const bars = useMemo(() => stableRows.flatMap((row) => row.bars), [stableRows]);
  const blocks = useMemo(() => stableRows.flatMap((row) => row.blocks), [stableRows]);
  /** `roomKey|YYYY-MM-DD` — 1박 갭인 칸(행 표시에서 되살린다). */
  const gapCells = useMemo(() => rowGapCellKeys(stableRows, dates), [stableRows, dates]);
  /** 행 밖(패널·호버 카드·예약 패널)에서 칸 요금을 읽는다. */
  const rateAt = useMemo(() => buildRowRateLookup(stableRows, dates), [stableRows, dates]);

  // 선택 상태는 전부 여기 있다. 서버로 왕복하지 않는다 — 칸 하나 찍을 때마다 격자를 다시
  // 그리면 2,700칸짜리 화면에서 쓸 수 없다.
  /**
   * 편집 모드는 **둘로 갈린다.**
   *
   * 가격과 최소 숙박일은 같은 격자를 쓰지만 묻는 것이 다르다 — 가격은 「얼마로?」이고 칸마다
   * 다른 값을 계산하지만, 최소 숙박일은 「몇 박으로?」 하나를 고른 칸 전부에 넣는다.
   * 한 패널에 둘을 넣으면 **어느 쪽을 고치는 중인지 모르는 채로 적용**하게 된다. 가격은
   * 틀리면 채널로 그대로 나간다.
   */
  const [mode, setMode] = useState<"off" | "price" | "minstay" | "block">("off");
  const editMode = mode !== "off";
  /** 지금 모드를 **비동기 콜백에서** 읽기 위한 ref — 클로저로 잡으면 저장 왕복 중 모드가
   * 바뀌어도(예: 「1박 갭 N」 버튼) 옛 모드로 착각한다(아래 `removeSentCells`). 렌더 중이 아니라
   * 효과에서 갱신한다(React Compiler 규칙 — 렌더 중 ref 변경 금지). */
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  const [scope, setScope] = useState<OpsSelectionScope>(EMPTY_SCOPE);
  /**
   * 고른 칸과 **직전 축이 기여한 칸**을 한 덩어리로 든다.
   *
   * 둘을 따로 두면 안 된다 — 전에는 축 키를 `useRef` 에 넣고 `setSelection` 업데이터 **안에서**
   * 갱신했는데, React 는 업데이터를 **두 번 부른다**(StrictMode · 동시성 렌더). 두 번째 호출
   * 때는 ref 가 이미 새 값이라 걷어낼 대상을 못 찾고, **객실 체크를 풀어도 그 칸이 그대로
   * 남았다.**
   *
   * 한 state 로 두면 업데이터가 순수해져 몇 번을 불려도 같은 결과가 나온다.
   */
  const [selectionState, setSelectionState] = useState<{
    cells: OpsSelectionCell[];
    scopeKeys: Set<string>;
  }>({ cells: [], scopeKeys: new Set() });
  const selection = selectionState.cells;
  /**
   * 드래그 선택 — **누른 칸과 지금 칸, 두 모서리로 사각형**을 정한다(`applyDragRect`).
   * `base` 는 누르기 전의 선택, `adding` 은 누른 칸이 정한 방향이다. 포인터 좌표는 자동 스크롤이
   * 같은 자리를 다시 재려고 들고 있는다.
   */
  const dragRef = useRef<{
    anchor: { row: number; col: number };
    current: { row: number; col: number };
    adding: boolean;
    base: OpsSelectionCell[];
    pointerId: number;
    x: number;
    y: number;
  } | null>(null);
  /**
   * Shift+클릭의 기준점 — 직전에 누른 칸.
   *
   * **행·열 인덱스가 아니라 (객실키·날짜)로 저장한다.** 인덱스로 두면 그 사이 「오늘 빈방」
   * 필터나 「큰방 위로」 정렬이 행 순서를 바꿨을 때 전혀 다른 칸을 기준점으로 삼는다. 쓸 때마다
   * 지금의 `roomKeys`/`dates` 에서 다시 찾고, 못 찾으면(그 행·날짜가 화면에서 빠졌으면) 기준점이
   * 없는 것으로 본다.
   */
  const lastAnchorRef = useRef<{ roomKey: string; date: string } | null>(null);
  const autoScrollRef = useRef<number | null>(null);
  // 화면을 떠나면 자동 스크롤을 멈춘다. 조기 반환보다 **앞에** 둬야 한다(훅 순서).
  useEffect(
    () => () => {
      if (autoScrollRef.current !== null) cancelAnimationFrame(autoScrollRef.current);
    },
    [],
  );
  const [dateAnchor, setDateAnchor] = useState<string | null>(null);
  /**
   * 접수했지만 아직 Beds24 에 반영되지 않은 값.
   *
   * 서버 응답을 기다리는 동안 옛 값이 보이면 사람은 「안 됐나?」 하고 다시 누른다.
   * **반영이 끝나고 서버 데이터를 다시 받으면** 거둔다(`runWrite`). 예전에는 「다음 서버 렌더가
   * 덮는다」고 봤지만 표시가 `pending ?? 서버값` 순이라 덮이지 않았고, 서버 렌더도 반영 전에
   * 끝나서 새로고침 전까지 옛 값이었다(2026-09-28).
   */
  const [pendingPrices, setPendingPrices] = useState<Map<string, PendingValue>>(new Map());
  /** 최소 숙박일도 같다 — 예전에는 가격만 먼저 그려서 「1박으로」가 새로고침 전까지 안 보였다. */
  const [pendingMinStay, setPendingMinStay] = useState<Map<string, PendingValue>>(new Map());
  /** 반영이 끝난 쓰기. **서버 데이터가 새로 도착하면** 이들의 흐린 값을 거둔다. */
  const [settledTokens, setSettledTokens] = useState<Set<number>>(new Set());
  /** 아직 Beds24 에 반영 중인 쓰기 수. 패널을 닫아도 진행 중인 것을 알 수 있게 툴바에 띄운다. */
  const [writesInFlight, setWritesInFlight] = useState(0);
  const writeTokenRef = useRef(0);
  const router = useRouter();
  const [, startRefresh] = useTransition();

  /**
   * 위 쓰기 상태를 **행별로** 쪼갠다(2026-09-30 속도).
   *
   * `OpsGridRow` 는 자기 몫만 받는다 — 전체 `pendingPrices` Map 을 그대로 모든 행에 넘기면,
   * 칸 하나만 써도 참조가 바뀌어 그 Map 을 참조하는 모든 행이 `React.memo` 를 지나 다시
   * 그려진다. `sliceRowPending` 이 안 바뀐 행에는 **이전 Map 참조를 그대로** 돌려준다.
   *
   * **비교 기준(직전 결과)을 ref 가 아니라 state 로 든다** — React Compiler 규칙상 렌더 중에
   * ref 를 읽거나 쓸 수 없다. 렌더 중 비교 후 다를 때만 `setState` 하는 것은 React 가 공식
   * 지원하는 패턴이다(아래 `seenRates` 와 같다).
   */
  const [pendingPricesByRoom, setPendingPricesByRoom] = useState<Map<string, Map<string, PendingCell>>>(
    new Map(),
  );
  const nextPendingPricesByRoom = sliceRowPending(pendingPrices, settledTokens, pendingPricesByRoom);
  if (!sameRoomBuckets(pendingPricesByRoom, nextPendingPricesByRoom)) {
    setPendingPricesByRoom(nextPendingPricesByRoom);
  }
  const [pendingMinStayByRoom, setPendingMinStayByRoom] = useState<Map<string, Map<string, PendingCell>>>(
    new Map(),
  );
  const nextPendingMinStayByRoom = sliceRowPending(pendingMinStay, settledTokens, pendingMinStayByRoom);
  if (!sameRoomBuckets(pendingMinStayByRoom, nextPendingMinStayByRoom)) {
    setPendingMinStayByRoom(nextPendingMinStayByRoom);
  }

  /**
   * 서버 데이터(`rows`)가 도착한 횟수(= 새로고침이 몇 번 왔는가). 흐린 값을 거둘 때 「이 쓰기가 반영된
   * **뒤에** 나간 새로고침이 왔는가」를 가늠하는 데 쓴다(아래 참고). 비동기 콜백(쓰기 반영
   * 확인)에서 **지금** 값을 읽어야 해서 ref 로도 들지만, ref 는 효과에서만 갱신한다.
   */
  const [refreshGeneration, setRefreshGeneration] = useState(0);
  const refreshGenerationRef = useRef(refreshGeneration);
  useEffect(() => {
    refreshGenerationRef.current = refreshGeneration;
  }, [refreshGeneration]);
  /** 토큰 → 반영이 확인된 시점의 새로고침 세대. 그보다 **새 세대**가 와야 값이 달라도 믿는다.
   * 렌더 중에 읽고 지워야 해서 ref 가 아니라 state 다. */
  const [settleGenerations, setSettleGenerations] = useState<Map<number, number>>(new Map());

  /*
   * 서버 데이터(`rows`)가 새로 오면 **끝난 쓰기의 흐린 값만** 거둔다. 아직 반영 중인 것은
   * 남긴다 — 접수 직후의 재렌더는 반영 전 값을 들고 오므로, 거기서 거두면 옛 값으로 튄다.
   *
   * 여러 쓰기가 겹치면 **더 먼저 나간(그래서 아직 옛 값인) 새로고침**이 나중에 도착할 수
   * 있다 — 그걸로 무작정 거두면 방금 반영된 값이 한 프레임 옛 값으로 튄다(2026-09-30). 그
   * 칸의 서버 값이 보낸 값과 **실제로 같아졌을 때**, 또는 이 쓰기가 반영된 **뒤에 나간**
   * 새로고침이 와서 지금 값이 확실히 최신일 때만 거둔다 — 후자가 없으면 값이 영영 안 맞는
   * 예외적인 경우(반올림 등)에 흐린 채로 남는다.
   *
   * 효과가 아니라 렌더 중에 비교한다(React 의 「이전 렌더 값 저장」 패턴) — 효과로 하면 옛 값이
   * 한 프레임 보였다가 바뀐다.
   */
  // 서버 데이터가 도착한 **횟수**로 센다(내용이 같아도 센다 — 「반영 뒤에 나간 새로고침이 왔다」는 뜻이다).
  if (rowsArrived) {
    const freshRate = buildRowRateLookup(
      rows,
      daysProp.map((day) => day.date),
    );
    const freshAt = (key: string) => {
      const separator = key.indexOf("|");
      return freshRate(key.slice(0, separator), key.slice(separator + 1));
    };
    const nextGeneration = refreshGeneration + 1;
    setRefreshGeneration(nextGeneration);
    if (settledTokens.size > 0) {
      const ready = new Set<number>();
      for (const token of settledTokens) {
        const settleGeneration = settleGenerations.get(token);
        if (settleGeneration !== undefined && nextGeneration > settleGeneration) ready.add(token);
      }
      for (const [key, entry] of pendingPrices) {
        if (settledTokens.has(entry.token) && freshAt(key)?.price === entry.value) ready.add(entry.token);
      }
      for (const [key, entry] of pendingMinStay) {
        if (settledTokens.has(entry.token) && freshAt(key)?.minStay === entry.value) ready.add(entry.token);
      }
      if (ready.size > 0) {
        setPendingPrices(dropTokens(pendingPrices, ready));
        setPendingMinStay(dropTokens(pendingMinStay, ready));
        setSettledTokens((previous) => {
          const next = new Set(previous);
          for (const token of ready) next.delete(token);
          return next;
        });
        setSettleGenerations((previous) => {
          const next = new Map(previous);
          for (const token of ready) next.delete(token);
          return next;
        });
      }
    }
  }

  const setPendingOf = (kind: OpsWriteKind) =>
    kind === "price" ? setPendingPrices : setPendingMinStay;

  /**
   * 가격·최소숙박 쓰기 한 번. 흐린 값 → 접수 → 반영 대기 → 서버 데이터 다시 받기.
   * 흐름과 이유는 `ops-write-tracker.ts`.
   */
  const runWrite: RunOpsWrite = async (kind, values, submit) => {
    writeTokenRef.current += 1;
    const token = writeTokenRef.current;
    const setPending = setPendingOf(kind);
    // **서버 응답을 기다리기 전에 화면부터 바꾼다.** 왕복 동안 옛 값이 보이면 사람은
    // 「안 됐나?」 하고 다시 누른다.
    setPending((previous) => {
      const next = new Map(previous);
      for (const item of values) next.set(item.key, { token, value: item.value });
      return next;
    });

    const result = await submit();
    if (!result.ok) {
      // 접수조차 안 됐다 — 흐린 값을 거두고 원래 값으로 돌아간다.
      setPending((previous) => dropTokens(previous, new Set([token])));
      return { result, settled: null };
    }

    setWritesInFlight((count) => count + 1);
    const settled = watchOpsWriteJob(result.jobId).then((outcome) => {
      setWritesInFlight((count) => Math.max(0, count - 1));
      if (outcome === "failed") {
        // 하나도 안 들어갔다 — 바로 되돌린다.
        setPending((previous) => dropTokens(previous, new Set([token])));
      } else {
        // 완료·일부 실패·시간 초과 모두 **실제 값으로** 맞춘다. 일부만 들어갔으면 들어간 칸만
        // 새 값이 보이는 게 정확하다.
        // 지금 세대를 적어 둔다 — 이보다 **새로운** 세대의 새로고침이 와야 값이 달라도 믿는다
        // (먼저 나간 옛 새로고침이 늦게 도착해 값을 되돌리는 것을 막는다).
        setSettleGenerations((previous) => {
          const next = new Map(previous);
          next.set(token, refreshGenerationRef.current);
          return next;
        });
        setSettledTokens((previous) => new Set(previous).add(token));
      }
      // 새로고침 없이 **서버 데이터만** 다시 받는다 — 스크롤·선택·열린 패널은 그대로다.
      startRefresh(() => router.refresh());
      return outcome;
    });
    return { result, settled };
  };
  /**
   * 수동 예약 — **격자에서 기간을 먼저 고른다**(저쪽 `handleDateCellClick`).
   *
   * 빈 칸의 `+` 가 체크인이고(`bookingDraft`), 이어서 누르거나 끌어서 놓은 날이 체크아웃이다.
   * 그 사이의 미리보기는 `OpsBookingDraft` 가 **자기 안에서만** 그린다 — 여기서 포인터를 들고
   * 있으면 움직일 때마다 격자 전체가 다시 그려져 끊긴다. 체크아웃이 정해져야 패널이 열린다.
   */
  const [bookingDraft, setBookingDraft] = useState<{ room: BookingPanelRoom; checkIn: string } | null>(
    null,
  );
  const [booking, setBooking] = useState<{
    room: BookingPanelRoom;
    checkIn: string;
    checkOut: string;
  } | null>(null);
  /** 편집 모드·「취소만 보기」에서는 예약을 만들지 않는다 — 고르던 것도 거기서는 안 보인다. */
  const activeDraft = !editMode && !showCancelled ? bookingDraft : null;
  const cancelDraft = () => setBookingDraft(null);

  // 고르는 중에만 Esc 로 무른다. 패널이 열려 있으면 패널의 Esc 가 먼저다(그때는 draft 가 없다).
  useEffect(() => {
    if (!activeDraft) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setBookingDraft(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [activeDraft]);
  /** 예약 상세. 막대를 누르면 뜬다 — **취소는 여기서만** 한다. */
  /**
   * 가격 개입 성공만 진하게(저쪽 「Price Wins」). 나머지 막대는 흐리게 — **목록에서 빼지는 않는다**
   * (어디에 섞여 있는지가 보여야 한다, 저쪽과 같다).
   */
  const [priceWinsOnly, setPriceWinsOnly] = useState(false);
  /**
   * **최근 예약**(2026-10-05) — 정한 시간대에 들어온, 가격 개입 성공이 아닌 예약만 진하게. 가격 개입 성공과 같은 강조
   * 방식이라 둘 중 하나만 켠다(켜면 다른 쪽이 꺼진다). 켜면 도구줄에 시간대 칩이 붙고 그걸 누르면 목록 · 기간 바꾸기.
   */
  const [recentOnly, setRecentOnly] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  /** 「매출 요약」 모달 — 보고 있는 창 × 고른 건물(2026-09-30). */
  const [salesOpen, setSalesOpen] = useState(false);
  // 큰방 위쪽 정렬 — 기본 켜짐(저쪽과 같다). STAY ARI Apartment Hotel 에만 있다(`ops-large-rooms.ts`).
  // **그 건물 하나만 골랐을 때만** 켠다 — 「전체」에서는 토글도 정렬도 없다(2026-09-29 사용자 결정).
  // **이 한 목록을 격자 전체가 쓴다** — 드래그 선택·행 순서가 화면과 어긋나면 안 된다.
  const [largeFirst, setLargeFirst] = useState(true);
  const hasLargeRooms = useMemo(
    () => new Set(serverRooms.map((room) => room.propertyName)).size === 1 && hasOpsLargeRooms(serverRooms),
    [serverRooms],
  );
  const largeActive = hasLargeRooms && largeFirst;
  // 오늘 빈방만 — 오늘 밤을 차지한 살아 있는 예약이 없는 방(`ops-vacant-today.ts`). 차단은 안 센다.
  // 보는 기간에 오늘이 없으면 예약을 다 못 읽었으므로 판정하지 않는다(버튼도 숨긴다).
  const [vacantOnly, setVacantOnly] = useState(false);
  const todayInView = days.some((day) => day.date === today);
  const vacantActive = vacantOnly && todayInView;
  const vacantKeys = useMemo(
    () => opsVacantRoomKeys({ bars, roomKeys: serverRooms.map((room) => room.key), today }),
    [bars, serverRooms, today],
  );
  const rooms = useMemo(() => {
    const base = vacantActive ? serverRooms.filter((room) => vacantKeys.has(room.key)) : serverRooms;
    // 거른 뒤 정렬(저쪽과 같다).
    return (largeActive ? orderOpsLargeRoomsFirst(base) : base) as OpsCalendarRoom[];
  }, [largeActive, serverRooms, vacantActive, vacantKeys]);

  /*
   * 가격 이력 호버 카드(`ops-cell-history-card.tsx`). 브라우저 `title` 대신이다.
   *
   * - 스치듯 지나가는 칸마다 뜨지 않게 **잠깐 머물러야** 뜬다(`HOVER_DELAY_MS`). 한 번 뜬 뒤 옆
   *   칸으로 옮기면 바로 바뀐다 — 줄을 따라 훑어보는 동작이 끊기지 않게.
   * - 누르거나(드래그 시작) 스크롤하면 바로 닫는다 — 선택을 가리면 안 된다.
   */
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * **위치 정보만 상태로 든다.** `history`·`room`·가격은 그때그때 최신 값을 읽는다 — 카드가
   * 뜬 채로 이력이 새로 들어오거나(다른 창에서 방금 고친 값) 낙관값이 반영되면(`pendingPrices`)
   * 카드도 같이 바뀌어야 한다. 호버 시작 시점 스냅샷을 들고 있으면 그 순간 값에 멈춘다.
   */
  const [hoverCell, setHoverCell] = useState<{
    anchor: DOMRect;
    /** 카드를 붙일 `.ops` — 호버를 시작한 칸에서 찾는다(렌더 중 ref 를 읽지 않는다). */
    container: HTMLElement;
    date: string;
    roomKey: string;
  } | null>(null);
  const hoverOpenRef = useRef(false);
  useEffect(() => {
    hoverOpenRef.current = hoverCell !== null;
  }, [hoverCell]);
  const HOVER_DELAY_MS = 140;
  /**
   * 이력 호버는 **격자 한 곳에서** 받는다(2026-09-30 속도) — 칸마다 핸들러를 달면 수천 개가 매 렌더
   * 새로 만들어진다. 이력이 있는 칸에는 행(`OpsGridRow`)이 `data-hc`(날짜)만 붙인다.
   */
  const hoverElementRef = useRef<HTMLElement | null>(null);
  const onGridPointerOver = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || event.buttons !== 0) return;
    const cell = (event.target as HTMLElement).closest<HTMLElement>("[data-hc]");
    if (!cell || cell === hoverElementRef.current) return;
    const roomKey = cell.closest<HTMLElement>("[data-ops-row]")?.dataset.opsRow;
    const date = cell.dataset.hc;
    // `data-hc` 는 이력이 있는 칸에만 붙는다 — 실제로 보여줄 값은 렌더 때 다시 읽는다(아래 참고).
    const container = cell.closest<HTMLElement>(".ops");
    if (!roomKey || !date || !container) return;
    hoverElementRef.current = cell;
    const anchor = cell.getBoundingClientRect();
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    const open = () => setHoverCell({ anchor, container, date, roomKey });
    if (hoverOpenRef.current) open();
    else hoverTimerRef.current = setTimeout(open, HOVER_DELAY_MS);
  };
  const onGridPointerOut = (event: React.PointerEvent<HTMLDivElement>) => {
    const from = (event.target as HTMLElement).closest<HTMLElement>("[data-hc]");
    const to = (event.relatedTarget as HTMLElement | null)?.closest?.("[data-hc]") ?? null;
    if (!from || from === to) return;
    hoverElementRef.current = null;
    endHover();
  };
  const endHover = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = null;
    // 옆 칸으로 옮기는 중이면 그 칸의 `startHover` 가 곧 바꾼다 — 한 프레임 기다려 깜빡임을 없앤다.
    hoverTimerRef.current = setTimeout(() => setHoverCell(null), 60);
  };
  useEffect(() => {
    if (!hoverCell) return;
    const close = () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
      hoverElementRef.current = null;
      setHoverCell(null);
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", close, true);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", close, true);
    };
  }, [hoverCell]);
  useEffect(
    () => () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    },
    [],
  );
  /*
   * ── 칸 이력은 **호버 카드가 뜰 때** 그 칸 것만 받는다(2026-09-30 속도) ────────────
   *
   * 페이지에는 「이력이 있는 칸」 표시만 온다. 받은 목록은 세션 동안 칸별로 들고 있다가, 서버 데이터가
   * 새로 오면(`refreshGeneration`) **낡은 것으로 보고** 다시 받는다 — 다시 받는 동안에는 직전 목록을
   * 그대로 보여 깜빡이지 않는다. `history: null` 은 「받아 보니 없다」다(카드를 안 띄운다).
   */
  const [historyCache, setHistoryCache] = useState<
    Map<string, { generation: number; history: CellHistory | null }>
  >(new Map());
  /** 이미 보낸 요청(`세대|칸`) — 같은 칸을 두 번 보내지 않는다. 효과 안에서만 읽고 쓴다. */
  const historyRequestsRef = useRef(new Set<string>());
  useEffect(() => {
    if (!hoverCell) return;
    const cellKey = selectionCellKey(hoverCell.roomKey, hoverCell.date);
    const cached = historyCache.get(cellKey);
    if (cached && cached.generation === refreshGeneration) return;
    const roomIds = serverRooms.find((room) => room.key === hoverCell.roomKey)?.roomIds ?? [];
    if (roomIds.length === 0) return;
    const requestKey = `${refreshGeneration}|${cellKey}`;
    if (historyRequestsRef.current.has(requestKey)) return;
    historyRequestsRef.current.add(requestKey);
    const generation = refreshGeneration;
    void loadOpsCellHistory({ date: hoverCell.date, roomIds }).then((result) => {
      historyRequestsRef.current.delete(requestKey);
      // 실패하면 남겨 두지 않는다 — 카드는 「불러오는 중」으로 남고, 다음 호버가 다시 받는다.
      if (!result.ok) return;
      setHistoryCache((previous) => new Map(previous).set(cellKey, { generation, history: result.history }));
    });
  }, [historyCache, hoverCell, refreshGeneration, serverRooms]);

  const [priceWinsOpen, setPriceWinsOpen] = useState(false);
  /*
   * ── 가격 개입 전환은 **격자가 그린 뒤** 따로 받는다(2026-09-30 속도) ─────
   *
   * **보고 있는 창 × 고른 건물**만 판정한다(2026-10-02 사용자 지시 — 예전엔 최근 90일 전체라 달을 넘겨도 같은 목록이
   * 남았다). 건물 · 창이 바뀌면 「불러오는 중」(`null`)부터, 같은 창에서 서버 데이터만 새로 오면 직전 목록을 둔 채
   * 다시 받는다.
   */
  const [conversionsState, setConversionsState] = useState<{
    propertyKey: string;
    list: OpsPriceConversion[];
  } | null>(null);
  /**
   * 고른 건물 목록을 **문자열 하나**로 — 서버가 새로고침마다 새 배열을 보내도 같은 선택이면 같은 값이라
   * 목록이 「불러오는 중」으로 깜빡이지 않는다. 건물 이름에 줄바꿈은 없다.
   */
  const propertyKey = properties.join("\n");
  const windowStart = days[0]?.date ?? "";
  const conversionsKey = `${propertyKey}#${windowStart}#${days.length}`;
  /** 가장 최근 요청 번호 — 늦게 도착한 옛 응답이 새 목록을 덮지 않게. 효과 안에서만 쓴다. */
  const conversionsRequestRef = useRef(0);
  useEffect(() => {
    conversionsRequestRef.current += 1;
    const requestId = conversionsRequestRef.current;
    if (!windowStart) return;
    void loadOpsPriceConversions({
      days: days.length,
      properties: propertyKey ? propertyKey.split("\n") : [],
      start: windowStart,
    }).then((result) => {
      if (!result.ok || requestId !== conversionsRequestRef.current) return;
      setConversionsState({ list: result.conversions, propertyKey: conversionsKey });
    });
  }, [conversionsKey, days.length, propertyKey, refreshGeneration, windowStart]);
  /** 보이는 객실 것만(건물 필터를 따른다). `null` = 아직 받는 중. */
  const priceConversions = useMemo(() => {
    if (!conversionsState || conversionsState.propertyKey !== conversionsKey) return null;
    const visible = new Set(serverRooms.map((room) => room.key));
    return conversionsState.list.filter((conversion) => visible.has(conversion.roomKey));
  }, [conversionsState, conversionsKey, serverRooms]);
  const conversionIds = useMemo(
    () => new Set((priceConversions ?? []).map((conversion) => conversion.reservationId)),
    [priceConversions],
  );
  const recent = useRecentBookings({ days: days.length, propertyKey, refreshToken: refreshGeneration, windowStart });
  /** 보이는 객실 것만. `null` = 받는 중. */
  const recentBookings = useMemo(() => {
    if (!recent.bookings) return null;
    const visible = new Set(serverRooms.map((room) => room.key));
    return recent.bookings.filter((booking) => visible.has(booking.roomKey));
  }, [recent.bookings, serverRooms]);
  const recentIds = useMemo(() => new Set((recentBookings ?? []).map((booking) => booking.reservationId)), [recentBookings]);
  const [openBar, setOpenBar] = useState<{
    bar: OpsCalendarBar;
    roomLabel: string;
    propertyName: string;
    roomIds: string[];
  } | null>(null);

  // 상단 검색(`AdminGuestSearch`)에서 고른 예약 — 이 화면 위에서는 이벤트로, 다른 화면에서
  // 넘어왔으면 `?resv=` 로 받는다. 창 밖 숙박이라도 상세는 열린다(가격 성과 목록과 같다).
  useEffect(() => {
    function onOpen(event: Event) {
      const placement = (event as CustomEvent<OpsReservationPlacement>).detail;
      if (placement?.bar?.id) setOpenBar(placement);
    }
    window.addEventListener(OPS_OPEN_RESERVATION_EVENT, onOpen);

    const url = new URL(window.location.href);
    const reservationId = url.searchParams.get("resv");
    if (reservationId) {
      // 새로고침으로 다시 열리지 않게 주소에서는 바로 뗀다.
      url.searchParams.delete("resv");
      window.history.replaceState(window.history.state, "", url.toString());
      void loadOpsReservationPlacement(reservationId).then((result) => {
        // 취소 플래그를 두지 않는다 — 개발 모드의 이중 실행에서 첫 실행이 주소를 떼고 곧바로
        // 정리되면, 두 번째 실행은 `resv` 를 못 봐서 패널이 영영 안 열린다.
        if (result.ok) setOpenBar(result.placement);
      });
    }
    return () => {
      window.removeEventListener(OPS_OPEN_RESERVATION_EVENT, onOpen);
    };
  }, []);

  const roomKeys = useMemo(() => rooms.map((room) => room.key), [rooms]);

  /*
   * 「오늘 빈방」 등 필터가 새로고침 뒤에 방을 화면에서 지우면, 고른 칸에는 이제 안 보이는
   * 방이 남을 수 있다. 그러면 요약(`scopeSummary`)은 그 방까지 세는데 실제로 보내는 칸
   * (`panelCells`, 방을 못 찾으면 빠진다)은 그 방을 빼먹어 **숫자가 어긋난다.** 화면에서
   * 사라진 방의 칸은 선택에서도 같이 뺀다 — 효과가 아니라 렌더 중에 비교한다(`seenRates` 와
   * 같은 패턴. 효과에서 하면 한 프레임 어긋난 요약이 보였다가 바뀐다).
   */
  if (selectionState.cells.some((cell) => !roomKeys.includes(cell.roomKey))) {
    const visible = new Set(roomKeys);
    const pruned = selectionState.cells.filter((cell) => visible.has(cell.roomKey));
    const prunedKeys = new Set(pruned.map((cell) => selectionCellKey(cell.roomKey, cell.date)));
    const scopeKeys = new Set([...selectionState.scopeKeys].filter((key) => prunedKeys.has(key)));
    setSelectionState({ cells: pruned, scopeKeys });
  }

  /**
   * 그 칸이 **팔려 있는가**. 가격 수정에서 막히는 유일한 조건이다.
   *
   * blackout·재고 블록·취소된 예약은 막지 않는다 — 차단해 둔 날도 가격은 미리 정해 둘 수
   * 있고, 취소된 예약은 이미 없는 예약이다(저쪽 `isCellPriceBlocked` 와 같다).
   */
  const soldCells = useMemo(() => {
    const sold = new Set<string>();
    for (const bar of bars) {
      if (bar.isCancelled) continue;
      for (const date of dates) {
        if (date >= bar.checkIn && date < bar.checkOut) {
          sold.add(selectionCellKey(bar.roomKey, date));
        }
      }
    }
    return sold;
  }, [bars, dates]);

  const occupancyAt = useMemo(
    () => (roomKey: string, date: string) => ({
      hasBlockingReservation: soldCells.has(selectionCellKey(roomKey, date)),
    }),
    [soldCells],
  );

  const weeks = useMemo(() => buildSelectableWeeks(dates, today), [dates, today]);
  const selectedKeys = useMemo(
    () => new Set(selection.map((cell) => selectionCellKey(cell.roomKey, cell.date))),
    [selection],
  );

  /** 축을 바꾼다 — 곧바로 선택에 반영하되 직접 찍은 칸은 보존한다. */
  const applyScope = (next: OpsSelectionScope) => {
    setScope(next);
    // 팔린 칸은 여기서 빠진다. 개수를 따로 알리지 않는다 — 격자에서 빗금으로 이미 보이고,
    // **고른 칸 수**가 무엇이 바뀔지를 정확히 말해 준다.
    const built = buildScopeCells({
      dates,
      occupancyAt,
      roomKeys,
      scope: next,
      today,
    });
    // **순수 업데이터다.** 부수효과를 넣으면 두 번째 호출 때 어긋난다(위 주석 참고).
    setSelectionState((previous) => {
      const applied = applyScopeToSelection({
        nextScopeCells: built.cells,
        previous: previous.cells,
        previousScopeKeys: previous.scopeKeys,
      });
      return { cells: applied.selection, scopeKeys: applied.scopeKeys };
    });
  };

  const clearSelection = () => {
    setScope(EMPTY_SCOPE);
    setSelectionState({ cells: [], scopeKeys: new Set() });
    setDateAnchor(null);
    // 지운 선택을 가리키던 기준점도 같이 버린다 — 안 그러면 다음 Shift+클릭이 없는 칸을 가리킨다.
    lastAnchorRef.current = null;
  };

  /**
   * 쓰기가 끝난 뒤 **보낸 칸만** 선택에서 뺀다(2026-09-30 버그).
   *
   * 전에는 저장 뒤 `onClear()` 로 선택 전체를 비웠다 — 서버 왕복(수백 ms~수 초) 동안 사람이
   * 이미 다음 칸을 골라 뒀으면 그것까지 같이 날아갔다. 여기서는 **보낸 칸만** 빼고, 아무것도
   * 안 남으면 그때만 축까지 비운다.
   *
   * `expectMode` 로 그새 다른 모드로 넘어갔는지도 본다(예: 「1박 갭 N」 버튼 → 최소숙박 모드) —
   * 이미 다른 선택이 화면에 떠 있는데 지난 쓰기가 그걸 건드리면 안 된다. **`modeRef` 로
   * 읽는다** — 클로저로 잡은 `mode` 는 이 함수가 만들어진 렌더 시점에 멈춰 있다.
   */
  const removeSentCells = (sentCells: OpsSelectionCell[], expectMode: "price" | "minstay") => {
    if (modeRef.current !== expectMode) return;
    setSelectionState((previous) => {
      const remaining = removeCells(previous.cells, sentCells);
      if (remaining.length === previous.cells.length) return previous;
      if (remaining.length === 0) {
        // 값이 고정된 호출이라 여러 번 불려도(StrictMode 이중 렌더 등) 결과가 같다.
        setScope(EMPTY_SCOPE);
        setDateAnchor(null);
        lastAnchorRef.current = null;
        return { cells: [], scopeKeys: new Set() };
      }
      const remainingKeys = new Set(remaining.map((cell) => selectionCellKey(cell.roomKey, cell.date)));
      const scopeKeys = new Set([...previous.scopeKeys].filter((key) => remainingKeys.has(key)));
      return { cells: remaining, scopeKeys };
    });
  };

  /*
   * **Esc = 선택 해제**(편집 모드에서만). 패널의 「선택 해제」와 같다.
   *
   * 입력칸에 커서가 있으면 건드리지 않는다 — 금액을 적다가 Esc 를 눌렀는데 고른 칸이 통째로
   * 날아가면 안 된다. 사이드 패널(예약 상세 등)이 열려 있으면 그쪽 Esc 가 먼저다.
   */
  const hasSelection = selection.length > 0;
  useEffect(() => {
    if (!editMode || !hasSelection) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true'], [role='dialog']")) return;
      clearSelection();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editMode, hasSelection]);

  /*
   * **Esc = 켜 둔 것 전부 끄기**(2026-10-01 사용자 요청) — 가격 수정 · 최소 숙박일 · 차단 모드,
   * 가격 개입 성공 강조, 목록 · 이력 · 매출 요약 패널, 오늘 빈방만.
   *
   * 단계를 둔다: 고른 칸이 있으면 위의 Esc 가 선택만 먼저 푼다(한 번 더 누르면 여기). 예약 상세 ·
   * 예약 만들기 · 고르는 중인 예약은 그쪽 Esc 가 먼저다. 입력칸에 커서가 있으면 건드리지 않는다.
   * 큰방 위쪽 정렬은 기본 켜짐인 보기 설정이라 끄지 않는다.
   */
  const anyToggleOn =
    editMode || priceWinsOnly || priceWinsOpen || recentOnly || recentOpen || historyOpen || vacantOnly;
  const escYields = (editMode && hasSelection) || Boolean(openBar) || Boolean(booking) || Boolean(activeDraft);
  useEffect(() => {
    if (!anyToggleOn || escYields) return;
    const onKey = (event: KeyboardEvent) => {
      // `defaultPrevented` 는 보지 않는다 — 목록 · 이력 · 매출 요약 패널이 Esc 를 먼저 받아 막는데,
      // 그때도 나머지 켜진 것까지 함께 꺼야 한다. 막아야 할 패널(예약 상세 · 예약 만들기)은 `escYields`.
      if (event.key !== "Escape") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      setMode("off");
      setPriceWinsOnly(false);
      setPriceWinsOpen(false);
      setRecentOnly(false);
      setRecentOpen(false);
      setHistoryOpen(false);
      // 매출 요약은 자기 Esc 로 닫는다 — 여기서 바로 끄면 닫힘 애니메이션이 끊긴다.
      setVacantOnly(false);
      // 마지막에 누른 툴바 버튼에 포커스가 남아 있으면, 키를 누른 순간 브라우저가 「키보드 조작」으로
      // 보고 포커스 링을 그린다 — 꺼진 버튼에 테두리만 남아 켜진 것처럼 보인다(2026-10-01).
      const focused = document.activeElement;
      if (focused instanceof HTMLButtonElement || focused instanceof HTMLAnchorElement) focused.blur();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [anyToggleOn, escYields]);

  const canSelect = (roomKey: string, date: string) =>
    date >= today && !isPriceEditBlocked(occupancyAt(roomKey, date));

  /**
   * 선택 모드에서 칸에 붙는 마우스 핸들러.
   *
   * 누른 칸의 현재 상태가 **드래그 방향**을 정한다 — 꺼진 칸에서 시작하면 지나가는 칸을
   * 켜고, 켜진 칸에서 시작하면 끈다. 방향을 매 칸 다시 판단하면 드래그가 깜빡인다.
   */
  /**
   * 포인터 아래의 **(행, 열)**. 칸이 아니라 좌표로 잰다 — 예약 막대·빗금·칸 경계 위에서도
   * 끊기지 않는다. 행은 가장 가까운 `[data-ops-row]`, 열은 그 행의 트랙 폭을 날짜 수로 나눠 잡는다.
   * 행 밖(건물 머리글 등)이면 `null` — 호출부가 직전 값을 유지한다.
   */
  const hitTest = (clientX: number, clientY: number): { row: number; col: number } | null => {
    const element = document.elementFromPoint(clientX, clientY);
    const rowElement = element?.closest<HTMLElement>("[data-ops-row]");
    const roomKey = rowElement?.dataset.opsRow;
    if (!rowElement || !roomKey) return null;
    const row = roomKeys.indexOf(roomKey);
    const tracks = rowElement.querySelector<HTMLElement>(".opsg__tracks");
    if (row < 0 || !tracks || dates.length === 0) return null;
    const rect = tracks.getBoundingClientRect();
    const col = Math.floor(((clientX - rect.left) / rect.width) * dates.length);
    return { col: Math.min(dates.length - 1, Math.max(0, col)), row };
  };

  /** 모서리가 **바뀔 때만** 다시 계산한다 — 칸 안에서 움직이는 동안은 다시 그리지 않는다. */
  const dragTo = (hit: { row: number; col: number }) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.current.row === hit.row && drag.current.col === hit.col) return;
    drag.current = hit;
    const next = applyDragRect({
      adding: drag.adding,
      anchor: drag.anchor,
      base: drag.base,
      canSelect,
      current: hit,
      dates,
      roomKeys,
    });
    setSelectionState((previous) => ({ ...previous, cells: next }));
  };

  // 자동 스크롤 루프는 드래그를 누른 순간의 `hitTest`·`dragTo` 를 그대로 들고 돈다
  // (아래 `runAutoScroll`) — 드래그 도중 격자가 다시 그려져도(흐린 값 반영 등) **ref 로**
  // 불러야 항상 최신 `roomKeys`·`dates`·`canSelect` 를 쓴다(2026-09-30 버그). **효과 안에서만**
  // 갱신한다 — 렌더 중에 ref 를 바꾸면 안 된다(React Compiler 규칙).
  const hitTestRef = useRef(hitTest);
  const dragToRef = useRef(dragTo);
  useEffect(() => {
    hitTestRef.current = hitTest;
    dragToRef.current = dragTo;
  });

  /**
   * 지금 화면에서 **고를 수 있는** 갭 칸.
   *
   * `gapCells` 에는 과거 날짜도 들어 있다(격자에 표시는 한다 — 「어제 이 밤을 버렸다」는
   * 정보다). 하지만 과거의 최소 숙박일을 고쳐 봐야 팔 수 없으므로 자동 선택에서는 뺀다.
   */
  const selectableGapCells = useMemo(() => {
    const cells: OpsSelectionCell[] = [];
    for (const key of gapCells) {
      const separator = key.indexOf("|");
      if (separator < 0) continue;
      const roomKey = key.slice(0, separator);
      const date = key.slice(separator + 1);
      if (!roomKeys.includes(roomKey)) continue;
      if (!canSelect(roomKey, date)) continue;
      cells.push({ date, roomKey });
    }
    return cells;
  }, [gapCells, roomKeys, today, soldCells]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * 갭만 고른다. **축 선택은 비운다** — 축으로 고른 것이 아니므로 축을 다시 누를 때 이 칸들이
   * 걷혀서는 안 된다(축이 기여한 칸만 걷는 규칙이다).
   */
  const selectAllGaps = () => {
    setScope(EMPTY_SCOPE);
    setDateAnchor(null);
    setSelectionState({ cells: selectableGapCells, scopeKeys: new Set() });
  };

  /*
   * 도구줄 「1박 갭 N」을 누르면(`ops-gap-button.tsx`) — 최소 숙박일 모드로 들어가 갭 칸을 전부 고른다.
   * 그러면 오른쪽 패널이 열려 「1박으로」까지 한 번에 간다(2026-09-30 사용자 요청). 첫 갭 칸이 화면에
   * 보이도록 세로로 옮긴다.
   */
  const openGapsRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    openGapsRef.current = () => {
      // 갭이 하나도 없으면 아무것도 안 한다 — 모드를 바꾸고 선택을 비우면 방금 하던
      // 작업(가격 선택 등)이 이유 없이 날아간다(2026-09-30 버그).
      if (selectableGapCells.length === 0) return;
      setMode("minstay");
      selectAllGaps();
      // 화면 맨 위 갭으로 스크롤한다. `selectableGapCells` 는 `Set` 을 돈 순서라 삽입 순서일
      // 뿐이다 — 격자에 보이는 순서(행 순서 → 날짜)로 다시 정렬해야 「맨 위」가 맞는다.
      const first = [...selectableGapCells].sort((a, b) => {
        const byRow = roomKeys.indexOf(a.roomKey) - roomKeys.indexOf(b.roomKey);
        return byRow !== 0 ? byRow : a.date.localeCompare(b.date);
      })[0];
      requestAnimationFrame(() => {
        const row = document.querySelector<HTMLElement>(`[data-ops-row="${CSS.escape(first.roomKey)}"]`);
        if (!row) return;
        const top = row.getBoundingClientRect().top;
        if (top < 120 || top > window.innerHeight - 80) {
          window.scrollBy({ behavior: "smooth", top: top - window.innerHeight / 3 });
        }
      });
    };
  });
  useEffect(() => {
    const onOpen = () => openGapsRef.current();
    window.addEventListener(OPS_GAP_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPS_GAP_OPEN_EVENT, onOpen);
  }, []);

  const gapContext = useMemo(
    () =>
      buildGapContext({
        bars,
        blocks,
        gapCells,
        propertyNames: new Map(rooms.map((room) => [room.key, room.propertyName])),
        roomLabels: new Map(rooms.map((room) => [room.key, room.displayRoomLabel])),
        roomOrder: new Map(rooms.map((room, index) => [room.key, index])),
      }),
    [bars, blocks, gapCells, rooms],
  );

  /** 한 줄(객실) 또는 한 열(날짜)을 통째로. 전부 골라져 있으면 해제된다. */
  const toggleGroup = (cells: OpsSelectionCell[]) => {
    const selectable = cells.filter((cell) => canSelect(cell.roomKey, cell.date));
    if (selectable.length === 0) return;
    setSelectionState((previous) => ({
      ...previous,
      cells: toggleCellGroup(previous.cells, selectable),
    }));
  };

  /**
   * 객실명 클릭 = **객실 축 토글.**
   *
   * 그 행을 통째로 잡는 게 아니라 축에 넣고 뺀다 — 그래야 기간·요일과 곱해진다.
   * 「주말」을 켜 둔 채 201호를 누르면 **201호의 주말만** 잡혀야지, 30일 전부가 잡히면
   * 축을 켜 둔 의미가 없다.
   */
  const toggleRoomRow = (roomKey: string) =>
    applyScope({ ...scope, roomKeys: toggleInList(scope.roomKeys, roomKey) });

  /** 날짜 머리글: 그 열 전체. Shift 를 누르면 직전 열부터 **범위**로 잡는다. */
  const toggleDateColumn = (date: string, withRange: boolean) => {
    const targetDates =
      withRange && dateAnchor
        ? dates.filter(
            (candidate) =>
              candidate >= (dateAnchor < date ? dateAnchor : date) &&
              candidate <= (dateAnchor < date ? date : dateAnchor),
          )
        : [date];
    setDateAnchor(date);
    toggleGroup(
      targetDates.flatMap((targetDate) =>
        roomKeys.map((roomKey) => ({ date: targetDate, roomKey })),
      ),
    );
  };

  /** 행마다 가격 개입 성공 막대 id(`|` 로 이음) — 문자열이라 다른 행이 바뀌어도 그 행의 값은 같다. */
  const winIdsByRoom = useMemo(() => {
    const byRoom = new Map<string, string[]>();
    for (const bar of bars) {
      if (!conversionIds.has(bar.id)) continue;
      const list = byRoom.get(bar.roomKey);
      if (list) list.push(bar.id);
      else byRoom.set(bar.roomKey, [bar.id]);
    }
    return new Map([...byRoom].map(([roomKey, list]) => [roomKey, list.join("|")]));
  }, [bars, conversionIds]);
  /** 행마다 최근 예약 막대 id — 위와 같은 모양. */
  const recentIdsByRoom = useMemo(() => {
    const byRoom = new Map<string, string[]>();
    for (const bar of bars) {
      if (!recentIds.has(bar.id)) continue;
      const list = byRoom.get(bar.roomKey);
      if (list) list.push(bar.id);
      else byRoom.set(bar.roomKey, [bar.id]);
    }
    return new Map([...byRoom].map(([roomKey, list]) => [roomKey, list.join("|")]));
  }, [bars, recentIds]);
  /** 행마다 고른 날짜(`|` 로 이음) — 문자열이라 다른 행이 바뀌어도 그 행의 값은 같다. */
  const selectedDatesByRoom = useMemo(() => {
    const byRoom = new Map<string, string[]>();
    for (const cell of selection) {
      const list = byRoom.get(cell.roomKey);
      if (list) list.push(cell.date);
      else byRoom.set(cell.roomKey, [cell.date]);
    }
    return new Map([...byRoom].map(([roomKey, list]) => [roomKey, list.sort().join("|")]));
  }, [selection]);
  // 행이 부르는 동작 — **참조는 고정**, 내용은 매 렌더 최신으로(행 메모가 깨지지 않게).
  const rowActions = useRef<GridRowActions>({
    cancelDraft: () => undefined,
    commitDraft: () => undefined,
    openBar: () => undefined,
    startDraft: () => undefined,
    toggleRoomRow: () => undefined,
  });
  // **패시브 효과가 아니라 레이아웃 효과다** — 패시브 효과는 브라우저 페인트 뒤에 돈다. 그 틈에
  // 사람이 칸을 누르면(클릭은 동기) 행이 아직 **지난 렌더의** 동작을 들고 있어 엉뚱한 게 실행된다.
  useLayoutEffect(() => {
    rowActions.current = {
      cancelDraft,
      commitDraft: (room, checkIn, checkOut) => {
        setBooking({ checkIn, checkOut, room });
        cancelDraft();
      },
      openBar: (bar, room) => {
        // 막대를 눌렀다 = 상세를 보겠다는 뜻이다. 고르던 기간은 버린다(저쪽과 같다).
        cancelDraft();
        setOpenBar({ bar, propertyName: room.propertyName, roomIds: room.roomIds, roomLabel: room.displayRoomLabel });
      },
      startDraft: (room, date) => setBookingDraft({ checkIn: date, room }),
      toggleRoomRow,
    };
  });

  // **원래 객실이 없을 때만** 통째로 비운다. 「오늘 빈방」 필터가 다 걸러내 `rooms` 가 비어도
  // `serverRooms` 는 있는 경우엔 툴바·열린 패널을 그대로 두고 격자 안에서만 빈 상태를 보인다
  // (2026-09-30 버그 — 필터를 끌 수단인 툴바 자체가 사라졌었다).
  if (serverRooms.length === 0) {
    return (
      <div className="opsg">
        <div className="ops__empty">
          <h2>{copy.emptyTitle}</h2>
          <p>{copy.emptyBody}</p>
        </div>
      </div>
    );
  }

  const weekdays = copy.weekDaysFromSunday;
  /** 지금 막혀 있는 칸(`roomKey|date`). 블록은 양끝을 포함한다. 「차단 해제」가 이 칸만 푼다. */
  const blockedCellKeys = new Set<string>();
  for (const block of blocks) {
    for (const date of dates) {
      if (date >= block.startDate && date <= block.endDate) {
        blockedCellKeys.add(selectionCellKey(block.roomKey, date));
      }
    }
  }

  /*
   * 임박 빈방(2026-10-01 새 기능 — 저쪽에는 없다): **오늘부터 3일 안**의 안 팔린 · 안 막힌 · 요금 칸이 있는 밤.
   * 누르면 가격 모드로 들어가 전부 고르고, 기존 가격 패널에서 사람이 올리든 내리든 정한다(자동 할인 없음).
   * 보는 기간에 오늘이 없으면 셀 수 없다 — 버튼을 숨긴다.
   */
  const urgentCells = todayInView
    ? opsUrgentVacantCells({
        dates,
        hasPrice: (roomKey, date) => rateAt(roomKey, date)?.price != null,
        isBlocked: (roomKey, date) => blockedCellKeys.has(selectionCellKey(roomKey, date)),
        isSold: (roomKey, date) => soldCells.has(selectionCellKey(roomKey, date)),
        roomKeys,
        today,
      })
    : [];
  // 다시 누르면 끈다(2026-10-02 사용자 지시) — 지금 선택이 임박 빈방 그대로면 켜진 모양 · 누르면 해제.
  const urgentPicked = isExactCellSelection(selectedKeys, selection.length, urgentCells);
  const selectUrgent = () => {
    if (urgentPicked) {
      clearSelection();
      return;
    }
    if (urgentCells.length === 0) return;
    setMode("price");
    setScope(EMPTY_SCOPE);
    setDateAnchor(null);
    setSelectionState({ cells: urgentCells, scopeKeys: new Set() });
  };

  // 건물이 바뀌는 자리에 묶음 머리글을 넣는다. 건물 하나만 골랐어도 「객실 N」이 보여야
  // 격자가 전부인지 잘린 것인지 알 수 있다.
  const roomsByProperty: { property: string; rows: OpsGridRowData[] }[] = [];
  for (const room of rooms) {
    const row = rowsByKey.get(room.key);
    if (!row) continue;
    const last = roomsByProperty.at(-1);
    if (last && last.property === room.propertyName) last.rows.push(row);
    else roomsByProperty.push({ property: room.propertyName, rows: [row] });
  }


  /** 화면 위·아래 끝에 가면 저절로 스크롤한다 — 끝까지 끌어서 아래 객실을 잡을 수 있게. */
  const stopAutoScroll = () => {
    if (autoScrollRef.current !== null) cancelAnimationFrame(autoScrollRef.current);
    autoScrollRef.current = null;
  };
  /**
   * 자동 스크롤 한 걸음. **속도가 0 이면 루프를 접는다** — 가장자리를 벗어났는데도 매 프레임
   * 도는 것은 낭비다. 다시 가장자리에 닿으면 `onPointerMove` 가 새로 깨운다.
   */
  const runAutoScroll = () => {
    const drag = dragRef.current;
    if (!drag) {
      stopAutoScroll();
      return;
    }
    const speed = autoScrollSpeed(drag.y);
    if (speed === 0) {
      autoScrollRef.current = null;
      return;
    }
    window.scrollBy(0, speed);
    const hit = hitTestRef.current(drag.x, drag.y);
    if (hit) dragToRef.current(hit);
    autoScrollRef.current = requestAnimationFrame(runAutoScroll);
  };

  const endDrag = (event?: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (event && drag && event.currentTarget.hasPointerCapture(drag.pointerId)) {
      event.currentTarget.releasePointerCapture(drag.pointerId);
    }
    dragRef.current = null;
    stopAutoScroll();
  };

  /** 편집 모드의 격자 포인터 처리. 스크롤 영역 **한 곳**에서 받는다(칸마다 걸지 않는다). */
  const gridPointerHandlers = editMode
    ? {
        onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
          if (event.button !== 0 || event.pointerType === "touch") return;
          // 칸 영역에서 누른 것만 — 객실명(객실 축 토글)·건물 머리글은 제 클릭을 그대로 받는다.
          if (!(event.target as HTMLElement).closest(".opsg__tracks")) return;
          const hit = hitTest(event.clientX, event.clientY);
          if (!hit) return;
          // 글자 선택·포커스 이동을 막아야 끌 때 화면이 파랗게 칠해지지 않는다.
          event.preventDefault();
          const anchorCell = lastAnchorRef.current;
          // 저장해 둔 기준점을 **지금** 배열에서 다시 찾는다 — 못 찾으면 기준점이 없는 것으로 본다.
          const resolvedAnchor = anchorCell
            ? (() => {
                const row = roomKeys.indexOf(anchorCell.roomKey);
                const col = dates.indexOf(anchorCell.date);
                return row === -1 || col === -1 ? null : { col, row };
              })()
            : null;
          const shiftFrom = event.shiftKey ? resolvedAnchor : null;
          const anchor = shiftFrom ?? hit;
          const anchorKey = selectionCellKey(roomKeys[anchor.row], dates[anchor.col]);
          // Shift 범위는 늘 더한다. 그 밖에는 누른 칸이 골라져 있으면 빼는 드래그다.
          const adding = shiftFrom ? true : !selectedKeys.has(anchorKey);
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = {
            adding,
            anchor,
            base: selection,
            // 첫 계산이 반드시 돌도록 불가능한 자리로 둔다.
            current: { col: -1, row: -1 },
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
          };
          if (!shiftFrom) lastAnchorRef.current = { date: dates[hit.col], roomKey: roomKeys[hit.row] };
          dragTo(hit);
          stopAutoScroll();
          autoScrollRef.current = requestAnimationFrame(runAutoScroll);
        },
        onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => {
          const drag = dragRef.current;
          if (!drag || event.pointerId !== drag.pointerId) return;
          drag.x = event.clientX;
          drag.y = event.clientY;
          const hit = hitTest(event.clientX, event.clientY);
          if (hit) dragTo(hit);
          // 가장자리에 새로 닿았는데 루프가 멈춰 있으면 깨운다 — 벗어났을 때 루프를 접어 뒀다.
          if (autoScrollRef.current === null && autoScrollSpeed(drag.y) !== 0) {
            autoScrollRef.current = requestAnimationFrame(runAutoScroll);
          }
        },
        onPointerUp: endDrag,
        onPointerCancel: endDrag,
        onLostPointerCapture: () => {
          dragRef.current = null;
          stopAutoScroll();
        },
      }
    : {};

  /**
   * 선택된 칸을 패널이 쓰는 모양으로 바꾼다.
   *
   * `roomIds` 가 비어 있으면 **Beds24 에 대응하는 유닛이 없는 행**이라 고칠 수 없다.
   * 보내 봐야 서버가 걸러내므로 여기서 뺀다.
   */
  const panelCells: PanelCell[] = selection
    .map((cell) => {
      const room = rooms.find((candidate) => candidate.key === cell.roomKey);
      if (!room || room.roomIds.length === 0) return null;
      const key = selectionCellKey(cell.roomKey, cell.date);
      return {
        date: cell.date,
        isGap: gapCells.has(`${cell.roomKey}|${cell.date}`),
        price: pendingPrices.get(key)?.value ?? rateAt(cell.roomKey, cell.date)?.price ?? null,
        roomIds: room.roomIds,
        roomKey: cell.roomKey,
        roomLabel: room.displayRoomLabel,
      };
    })
    .filter((cell): cell is PanelCell => cell !== null);

  const chip = (on: boolean, extra = "") =>
    `opsg__chip${on ? " on" : ""}${extra ? ` ${extra}` : ""}`;

  /**
   * 객실 칩은 **건물이 하나로 좁혀졌을 때만** 늘어놓는다.
   *
   * 「전체」에서는 객실이 91개다 — 칩으로 깔면 화면을 덮고 격자가 밀려난다. 저쪽 원본도
   * 가격 모드에서는 건물 하나를 강제한다(`portfolioPriceBuilding`). 건물을 안 고른 상태에서는
   * 격자에서 **객실명을 눌러** 행을 고르면 된다 — 그쪽이 더 직접적이기도 하다.
   */
  const allRoomsInScope =
    roomKeys.length > 0 && roomKeys.every((key) => scope.roomKeys.includes(key));

  /**
   * 패널 머리말에 뜨는 **무엇을 고쳤는가**.
   *
   * 「아라키초A · 402 · 501 · 502 / 11/20 → 11/22」. 숫자만 보여주면(「9칸」) 정작 **어느 방
   * 어느 날**인지 모른 채 적용하게 된다 — 가격은 채널로 그대로 나간다.
   *
   * 객실이 많으면 앞의 넷만 적고 나머지는 개수로 줄인다. 날짜는 처음과 끝만 쓴다.
   */
  const scopeSummary = buildOpsScopeSummary({ andMore: copy.andMore, rooms, selection });

  return (
    /*
     * 편집 모드를 뿌리에 표시한다. 형제 선택자로 흉내 내면 마크업 순서가 바뀌는 날 조용히 깨진다.
     *
     * ## 조작 패널은 **격자 오른쪽**이다 (2026-09-24, 시안 3-select)
     *
     * 위에 가로로 두면 그만큼 격자가 아래로 밀리는데, **가격을 고칠 때야말로 객실을 아래까지
     * 길게 봐야 한다.** 옆에 두면 세로를 0 먹고, 대신 숫자·제외 목록·설명을 세로로 쌓을 수
     * 있다. 가격은 틀리면 채널로 그대로 나가므로 크게 보이는 편이 낫다.
     */
    <div className={`opsw${editMode ? " is-edit" : ""}`}>
      {/* ── 선택 모드 ────────────────────────────────────────────────────
          평소에는 읽는 화면이다. 「가격 수정」을 눌러야 칸이 선택 대상이 된다 —
          저쪽도 `priceMode` 토글로 갈라 놓았다. 읽기만 하려다 실수로 바꾸는 일을 막는다. */}
      <div className="opsg__edit">
        {mode === "off" ? (
          <>
            <button
              className="opsg__editbtn"
              onClick={() => setMode("price")}
              type="button"
            >
              {copy.editMode}
            </button>
            <button
              className="opsg__editbtn"
              onClick={() => setMode("minstay")}
              type="button"
            >
              {copy.minStayMode}
            </button>
            <button
              className="opsg__editbtn"
              onClick={() => setMode("block")}
              type="button"
            >
              {copy.blockMode}
            </button>
            {/* 가격 개입 성공 — 가격을 바꾸고 48시간 안에 그 방·그 날짜로 들어온 예약. */}
            <button
              aria-pressed={priceWinsOnly}
              className={`opsg__editbtn opsg__pw${priceWinsOnly ? " on" : ""}`}
              onClick={() => {
                setPriceWinsOnly((value) => !value);
                setRecentOnly(false);
              }}
              type="button"
            >
              {copy.pwToggle}
              {/* 판정은 격자가 그린 뒤 따로 온다 — 그 사이에는 숫자 대신 말줄임. */}
              <span className="opsg__pwn">{priceConversions ? priceConversions.length : "…"}</span>
            </button>
            <button className="opsg__editbtn" onClick={() => setPriceWinsOpen(true)} type="button">
              {copy.pwList}
            </button>
            {/* 최근 예약 — 가격을 건드리지 않았는데 정한 시간대에 들어온 예약(가격 개입 성공의 반대). */}
            <button
              aria-pressed={recentOnly}
              className={`opsg__editbtn opsg__pw opsg__recent${recentOnly ? " on" : ""}`}
              onClick={() => {
                setRecentOnly((value) => !value);
                setPriceWinsOnly(false);
              }}
              type="button"
            >
              {copy.rbToggle}
              <span className="opsg__pwn">{recentBookings ? recentBookings.length : "…"}</span>
            </button>
            {recentOnly && (
              <button className="opsg__editbtn opsg__rbrange" onClick={() => setRecentOpen(true)} type="button">
                {recent.range ? recentRangeLabel(recent.range, copy.rbNow) : "…"}
              </button>
            )}
            {/* 이력 · 전송 로그 — 변경 이력과 「Beds24 에 제대로 나갔나」. 실패·멈춘 작업이 있으면 숫자. */}
            <button
              className={`opsg__editbtn opsg__hist${historyAlerts > 0 ? " alert" : ""}`}
              onClick={() => setHistoryOpen(true)}
              title={historyAlerts > 0 ? copy.hsAlertTitle.replace("{n}", String(historyAlerts)) : undefined}
              type="button"
            >
              {copy.hsButton}
              {historyAlerts > 0 && <span className="opsg__histn">{historyAlerts}</span>}
            </button>
            {/* 매출 요약 — 지금 보고 있는 기간 · 건물의 매출 · 수수료 · 가동률 · ADR · 빈방(가운데 모달). */}
            {days.length > 0 && (
              <button
                aria-haspopup="dialog"
                className="opsg__editbtn opsg__sales"
                onClick={() => setSalesOpen(true)}
                // 누르기 전에 미리 부른다 — 올리기·포커스에서 누르기까지의 틈이 곧 로딩 시간이다.
                onFocus={() => void prefetchSalesSummary(rows, { days: days.length, properties, start: days[0].date })}
                onPointerEnter={() => void prefetchSalesSummary(rows, { days: days.length, properties, start: days[0].date })}
                type="button"
              >
                <ChartColumn aria-hidden="true" className="opsg__btnic" />
                {copy.ssButton}
              </button>
            )}
            {todayInView && urgentCells.length > 0 && (
              <button
                aria-pressed={urgentPicked}
                className={`opsg__editbtn opsg__urgent${urgentPicked ? " on" : ""}`}
                onClick={selectUrgent}
                title={copy.urgentVacantHint}
                type="button"
              >
                <Timer aria-hidden="true" className="opsg__btnic" />
                {copy.urgentVacant}
                <span className="opsg__pwn">{urgentCells.length}</span>
              </button>
            )}
            {todayInView && (
              <button
                aria-pressed={vacantOnly}
                className={`opsg__editbtn opsg__vacant${vacantOnly ? " on" : ""}`}
                onClick={() => setVacantOnly((value) => !value)}
                type="button"
              >
                {copy.vacantToday}
                <span className="opsg__pwn">{vacantKeys.size}</span>
              </button>
            )}
            {hasLargeRooms && (
              <button
                aria-pressed={largeFirst}
                className={`opsg__editbtn opsg__large${largeFirst ? " on" : ""}`}
                onClick={() => setLargeFirst((value) => !value)}
                type="button"
              >
                {copy.largeFirst}
              </button>
            )}
            {/* 체크인만 찍힌 상태. 무엇을 기다리는지 적어 둔다 — 격자만 보면 「왜 칠해지지?」가 된다. */}
            {activeDraft && (
              <span className="opsg__draftnote" role="status">
                {copy.mbPickCheckout
                  .replace("{room}", activeDraft.room.label)
                  .replace("{date}", shortDate(activeDraft.checkIn))}
                <button className="opsg__draftx" onClick={cancelDraft} type="button">
                  {copy.mbCancel}
                </button>
              </span>
            )}
          </>
        ) : (
          <>
            <span
              className={`opsg__modepill${mode === "minstay" ? " ms" : ""}${mode === "block" ? " bk" : ""}`}
            >
              <span className="opsg__modedot" />
              {mode === "minstay"
                ? copy.minStayMode
                : mode === "block"
                  ? copy.blockMode
                  : copy.editMode}
            </span>
            <button
              className="opsg__editbtn"
              onClick={() => {
                clearSelection();
                setMode("off");
              }}
              type="button"
            >
              {copy.editModeExit}
            </button>
          </>
        )}

        {/* 반영 중인 쓰기. 패널을 닫았거나 다른 칸을 고르는 중에도 「아직 가는 중」임을 안다. */}
        {writesInFlight > 0 && (
          <span className="opsg__jobnote" role="status">
            <span className="opsg__jobspin" aria-hidden />
            {copy.msQueued}
          </span>
        )}

        {/* 갭은 눈에 안 띄는 손실이라 **찾아 주는 것만으로는 부족하다** — 한 번에 고를 수
            있어야 손이 간다. 격자에서 6칸을 하나씩 찾아 누르게 하면 그냥 안 한다. */}
        {mode === "minstay" && selectableGapCells.length > 0 && (
          <button className="opsg__gapsel" onClick={selectAllGaps} type="button">
            {copy.gapSelectAll}
            <span className="opsg__gapseln">{selectableGapCells.length}</span>
          </button>
        )}

        {editMode && (
          <>
            {/* 객실 축 — **칩으로 늘어놓지 않는다.**
                객실이 26개인 건물에서 칩을 깔면 가로로 넘쳐 오른쪽 축이 잘린다. 격자 왼쪽에
                이미 객실이 전부 있고 거기가 눈이 가 있는 자리라, **객실명 자체를 축으로 쓴다.**
                여기 남는 것은 「전부 / 해제」 하나뿐이다. */}
            <span className="opsg__axis">{copy.scopeRooms}</span>
            <button
              className={chip(allRoomsInScope)}
              onClick={() =>
                applyScope({ ...scope, roomKeys: allRoomsInScope ? [] : roomKeys })
              }
              type="button"
            >
              {copy.scopeAll}
            </button>
            {scope.roomKeys.length > 0 && !allRoomsInScope && (
              <span className="opsg__acount">{scope.roomKeys.length}</span>
            )}

            <span className="opsg__adiv" />

            {/* 기간 축 — **주 단위다.** 요금은 주말가/평일가로 주 단위로 움직인다. */}
            <span className="opsg__axis">{copy.scopeWeeks}</span>
            <button
              className={chip(scope.weekStarts.length === 0)}
              onClick={() => applyScope({ ...scope, weekStarts: [] })}
              type="button"
            >
              {copy.scopeAll}
            </button>
            {weeks.map((week) => (
              <button
                className={chip(scope.weekStarts.includes(week.start), "mini")}
                key={week.start}
                onClick={() =>
                  applyScope({
                    ...scope,
                    weekStarts: toggleInList(scope.weekStarts, week.start),
                  })
                }
                type="button"
              >
                {`${Number(week.start.slice(5, 7))}/${Number(week.start.slice(8, 10))}`}
                –{`${Number(week.end.slice(5, 7))}/${Number(week.end.slice(8, 10))}`}
              </button>
            ))}

            <span className="opsg__adiv" />

            {/* 요일 축 — **사내 주말은 금·토·일이다.** 토·일이 아니다. */}
            <span className="opsg__axis">{copy.scopeDays}</span>
            <button
              className={chip(scope.weekdays.length === 0)}
              onClick={() => applyScope({ ...scope, weekdays: [] })}
              type="button"
            >
              {copy.scopeAll}
            </button>
            <button
              className={chip(
                scope.weekdays.length === 3 && WEEKEND_WEEKDAYS.every((d) => scope.weekdays.includes(d)),
              )}
              onClick={() =>
                applyScope({ ...scope, weekdays: toggleWeekdayPreset(scope.weekdays, WEEKEND_WEEKDAYS) })
              }
              type="button"
            >
              {copy.scopeWeekend}
            </button>
            <button
              className={chip(
                scope.weekdays.length === 4 && WEEKDAY_WEEKDAYS.every((d) => scope.weekdays.includes(d)),
              )}
              onClick={() =>
                applyScope({ ...scope, weekdays: toggleWeekdayPreset(scope.weekdays, WEEKDAY_WEEKDAYS) })
              }
              type="button"
            >
              {copy.scopeWeekday}
            </button>
            {[1, 2, 3, 4, 5, 6, 0].map((weekday) => (
              <button
                className={chip(scope.weekdays.includes(weekday), "mini")}
                key={`dow-${weekday}`}
                onClick={() =>
                  applyScope({ ...scope, weekdays: toggleInList(scope.weekdays, weekday) })
                }
                type="button"
              >
                {weekdays[weekday]}
              </button>
            ))}

          </>
        )}
      </div>

      {/* 격자와 패널이 나란히 선다. 격자가 남는 폭을 전부 갖고, 패널은 고정 폭이다. */}
      <div className="opsw__body">
      <div className="opsg">
      <div className="opsg__head">
        <div className="opsg__corner">{copy.roomsHeader}</div>
        <div className="opsg__heads">
        <div className="opsg__months">
          {monthSegments(days).map((segment, index) => (
            <div
              className={`opsg__month${index > 0 ? " m1" : ""}`}
              key={segment.key}
              style={{ flexGrow: segment.span }}
            >
              <span>{monthLabelOf(segment.year, segment.month, segment.span >= 4, copy.localeTag)}</span>
            </div>
          ))}
        </div>
        <div className="opsg__days">
        {days.map((day) => (
          <div
            className={[
              "opsg__day",
              day.isWeekend ? "we" : "",
              day.isToday ? "today" : "",
              day.startsMonth ? "m1" : "",
              editMode && day.date >= today ? "pick" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            key={day.date}
            // 열 전체. Shift 를 누르면 직전에 누른 날짜부터 **범위**로 잡는다.
            onClick={
              editMode && day.date >= today
                ? (event) => toggleDateColumn(day.date, event.shiftKey)
                : undefined
            }
          >
            <div className="opsg__dn">{day.day}</div>
            <div className="opsg__dw">{weekdays[day.weekday]}</div>
          </div>
        ))}
        </div>
        </div>
      </div>

      {/* 편집 모드의 드래그는 여기 **한 곳**에서 받는다. 포인터를 붙잡아(capture) 격자 밖에서
          놓아도 끝나고, 밖으로 나갔다 들어와도 끊기지 않는다. */}
      <div
        className="opsg__scroll"
        onPointerOut={onGridPointerOut}
        onPointerOver={onGridPointerOver}
        {...gridPointerHandlers}
      >
        {rooms.length === 0 && (
          <div className="ops__empty">
            <p>{copy.vacantEmpty}</p>
          </div>
        )}
        {roomsByProperty.map((group) => (
          <div key={group.property}>
            <div className="opsg__group">
              {group.property}
              <span className="opsg__gcount">
                · {copy.roomCount.replace("{count}", String(group.rows.length))}
              </span>
            </div>
            {group.rows.map((row) => {
              const room = row.room;
              return (
              <OpsGridRow
                actions={rowActions}
                copy={copy}
                dates={dates}
                dayIndex={dayIndex}
                days={days}
                drafting={activeDraft?.room.key === room.key ? activeDraft : null}
                editMode={editMode}
                key={room.key}
                large={largeActive && isOpsLargeRoom(room.propertyName, room.displayRoomLabel)}
                pendingMinStay={pendingMinStayByRoom.get(room.key) ?? EMPTY_ROW_PENDING}
                pendingPrices={pendingPricesByRoom.get(room.key) ?? EMPTY_ROW_PENDING}
                priceWinsOnly={priceWinsOnly || recentOnly}
                row={row}
                scopeOn={scope.roomKeys.includes(room.key)}
                selectedDates={selectedDatesByRoom.get(room.key) ?? ""}
                showCancelled={showCancelled}
                today={today}
                winIds={
                  priceWinsOnly
                    ? (winIdsByRoom.get(room.key) ?? "")
                    : recentOnly
                      ? (recentIdsByRoom.get(room.key) ?? "")
                      : ""
                }
              />
              );
            })}
          </div>
        ))}
      </div>
      </div>

      {hoverCell &&
        (() => {
          // **전부 지금 값으로 다시 읽는다** — 카드가 뜬 채로 낙관값이 반영되거나 이력이
          // 새로 들어오면(다른 창에서 방금 고침) 스냅샷이 아니라 그 값을 보여줘야 한다.
          const hoverRow = rowsByKey.get(hoverCell.roomKey);
          const hoverRoom = rooms.find((candidate) => candidate.key === hoverCell.roomKey);
          const cellKey = selectionCellKey(hoverCell.roomKey, hoverCell.date);
          // 새로고침으로 그 칸의 「이력 있음」이 사라졌으면 닫는다(예전과 같다).
          const flagged = hoverRow ? dayFlagAt(hoverRow.history, dayIndex.get(hoverCell.date) ?? -1) : false;
          const cached = historyCache.get(cellKey);
          // 받아 보니 이력이 없는 칸(`history: null`)은 띄우지 않는다. 아직 안 왔으면 「불러오는 중」.
          if (!hoverRoom || !flagged || (cached && cached.history === null)) return null;
          const rate = rateAt(hoverCell.roomKey, hoverCell.date);
          return (
            <OpsCellHistoryCard
              anchor={hoverCell.anchor}
              container={hoverCell.container}
              copy={copy}
              currentMinStay={pendingMinStay.get(cellKey)?.value ?? rate?.minStay ?? null}
              currentPrice={pendingPrices.get(cellKey)?.value ?? rate?.price ?? null}
              date={hoverCell.date}
              history={cached?.history ?? null}
              localeTag={copy.localeTag}
              roomTitle={`${hoverRoom.propertyName} ${hoverRoom.displayRoomLabel}`}
            />
          );
        })()}

      {historyOpen && <OpsHistoryPanel copy={copy} onClose={() => setHistoryOpen(false)} />}
      {salesOpen && days.length > 0 && (
        <OpsSalesSummaryModal
          copy={copy}
          days={days.length}
          onClose={() => setSalesOpen(false)}
          properties={properties}
          scope={rows}
          start={days[0].date}
        />
      )}

      {recentOpen && (
        <OpsRecentBookingsPanel
          bookings={recentBookings}
          copy={copy}
          localeTag={copy.localeTag}
          onApplyRange={recent.setRange}
          onClose={() => setRecentOpen(false)}
          onOpenReservation={(booking) => {
            setRecentOpen(false);
            setOpenBar({
              bar: {
                channel: booking.channel,
                checkIn: booking.checkIn,
                checkOut: booking.checkOut,
                guestName: booking.guestName,
                id: booking.reservationId,
                isCancelled: false,
                roomKey: booking.roomKey,
              },
              propertyName: booking.propertyName,
              roomIds: rooms.find((room) => room.key === booking.roomKey)?.roomIds ?? [],
              roomLabel: booking.roomLabel,
            });
          }}
          onResetRange={recent.resetRange}
          propertyName={
            properties.length > 1
              ? properties.join(" · ")
              : new Set(rooms.map((room) => room.propertyName)).size === 1
                ? rooms[0]?.propertyName ?? null
                : null
          }
          range={recent.range}
        />
      )}

      {priceWinsOpen && (
        <OpsPriceWinsPanel
          conversions={priceConversions}
          copy={copy}
          localeTag={copy.localeTag}
          onClose={() => setPriceWinsOpen(false)}
          onOpenReservation={(conversion) => {
            // 목록에서 누르면 그 예약의 상세로 — 창 밖 숙박이라도 상세는 열린다.
            setPriceWinsOpen(false);
            setOpenBar({
              bar: {
                channel: conversion.channel,
                checkIn: conversion.checkIn,
                checkOut: conversion.checkOut,
                guestName: conversion.guestName,
                id: conversion.reservationId,
                isCancelled: false,
                roomKey: conversion.roomKey,
              },
              propertyName: conversion.propertyName,
              roomIds: rooms.find((room) => room.key === conversion.roomKey)?.roomIds ?? [],
              roomLabel: conversion.roomLabel,
            });
          }}
          propertyName={
            // 여러 건물을 골랐으면 그 이름들을 잇는다(탭 순서). 전체면 「전체 건물」.
            properties.length > 1
              ? properties.join(" · ")
              : new Set(rooms.map((room) => room.propertyName)).size === 1
                ? rooms[0]?.propertyName ?? null
                : null
          }
          windowLabel={opsWindowLabel(days)}
        />
      )}

      {openBar && (
        <OpsReservationPanel
          bar={openBar.bar}
          key={openBar.bar.id}
          localeTag={copy.localeTag}
          propertyName={openBar.propertyName}
          roomIds={openBar.roomIds}
          roomKey={openBar.bar.roomKey}
          today={today}
          copy={copy}
          nights={
            stayNights(openBar.bar.checkIn, openBar.bar.checkOut).length
          }
          onClose={() => setOpenBar(null)}
          roomLabel={openBar.roomLabel}
        />
      )}

      {booking && (
        <OpsBookingPanel
          checkIn={booking.checkIn}
          checkOut={booking.checkOut}
          copy={copy}
          localeTag={copy.localeTag}
          onClose={() => setBooking(null)}
          rateAt={(date) => {
            const rate = rateAt(booking.room.key, date);
            return { airbnb: rate?.price ?? null, booking: rate?.bookingPrice ?? null };
          }}
          room={booking.room}
          today={today}
        />
      )}

      {mode === "block" && (
        <OpsBlockPanel
          blockedKeys={blockedCellKeys}
          cells={panelCells.map((cell) => ({
            date: cell.date,
            roomIds: cell.roomIds,
            roomKey: cell.roomKey,
            roomLabel: cell.roomLabel,
          }))}
          copy={copy}
          onClear={clearSelection}
          scopeSummary={scopeSummary}
        />
      )}

      {mode === "minstay" && (
        <OpsMinStayPanel
          cells={panelCells}
          copy={copy}
          gapContext={gapContext}
          onApplied={(sent) => removeSentCells(sent, "minstay")}
          onClear={clearSelection}
          runWrite={runWrite}
          scopeSummary={scopeSummary}
        />
      )}

      {mode === "price" && (
        <OpsPricePanel
          cells={panelCells}
          clearLabel={copy.scopeClear}
          copy={copy}
          onApplied={(sent) => removeSentCells(sent, "price")}
          onClear={clearSelection}
          runWrite={runWrite}
          scopeSummary={scopeSummary}
        />
      )}
      </div>
    </div>
  );
}

/** 보고 있는 창 「9/28–10/27」 — 가격 개입 목록 머리에 쓴다. */
function opsWindowLabel(days: readonly { date: string }[]): string {
  const first = days[0]?.date;
  const last = days.at(-1)?.date;
  if (!first || !last) return "";
  const md = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
  return `${md(first)}–${md(last)}`;
}
