import { describe, expect, it } from "vitest";

import type { TaskRecord } from "@/lib/tasks";
import {
  anchorDateOf,
  backlogCoveredByOccurrenceOn,
  isOpenOccurrenceOn,
  isOverdueOneOff,
  isTodayOneOff,
  isTomorrowOneOff,
  occursOn,
  overdueOccurrenceDatesOf,
  prioRank,
} from "@/lib/task-predicates";

/**
 * 이 술어들은 두 화면(모바일 워크스페이스 / 관리자 콘솔)에 **각자 구현돼 있었고**, 정의가 갈리면서
 * 실제 사고를 냈다(결정 로그 2026-07-30 · 2026-08-25). 한 곳으로 모은 지금, 여기가 그 계약을
 * 지키는 자리다. 화면 컴포넌트 안에 있는 동안에는 테스트를 걸 수가 없었다.
 */

const TODAY = "2026-08-25"; // 화요일

/** 최소 TaskRecord — 술어가 읽는 필드만 채우고 나머지는 형태만 맞춘다. */
function task(over: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: "t1",
    status: "open",
    priority: "normal",
    dueAt: null,
    scheduledDate: null,
    recurrenceRule: null,
    ...over,
  } as TaskRecord;
}

/** 도쿄 자정(= 그 날짜의 all-day 마감)을 UTC ISO 로. */
const dueOn = (ymd: string) => new Date(`${ymd}T00:00:00+09:00`).toISOString();

describe("anchorDateOf — 마감 우선, 없으면 예정일", () => {
  it("마감이 있으면 마감의 도쿄 날짜", () => {
    expect(anchorDateOf(task({ dueAt: dueOn("2026-08-20") }))).toBe("2026-08-20");
  });
  it("마감이 없으면 예정일", () => {
    expect(anchorDateOf(task({ scheduledDate: "2026-08-21" }))).toBe("2026-08-21");
  });
  it("둘 다 있으면 마감이 이긴다", () => {
    expect(
      anchorDateOf(task({ dueAt: dueOn("2026-08-20"), scheduledDate: "2026-08-21" })),
    ).toBe("2026-08-20");
  });
  it("둘 다 없으면 null", () => {
    expect(anchorDateOf(task())).toBeNull();
  });
  it("도쿄 자정 직전 UTC 값도 도쿄 날짜로 읽는다", () => {
    // 2026-08-24T15:00Z = 2026-08-25 00:00 JST. UTC 로 자르면 하루가 밀린다.
    expect(anchorDateOf(task({ dueAt: "2026-08-24T15:00:00.000Z" }))).toBe("2026-08-25");
  });
});

describe("일회성 날짜 버킷", () => {
  it("마감이 지난 일회성은 지연", () => {
    expect(isOverdueOneOff(task({ dueAt: dueOn("2026-08-20") }), TODAY)).toBe(true);
  });
  it("완료·취소된 것은 지연이 아니다", () => {
    expect(
      isOverdueOneOff(task({ dueAt: dueOn("2026-08-20"), status: "completed" }), TODAY),
    ).toBe(false);
    expect(
      isOverdueOneOff(task({ dueAt: dueOn("2026-08-20"), status: "cancelled" }), TODAY),
    ).toBe(false);
  });
  it("반복 작업은 일회성 버킷에 절대 들어가지 않는다", () => {
    // 반복의 앵커는 규칙 시작일이라 과거에 남는다. 마감처럼 다루면 반복이 전부 «지연»으로 보인다.
    const rec = task({ dueAt: dueOn("2026-07-30"), recurrenceRule: "weekdays" });
    expect(isOverdueOneOff(rec, TODAY)).toBe(false);
    expect(isTodayOneOff(rec, TODAY)).toBe(false);
    expect(isTomorrowOneOff(rec, TODAY)).toBe(false);
  });
  it("예정일로만 오늘에 걸린 작업도 오늘", () => {
    expect(isTodayOneOff(task({ scheduledDate: TODAY }), TODAY)).toBe(true);
  });
  it("지연인 것은 오늘 버킷에 중복으로 들어가지 않는다", () => {
    const t = task({ dueAt: dueOn("2026-08-20"), scheduledDate: TODAY });
    expect(isOverdueOneOff(t, TODAY)).toBe(true);
    expect(isTodayOneOff(t, TODAY)).toBe(false);
  });
  it("내일 버킷은 달 경계를 넘어서도 맞다", () => {
    expect(isTomorrowOneOff(task({ dueAt: dueOn("2026-09-01") }), "2026-08-31")).toBe(true);
  });
});

describe("occursOn — 반복은 규칙으로, 비반복은 앵커 하루", () => {
  it("평일 반복은 화요일에 걸리고 일요일에는 안 걸린다", () => {
    const rec = task({ dueAt: dueOn("2026-07-30"), recurrenceRule: "weekdays" });
    expect(occursOn(rec, TODAY)).toBe(true); // 화
    expect(occursOn(rec, "2026-08-30")).toBe(false); // 일
  });
  it("앵커가 없으면 어떤 날짜에도 안 걸린다", () => {
    expect(occursOn(task({ recurrenceRule: "daily" }), TODAY)).toBe(false);
  });
});

describe("isOpenOccurrenceOn — 상태 행이 있으면 해결된 회차", () => {
  const rec = task({ dueAt: dueOn("2026-07-30"), recurrenceRule: "weekdays" });
  const stateOf = (state?: "completed" | "skipped" | "moved") => () => state;

  it("상태가 없으면 열린 회차", () => {
    expect(isOpenOccurrenceOn(rec, TODAY, stateOf())).toBe(true);
  });
  it("완료·건너뜀·이동 셋 다 목록에서 빠진다", () => {
    // 예전에 completed 만 걸러서 건너뛴 회차가 목록에 남았던 적이 있다.
    expect(isOpenOccurrenceOn(rec, TODAY, stateOf("completed"))).toBe(false);
    expect(isOpenOccurrenceOn(rec, TODAY, stateOf("skipped"))).toBe(false);
    expect(isOpenOccurrenceOn(rec, TODAY, stateOf("moved"))).toBe(false);
  });
});

describe("overdueOccurrenceDatesOf — 밀린 회차는 어제까지", () => {
  const rec = task({ dueAt: dueOn("2026-08-20"), recurrenceRule: "daily" });

  it("오늘은 밀린 목록에 포함되지 않는다", () => {
    const dates = overdueOccurrenceDatesOf(rec, TODAY, new Set());
    expect(dates).toContain("2026-08-24");
    expect(dates).not.toContain(TODAY);
  });
  it("이미 해결된 날짜는 빠진다", () => {
    const all = overdueOccurrenceDatesOf(rec, TODAY, new Set());
    const some = overdueOccurrenceDatesOf(rec, TODAY, new Set(["2026-08-21", "2026-08-22"]));
    expect(some.length).toBe(all.length - 2);
  });
  it("비반복이면 빈 배열", () => {
    expect(overdueOccurrenceDatesOf(task({ dueAt: dueOn("2026-08-20") }), TODAY, new Set())).toEqual(
      [],
    );
  });
});

describe("backlogCoveredByOccurrenceOn — 보충 사본을 만들 것인가", () => {
  const rule = "weekdays";
  const anchor = "2026-07-30";
  const cover = (state?: "completed" | "skipped" | "moved") =>
    backlogCoveredByOccurrenceOn({ rule, anchor, date: TODAY, state });

  it("오늘 회차가 열려 있으면 덮는다 — 그 회차가 보충분을 겸한다", () => {
    expect(cover(undefined)).toBe(true);
  });

  it("오늘 회차를 이미 완료했어도 덮는다", () => {
    // 회귀 가드(2026-08-25 사용자 제보): 최초 구현은 여기서 사본을 만들어, 오늘 것을 완료한 뒤
    // 「오늘로 가져오기」를 누르면 같은 제목이 오늘 목록에 또 생겼다. 이 반복 업무들은 누적되지
    // 않으므로(3일치 재고 확인을 세 번 하지 않는다) 오늘 한 번으로 밀린 몫이 덮인다.
    expect(cover("completed")).toBe(true);
  });

  it("이미 다른 곳으로 옮겨진 회차도 덮는다", () => {
    expect(cover("moved")).toBe(true);
  });

  it("건너뛴 회차는 덮지 않는다 — 오늘 할 일이 하나 필요하다", () => {
    expect(cover("skipped")).toBe(false);
  });

  it("오늘이 규칙상 회차가 아니면 덮지 못한다", () => {
    // 주 1회(월요일 앵커) 규칙을 화요일에 물어보면 회차가 아니다 → 보충 사본이 필요하다.
    expect(
      backlogCoveredByOccurrenceOn({
        rule: "weekly",
        anchor: "2026-08-03", // 월요일
        date: TODAY, // 화요일
        state: undefined,
      }),
    ).toBe(false);
  });

  it("반복이 아니거나 앵커가 없으면 덮지 못한다", () => {
    expect(
      backlogCoveredByOccurrenceOn({ rule: null, anchor, date: TODAY, state: undefined }),
    ).toBe(false);
    expect(
      backlogCoveredByOccurrenceOn({ rule, anchor: null, date: TODAY, state: undefined }),
    ).toBe(false);
  });
});

describe("prioRank — 두 화면의 정렬이 갈리지 않아야 한다", () => {
  it("urgent > important > medium > normal", () => {
    expect(prioRank("urgent")).toBeLessThan(prioRank("important"));
    expect(prioRank("important")).toBeLessThan(prioRank("medium"));
    expect(prioRank("medium")).toBeLessThan(prioRank("normal"));
  });
  it("medium 이 표에 있어야 normal 과 동점이 되지 않는다", () => {
    // 한쪽 표에서 medium 이 빠져 폴백(3)으로 떨어지면 normal 과 같은 순위가 된다.
    expect(prioRank("medium")).not.toBe(prioRank("normal"));
  });
  it("모르는 값은 normal 과 같은 최하위", () => {
    expect(prioRank("nope")).toBe(prioRank("normal"));
  });
});
