"use client";

import { useMemo, useRef, useState } from "react";
import type {
  OpsCalendarBar,
  OpsCalendarBlock,
  OpsCalendarDay,
  OpsCalendarRate,
  OpsCalendarRoom,
} from "@/lib/ops-calendar";
import { OpsPricePanel, type PanelCopy, type PanelCell } from "@/components/admin/ops/ops-price-panel";
import {
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
} & PanelCopy;

/**
 * 격자 칸의 가격 표기 — `42659` → `42.7K`.
 *
 * 칸 폭이 30px 대라 `¥42,659` 는 들어가지 않는다. 천 단위로 줄이되 **소수 한 자리는 남긴다** —
 * `42K` 와 `43K` 로 뭉개면 2,000엔 차이가 사라져 가격표를 읽는 의미가 없어진다.
 */
function formatPrice(value: number): string {
  return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}K`;
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
  rates,
  rooms,
  today,
}: {
  bars: OpsCalendarBar[];
  blocks: OpsCalendarBlock[];
  copy: Copy;
  days: OpsCalendarDay[];
  /** `roomKey|YYYY-MM-DD` — 1박 갭인 칸. */
  gapCells: Set<string>;
  rates: Map<string, OpsCalendarRate>;
  rooms: OpsCalendarRoom[];
  today: string;
}) {
  // 선택 상태는 전부 여기 있다. 서버로 왕복하지 않는다 — 칸 하나 찍을 때마다 격자를 다시
  // 그리면 2,700칸짜리 화면에서 쓸 수 없다.
  const [editMode, setEditMode] = useState(false);
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
  // 드래그: 누른 칸과 「더하는 중인가 빼는 중인가」. 누른 칸의 상태가 방향을 정한다.
  const dragRef = useRef<{ adding: boolean } | null>(null);
  const [dateAnchor, setDateAnchor] = useState<string | null>(null);
  /**
   * 접수했지만 아직 Beds24 에 반영되지 않은 값.
   *
   * 서버 응답을 기다리는 동안 옛 값이 보이면 사람은 「안 됐나?」 하고 다시 누른다.
   * 다음 서버 렌더가 실제 값을 들고 오면 자연히 덮인다.
   */
  const [pendingPrices, setPendingPrices] = useState<Map<string, number>>(new Map());

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

  const canSelect = (roomKey: string, date: string) =>
    date >= today && !isPriceEditBlocked(occupancyAt(roomKey, date));

  /** 칸 하나를 켜거나 끈다. 드래그 중이면 누른 칸이 정한 방향을 따른다. */
  const touchCell = (roomKey: string, date: string, adding: boolean) => {
    if (!canSelect(roomKey, date)) return;
    const key = selectionCellKey(roomKey, date);
    setSelectionState((previous) => {
      const has = previous.cells.some(
        (cell) => selectionCellKey(cell.roomKey, cell.date) === key,
      );
      if (adding === has) return previous;
      return {
        ...previous,
        cells: adding
          ? [...previous.cells, { date, roomKey }]
          : previous.cells.filter((cell) => selectionCellKey(cell.roomKey, cell.date) !== key),
      };
    });
  };

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
  const cellHandlers = (roomKey: string, date: string) => {
    if (!editMode || !canSelect(roomKey, date)) return {};
    return {
      onMouseDown: (event: React.MouseEvent) => {
        event.preventDefault();
        const adding = !selectedKeys.has(selectionCellKey(roomKey, date));
        dragRef.current = { adding };
        touchCell(roomKey, date, adding);
      },
      onMouseEnter: () => {
        if (dragRef.current) touchCell(roomKey, date, dragRef.current.adding);
      },
      onMouseUp: () => {
        dragRef.current = null;
      },
    };
  };

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
        price: pendingPrices.get(key) ?? rates.get(key)?.price ?? null,
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
    const labelByKey = new Map(rooms.map((room) => [room.key, room.displayRoomLabel]));
    const selectedRooms = [...new Set(selection.map((cell) => cell.roomKey))];
    const properties = [
      ...new Set(
        selectedRooms.map((key) => rooms.find((room) => room.key === key)?.propertyName ?? ""),
      ),
    ].filter(Boolean);
    const labels = selectedRooms.map((key) => labelByKey.get(key) ?? key);
    const shown = labels.slice(0, 4).join(" · ");
    const roomText =
      labels.length > 4
        ? `${shown} ${copy.andMore.replace("{count}", String(labels.length - 4))}`
        : shown;
    const selectedDates = [...new Set(selection.map((cell) => cell.date))].sort();
    const short = (date: string) => date.slice(5).replace("-", "/");
    const first = selectedDates[0];
    const last = selectedDates[selectedDates.length - 1];
    return {
      dates: first === last ? short(first) : `${short(first)} → ${short(last)}`,
      rooms: [properties.length === 1 ? properties[0] : "", roomText].filter(Boolean).join(" · "),
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
        <button
          className={`opsg__editbtn${editMode ? " on" : ""}`}
          onClick={() => {
            if (editMode) clearSelection();
            setEditMode(!editMode);
          }}
          type="button"
        >
          {editMode ? copy.editModeExit : copy.editMode}
        </button>

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

      {/* 드래그를 칸 밖에서 놓아도 끝나야 한다. 안 그러면 마우스를 뗀 뒤에도 지나가는
          칸이 계속 선택된다. */}
      <div
        className="opsg__scroll"
        onMouseLeave={() => {
          dragRef.current = null;
        }}
        onMouseUp={() => {
          dragRef.current = null;
        }}
      >
        {roomsByProperty.map((group) => (
          <div key={group.property}>
            <div className="opsg__group">
              {group.property}
              <span className="opsg__gcount">
                · {copy.roomCount.replace("{count}", String(group.rooms.length))}
              </span>
            </div>
            {group.rooms.map((room) => {
              const roomBars = barsByRoom.get(room.key) ?? [];
              const roomBlocks = blocksByRoom.get(room.key) ?? [];
              const occupied = new Set<string>();
              for (const bar of roomBars) {
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

              return (
                <div className="opsg__row" key={room.key}>
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
                        const pendingPrice = pendingPrices.get(cellKey);
                        const price =
                          pendingPrice ?? rates.get(`${room.key}|${day.date}`)?.price ?? null;
                        return (
                          <div
                            className={cellClass(day, room.key)}
                            key={`p-${day.date}`}
                            {...cellHandlers(room.key, day.date)}
                          >
                            <span
                              className={`opsg__price${price === null ? " none" : ""}${pendingPrice === undefined ? "" : " pend"}`}
                            >
                              {price === null ? "–" : formatPrice(price)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {/* 최소 숙박일. 아주 흐리게 — 가격을 읽는 데 방해가 되면 안 된다. */}
                    <div className="opsg__track">
                      {days.map((day) => {
                        const minStay = rates.get(`${room.key}|${day.date}`)?.minStay ?? null;
                        return (
                          <div
                            className={cellClass(day, room.key)}
                            key={`m-${day.date}`}
                            {...cellHandlers(room.key, day.date)}
                          >
                            <span className="opsg__min">{minStay ?? ""}</span>
                          </div>
                        );
                      })}
                    </div>
                    {/* 예약 · BLOCK */}
                    <div className="opsg__track">
                      {days.map((day) => (
                        <div className={cellClass(day)} key={`r-${day.date}`}>
                          {!editMode && !occupied.has(day.date) && day.date >= today && (
                            <span className="opsg__plus">+</span>
                          )}
                        </div>
                      ))}
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
                        return (
                          <div
                            className={`opsg__bar ${bar.channel}${bar.isCancelled ? " cancelled" : ""}`}
                            key={bar.id}
                            style={geometry}
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

      {editMode && (
        <OpsPricePanel
          cells={panelCells}
          clearLabel={copy.scopeClear}
          copy={copy}
          onApplied={(applied) =>
            setPendingPrices((previous) => {
              const next = new Map(previous);
              for (const item of applied) {
                next.set(selectionCellKey(item.roomKey, item.date), item.price);
              }
              return next;
            })
          }
          onClear={clearSelection}
          scopeSummary={scopeSummary}
        />
      )}
      </div>
    </div>
  );
}
