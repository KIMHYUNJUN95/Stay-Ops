/**
 * 판매 캘린더 **선택** 규칙 — 순수 모듈.
 *
 * 도메인 계약: docs/product/33-calendar-write-features.md 「선택과 조작」
 * 원본: STAY ARI Manager `BuildingCalendar.jsx` — `scopeCells`, `buildSelectableCells`,
 *       `selectableWeeks`, `isCellPriceBlocked`
 *
 * 선택이 틀리면 **의도하지 않은 칸의 가격이 바뀐다.** 화면에서는 「42칸 바꿨다」고 보이는데
 * 실제로는 다른 칸이 바뀌거나 몇 칸이 조용히 빠진다. 그래서 판정을 전부 여기 모은다.
 */

/** 한 칸. `roomKey` 는 캘린더 **행**이다(그 뒤에 Beds24 유닛이 여럿일 수 있다). */
export type OpsSelectionCell = { roomKey: string; date: string };

export function selectionCellKey(roomKey: string, date: string): string {
  return `${roomKey}|${date}`;
}

/**
 * 축(스코프) — 객실 · 주 · 요일.
 *
 * **빈 축은 「전체」다.** 요일을 하나도 안 고르면 전 요일이지, 아무 날도 아닌 게 아니다.
 * 세 축은 서로 **곱해진다** — 「이번 주 × 금토일 × 3층 전부」가 한 번에 나온다.
 */
export type OpsSelectionScope = {
  roomKeys: string[];
  weekStarts: string[];
  /** 0=일 … 6=토. */
  weekdays: number[];
};

export const EMPTY_SCOPE: OpsSelectionScope = { roomKeys: [], weekStarts: [], weekdays: [] };

export function isScopeActive(scope: OpsSelectionScope): boolean {
  return scope.roomKeys.length > 0 || scope.weekStarts.length > 0 || scope.weekdays.length > 0;
}

/**
 * **사내 기준 주말은 금·토·일이다.** 일반적인 토·일이 아니다 — 주말 요금이 금요일부터
 * 붙는다. 여기를 토·일로 바꾸면 금요일이 평일가로 팔린다.
 */
export const WEEKEND_WEEKDAYS = [5, 6, 0];
/** 평일은 월~목. 금요일은 위쪽(주말)이다. */
export const WEEKDAY_WEEKDAYS = [1, 2, 3, 4];

/** 같은 프리셋을 다시 누르면 해제된다 — 저쪽 `setScopeDowPreset` 과 같다. */
export function toggleWeekdayPreset(current: number[], preset: number[]): number[] {
  const same =
    current.length === preset.length && preset.every((day) => current.includes(day));
  return same ? [] : [...preset];
}

export function toggleInList<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

/** 0=일 … 6=토. 도쿄 날짜 문자열을 그대로 쓰므로 표준시 문제가 없다. */
export function weekdayOf(date: string): number {
  return parseDate(date).getUTCDay();
}

/**
 * 그 날짜가 속한 주의 **월요일**.
 *
 * 저쪽과 같이 월요일 시작이다. 일요일(0)은 **앞 주**에 붙는다 — 사내 주말이 금·토·일이라
 * 일요일을 다음 주로 밀면 주말 한 덩어리가 두 칩으로 쪼개진다.
 */
export function weekStartOf(date: string): string {
  const parsed = parseDate(date);
  const offsetToMonday = (parsed.getUTCDay() + 6) % 7;
  return new Date(parsed.getTime() - offsetToMonday * DAY_MS).toISOString().slice(0, 10);
}

export type SelectableWeek = { start: string; end: string; dates: string[] };

/**
 * 지금 보이는 **미래** 날짜를 주 단위로 묶는다.
 *
 * 기간 칩이 임의 기간이 아니라 **주 단위**인 이유 — 요금은 주 단위로 움직인다(주말가/평일가).
 * 「10/3~10/17」 같은 임의 구간을 만들 일이 거의 없다.
 */
export function buildSelectableWeeks(dates: string[], today: string): SelectableWeek[] {
  const byWeek = new Map<string, string[]>();
  for (const date of dates) {
    if (date < today) continue;
    const start = weekStartOf(date);
    const bucket = byWeek.get(start);
    if (bucket) bucket.push(date);
    else byWeek.set(start, [date]);
  }
  return [...byWeek.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([start, weekDates]) => ({
      dates: weekDates,
      end: new Date(parseDate(start).getTime() + 6 * DAY_MS).toISOString().slice(0, 10),
      start,
    }));
}

/**
 * 가격을 고칠 수 없는 칸인가.
 *
 * **팔린 밤만 막는다.** blackout(Beds24 차단)·재고 블록·취소된 예약이 있는 칸은 **고칠 수
 * 있다** — 차단해 둔 날도 가격은 미리 정해 둘 수 있고, 취소된 예약은 이미 없는 예약이다.
 * 저쪽 `isCellPriceBlocked` 가 `hasBlockingReservation` 만 보는 이유다.
 */
export type OpsCellOccupancy = {
  /** 취소·노쇼가 아닌 실제 예약이 그 밤을 차지하고 있다. */
  hasBlockingReservation: boolean;
};

export function isPriceEditBlocked(occupancy: OpsCellOccupancy | undefined): boolean {
  return occupancy?.hasBlockingReservation === true;
}

export type BuildScopeCellsArgs = {
  scope: OpsSelectionScope;
  /** 화면에 보이는 객실 행 순서대로. */
  roomKeys: string[];
  /** 화면에 보이는 날짜 전부(과거 포함). 과거는 여기서 걸러낸다. */
  dates: string[];
  /** 도쿄 기준 오늘. */
  today: string;
  occupancyAt: (roomKey: string, date: string) => OpsCellOccupancy | undefined;
};

export type ScopeCellsResult = {
  cells: OpsSelectionCell[];
  /** 팔려 있어서 빠진 칸 수. **조용히 빼지 않고 몇 개가 빠졌는지 알려준다.** */
  skipped: number;
};

/**
 * 축이 만들어내는 칸 목록.
 *
 * **과거 날짜는 고를 수 없다.** 이미 지난 밤의 가격을 바꿔도 아무 일도 일어나지 않는데,
 * 「42칸 바꿨다」는 숫자에는 들어가 사람을 속인다.
 */
export function buildScopeCells(args: BuildScopeCellsArgs): ScopeCellsResult {
  if (!isScopeActive(args.scope)) return { cells: [], skipped: 0 };

  const weekdaySet = new Set(args.scope.weekdays);
  const weekSet = new Set(args.scope.weekStarts);
  const dates = args.dates.filter((date) => {
    if (date < args.today) return false;
    if (weekdaySet.size > 0 && !weekdaySet.has(weekdayOf(date))) return false;
    if (weekSet.size > 0 && !weekSet.has(weekStartOf(date))) return false;
    return true;
  });

  const roomKeys =
    args.scope.roomKeys.length > 0
      ? args.roomKeys.filter((roomKey) => args.scope.roomKeys.includes(roomKey))
      : args.roomKeys;

  const cells: OpsSelectionCell[] = [];
  let skipped = 0;
  for (const roomKey of roomKeys) {
    for (const date of dates) {
      if (isPriceEditBlocked(args.occupancyAt(roomKey, date))) {
        skipped += 1;
        continue;
      }
      cells.push({ date, roomKey });
    }
  }
  return { cells, skipped };
}

/**
 * 축이 바뀌었을 때 선택을 갱신한다 — **직접 찍은 칸은 살린다.**
 *
 * 통째로 덮어쓰면 칸을 하나씩 손본 것이 축을 건드릴 때마다 날아간다. 그래서 **직전 축이
 * 기여했던 키만** 걷어내고 새 축을 얹는다(저쪽 `scopeCellKeysRef` 와 같다).
 *
 * @returns 새 선택과, 다음 번에 걷어낼 축 키 집합
 */
export function applyScopeToSelection(args: {
  previous: OpsSelectionCell[];
  previousScopeKeys: Set<string>;
  nextScopeCells: OpsSelectionCell[];
}): { selection: OpsSelectionCell[]; scopeKeys: Set<string> } {
  const nextKeys = new Set(
    args.nextScopeCells.map((cell) => selectionCellKey(cell.roomKey, cell.date)),
  );

  const kept = args.previous.filter((cell) => {
    const key = selectionCellKey(cell.roomKey, cell.date);
    // 직전 축이 넣어준 칸만 걷어낸다. 사람이 직접 찍은 칸은 축과 무관하게 남는다.
    return !args.previousScopeKeys.has(key) || nextKeys.has(key);
  });
  const keptKeys = new Set(kept.map((cell) => selectionCellKey(cell.roomKey, cell.date)));
  const added = args.nextScopeCells.filter(
    (cell) => !keptKeys.has(selectionCellKey(cell.roomKey, cell.date)),
  );

  return { scopeKeys: nextKeys, selection: [...kept, ...added] };
}

/** 칸 묶음을 더한다(중복 제거). 실제로 더해진 개수를 돌려준다. */
export function addCells(
  selection: OpsSelectionCell[],
  cells: OpsSelectionCell[],
): { selection: OpsSelectionCell[]; added: number } {
  const existing = new Set(selection.map((cell) => selectionCellKey(cell.roomKey, cell.date)));
  const fresh = cells.filter(
    (cell) => !existing.has(selectionCellKey(cell.roomKey, cell.date)),
  );
  return { added: fresh.length, selection: fresh.length > 0 ? [...selection, ...fresh] : selection };
}

export function removeCells(
  selection: OpsSelectionCell[],
  cells: OpsSelectionCell[],
): OpsSelectionCell[] {
  const removing = new Set(cells.map((cell) => selectionCellKey(cell.roomKey, cell.date)));
  return selection.filter((cell) => !removing.has(selectionCellKey(cell.roomKey, cell.date)));
}

export function areAllSelected(
  selection: OpsSelectionCell[],
  cells: OpsSelectionCell[],
): boolean {
  if (cells.length === 0) return false;
  const existing = new Set(selection.map((cell) => selectionCellKey(cell.roomKey, cell.date)));
  return cells.every((cell) => existing.has(selectionCellKey(cell.roomKey, cell.date)));
}

/** 전부 골라져 있으면 해제, 아니면 더한다 — 행·열 클릭의 동작이다. */
export function toggleCellGroup(
  selection: OpsSelectionCell[],
  cells: OpsSelectionCell[],
): OpsSelectionCell[] {
  return areAllSelected(selection, cells)
    ? removeCells(selection, cells)
    : addCells(selection, cells).selection;
}
