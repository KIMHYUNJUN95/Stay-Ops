import { describe, expect, it } from "vitest";
import {
  diffCalendarReadback,
  findCalendarEntryForDate,
  normalizeBeds24MinStay,
  toLinkedUnitExpectation,
  type CalendarReadSegment,
} from "@/lib/beds24/price-write-verification";
import { resolveCooldownSeconds, shouldCooldownForCredit } from "@/lib/beds24/sync-locks";

/**
 * 쓴 값 되읽기 대조.
 *
 * **Beds24 는 값을 반영하지 않고도 `success: true` 를 돌려준다.** 이 비교가 유일한 진실
 * 확인 수단이라, 느슨하면 실패를 성공으로 기록하고 빡빡하면 성공을 실패로 되돌린다.
 *
 * 계약: docs/product/33-calendar-write-features.md 「쓰기 안전장치」
 */

const SEGMENTS: CalendarReadSegment[] = [
  { from: "2026-10-01", to: "2026-10-03", minStay: 2, price1: 79000 },
  { from: "2026-10-04", to: "2026-10-04", minStay: 1, price1: 89000 },
];

describe("findCalendarEntryForDate", () => {
  it("구간 안의 날짜를 찾는다 — 응답이 날짜별이 아니라 구간별이다", () => {
    expect(findCalendarEntryForDate(SEGMENTS, "2026-10-02")?.price1).toBe(79000);
    expect(findCalendarEntryForDate(SEGMENTS, "2026-10-01")?.price1).toBe(79000);
    expect(findCalendarEntryForDate(SEGMENTS, "2026-10-03")?.price1).toBe(79000);
  });

  it("어느 구간에도 없으면 null", () => {
    expect(findCalendarEntryForDate(SEGMENTS, "2026-09-30")).toBeNull();
  });
});

describe("normalizeBeds24MinStay", () => {
  it("빈칸은 1이다 — Beds24 가 minStay 1 을 빈칸으로 돌려준다", () => {
    // 이걸 놓치면 「1박으로」를 성공적으로 쓴 뒤 읽었을 때 실패로 보고된다.
    expect(normalizeBeds24MinStay(null)).toBe(1);
    expect(normalizeBeds24MinStay(undefined)).toBe(1);
    expect(normalizeBeds24MinStay("")).toBe(1);
    expect(normalizeBeds24MinStay(0)).toBe(1);
  });

  it("문자열로 와도 숫자로 본다", () => {
    expect(normalizeBeds24MinStay("2")).toBe(2);
    expect(normalizeBeds24MinStay(99)).toBe(99);
  });
});

describe("diffCalendarReadback", () => {
  it("일치하면 빈 배열", () => {
    expect(
      diffCalendarReadback({
        expected: { "2026-10-01": { p1: 79000, m: 2 } },
        segments: SEGMENTS,
      }),
    ).toEqual([]);
  });

  it("가격이 안 바뀌었으면 잡는다", () => {
    const mismatches = diffCalendarReadback({
      expected: { "2026-10-01": { p1: 50000 } },
      segments: SEGMENTS,
    });
    expect(mismatches).toEqual([
      { actual: 79000, date: "2026-10-01", expected: 50000, field: "price1" },
    ]);
  });

  it("「1박으로」가 반영됐으면 성공으로 본다 — 빈칸이 곧 1이다", () => {
    const mismatches = diffCalendarReadback({
      expected: { "2026-10-04": { m: 1 } },
      segments: [{ from: "2026-10-04", to: "2026-10-04", minStay: null }],
    });
    expect(mismatches).toEqual([]);
  });

  it("최소숙박이 안 바뀌었으면 잡는다", () => {
    const mismatches = diffCalendarReadback({
      expected: { "2026-10-01": { m: 1 } },
      segments: SEGMENTS,
    });
    expect(mismatches[0]).toMatchObject({ actual: 2, expected: 1, field: "minStay" });
  });

  it("**보내지 않은 항목은 보지 않는다**", () => {
    // 최소숙박만 바꿨다면 가격이 뭐든 상관없다. 안 본 값까지 따지면 그 사이 남이 바꾼
    // 가격 때문에 내 작업이 실패한다.
    expect(
      diffCalendarReadback({
        expected: { "2026-10-01": { m: 2 } },
        segments: [{ from: "2026-10-01", to: "2026-10-01", minStay: 2, price1: 12345 }],
      }),
    ).toEqual([]);
  });

  it("`REMOVE` 는 **지워져 있어야** 맞다", () => {
    expect(
      diffCalendarReadback({
        expected: { "2026-10-01": { p1: "REMOVE" } },
        segments: [{ from: "2026-10-01", to: "2026-10-01", price1: null }],
      }),
    ).toEqual([]);
    const stillThere = diffCalendarReadback({
      expected: { "2026-10-01": { p1: "REMOVE" } },
      segments: SEGMENTS,
    });
    expect(stillThere[0]).toMatchObject({ expected: null, field: "price1" });
  });

  it("그 날짜 구간이 아예 없으면 불일치다 — 「모른다」를 성공이라 하지 않는다", () => {
    const mismatches = diffCalendarReadback({
      expected: { "2026-12-25": { p1: 99000, m: 2 } },
      segments: SEGMENTS,
    });
    expect(mismatches).toHaveLength(2);
    expect(mismatches.map((m) => m.actual)).toEqual([null, null]);
  });

  it("여러 날짜를 한 번에 본다", () => {
    const mismatches = diffCalendarReadback({
      expected: {
        "2026-10-01": { p1: 79000 },
        "2026-10-02": { p1: 79000 },
        "2026-10-04": { p1: 12345 },
      },
      segments: SEGMENTS,
    });
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0].date).toBe("2026-10-04");
  });
});

describe("toLinkedUnitExpectation", () => {
  it("연결 유닛은 **가격만** 검증한다", () => {
    // 링크로 퍼지는 것은 에어비앤비 가격뿐이다. 최소숙박까지 보면 매번 불일치가 난다.
    expect(
      toLinkedUnitExpectation({ "2026-10-01": { p1: 79000, m: 2 } }),
    ).toEqual({ "2026-10-01": { p1: 79000 } });
  });

  it("가격을 안 바꾼 날짜는 검증 대상에서 빠진다", () => {
    expect(toLinkedUnitExpectation({ "2026-10-01": { m: 1 } })).toEqual({});
  });
});

/**
 * 쉬는 시간 계산(`resolveCooldownSeconds`).
 *
 * 너무 짧으면 바로 또 429 를 맞고, 너무 길면 그동안 아무것도 못 한다.
 */
describe("resolveCooldownSeconds", () => {
  it("Beds24 가 알려준 리셋 + 2초", () => {
    // 기준 시각을 저쪽이 찍고 우리가 재므로 시계가 다르다 — 여유를 둔다.
    expect(resolveCooldownSeconds(30)).toBe(32);
  });

  it("안 알려주면 기본값", () => {
    expect(resolveCooldownSeconds(null)).toBe(60);
    expect(resolveCooldownSeconds(null, 30)).toBe(30);
  });

  it("위아래로 가둔다 — 너무 짧으면 바로 또 맞는다", () => {
    expect(resolveCooldownSeconds(1)).toBe(15);
    expect(resolveCooldownSeconds(9999)).toBe(300);
  });

  it("0이나 음수는 값이 없는 것으로 본다", () => {
    expect(resolveCooldownSeconds(0)).toBe(60);
    expect(resolveCooldownSeconds(-5)).toBe(60);
  });
});

describe("shouldCooldownForCredit", () => {
  it("바닥나기 **전에** 멈춘다", () => {
    expect(shouldCooldownForCredit({ remaining: 9, resetInSec: null })).toBe(true);
    expect(shouldCooldownForCredit({ remaining: 10, resetInSec: null })).toBe(false);
  });

  it("헤더가 없으면 쉬지 않는다 — 모른다고 멈추면 아무것도 못 한다", () => {
    expect(shouldCooldownForCredit({ remaining: null, resetInSec: null })).toBe(false);
  });
});
