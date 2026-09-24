import { describe, expect, it } from "vitest";
import {
  buildCalendarSegments,
  consolidateCalendarRanges,
  validateCalendarDateValues,
  type CalendarDateValues,
} from "@/lib/beds24/calendar-write-payload";

/**
 * Beds24 로 나갈 값 만들기.
 *
 * **이 모듈이 틀리면 실제 판매가가 지워진다.** 저쪽이 검증을 따로 둔 이유가 그것이다 —
 * 숫자가 아닌 입력이 `NaN` → `null` 로 직렬화되고, Beds24 는 `price1: null` 을
 * 「가격 삭제」로 처리한다.
 *
 * 계약: docs/product/33-calendar-write-features.md
 */

describe("validateCalendarDateValues", () => {
  it("정상 입력은 통과", () => {
    expect(
      validateCalendarDateValues({ "2026-10-01": { p1: 42000, m: 2, na: 1 } }),
    ).toBeNull();
  });

  it("숫자가 아닌 가격은 막는다 — 이게 통과하면 가격이 지워진다", () => {
    const bad = { "2026-10-01": { p1: "42,000" } } as unknown as Record<string, CalendarDateValues>;
    expect(validateCalendarDateValues(bad)).toContain("p1");
    const empty = { "2026-10-01": { p1: "" } } as unknown as Record<string, CalendarDateValues>;
    expect(validateCalendarDateValues(empty)).toContain("p1");
    const nan = { "2026-10-01": { p1: Number.NaN } };
    expect(validateCalendarDateValues(nan)).toContain("p1");
  });

  it("음수 가격은 막는다", () => {
    expect(validateCalendarDateValues({ "2026-10-01": { p1: -1 } })).toContain("p1");
  });

  it("`REMOVE` 는 **의도한 삭제**라 통과시킨다", () => {
    expect(validateCalendarDateValues({ "2026-10-01": { p1: "REMOVE" } })).toBeNull();
  });

  it("최소숙박 0 은 막는다 — Beds24 에서 「비활성」과 구별이 안 된다", () => {
    expect(validateCalendarDateValues({ "2026-10-01": { m: 0 } })).toContain("최소숙박");
    expect(validateCalendarDateValues({ "2026-10-01": { m: 1 } })).toBeNull();
  });

  it("정수여야 하는 칸에 소수가 오면 막는다", () => {
    expect(validateCalendarDateValues({ "2026-10-01": { m: 2.5 } })).toContain("m");
  });

  it("날짜 형식이 아니면 막는다", () => {
    expect(validateCalendarDateValues({ "20261001": { p1: 1000 } })).toContain("날짜");
  });

  it("값을 안 넣은 항목은 검증 대상이 아니다", () => {
    // 넣지 않은 항목은 Beds24 가 기존 값을 유지한다. 그게 정상 경로다.
    expect(validateCalendarDateValues({ "2026-10-01": {} })).toBeNull();
  });
});

describe("consolidateCalendarRanges", () => {
  it("값이 같고 날짜가 붙어 있으면 합친다", () => {
    expect(
      consolidateCalendarRanges([
        { from: "2026-10-01", to: "2026-10-01", price1: 79000 },
        { from: "2026-10-02", to: "2026-10-02", price1: 79000 },
        { from: "2026-10-03", to: "2026-10-03", price1: 79000 },
      ]),
    ).toEqual([{ from: "2026-10-01", to: "2026-10-03", price1: 79000 }]);
  });

  it("값이 다르면 안 합친다", () => {
    const result = consolidateCalendarRanges([
      { from: "2026-10-01", to: "2026-10-01", price1: 79000 },
      { from: "2026-10-02", to: "2026-10-02", price1: 89000 },
    ]);
    expect(result).toHaveLength(2);
  });

  it("날짜가 떨어져 있으면 안 합친다", () => {
    const result = consolidateCalendarRanges([
      { from: "2026-10-01", to: "2026-10-01", price1: 79000 },
      { from: "2026-10-03", to: "2026-10-03", price1: 79000 },
    ]);
    expect(result).toHaveLength(2);
  });

  it("달을 넘어가도 이어 붙인다", () => {
    // 10/31 다음이 11/1 인 것을 놓치면 월말마다 구간이 쪼개진다.
    expect(
      consolidateCalendarRanges([
        { from: "2026-10-31", to: "2026-10-31", minStay: 2 },
        { from: "2026-11-01", to: "2026-11-01", minStay: 2 },
      ]),
    ).toEqual([{ from: "2026-10-31", to: "2026-11-01", minStay: 2 }]);
  });

  it("해를 넘어가도 이어 붙인다", () => {
    expect(
      consolidateCalendarRanges([
        { from: "2026-12-31", to: "2026-12-31", minStay: 2 },
        { from: "2027-01-01", to: "2027-01-01", minStay: 2 },
      ]),
    ).toEqual([{ from: "2026-12-31", to: "2027-01-01", minStay: 2 }]);
  });

  it("순서가 섞여 들어와도 정렬해 합친다", () => {
    expect(
      consolidateCalendarRanges([
        { from: "2026-10-03", to: "2026-10-03", minStay: 1 },
        { from: "2026-10-01", to: "2026-10-01", minStay: 1 },
        { from: "2026-10-02", to: "2026-10-02", minStay: 1 },
      ]),
    ).toEqual([{ from: "2026-10-01", to: "2026-10-03", minStay: 1 }]);
  });

  it("항목 구성이 다르면 안 합친다", () => {
    // 한쪽에만 minStay 가 있으면 다른 값이다 — 합치면 없던 값이 생긴다.
    const result = consolidateCalendarRanges([
      { from: "2026-10-01", to: "2026-10-01", price1: 79000 },
      { from: "2026-10-02", to: "2026-10-02", price1: 79000, minStay: 2 },
    ]);
    expect(result).toHaveLength(2);
  });
});

describe("buildCalendarSegments", () => {
  it("넣지 않은 항목은 payload 에 **키를 만들지 않는다**", () => {
    const [segment] = buildCalendarSegments({ "2026-10-01": { p1: 42000 } });
    expect(segment).toEqual({ from: "2026-10-01", to: "2026-10-01", price1: 42000 });
    expect("price2" in segment).toBe(false);
    expect("minStay" in segment).toBe(false);
  });

  it("`REMOVE` 는 `null` 로 나간다 — Beds24 의 삭제 신호", () => {
    const [segment] = buildCalendarSegments({ "2026-10-01": { p1: "REMOVE" } });
    expect(segment.price1).toBeNull();
  });

  it("빈 override 는 null — 해제 신호", () => {
    const [segment] = buildCalendarSegments({ "2026-10-01": { ov: "" } });
    expect(segment.override).toBeNull();
  });

  it("만들면서 구간을 합친다", () => {
    // 「1박으로」가 한 객실 30일을 바꿔도 구간 하나로 나간다.
    const dates: Record<string, CalendarDateValues> = {};
    for (let day = 1; day <= 30; day += 1) {
      dates[`2026-11-${String(day).padStart(2, "0")}`] = { m: 1 };
    }
    expect(buildCalendarSegments(dates)).toEqual([
      { from: "2026-11-01", to: "2026-11-30", minStay: 1 },
    ]);
  });
});
