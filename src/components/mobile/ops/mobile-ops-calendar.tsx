"use client";

import { memo, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Timer, X } from "lucide-react";
import { OpsBlockPanel } from "@/components/admin/ops/ops-block-panel";
import { OpsMinStayPanel } from "@/components/admin/ops/ops-minstay-panel";
import { OpsPricePanel, type PanelCell } from "@/components/admin/ops/ops-price-panel";
import { watchOpsWriteJob, type OpsWriteKind, type RunOpsWrite } from "@/components/admin/ops/ops-write-tracker";
import { Beds24LiveDot } from "@/components/shared/beds24-live-dot";
import { BottomSheet } from "@/components/shell/bottom-sheet";
import type { Dictionary } from "@/lib/i18n";
import { assignBarLanes, assignBlockLanes } from "@/lib/ops-bar-lanes";
import type { OpsCalendarDay, OpsCalendarRoom } from "@/lib/ops-calendar";
import { buildRowRateLookup, dayFlagAt, decodeRowRate, rowGapCellKeys, type OpsGridRowData } from "@/lib/ops-calendar-rows";
import {
  applyDragRect,
  removeCells,
  selectionCellKey,
  toggleCellGroup,
  type OpsSelectionCell,
} from "@/lib/ops-calendar-selection";
import { buildGapContext } from "@/lib/ops-gap-context";
import { hasOpsLargeRooms, orderOpsLargeRoomsFirst } from "@/lib/ops-large-rooms";
import { buildOpsScopeSummary } from "@/lib/ops-scope-summary";
import { opsUrgentVacantCells } from "@/lib/ops-urgent-vacant";
import { opsVacantRoomKeys } from "@/lib/ops-vacant-today";
import "./mobile-ops-calendar.css";

/**
 * 모바일 판매 캘린더 격자(2026-10-01, 시안 1a v2 「A 보기 · 편집」).
 *
 * 도메인 계약: `docs/product/33-calendar-write-features.md` → 「모바일 판매 캘린더」
 *
 * 데스크톱 격자(`ops-calendar-grid.tsx`)와 **같은 데이터 · 같은 판정 · 같은 패널**을 쓴다. 다른 것은
 * 입력 방식뿐이다:
 *
 * - **탭 = 한 칸 토글**, **길게 누른 뒤 끌기 = 사각형 선택**(`applyDragRect` — 데스크톱 드래그와 같은 함수).
 *   그냥 끌면 격자가 스크롤된다 — 폰에서는 스크롤이 기본 동작이어야 한다.
 * - 고른 칸이 있으면 아래에 **선택 바**가 뜨고, 가격 · 최소숙박 · 차단을 누르면 데스크톱 패널이 그대로
 *   **하단 시트**(공용 `BottomSheet`) 안에 열린다. 패널의 CSS 변수가 `.adm` · `.ops` 에 걸려 있어 시트
 *   내용을 그 두 클래스로 감싼다.
 */

type Copy = Dictionary["opsAdmin"]["calendar"];

type PropertyPill = { name: string; href: string; toggleHref: string; selected: boolean };

type Nav = {
  allHref: string;
  cancelledHref: string;
  isRolling: boolean;
  monthlyHref: string;
  nextHref: string;
  prevHref: string;
  rangeLabel: string;
  rollingHref: string;
  showCancelled: boolean;
  todayHref: string;
};

type Pending = { token: number; value: number };
type SheetKind = "price" | "minstay" | "block";

/** 칸 폭 · 객실 열 폭 · 트랙. CSS(`mobile-ops-calendar.css`)의 같은 이름 변수와 짝이다. */
const CELL_W = 46;
const TOP_H = 34;
const LANE_H = 22;
/** 길게 누르기 판정. iOS 기본 콜아웃(약 500ms)보다 짧아야 그쪽이 먼저 뜨지 않는다. */
const LONG_PRESS_MS = 380;
/** 이만큼 움직이면 스크롤로 본다 — 길게 누르기를 취소한다. */
const MOVE_SLOP = 8;
/** 끌다가 격자 가장자리에 이만큼 다가가면 그쪽으로 저절로 넘긴다. */
const EDGE = 36;

/** 46px 칸에 맞는 금액 표기. 10만 엔부터는 `123k` — 그대로 쓰면 칸을 넘는다. */
function compactYen(value: number): string {
  if (value >= 100_000) return `${Math.round(value / 1000)}k`;
  return value.toLocaleString("ja-JP");
}

function dropTokens(map: Map<string, Pending>, tokens: ReadonlySet<number>): Map<string, Pending> {
  let changed = false;
  const next = new Map<string, Pending>();
  for (const [key, entry] of map) {
    if (tokens.has(entry.token)) changed = true;
    else next.set(key, entry);
  }
  return changed ? next : map;
}

export function MobileOpsCalendar({
  copy,
  days,
  nav,
  properties,
  rows,
  selectedProperties,
  staleRates,
  syncedLabel,
  today,
}: {
  copy: Copy;
  days: OpsCalendarDay[];
  nav: Nav;
  properties: PropertyPill[];
  rows: OpsGridRowData[];
  selectedProperties: string[];
  staleRates: boolean;
  syncedLabel: string;
  today: string;
}) {
  const router = useRouter();
  const [, startRefresh] = useTransition();
  const dates = useMemo(() => days.map((day) => day.date), [days]);
  const todayInView = dates.includes(today);

  // ── 보기 필터(데스크톱과 같은 판정) ────────────────────────────────────────
  const [vacantOnly, setVacantOnly] = useState(false);
  const [largeFirst, setLargeFirst] = useState(false);
  const serverRooms = useMemo(() => rows.map((row) => row.room), [rows]);
  const allBars = useMemo(() => rows.flatMap((row) => row.bars), [rows]);
  const allBlocks = useMemo(() => rows.flatMap((row) => row.blocks), [rows]);
  const hasLargeRooms = useMemo(() => hasOpsLargeRooms(serverRooms), [serverRooms]);
  const vacantKeys = useMemo(
    () => opsVacantRoomKeys({ bars: allBars, roomKeys: serverRooms.map((room) => room.key), today }),
    [allBars, serverRooms, today],
  );
  const vacantActive = vacantOnly && todayInView;
  const rooms = useMemo(() => {
    const base = vacantActive ? serverRooms.filter((room) => vacantKeys.has(room.key)) : serverRooms;
    return (hasLargeRooms && largeFirst ? orderOpsLargeRoomsFirst(base) : base) as OpsCalendarRoom[];
  }, [hasLargeRooms, largeFirst, serverRooms, vacantActive, vacantKeys]);
  const rowByKey = useMemo(() => new Map(rows.map((row) => [row.room.key, row])), [rows]);
  const roomKeys = useMemo(() => rooms.map((room) => room.key), [rooms]);

  const rateAt = useMemo(() => buildRowRateLookup(rows, dates), [rows, dates]);
  const gapCells = useMemo(() => rowGapCellKeys(rows, dates), [rows, dates]);
  const soldCells = useMemo(() => {
    const sold = new Set<string>();
    for (const bar of allBars) {
      if (bar.isCancelled) continue;
      for (const date of dates) if (date >= bar.checkIn && date < bar.checkOut) sold.add(selectionCellKey(bar.roomKey, date));
    }
    return sold;
  }, [allBars, dates]);
  const blockedCells = useMemo(() => {
    const blocked = new Set<string>();
    for (const block of allBlocks) {
      for (const date of dates) {
        if (date >= block.startDate && date <= block.endDate) blocked.add(selectionCellKey(block.roomKey, date));
      }
    }
    return blocked;
  }, [allBlocks, dates]);

  /** 고를 수 있는 칸 — 오늘 이후이고 팔리지 않은 밤(데스크톱 `canSelect` 와 같다). */
  const canSelect = (roomKey: string, date: string) => date >= today && !soldCells.has(selectionCellKey(roomKey, date));

  // ── 선택 ─────────────────────────────────────────────────────────────────
  const [selection, setSelection] = useState<OpsSelectionCell[]>([]);
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  // 필터가 방을 화면에서 지우면 그 방의 칸도 선택에서 뺀다 — 요약과 실제로 보내는 칸이 어긋나지 않게.
  if (selection.some((cell) => !roomKeys.includes(cell.roomKey))) {
    const visible = new Set(roomKeys);
    setSelection(selection.filter((cell) => visible.has(cell.roomKey)));
  }
  const selectedKeys = useMemo(
    () => new Set(selection.map((cell) => selectionCellKey(cell.roomKey, cell.date))),
    [selection],
  );
  const clearSelection = () => setSelection([]);

  const urgentCells = useMemo(
    () =>
      todayInView
        ? opsUrgentVacantCells({
            dates,
            hasPrice: (roomKey, date) => rateAt(roomKey, date)?.price != null,
            isBlocked: (roomKey, date) => blockedCells.has(selectionCellKey(roomKey, date)),
            isSold: (roomKey, date) => soldCells.has(selectionCellKey(roomKey, date)),
            roomKeys,
            today,
          })
        : [],
    [blockedCells, dates, rateAt, roomKeys, soldCells, today, todayInView],
  );
  const urgentKeys = useMemo(
    () => new Set(urgentCells.map((cell) => selectionCellKey(cell.roomKey, cell.date))),
    [urgentCells],
  );
  const selectableGaps = useMemo(() => {
    const visible = new Set(roomKeys);
    const cells: OpsSelectionCell[] = [];
    for (const key of gapCells) {
      const separator = key.indexOf("|");
      const roomKey = key.slice(0, separator);
      const date = key.slice(separator + 1);
      if (visible.has(roomKey) && date >= today && !soldCells.has(selectionCellKey(roomKey, date))) {
        cells.push({ date, roomKey });
      }
    }
    return cells;
  }, [gapCells, roomKeys, soldCells, today]);

  const openWith = (cells: OpsSelectionCell[], kind: SheetKind) => {
    if (cells.length === 0) return;
    setSelection(cells);
    setSheet(kind);
  };

  // ── 쓰기(흐린 값 → 접수 → 반영 대기 → 다시 읽기) ──────────────────────────
  const [pendingPrices, setPendingPrices] = useState<Map<string, Pending>>(new Map());
  const [pendingMinStay, setPendingMinStay] = useState<Map<string, Pending>>(new Map());
  const [settledTokens, setSettledTokens] = useState<Set<number>>(new Set());
  const writeTokenRef = useRef(0);
  /*
   * 서버 데이터가 새로 오면 **반영이 끝났고 값도 맞아진** 쓰기의 흐린 값을 거둔다. 값이 끝내 안 맞는
   * 예외(반올림 등)는 아래 `runWrite` 의 타이머가 거둔다 — 흐린 채로 남지 않는다.
   */
  const [seenRows, setSeenRows] = useState(rows);
  if (seenRows !== rows) {
    setSeenRows(rows);
    if (settledTokens.size > 0) {
      const ready = new Set<number>();
      for (const [key, entry] of pendingPrices) {
        const separator = key.indexOf("|");
        if (settledTokens.has(entry.token) && rateAt(key.slice(0, separator), key.slice(separator + 1))?.price === entry.value) {
          ready.add(entry.token);
        }
      }
      for (const [key, entry] of pendingMinStay) {
        const separator = key.indexOf("|");
        if (settledTokens.has(entry.token) && rateAt(key.slice(0, separator), key.slice(separator + 1))?.minStay === entry.value) {
          ready.add(entry.token);
        }
      }
      if (ready.size > 0) {
        setPendingPrices(dropTokens(pendingPrices, ready));
        setPendingMinStay(dropTokens(pendingMinStay, ready));
        setSettledTokens(new Set([...settledTokens].filter((token) => !ready.has(token))));
      }
    }
  }

  const runWrite: RunOpsWrite = async (kind: OpsWriteKind, values, submit) => {
    writeTokenRef.current += 1;
    const token = writeTokenRef.current;
    const setPending = kind === "price" ? setPendingPrices : setPendingMinStay;
    const drop = () => setPending((previous) => dropTokens(previous, new Set([token])));
    setPending((previous) => {
      const next = new Map(previous);
      for (const item of values) next.set(item.key, { token, value: item.value });
      return next;
    });
    const result = await submit();
    if (!result.ok) {
      drop();
      return { result, settled: null };
    }
    const settled = watchOpsWriteJob(result.jobId).then((outcome) => {
      if (outcome === "failed") drop();
      else {
        setSettledTokens((previous) => new Set(previous).add(token));
        // 값이 끝내 안 맞아도 흐린 채로 두지 않는다.
        setTimeout(drop, 8000);
      }
      startRefresh(() => router.refresh());
      return outcome;
    });
    return { result, settled };
  };

  const removeSentCells = (sent: OpsSelectionCell[]) => {
    setSelection((previous) => removeCells(previous, sent));
  };

  // ── 패널에 넘길 모양 ───────────────────────────────────────────────────────
  const roomByKey = useMemo(() => new Map(rooms.map((room) => [room.key, room])), [rooms]);
  const panelCells: PanelCell[] = selection
    .map((cell) => {
      const room = roomByKey.get(cell.roomKey);
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
  const scopeSummary = buildOpsScopeSummary({ andMore: copy.andMore, rooms, selection });
  const gapContext = useMemo(
    () =>
      buildGapContext({
        bars: allBars,
        blocks: allBlocks,
        gapCells,
        propertyNames: new Map(rooms.map((room) => [room.key, room.propertyName])),
        roomLabels: new Map(rooms.map((room) => [room.key, room.displayRoomLabel])),
        roomOrder: new Map(rooms.map((room, index) => [room.key, index])),
      }),
    [allBars, allBlocks, gapCells, rooms],
  );

  // ── 길게 누르기 · 끌기 ──────────────────────────────────────────────────────
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  /** 네이티브 리스너가 읽는 최신 값. 렌더 중이 아니라 효과에서만 갱신한다(React Compiler 규칙). */
  const liveRef = useRef({ canSelect, dates, roomKeys, selectedKeys, selection });
  useEffect(() => {
    liveRef.current = { canSelect, dates, roomKeys, selectedKeys, selection };
  });

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    type Drag = {
      anchor: { row: number; col: number };
      base: OpsSelectionCell[];
      adding: boolean;
      x: number;
      y: number;
    };
    let pressTimer: ReturnType<typeof setTimeout> | null = null;
    let press: { x: number; y: number; target: HTMLElement } | null = null;
    let drag: Drag | null = null;
    let suppressClick = false;
    let autoFrame: number | null = null;

    const cellAt = (x: number, y: number) => {
      const element = document.elementFromPoint(x, y) as HTMLElement | null;
      const cell = element?.closest<HTMLElement>("[data-i]");
      const row = cell?.closest<HTMLElement>("[data-r]");
      if (!cell || !row || !scroller.contains(cell)) return null;
      return { col: Number(cell.dataset.i), row: Number(row.dataset.r) };
    };
    const applyAt = (x: number, y: number) => {
      if (!drag) return;
      const current = cellAt(x, y);
      if (!current) return;
      const live = liveRef.current;
      setSelection(
        applyDragRect({
          adding: drag.adding,
          anchor: drag.anchor,
          base: drag.base,
          canSelect: live.canSelect,
          current,
          dates: live.dates,
          roomKeys: live.roomKeys,
        }),
      );
    };
    const stopAuto = () => {
      if (autoFrame !== null) cancelAnimationFrame(autoFrame);
      autoFrame = null;
    };
    const autoScroll = () => {
      autoFrame = null;
      if (!drag) return;
      const box = scroller.getBoundingClientRect();
      let dx = 0;
      let dy = 0;
      if (drag.x < box.left + 56 + EDGE) dx = -8;
      else if (drag.x > box.right - EDGE) dx = 8;
      if (drag.y < box.top + 60 + EDGE) dy = -8;
      else if (drag.y > box.bottom - EDGE) dy = 8;
      if (dx === 0 && dy === 0) return;
      scroller.scrollBy(dx, dy);
      applyAt(drag.x, drag.y);
      autoFrame = requestAnimationFrame(autoScroll);
    };
    const startDrag = (x: number, y: number) => {
      const anchor = cellAt(x, y);
      if (!anchor) return false;
      const live = liveRef.current;
      const roomKey = live.roomKeys[anchor.row];
      const date = live.dates[anchor.col];
      if (!roomKey || !date) return false;
      drag = {
        adding: !live.selectedKeys.has(selectionCellKey(roomKey, date)),
        anchor,
        base: live.selection,
        x,
        y,
      };
      scroller.classList.add("is-dragging");
      applyAt(x, y);
      return true;
    };
    const endDrag = () => {
      if (pressTimer) clearTimeout(pressTimer);
      pressTimer = null;
      press = null;
      if (drag) {
        drag = null;
        suppressClick = true;
        scroller.classList.remove("is-dragging");
      }
      stopAuto();
    };

    const onTouchStart = (event: TouchEvent) => {
      // 격자가 맨 위가 아니면 셸의 당겨서 새로고침을 무장시키지 않는다 — 격자를 위로 올리다가 화면 전체가
      // 새로고침되면 안 된다.
      if (scroller.scrollTop > 0) event.stopPropagation();
      if (event.touches.length !== 1) {
        endDrag();
        return;
      }
      const touch = event.touches[0];
      const target = event.target as HTMLElement;
      if (!target.closest("[data-i]")) return;
      press = { target, x: touch.clientX, y: touch.clientY };
      suppressClick = false;
      pressTimer = setTimeout(() => {
        pressTimer = null;
        if (!press) return;
        if (startDrag(press.x, press.y)) navigator.vibrate?.(8);
      }, LONG_PRESS_MS);
    };
    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (drag) {
        // 끄는 중에는 스크롤도, 셸의 당겨서 새로고침도 막는다.
        event.preventDefault();
        event.stopPropagation();
        drag.x = touch.clientX;
        drag.y = touch.clientY;
        applyAt(touch.clientX, touch.clientY);
        if (autoFrame === null) autoFrame = requestAnimationFrame(autoScroll);
        return;
      }
      if (press && Math.hypot(touch.clientX - press.x, touch.clientY - press.y) > MOVE_SLOP) {
        if (pressTimer) clearTimeout(pressTimer);
        pressTimer = null;
        press = null;
      }
      if (scroller.scrollTop > 0) event.stopPropagation();
    };
    const onTouchEnd = () => endDrag();
    // 마우스(데스크톱에서 열었을 때)는 누르는 즉시 사각형 선택이다 — 길게 누를 필요가 없다.
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      if (!(event.target as HTMLElement).closest("[data-i]")) return;
      event.preventDefault();
      if (startDrag(event.clientX, event.clientY)) {
        const onMove = (move: PointerEvent) => {
          if (!drag) return;
          drag.x = move.clientX;
          drag.y = move.clientY;
          applyAt(move.clientX, move.clientY);
          if (autoFrame === null) autoFrame = requestAnimationFrame(autoScroll);
        };
        const onUp = () => {
          endDrag();
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      }
    };
    // 길게 눌러 끈 뒤 손을 떼면 click 이 한 번 더 온다 — 그걸로 칸이 토글되면 안 된다.
    const onClickCapture = (event: MouseEvent) => {
      if (!suppressClick) return;
      suppressClick = false;
      event.stopPropagation();
      event.preventDefault();
    };
    const onContextMenu = (event: Event) => {
      if ((event.target as HTMLElement).closest("[data-i]")) event.preventDefault();
    };

    scroller.addEventListener("touchstart", onTouchStart, { passive: true });
    scroller.addEventListener("touchmove", onTouchMove, { passive: false });
    scroller.addEventListener("touchend", onTouchEnd);
    scroller.addEventListener("touchcancel", onTouchEnd);
    scroller.addEventListener("pointerdown", onPointerDown);
    scroller.addEventListener("click", onClickCapture, true);
    scroller.addEventListener("contextmenu", onContextMenu);
    return () => {
      endDrag();
      scroller.removeEventListener("touchstart", onTouchStart);
      scroller.removeEventListener("touchmove", onTouchMove);
      scroller.removeEventListener("touchend", onTouchEnd);
      scroller.removeEventListener("touchcancel", onTouchEnd);
      scroller.removeEventListener("pointerdown", onPointerDown);
      scroller.removeEventListener("click", onClickCapture, true);
      scroller.removeEventListener("contextmenu", onContextMenu);
    };
  }, []);

  /** 탭 한 번 = 그 칸 토글(이벤트는 격자 한 곳에서 받는다 — 칸마다 핸들러를 달지 않는다). */
  const onGridClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const cell = target.closest<HTMLElement>("[data-i]");
    const rowElement = target.closest<HTMLElement>("[data-r]");
    if (cell && rowElement) {
      const roomKey = roomKeys[Number(rowElement.dataset.r)];
      const date = dates[Number(cell.dataset.i)];
      if (!roomKey || !date || !canSelect(roomKey, date)) return;
      setSelection((previous) => toggleCellGroup(previous, [{ date, roomKey }]));
      return;
    }
    // 객실명 = 그 줄, 날짜 머리 = 그 열(고를 수 있는 칸만). 전부 골라져 있으면 해제.
    const roomButton = target.closest<HTMLElement>("[data-room]");
    if (roomButton) {
      const roomKey = roomButton.dataset.room ?? "";
      const cells = dates.filter((date) => canSelect(roomKey, date)).map((date) => ({ date, roomKey }));
      if (cells.length > 0) setSelection((previous) => toggleCellGroup(previous, cells));
      return;
    }
    const dayButton = target.closest<HTMLElement>("[data-day]");
    if (dayButton) {
      const date = dayButton.dataset.day ?? "";
      const cells = roomKeys.filter((roomKey) => canSelect(roomKey, date)).map((roomKey) => ({ date, roomKey }));
      if (cells.length > 0) setSelection((previous) => toggleCellGroup(previous, cells));
    }
  };

  // 격자를 내리면 셸 머리도 같이 숨는다(셸의 공용 신호 — 달력 보기와 같다).
  const onGridScroll = (event: React.UIEvent<HTMLDivElement>) => {
    window.dispatchEvent(new CustomEvent("mobile-shell-scroll", { detail: { scrollTop: event.currentTarget.scrollTop } }));
  };

  // ── 행별로 쪼갠 표시 상태(바뀐 행만 다시 그린다) ────────────────────────────
  const flagsFor = (roomKey: string, keys: ReadonlySet<string>) => {
    if (keys.size === 0) return "";
    let flags = "";
    for (const date of dates) flags += keys.has(selectionCellKey(roomKey, date)) ? "1" : "0";
    return flags.includes("1") ? flags : "";
  };
  const pendingByRoom = useMemo(() => {
    const byRoom = new Map<string, { price: Map<string, number>; minStay: Map<string, number> }>();
    const bucket = (key: string) => {
      const roomKey = key.slice(0, key.indexOf("|"));
      let entry = byRoom.get(roomKey);
      if (!entry) {
        entry = { minStay: new Map(), price: new Map() };
        byRoom.set(roomKey, entry);
      }
      return { date: key.slice(key.indexOf("|") + 1), entry };
    };
    for (const [key, item] of pendingPrices) {
      const { date, entry } = bucket(key);
      entry.price.set(date, item.value);
    }
    for (const [key, item] of pendingMinStay) {
      const { date, entry } = bucket(key);
      entry.minStay.set(date, item.value);
    }
    return byRoom;
  }, [pendingMinStay, pendingPrices]);

  const groups: { property: string; rooms: OpsCalendarRoom[] }[] = [];
  for (const room of rooms) {
    const last = groups.at(-1);
    if (last && last.property === room.propertyName) last.rooms.push(room);
    else groups.push({ property: room.propertyName, rooms: [room] });
  }
  const rowIndexByKey = new Map(roomKeys.map((key, index) => [key, index]));
  const allSelected = selectedProperties.length === 0;
  const rowCopy = useMemo(() => ({ blockLabel: copy.blockLabel }), [copy.blockLabel]);

  const selCount = selection.length;
  const selRoomCount = new Set(selection.map((cell) => cell.roomKey)).size;

  return (
    <div className="mops">
      {/* 건물 — 누르면 그 건물만, 동그라미는 함께 보기(데스크톱의 체크 동그라미 · Ctrl+클릭과 같다). */}
      <div className="mops-pills" role="group" aria-label={copy.propertyGroupLabel}>
        <Link className={`mops-pill${allSelected ? " on" : ""}`} href={nav.allHref} scroll={false}>
          {copy.allProperties}
        </Link>
        {properties.map((property) => (
          <span className={`mops-pill${property.selected ? " on" : ""}`} key={property.name}>
            <Link
              aria-label={(property.selected ? copy.propertyRemove : copy.propertyAdd).replace("{name}", property.name)}
              className={property.selected ? "mops-ck" : "mops-ck0"}
              href={property.toggleHref}
              scroll={false}
            />
            <Link href={property.href} scroll={false}>
              {property.name}
            </Link>
          </span>
        ))}
      </div>

      {/* 기간 */}
      <div className="mops-bar">
        <div className="mops-seg">
          <Link className={nav.isRolling ? "on" : ""} href={nav.rollingHref} scroll={false}>
            {copy.viewRolling}
          </Link>
          <Link className={nav.isRolling ? "" : "on"} href={nav.monthlyHref} scroll={false}>
            {copy.viewMonthly}
          </Link>
        </div>
        <Link aria-label={copy.prev} className="mops-nav" href={nav.prevHref} scroll={false}>
          <ChevronLeft aria-hidden="true" />
        </Link>
        <Link className="mops-today" href={nav.todayHref} scroll={false}>
          {copy.today}
        </Link>
        <Link aria-label={copy.next} className="mops-nav" href={nav.nextHref} scroll={false}>
          <ChevronRight aria-hidden="true" />
        </Link>
        <span className="mops-range">{nav.rangeLabel}</span>
        <span className={`mops-sync${staleRates ? " stale" : ""}`} title={copy.syncedHint}>
          {syncedLabel}
          <Beds24LiveDot offLabel={copy.liveOff} onLabel={copy.liveOn} />
        </span>
      </div>

      {/* 빠른 칩 — 데스크톱과 같은 순서: 위 줄의 취소 보기 · 1박 갭 → 격자 도구줄의 임박 빈방 · 오늘 빈방만 · 큰방 위로. */}
      <div className="mops-chips">
        <Link className={`mops-chip${nav.showCancelled ? " on" : ""}`} href={nav.cancelledHref} scroll={false}>
          {nav.showCancelled ? copy.showCancelledOn : copy.showCancelled}
        </Link>
        {selectableGaps.length > 0 && (
          <button className="mops-chip gap" onClick={() => openWith(selectableGaps, "minstay")} title={copy.gapOpenHint} type="button">
            {copy.gapLabel}
            <b>{selectableGaps.length}</b>
          </button>
        )}
        {todayInView && (
          <button
            className="mops-chip urg"
            disabled={urgentCells.length === 0}
            onClick={() => openWith(urgentCells, "price")}
            title={copy.urgentVacantHint}
            type="button"
          >
            <Timer aria-hidden="true" />
            {copy.urgentVacant}
            <b>{urgentCells.length}</b>
          </button>
        )}
        {todayInView && (
          <button
            aria-pressed={vacantOnly}
            className={`mops-chip${vacantOnly ? " on" : ""}`}
            onClick={() => setVacantOnly((value) => !value)}
            type="button"
          >
            {copy.vacantToday}
          </button>
        )}
        {hasLargeRooms && (
          <button
            aria-pressed={largeFirst}
            className={`mops-chip${largeFirst ? " on" : ""}`}
            onClick={() => setLargeFirst((value) => !value)}
            type="button"
          >
            {copy.largeFirst}
          </button>
        )}
      </div>

      <p className="mops-hint">{copy.mHint}</p>

      {/* 격자 — 가로 · 세로 모두 이 상자 안에서 넘긴다(날짜 머리 · 객실 열이 붙어 있게). */}
      <div
        aria-label={copy.mGridLabel}
        className="mops-grid"
        onClick={onGridClick}
        onScroll={onGridScroll}
        ref={scrollerRef}
        role="grid"
        style={{ "--mops-cols": days.length } as React.CSSProperties}
      >
        <div className="mops-head">
          <div className="mops-corner">{copy.roomsHeader}</div>
          {days.map((day) => (
            <button
              className={`mops-d${day.isWeekend ? " we" : ""}${day.isToday ? " today" : ""}${day.startsMonth ? " m1" : ""}${day.date < today ? " past" : ""}`}
              data-day={day.date}
              key={day.date}
              type="button"
            >
              {day.startsMonth && <em>{Number(day.date.slice(5, 7))}/</em>}
              <b>{day.day}</b>
              <span>{copy.weekDaysFromSunday[day.weekday]}</span>
            </button>
          ))}
        </div>
        {rooms.length === 0 && <div className="mops-empty">{vacantActive ? copy.vacantEmpty : copy.emptyBody}</div>}
        {groups.map((group) => (
          <div key={group.property}>
            <div className="mops-group">
              <span className="mops-group__name">{group.property}</span>
              <span>{copy.roomCount.replace("{count}", String(group.rooms.length))}</span>
            </div>
            {group.rooms.map((room) => {
              const row = rowByKey.get(room.key);
              if (!row) return null;
              return (
                <MobileOpsRow
                  copy={rowCopy}
                  days={days}
                  key={room.key}
                  pending={pendingByRoom.get(room.key)}
                  row={row}
                  rowIndex={rowIndexByKey.get(room.key) ?? 0}
                  selFlags={flagsFor(room.key, selectedKeys)}
                  showCancelled={nav.showCancelled}
                  today={today}
                  urgFlags={flagsFor(room.key, urgentKeys)}
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* 선택 바 — 셸의 스크롤 · 당겨서 새로고침과 섞이지 않게 body 로 띄운다. */}
      {selCount > 0 &&
        sheet === null &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="mops-selbar" role="toolbar">
            <div className="mops-selbar__cnt">
              <b>{copy.mSelCount.replace("{n}", String(selCount))}</b>
              <span>
                {copy.mSelSummary
                  .replace("{rooms}", String(selRoomCount))
                  .replace("{dates}", scopeSummary?.dates ?? "")}
              </span>
            </div>
            <button className="mops-selbar__act go" onClick={() => setSheet("price")} type="button">
              {copy.mActPrice}
            </button>
            <button className="mops-selbar__act" onClick={() => setSheet("minstay")} type="button">
              {copy.mActMinStay}
            </button>
            <button className="mops-selbar__act" onClick={() => setSheet("block")} type="button">
              {copy.mActBlock}
            </button>
            <button aria-label={copy.mClearSel} className="mops-selbar__x" onClick={clearSelection} type="button">
              <X aria-hidden="true" />
            </button>
          </div>,
          document.body,
        )}

      {sheet !== null && (
        <BottomSheet
          ariaLabel={sheet === "price" ? copy.panelTitle : sheet === "minstay" ? copy.minStayTitle : copy.bkTitle}
          className="flex max-h-[88dvh] flex-col"
          onClose={() => setSheet(null)}
        >
          <div className="adm ops mops-panel">
            {sheet === "price" && (
              <OpsPricePanel
                cells={panelCells}
                clearLabel={copy.scopeClear}
                copy={copy}
                onApplied={removeSentCells}
                onClear={clearSelection}
                runWrite={runWrite}
                scopeSummary={scopeSummary}
              />
            )}
            {sheet === "minstay" && (
              <OpsMinStayPanel
                cells={panelCells}
                copy={copy}
                gapContext={gapContext}
                onApplied={removeSentCells}
                onClear={clearSelection}
                runWrite={runWrite}
                scopeSummary={scopeSummary}
              />
            )}
            {sheet === "block" && (
              <OpsBlockPanel
                blockedKeys={blockedCells}
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
          </div>
        </BottomSheet>
      )}
    </div>
  );
}

/**
 * 객실 한 줄. **자기 몫의 값만** 받는다 — 선택은 칸마다 한 글자인 문자열이라, 고른 칸이 바뀌어도 그 줄이
 * 아니면 다시 그리지 않는다(끄는 동안 수십 번 바뀐다).
 */
const MobileOpsRow = memo(function MobileOpsRow({
  copy,
  days,
  pending,
  row,
  rowIndex,
  selFlags,
  showCancelled,
  today,
  urgFlags,
}: {
  copy: { blockLabel: string };
  days: OpsCalendarDay[];
  pending: { price: Map<string, number>; minStay: Map<string, number> } | undefined;
  row: OpsGridRowData;
  rowIndex: number;
  selFlags: string;
  showCancelled: boolean;
  today: string;
  urgFlags: string;
}) {
  const first = days[0]?.date ?? "";
  const last = days.at(-1)?.date ?? "";
  const indexOf = (date: string) => days.findIndex((day) => day.date === date);
  // 보기 모드로 거른다 — 「취소 보기」면 취소만, 아니면 살아 있는 예약만(데스크톱과 같다).
  const bars = row.bars.filter((bar) => bar.isCancelled === showCancelled && bar.checkOut > first && bar.checkIn <= last);
  const barLanes = assignBarLanes(bars);
  const blocks = row.blocks.filter((block) => block.endDate >= first && block.startDate <= last);
  const blockLanes = assignBlockLanes(
    bars.map((bar) => ({ checkIn: bar.checkIn, checkOut: bar.checkOut, lane: barLanes.laneById.get(bar.id) ?? 0 })),
    blocks,
  );
  const laneCount = Math.max(1, blockLanes.laneCount, barLanes.laneCountByRoom.get(row.room.key) ?? 0);
  const height = TOP_H + laneCount * LANE_H + 4;

  return (
    <div className="mops-row" data-r={rowIndex} style={{ height }}>
      <button className="mops-room" data-room={row.room.key} type="button">
        {row.room.displayRoomLabel}
      </button>
      <div className="mops-track">
        {days.map((day, index) => {
          const rate = decodeRowRate(row.rates, index);
          const price = pending?.price.get(day.date) ?? rate?.price ?? null;
          const minStay = pending?.minStay.get(day.date) ?? rate?.minStay ?? null;
          const isPendingPrice = pending?.price.has(day.date) ?? false;
          const isPendingMin = pending?.minStay.has(day.date) ?? false;
          const selected = selFlags !== "" && dayFlagAt(selFlags, index);
          const urgent = urgFlags !== "" && dayFlagAt(urgFlags, index);
          const gap = dayFlagAt(row.gap, index);
          const msClass = minStay === 1 ? " ms1" : minStay !== null && minStay >= 3 ? " ms3" : "";
          return (
            <div
              className={`mops-c${day.isWeekend ? " we" : ""}${day.isToday ? " today" : ""}${day.date < today ? " past" : ""}${gap ? " gap" : ""}${urgent ? " urg" : ""}${selected ? " sel" : ""}`}
              data-i={index}
              key={day.date}
            >
              {dayFlagAt(row.history, index) && <i className="mops-hdot" />}
              {price !== null && <span className={`mops-p${isPendingPrice ? " pend" : ""}`}>{compactYen(price)}</span>}
              {minStay !== null && (
                <span className={`mops-m${msClass}${isPendingMin ? " pend" : ""}`}>
                  {/* 숫자만 적는다(데스크톱 격자와 같다) — 「2박」은 46px 칸에서 가격과 겹쳐 읽힌다. */}
                  {minStay}
                  {rate?.minStayByUnit && <sup>•</sup>}
                </span>
              )}
            </div>
          );
        })}
        {bars.map((bar) => {
          const startIndex = bar.checkIn < first ? -1 : indexOf(bar.checkIn);
          const endIndex = bar.checkOut > last ? days.length : indexOf(bar.checkOut);
          const left = startIndex < 0 ? 0 : (startIndex + 0.5) * CELL_W + 1;
          const right = endIndex >= days.length ? days.length * CELL_W : (endIndex + 0.5) * CELL_W - 1;
          const lane = barLanes.laneById.get(bar.id) ?? 0;
          const channel = bar.channel === "airbnb" ? "abnb" : bar.channel === "booking" ? "bkng" : "dir";
          return (
            <span
              className={`mops-bar-r ${channel}${startIndex < 0 ? " open-l" : ""}${bar.isCancelled ? " cxl" : ""}`}
              key={bar.id}
              style={{ left, top: TOP_H + lane * LANE_H, width: Math.max(12, right - left) }}
            >
              {bar.guestName}
            </span>
          );
        })}
        {blocks.map((block) => {
          const startIndex = block.startDate < first ? 0 : indexOf(block.startDate);
          const endIndex = block.endDate > last ? days.length - 1 : indexOf(block.endDate);
          const lane = blockLanes.laneById.get(block.id) ?? 0;
          return (
            <span
              className="mops-blk"
              key={block.id}
              style={{
                left: startIndex * CELL_W + 2,
                top: TOP_H + lane * LANE_H,
                width: (endIndex - startIndex + 1) * CELL_W - 4,
              }}
            >
              {copy.blockLabel}
            </span>
          );
        })}
      </div>
    </div>
  );
});
