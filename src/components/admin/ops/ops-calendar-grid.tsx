"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  OpsCalendarBar,
  OpsCalendarBlock,
  OpsCalendarDay,
  OpsCalendarRate,
  OpsCalendarRoom,
  OpsPriceConversion,
} from "@/lib/ops-calendar";
import { OpsPriceWinsPanel, type PriceWinsCopy } from "@/components/admin/ops/ops-price-wins-panel";
import { OpsCellHistoryCard, type CellHistoryCardCopy } from "@/components/admin/ops/ops-cell-history-card";
import { OpsHistoryPanel, type HistoryPanelCopy } from "@/components/admin/ops/ops-history-panel";
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
import { assignBarLanes } from "@/lib/ops-bar-lanes";
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
import {
  historyCellKey,
  type CellHistory,
  type HistoryCopy,
} from "@/lib/ops-price-history";
import {
  applyDragRect,
  applyScopeToSelection,
  buildScopeCells,
  buildSelectableWeeks,
  EMPTY_SCOPE,
  isPriceEditBlocked,
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
  emptyBody: string;
  emptyTitle: string;
  monthTag: string;
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
  PriceWinsCopy & { pwToggle: string; pwList: string; largeFirst: string; vacantToday: string };

/**
 * 격자 칸의 가격 표기 — `42659` → `42.7K`.
 *
 * 칸 폭이 30px 대라 `¥42,659` 는 들어가지 않는다. 천 단위로 줄이되 **소수 한 자리는 남긴다** —
 * `42K` 와 `43K` 로 뭉개면 2,000엔 차이가 사라져 가격표를 읽는 의미가 없어진다.
 */
function formatPrice(value: number): string {
  return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}K`;
}

/** 낙관적으로 먼저 그린 값. `token` 이 어느 쓰기에서 왔는지 가른다. */
type PendingValue = { value: number; token: number };

/** 그 쓰기들에서 온 흐린 값을 거둔다. */
function dropTokens(map: Map<string, PendingValue>, tokens: Set<number>): Map<string, PendingValue> {
  const next = new Map<string, PendingValue>();
  for (const [key, entry] of map) if (!tokens.has(entry.token)) next.set(key, entry);
  return next;
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

/** BLOCK 은 **밤의 범위이며 양끝을 포함한다.** 9/23~9/26 이면 네 밤이다. */
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

export function OpsCalendarGrid({
  bars,
  blocks,
  copy,
  days,
  gapCells,
  history,
  historyAlerts,
  priceConversions,
  rates,
  rooms: serverRooms,
  showCancelled,
  today,
}: {
  /** 가격 개입 전환(최근 90일). 토글이 막대를 강조하고, 목록 패널이 보여준다. */
  priceConversions: OpsPriceConversion[];
  bars: OpsCalendarBar[];
  blocks: OpsCalendarBlock[];
  copy: Copy;
  days: OpsCalendarDay[];
  /** `roomKey|YYYY-MM-DD` — 1박 갭인 칸. */
  gapCells: Set<string>;
  /** `행키|YYYY-MM-DD` — 그 칸의 가격·최소숙박·차단 변경 이력(최신순). 행키 = `건물::표시 라벨`. */
  history: Map<string, CellHistory>;
  /** 최근 7일 Beds24 전송 실패 + 멈춘 대기 작업 수 — 「이력」 버튼에 빨간 숫자로. */
  historyAlerts: number;
  rates: Map<string, OpsCalendarRate>;
  rooms: OpsCalendarRoom[];
  /**
   * **「취소만 보기」다.** 켜면 일반 예약이 사라지고 취소된 것만 남는다 — 저쪽과 같다
   * (`isCancelled === showCancelled`). 겹쳐 그리면 못 읽기 때문이다.
   * 점유·갭 판정은 이 값과 **무관하게** 항상 취소를 뺀다.
   */
  showCancelled: boolean;
  today: string;
}) {
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
  /** Shift+클릭의 기준점 — 직전에 누른 칸. */
  const lastAnchorRef = useRef<{ row: number; col: number } | null>(null);
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

  /*
   * 서버 데이터(`rates`)가 새로 오면 **끝난 쓰기의 흐린 값만** 거둔다. 아직 반영 중인 것은
   * 남긴다 — 접수 직후의 재렌더는 반영 전 값을 들고 오므로, 거기서 거두면 옛 값으로 튄다.
   *
   * 효과가 아니라 렌더 중에 비교한다(React 의 「이전 렌더 값 저장」 패턴) — 효과로 하면 옛 값이
   * 한 프레임 보였다가 바뀐다.
   */
  const [seenRates, setSeenRates] = useState(rates);
  if (seenRates !== rates) {
    setSeenRates(rates);
    if (settledTokens.size > 0) {
      setPendingPrices(dropTokens(pendingPrices, settledTokens));
      setPendingMinStay(dropTokens(pendingMinStay, settledTokens));
      setSettledTokens(new Set());
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
  const [historyOpen, setHistoryOpen] = useState(false);
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
  const [hoverCell, setHoverCell] = useState<{
    anchor: DOMRect;
    /** 카드를 붙일 `.ops` — 호버를 시작한 칸에서 찾는다(렌더 중 ref 를 읽지 않는다). */
    container: HTMLElement;
    date: string;
    history: CellHistory;
    room: OpsCalendarRoom;
  } | null>(null);
  const hoverOpenRef = useRef(false);
  useEffect(() => {
    hoverOpenRef.current = hoverCell !== null;
  }, [hoverCell]);
  const HOVER_DELAY_MS = 140;
  const startHover = (
    event: React.PointerEvent<HTMLDivElement>,
    room: OpsCalendarRoom,
    date: string,
    cellHistory: CellHistory,
  ) => {
    if (event.pointerType !== "mouse" || event.buttons !== 0) return;
    const anchor = event.currentTarget.getBoundingClientRect();
    const container = event.currentTarget.closest<HTMLElement>(".ops");
    if (!container) return;
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    const open = () => setHoverCell({ anchor, container, date, history: cellHistory, room });
    if (hoverOpenRef.current) open();
    else hoverTimerRef.current = setTimeout(open, HOVER_DELAY_MS);
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
  const [priceWinsOpen, setPriceWinsOpen] = useState(false);
  const conversionIds = useMemo(
    () => new Set(priceConversions.map((conversion) => conversion.reservationId)),
    [priceConversions],
  );
  const [openBar, setOpenBar] = useState<{
    bar: OpsCalendarBar;
    roomLabel: string;
    propertyName: string;
    roomIds: string[];
  } | null>(null);

  const dates = useMemo(() => days.map((day) => day.date), [days]);
  const roomKeys = useMemo(() => rooms.map((room) => room.key), [rooms]);

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
      setScope(EMPTY_SCOPE);
      setSelectionState({ cells: [], scopeKeys: new Set() });
      setDateAnchor(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editMode, hasSelection]);

  const canSelect = (roomKey: string, date: string) =>
    date >= today && !isPriceEditBlocked(occupancyAt(roomKey, date));

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
  }, [gapCells, roomKeys, today, rates, bars, blocks]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * 갭만 고른다. **축 선택은 비운다** — 축으로 고른 것이 아니므로 축을 다시 누를 때 이 칸들이
   * 걷혀서는 안 된다(축이 기여한 칸만 걷는 규칙이다).
   */
  const selectAllGaps = () => {
    setScope(EMPTY_SCOPE);
    setDateAnchor(null);
    setSelectionState({ cells: selectableGapCells, scopeKeys: new Set() });
  };

  /**
   * 취소 막대는 **같은 밤에 여러 건이 겹친다.** 한 줄에 그리면 서로 덮어 못 읽는다 —
   * 실측(2026-09-28)으로 취소가 걸린 방-밤의 20%가 2건 이상, 최대 5건이다.
   * 그래서 층을 나누고 그만큼 트랙을 키운다(저쪽 `cancelledBarLaneMap` 과 같다).
   */
  const barLanes = useMemo(
    () =>
      showCancelled
        ? assignBarLanes(
            bars
              .filter((bar) => bar.isCancelled)
              .map((bar) => ({
                checkIn: bar.checkIn,
                checkOut: bar.checkOut,
                id: bar.id,
                roomKey: bar.roomKey,
              })),
          )
        : null,
    [bars, showCancelled],
  );

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

  if (rooms.length === 0) {
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
  const barsByRoom = new Map<string, OpsCalendarBar[]>();
  for (const bar of bars) {
    const list = barsByRoom.get(bar.roomKey);
    if (list) list.push(bar);
    else barsByRoom.set(bar.roomKey, [bar]);
  }
  const blocksByRoom = new Map<string, OpsCalendarBlock[]>();
  for (const block of blocks) {
    const list = blocksByRoom.get(block.roomKey);
    if (list) list.push(block);
    else blocksByRoom.set(block.roomKey, [block]);
  }
  /** 지금 막혀 있는 칸(`roomKey|date`). 블록은 양끝을 포함한다. 「차단 해제」가 이 칸만 푼다. */
  const blockedCellKeys = new Set<string>();
  for (const block of blocks) {
    for (const date of dates) {
      if (date >= block.startDate && date <= block.endDate) {
        blockedCellKeys.add(selectionCellKey(block.roomKey, date));
      }
    }
  }

  // 건물이 바뀌는 자리에 묶음 머리글을 넣는다. 건물 하나만 골랐어도 「객실 N」이 보여야
  // 격자가 전부인지 잘린 것인지 알 수 있다.
  const roomsByProperty: { property: string; rooms: OpsCalendarRoom[] }[] = [];
  for (const room of rooms) {
    const last = roomsByProperty.at(-1);
    if (last && last.property === room.propertyName) last.rooms.push(room);
    else roomsByProperty.push({ property: room.propertyName, rooms: [room] });
  }

  const cellClass = (day: OpsCalendarDay, roomKey?: string) =>
    [
      "opsg__cell",
      day.isWeekend ? "we" : "",
      day.date < today ? "past" : "",
      day.startsMonth ? "m1" : "",
      roomKey && gapCells.has(`${roomKey}|${day.date}`) ? "gap" : "",
      roomKey && selectedKeys.has(selectionCellKey(roomKey, day.date)) ? "sel" : "",
      editMode && roomKey && canSelect(roomKey, day.date) ? "pick" : "",
      // 선택 모드에서 **팔린 밤**은 고를 수 없다는 것이 보여야 한다.
      editMode && roomKey && soldCells.has(selectionCellKey(roomKey, day.date)) ? "sold" : "",
    ]
      .filter(Boolean)
      .join(" ");

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

  /** 화면 위·아래 끝에 가면 저절로 스크롤한다 — 끝까지 끌어서 아래 객실을 잡을 수 있게. */
  const stopAutoScroll = () => {
    if (autoScrollRef.current !== null) cancelAnimationFrame(autoScrollRef.current);
    autoScrollRef.current = null;
  };
  const runAutoScroll = () => {
    const drag = dragRef.current;
    if (!drag) return stopAutoScroll();
    const EDGE = 56;
    const speed =
      drag.y < EDGE ? -Math.ceil((EDGE - drag.y) / 4) : drag.y > window.innerHeight - EDGE
        ? Math.ceil((drag.y - (window.innerHeight - EDGE)) / 4)
        : 0;
    if (speed !== 0) {
      window.scrollBy(0, speed);
      const hit = hitTest(drag.x, drag.y);
      if (hit) dragTo(hit);
    }
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
          const shiftFrom = event.shiftKey ? lastAnchorRef.current : null;
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
          if (!shiftFrom) lastAnchorRef.current = hit;
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
        price: pendingPrices.get(key)?.value ?? rates.get(key)?.price ?? null,
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
  const scopeSummary = (() => {
    if (selection.length === 0) return null;
    // **건물별로 묶어 적는다** — 「502 · 107」만으로는 어느 건물인지 모른다(2026-09-28 지적).
    // 격자 순서(건물 순서 포함)를 따른다: 「아라키초A 502 · 오쿠보B 107」.
    const selectedKeys = new Set(selection.map((cell) => cell.roomKey));
    const byProperty = new Map<string, string[]>();
    for (const room of rooms) {
      if (!selectedKeys.has(room.key)) continue;
      const list = byProperty.get(room.propertyName);
      if (list) list.push(room.displayRoomLabel);
      else byProperty.set(room.propertyName, [room.displayRoomLabel]);
    }
    const ROOM_LIMIT = 4;
    let shownCount = 0;
    const parts: string[] = [];
    for (const [property, labels] of byProperty) {
      if (shownCount >= ROOM_LIMIT) break;
      const take = labels.slice(0, ROOM_LIMIT - shownCount);
      shownCount += take.length;
      parts.push(`${property} ${take.join(" · ")}`);
    }
    const totalRooms = selectedKeys.size;
    const roomText =
      totalRooms > shownCount
        ? `${parts.join(" / ")} ${copy.andMore.replace("{count}", String(totalRooms - shownCount))}`
        : parts.join(" / ");
    const selectedDates = [...new Set(selection.map((cell) => cell.date))].sort();
    const short = (date: string) => date.slice(5).replace("-", "/");
    const first = selectedDates[0];
    const last = selectedDates[selectedDates.length - 1];
    return {
      dates: first === last ? short(first) : `${short(first)} → ${short(last)}`,
      rooms: roomText,
    };
  })();

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
              onClick={() => setPriceWinsOnly((value) => !value)}
              type="button"
            >
              {copy.pwToggle}
              <span className="opsg__pwn">{priceConversions.length}</span>
            </button>
            <button className="opsg__editbtn" onClick={() => setPriceWinsOpen(true)} type="button">
              {copy.pwList}
            </button>
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
            {day.startsMonth && (
              <span className="opsg__mtag">
                {copy.monthTag.replace("{month}", String(Number(day.date.slice(5, 7))))}
              </span>
            )}
            <div className="opsg__dn">{day.day}</div>
            <div className="opsg__dw">{weekdays[day.weekday]}</div>
          </div>
        ))}
      </div>

      {/* 편집 모드의 드래그는 여기 **한 곳**에서 받는다. 포인터를 붙잡아(capture) 격자 밖에서
          놓아도 끝나고, 밖으로 나갔다 들어와도 끊기지 않는다. */}
      <div className="opsg__scroll" {...gridPointerHandlers}>
        {roomsByProperty.map((group) => (
          <div key={group.property}>
            <div className="opsg__group">
              {group.property}
              <span className="opsg__gcount">
                · {copy.roomCount.replace("{count}", String(group.rooms.length))}
              </span>
            </div>
            {group.rooms.map((room) => {
              const allRoomBars = barsByRoom.get(room.key) ?? [];
              // **켜면 취소만, 끄면 일반만.** 둘을 같이 그리면 같은 밤에 겹쳐 못 읽는다.
              const roomBars = allRoomBars.filter((bar) => bar.isCancelled === showCancelled);
              const laneCount = barLanes?.laneCountByRoom.get(room.key) ?? 1;
              const roomBlocks = blocksByRoom.get(room.key) ?? [];
              const occupied = new Set<string>();
              // 점유는 **항상** 일반 예약으로만 센다 — 「취소만 보기」를 켜도 팔린 밤은 팔린 밤이다.
              for (const bar of allRoomBars) {
                if (bar.isCancelled) continue;
                for (const day of days) {
                  if (day.date >= bar.checkIn && day.date < bar.checkOut) occupied.add(day.date);
                }
              }
              for (const block of roomBlocks) {
                for (const day of days) {
                  if (day.date >= block.startDate && day.date <= block.endDate) {
                    occupied.add(day.date);
                  }
                }
              }

              const bookingRoom: BookingPanelRoom = {
                key: room.key,
                label: room.displayRoomLabel,
                propertyName: room.propertyName,
                roomIds: room.roomIds,
              };
              const drafting = activeDraft?.room.key === room.key ? activeDraft : null;
              // 빈 칸의 `+`. **「취소만 보기」에서는 숨긴다** — 그 모드에서는 일반 막대가 안 보여
              // 팔린 밤도 빈칸처럼 보이는데, 거기에 `+` 가 뜨면 이미 찬 방에 예약을 넣으려 하게 된다.
              // **팔 수 없는 밤**은 예약도 못 만든다 — 찬 밤(예약·블록)과, 파는 유닛이 없는 밤
              // (요금 칸이 비어 있다 = 활성 유닛 0, `mergeOpsRateUnits`). 서버와 패널 피커가
              // 같은 두 가지를 막는다 — 여기만 느슨하면 격자에서 끈 기간이 패널에서 막힌다.
              const nightTaken = (date: string) =>
                occupied.has(date) || !rates.get(`${room.key}|${date}`);
              const canStart = (date: string) =>
                !editMode && !showCancelled && !nightTaken(date) && date >= today;
              const startDraft = (date: string) => setBookingDraft({ checkIn: date, room: bookingRoom });

              return (
                <div
                  className={`opsg__row${drafting ? " drafting" : ""}${
                    largeActive && isOpsLargeRoom(room.propertyName, room.displayRoomLabel) ? " large" : ""
                  }`}
                  data-ops-row={room.key}
                  key={room.key}
                >
                  <div
                    className={`opsg__label${editMode ? " pick" : ""}${
                      editMode && scope.roomKeys.includes(room.key) ? " on" : ""
                    }`}
                    onClick={editMode ? () => toggleRoomRow(room.key) : undefined}
                  >
                    {/* 선택 모드에서만 나오는 네모. 누를 수 있다는 것과 켜졌다는 것을
                        한 번에 말한다 — 객실명만으로는 눌러도 되는지 알 수 없다. */}
                    {editMode && <span className="opsg__rbox" />}
                    <span className="opsg__rn">{room.displayRoomLabel}</span>
                  </div>
                  <div className="opsg__tracks">
                    {/* 가격. 값이 없으면 대시 — **0원이 아니다.** */}
                    <div className="opsg__track">
                      {days.map((day) => {
                        const cellKey = selectionCellKey(room.key, day.date);
                        const pendingEntry = pendingPrices.get(cellKey);
                        const pendingPrice = pendingEntry?.value;
                        // 반영이 확인된 값은 **바로 진하게** — 데이터 다시 받기를 기다리지 않는다.
                        const pricePending = !!pendingEntry && !settledTokens.has(pendingEntry.token);
                        const price =
                          pendingPrice ?? rates.get(`${room.key}|${day.date}`)?.price ?? null;
                        // 「누가 언제 얼마에서 얼마로」. 값이 이상할 때 제일 먼저 찾는 정보다.
                        const cellHistory = history.get(
                          historyCellKey(room.key, day.date),
                        );
                        return (
                          <div
                            className={cellClass(day, room.key)}
                            key={`p-${day.date}`}
                            onPointerEnter={
                              cellHistory ? (event) => startHover(event, room, day.date, cellHistory) : undefined
                            }
                            onPointerLeave={cellHistory ? endHover : undefined}
                          >
                            <span
                              className={`opsg__price${price === null ? " none" : ""}${pricePending ? " pend" : ""}`}
                            >
                              {price === null ? "–" : formatPrice(price)}
                            </span>
                            {/* 사람이 손댄 칸이라는 표시. 점 하나면 격자를 어지럽히지 않는다. */}
                            {cellHistory && <span className="opsg__hdot" />}
                          </div>
                        );
                      })}
                    </div>
                    {/* 최소 숙박일. **가격보다 얇게** 간다 — 이 줄이 두꺼우면 한 객실이
                        차지하는 세로가 늘어 화면에 담기는 객실 수가 줄고, 정작 중요한 가격이
                        멀어진다. 숫자는 작아도 색으로 구분되므로 읽힌다. */}
                    <div className="opsg__track min">
                      {days.map((day) => {
                        const pendingMin = pendingMinStay.get(selectionCellKey(room.key, day.date));
                        const minStay =
                          pendingMin?.value ?? rates.get(`${room.key}|${day.date}`)?.minStay ?? null;
                        // 갭 칸에서는 이 값이 **원인**이다 — `.opsg__cell.gap .opsg__min` 이
                        // 붉게 세운다. 칸이 이미 `gap` 클래스를 들고 있어 여기서 또 붙이지 않는다.
                        //
                        // **2박이 기본이라 조용히 둔다.** 실측(2026-09-25) 기준 Beds24 의
                        // 12,412칸이 2박이고 1박은 388칸뿐이다. 기본값을 강조하면 격자가
                        // 통째로 시끄러워지고, 정작 찾아야 할 예외가 안 보인다.
                        // **구분은 글자 굵기가 아니라 칸 바탕색으로 한다.** 2,700칸을 굵게
                        // 하면 격자가 통째로 복잡해진다 — 저쪽 캘린더도 옅은 바탕으로 가른다.
                        const minTone =
                          minStay === 1 ? " ms1" : minStay !== null && minStay >= 3 ? " ms3" : "";
                        // 같은 칸의 이력(가격·최소숙박이 한 목록이다) — 가격 줄과 같은 카드를 띄운다.
                        const minHistory = history.get(historyCellKey(room.key, day.date));
                        return (
                          <div
                            className={`${cellClass(day, room.key)}${minTone}`}
                            key={`m-${day.date}`}
                            onPointerEnter={
                              minHistory ? (event) => startHover(event, room, day.date, minHistory) : undefined
                            }
                            onPointerLeave={minHistory ? endHover : undefined}
                          >
                            <span
                              className={`opsg__min${
                                pendingMin && !settledTokens.has(pendingMin.token) ? " pend" : ""
                              }`}
                            >
                              {minStay ?? ""}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {/* 예약 · BLOCK. 「취소만 보기」에서는 층 수만큼 키운다. */}
                    <div
                      className="opsg__track"
                      style={laneCount > 1 ? { height: `calc(var(--ops-track) + ${(laneCount - 1) * 18}px)` } : undefined}
                    >
                      {days.map((day) => (
                        <div className={cellClass(day)} key={`r-${day.date}`}>
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
                          onCancel={cancelDraft}
                          onCommit={(checkOut) => {
                            setBooking({ checkIn: drafting.checkIn, checkOut, room: bookingRoom });
                            cancelDraft();
                          }}
                          onRestart={(date) => {
                            if (canStart(date)) startDraft(date);
                          }}
                        />
                      )}
                      {roomBlocks.map((block) => {
                        const geometry = blockGeometry(days, block.startDate, block.endDate);
                        if (!geometry) return null;
                        return (
                          <div className="opsg__block" key={block.id} style={geometry}>
                            {copy.blockLabel}
                          </div>
                        );
                      })}
                      {days.map((day) =>
                        gapCells.has(`${room.key}|${day.date}`) ? (
                          <div
                            className="opsg__gap"
                            key={`g-${day.date}`}
                            style={{
                              left: `calc(${(days.indexOf(day) / days.length) * 100}% + 1px)`,
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
                              priceWinsOnly && !showCancelled
                                ? conversionIds.has(bar.id)
                                  ? " pw-win"
                                  : " pw-dim"
                                : ""
                            }`}
                            key={bar.id}
                            onClick={
                              // 편집 모드에서는 칸 선택이 먼저다 — 막대를 누르다 상세가 뜨면
                              // 드래그 선택이 끊긴다.
                              editMode
                                ? undefined
                                : () => {
                                    // 막대를 눌렀다 = 상세를 보겠다는 뜻이다. 고르던 기간은 버린다(저쪽과 같다).
                                    cancelDraft();
                                    setOpenBar({
                                      bar,
                                      propertyName: room.propertyName,
                                      roomIds: room.roomIds,
                                      roomLabel: room.displayRoomLabel,
                                    });
                                  }
                            }
                            style={lane > 0 ? { ...geometry, top: `calc(3px + ${lane * 18}px)` } : geometry}
                            title={`${bar.guestName} · ${bar.checkIn} → ${bar.checkOut}`}
                          >
                            {bar.guestName}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      </div>

      {hoverCell && (
        <OpsCellHistoryCard
          anchor={hoverCell.anchor}
          container={hoverCell.container}
          copy={copy}
          currentMinStay={rates.get(`${hoverCell.room.key}|${hoverCell.date}`)?.minStay ?? null}
          currentPrice={rates.get(`${hoverCell.room.key}|${hoverCell.date}`)?.price ?? null}
          date={hoverCell.date}
          history={hoverCell.history}
          localeTag={copy.localeTag}
          roomTitle={`${hoverCell.room.propertyName} ${hoverCell.room.displayRoomLabel}`}
        />
      )}

      {historyOpen && <OpsHistoryPanel copy={copy} onClose={() => setHistoryOpen(false)} />}

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
            new Set(rooms.map((room) => room.propertyName)).size === 1 ? rooms[0]?.propertyName ?? null : null
          }
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
            const rate = rates.get(`${booking.room.key}|${date}`);
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
          onClear={clearSelection}
          runWrite={runWrite}
          scopeSummary={scopeSummary}
        />
      )}
      </div>
    </div>
  );
}
