import { describe, expect, it } from "vitest";
import {
  applyScopeToSelection,
  areAllSelected,
  buildScopeCells,
  buildSelectableWeeks,
  EMPTY_SCOPE,
  isPriceEditBlocked,
  selectionCellKey,
  toggleCellGroup,
  toggleWeekdayPreset,
  WEEKDAY_WEEKDAYS,
  WEEKEND_WEEKDAYS,
  weekdayOf,
  weekStartOf,
  type OpsSelectionCell,
} from "@/lib/ops-calendar-selection";

/**
 * 선택 규칙 고정.
 *
 * 틀리면 **의도하지 않은 칸의 가격이 바뀐다.** 화면에는 「42칸 바꿨다」고 뜨는데 실제로는
 * 다른 칸이 바뀌거나 몇 칸이 조용히 빠진다.
 *
 * 계약: docs/product/33-calendar-write-features.md 「선택과 조작」
 */

// 2026-10-01 은 목요일이다.
const TODAY = "2026-10-01";
const DATES = [
  "2026-09-30", // 수 (과거)
  "2026-10-01", // 목
  "2026-10-02", // 금
  "2026-10-03", // 토
  "2026-10-04", // 일
  "2026-10-05", // 월
  "2026-10-06", // 화
];
const ROOMS = ["아라키초A::201", "아라키초A::202"];

const noOccupancy = () => undefined;

describe("요일·주 계산", () => {
  it("요일을 도쿄 날짜 문자열 그대로 읽는다", () => {
    expect(weekdayOf("2026-10-01")).toBe(4); // 목
    expect(weekdayOf("2026-10-04")).toBe(0); // 일
  });

  it("주는 **월요일 시작**이고 일요일은 앞 주에 붙는다", () => {
    // 사내 주말이 금·토·일이라, 일요일을 다음 주로 밀면 주말이 두 칩으로 쪼개진다.
    expect(weekStartOf("2026-10-02")).toBe("2026-09-28"); // 금
    expect(weekStartOf("2026-10-04")).toBe("2026-09-28"); // 일 → 같은 주
    expect(weekStartOf("2026-10-05")).toBe("2026-10-05"); // 월 → 새 주
  });

  it("주 칩은 미래만, 시작일 순으로 묶는다", () => {
    const weeks = buildSelectableWeeks(DATES, TODAY);
    expect(weeks.map((week) => week.start)).toEqual(["2026-09-28", "2026-10-05"]);
    // 과거(9/30)는 빠진다.
    expect(weeks[0].dates).toEqual(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(weeks[0].end).toBe("2026-10-04");
  });
});

describe("주말 프리셋", () => {
  it("**주말은 금·토·일이다** — 토·일이 아니다", () => {
    // 여기를 토·일로 바꾸면 금요일이 평일가로 팔린다.
    expect(WEEKEND_WEEKDAYS).toEqual([5, 6, 0]);
    expect(WEEKDAY_WEEKDAYS).toEqual([1, 2, 3, 4]);
  });

  it("같은 프리셋을 다시 누르면 해제된다", () => {
    expect(toggleWeekdayPreset([], WEEKEND_WEEKDAYS)).toEqual([5, 6, 0]);
    expect(toggleWeekdayPreset([5, 6, 0], WEEKEND_WEEKDAYS)).toEqual([]);
    // 다른 프리셋으로는 갈아탄다.
    expect(toggleWeekdayPreset([5, 6, 0], WEEKDAY_WEEKDAYS)).toEqual([1, 2, 3, 4]);
  });
});

describe("buildScopeCells", () => {
  it("축이 하나도 없으면 아무것도 안 고른다", () => {
    expect(
      buildScopeCells({
        dates: DATES,
        occupancyAt: noOccupancy,
        roomKeys: ROOMS,
        scope: EMPTY_SCOPE,
        today: TODAY,
      }).cells,
    ).toEqual([]);
  });

  it("**과거 날짜는 절대 안 고른다**", () => {
    // 지난 밤의 가격을 바꿔도 아무 일도 안 일어나는데 「42칸」에는 들어가 사람을 속인다.
    const { cells } = buildScopeCells({
      dates: DATES,
      occupancyAt: noOccupancy,
      roomKeys: ROOMS,
      scope: { ...EMPTY_SCOPE, roomKeys: [ROOMS[0]] },
      today: TODAY,
    });
    expect(cells.some((cell) => cell.date === "2026-09-30")).toBe(false);
    expect(cells).toHaveLength(6);
  });

  it("**빈 축은 전체다** — 요일을 안 고르면 전 요일이다", () => {
    const { cells } = buildScopeCells({
      dates: DATES,
      occupancyAt: noOccupancy,
      roomKeys: ROOMS,
      scope: { ...EMPTY_SCOPE, weekStarts: ["2026-10-05"] },
      today: TODAY,
    });
    // 객실 2개 × 10/5·10/6
    expect(cells).toHaveLength(4);
  });

  it("세 축은 **곱해진다**", () => {
    const { cells } = buildScopeCells({
      dates: DATES,
      occupancyAt: noOccupancy,
      roomKeys: ROOMS,
      scope: {
        roomKeys: [ROOMS[0]],
        weekStarts: ["2026-09-28"],
        weekdays: WEEKEND_WEEKDAYS,
      },
      today: TODAY,
    });
    // 201호 × (9/28 주 ∩ 금토일) = 10/2, 10/3, 10/4
    expect(cells.map((cell) => cell.date)).toEqual(["2026-10-02", "2026-10-03", "2026-10-04"]);
  });

  it("**팔린 밤은 빼고, 몇 개 뺐는지 알려준다**", () => {
    // 조용히 빼면 「42칸 고쳤다」고 믿는데 5칸은 안 바뀐다.
    const { cells, skipped } = buildScopeCells({
      dates: DATES,
      occupancyAt: (roomKey, date) =>
        date === "2026-10-02" ? { hasBlockingReservation: true } : undefined,
      roomKeys: ROOMS,
      scope: { ...EMPTY_SCOPE, weekdays: WEEKEND_WEEKDAYS },
      today: TODAY,
    });
    expect(skipped).toBe(2);
    expect(cells.some((cell) => cell.date === "2026-10-02")).toBe(false);
  });
});

describe("isPriceEditBlocked", () => {
  it("**팔린 밤만 막는다**", () => {
    expect(isPriceEditBlocked({ hasBlockingReservation: true })).toBe(true);
  });

  it("blackout·취소 예약 칸은 **고칠 수 있다**", () => {
    // 차단해 둔 날도 가격은 미리 정해 둘 수 있고, 취소된 예약은 이미 없는 예약이다.
    expect(isPriceEditBlocked({ hasBlockingReservation: false })).toBe(false);
    expect(isPriceEditBlocked(undefined)).toBe(false);
  });
});

describe("applyScopeToSelection", () => {
  const cell = (roomKey: string, date: string): OpsSelectionCell => ({ date, roomKey });

  it("축을 바꾸면 **직전 축 몫만** 갈린다", () => {
    const previous = [cell("A", "2026-10-01"), cell("A", "2026-10-02")];
    const previousScopeKeys = new Set(previous.map((c) => selectionCellKey(c.roomKey, c.date)));
    const { selection } = applyScopeToSelection({
      nextScopeCells: [cell("A", "2026-10-05")],
      previous,
      previousScopeKeys,
    });
    expect(selection).toEqual([cell("A", "2026-10-05")]);
  });

  it("**직접 찍은 칸은 축을 바꿔도 살아남는다**", () => {
    // 통째로 덮어쓰면 하나씩 손본 것이 축을 건드릴 때마다 날아간다.
    const manual = cell("B", "2026-10-09");
    const fromScope = cell("A", "2026-10-01");
    const { selection } = applyScopeToSelection({
      nextScopeCells: [cell("A", "2026-10-05")],
      previous: [fromScope, manual],
      previousScopeKeys: new Set([selectionCellKey("A", "2026-10-01")]),
    });
    expect(selection).toContainEqual(manual);
    expect(selection).not.toContainEqual(fromScope);
  });

  it("축이 그대로 품는 칸은 중복되지 않는다", () => {
    const shared = cell("A", "2026-10-01");
    const { selection } = applyScopeToSelection({
      nextScopeCells: [shared],
      previous: [shared],
      previousScopeKeys: new Set([selectionCellKey("A", "2026-10-01")]),
    });
    expect(selection).toEqual([shared]);
  });

  it("다음에 걷어낼 키를 돌려준다", () => {
    const { scopeKeys } = applyScopeToSelection({
      nextScopeCells: [cell("A", "2026-10-05")],
      previous: [],
      previousScopeKeys: new Set(),
    });
    expect([...scopeKeys]).toEqual([selectionCellKey("A", "2026-10-05")]);
  });
});

describe("toggleCellGroup", () => {
  const group = [
    { date: "2026-10-01", roomKey: "A" },
    { date: "2026-10-02", roomKey: "A" },
  ];

  it("전부 골라져 있으면 해제한다 — 행·열 클릭의 동작", () => {
    expect(toggleCellGroup(group, group)).toEqual([]);
  });

  it("일부만 골라져 있으면 나머지를 더한다", () => {
    expect(toggleCellGroup([group[0]], group)).toHaveLength(2);
  });

  it("빈 묶음은 아무것도 안 바꾼다", () => {
    expect(areAllSelected(group, [])).toBe(false);
    expect(toggleCellGroup(group, [])).toHaveLength(2);
  });
});

/**
 * 축을 껐다 켜는 왕복.
 *
 * 2026-09-24 회귀 — 객실 체크를 풀어도 그 칸이 선택에 남아 있었다. 판정식은 멀쩡했고
 * **부르는 쪽**이 축 키를 `useRef` 에 넣고 state 업데이터 **안에서** 갱신한 것이 원인이다.
 * React 는 업데이터를 두 번 부르므로, 두 번째 호출 때는 ref 가 이미 새 값이라 걷어낼 대상을
 * 못 찾는다.
 *
 * 그래서 여기서는 **같은 입력으로 두 번 불러도 결과가 같은지**를 고정한다 — 업데이터가
 * 순수해야 한다는 요구를 테스트가 대신 말해 준다.
 */
describe("축 왕복 (2026-09-24 회귀)", () => {
  const cell = (roomKey: string, date: string): OpsSelectionCell => ({ date, roomKey });

  it("축을 끄면 그 축이 넣은 칸이 **사라진다**", () => {
    const fromScope = [cell("201", "2026-10-01"), cell("201", "2026-10-02")];
    const scopeKeys = new Set(fromScope.map((c) => selectionCellKey(c.roomKey, c.date)));

    const off = applyScopeToSelection({
      nextScopeCells: [],
      previous: fromScope,
      previousScopeKeys: scopeKeys,
    });
    expect(off.selection).toEqual([]);
    expect([...off.scopeKeys]).toEqual([]);
  });

  it("**같은 입력으로 두 번 불러도 같다** — 업데이터가 순수해야 한다", () => {
    const fromScope = [cell("201", "2026-10-01")];
    const scopeKeys = new Set(fromScope.map((c) => selectionCellKey(c.roomKey, c.date)));
    const args = { nextScopeCells: [], previous: fromScope, previousScopeKeys: scopeKeys };

    expect(applyScopeToSelection(args)).toEqual(applyScopeToSelection(args));
  });

  it("껐다 켜면 다시 들어온다", () => {
    const scoped = [cell("201", "2026-10-01")];
    const keys = new Set(scoped.map((c) => selectionCellKey(c.roomKey, c.date)));
    const off = applyScopeToSelection({ nextScopeCells: [], previous: scoped, previousScopeKeys: keys });
    const on = applyScopeToSelection({
      nextScopeCells: scoped,
      previous: off.selection,
      previousScopeKeys: off.scopeKeys,
    });
    expect(on.selection).toEqual(scoped);
  });

  it("축을 꺼도 **직접 찍은 칸**은 남는다", () => {
    const manual = cell("202", "2026-10-09");
    const scoped = cell("201", "2026-10-01");
    const off = applyScopeToSelection({
      nextScopeCells: [],
      previous: [scoped, manual],
      previousScopeKeys: new Set([selectionCellKey("201", "2026-10-01")]),
    });
    expect(off.selection).toEqual([manual]);
  });
});
