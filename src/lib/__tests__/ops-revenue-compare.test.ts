import { describe, expect, it } from "vitest";
import { emptyCell, type RevenueCell } from "@/lib/ops-revenue";
import { bridgeScale, buildBridge, groupProperties, niceUnit, topMover } from "@/lib/ops-revenue-compare";

const cell = (revenue: number, occupied = revenue > 0 ? 10 : 0): RevenueCell => ({ ...emptyCell(), availableNights: 30, occupiedNights: occupied, revenue });

// 2026-09 vs 2025-09 실제 숫자(34번 「저쪽과 숫자 대조」 뒤)
const A = {
  STAY: cell(18896449), 가부키초: cell(7229863), 다카다노바바: cell(6555141), 아라키초A: cell(8643857), 아라키초B: cell(11445033),
  오쿠보B: cell(1754141), 오쿠보C: cell(1245084),
};
const B = {
  STAY: cell(0), 가부키초: cell(7425330), 다카다노바바: cell(8363609), 아라키초A: cell(11105133), 아라키초B: cell(10304846),
  오쿠보B: cell(0), 오쿠보C: cell(1401707),
};
const names = Object.keys(A);

describe("groupProperties", () => {
  it("두 기간 모두 · A 만 · B 만", () => {
    const g = groupProperties([...names, "닫힌곳"], A, { ...B, 닫힌곳: cell(500000) });
    expect(g.fresh.sort()).toEqual(["STAY", "오쿠보B"]);
    expect(g.closed).toEqual(["닫힌곳"]);
    expect(g.existing).toHaveLength(5);
  });
});

describe("buildBridge", () => {
  it("B → 기존 변화 → 신규(큰 순) → A, 마지막 누적 = A 합계", () => {
    const steps = buildBridge(groupProperties(names, A, B), A, B);
    expect(steps.map((s) => s.role)).toEqual(["totalB", "existing", "fresh", "fresh", "totalA"]);
    expect(steps[0].to).toBe(38600625); // 건물별 반올림 값의 합(실제 합계 ¥38,600,626 과 1엔)
    expect(steps[1].kind).toBe("down");
    expect(Math.round(steps[1].to - steps[1].from)).toBe(-3481647);
    expect(steps[2].names).toEqual(["STAY"]);
    expect(Math.round(steps[3].to)).toBe(55769568);
    expect(Math.round(steps[4].to)).toBe(55769568);
  });
  it("신규가 많으면 큰 둘 + 나머지 하나로, 판매가 없어진 건물은 빼는 몫", () => {
    const a = { x: cell(100), n1: cell(50), n2: cell(40), n3: cell(30), n4: cell(20) };
    const b = { x: cell(100), gone: cell(60) };
    const steps = buildBridge(groupProperties(["x", "n1", "n2", "n3", "n4", "gone"], a, b), a, b);
    expect(steps.map((s) => s.role)).toEqual(["totalB", "fresh", "fresh", "freshOther", "closed", "totalA"]);
    expect(steps[3].names).toEqual(["n3", "n4"]);
    expect(steps[4].kind).toBe("down");
    expect(steps.at(-2)!.to).toBe(steps.at(-1)!.to);
  });
});

describe("bridgeScale · niceUnit", () => {
  it("1 · 2 · 5 단위", () => {
    expect(niceUnit(11_000_000)).toBe(20_000_000);
    expect(niceUnit(9_000_000)).toBe(10_000_000);
    expect(niceUnit(4_200)).toBe(5_000);
  });
  it("누적 최솟값 근처부터 — 작은 차이가 보이게", () => {
    const scale = bridgeScale(buildBridge(groupProperties(names, A, B), A, B));
    expect(scale.base).toBeGreaterThan(0);
    expect(scale.base).toBeLessThanOrEqual(35118978);
    expect(scale.top).toBeGreaterThanOrEqual(55769568);
  });
  it("차이가 크면 0 부터", () => {
    const a = { x: cell(100_000_000) };
    const b = { x: cell(10_000_000) };
    expect(bridgeScale(buildBridge(groupProperties(["x"], a, b), a, b)).base).toBe(0);
  });
});

describe("topMover", () => {
  it("기존 건물 중 가장 많이 늘어난 곳", () => {
    const g = groupProperties(names, A, B);
    expect(topMover(g.existing, A, B)?.name).toBe("아라키초B");
  });
  it("늘어난 곳이 없으면 가장 많이 줄어든 곳", () => {
    expect(topMover(["다카다노바바", "가부키초"], A, B)?.name).toBe("다카다노바바");
  });
});
