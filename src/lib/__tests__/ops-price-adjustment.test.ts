import { describe, expect, it } from "vitest";
import {
  amountFromPercent,
  buildAdjustmentPreview,
  computeAdjustedPrice,
  findAdjustmentWarnings,
  percentFromAmount,
  PERCENT_PRESETS,
  type AdjustmentCellInput,
} from "@/lib/ops-price-adjustment";

/**
 * 가격 조정 계산.
 *
 * **여기서 나온 숫자가 그대로 채널로 나간다.** 반올림 한 번, 기준가 하나만 틀려도 잘못된
 * 가격에 팔린다.
 *
 * 계약: docs/product/33-calendar-write-features.md 「조정 방식 두 가지」
 */

const CELLS: AdjustmentCellInput[] = [
  { date: "2026-10-01", price: 40000, roomKey: "A", roomLabel: "201" },
  { date: "2026-10-02", price: 60000, roomKey: "A", roomLabel: "201" },
];

describe("computeAdjustedPrice", () => {
  it("금액은 고른 칸 **전부**를 그 값으로", () => {
    expect(computeAdjustedPrice(40000, { amount: 30000, kind: "amount" })).toBe(30000);
    expect(computeAdjustedPrice(99999, { amount: 30000, kind: "amount" })).toBe(30000);
  });

  it("퍼센트는 칸마다 **자기 현재가** 기준", () => {
    expect(computeAdjustedPrice(40000, { kind: "percent", percent: 10 })).toBe(44000);
    expect(computeAdjustedPrice(60000, { kind: "percent", percent: 10 })).toBe(66000);
  });

  it("퍼센트는 반올림한다", () => {
    // 저쪽 Math.round 와 같아야 한다 — 내림으로 바꾸면 매 칸 1엔씩 어긋난다.
    expect(computeAdjustedPrice(33333, { kind: "percent", percent: 5 })).toBe(35000);
    expect(computeAdjustedPrice(10001, { kind: "percent", percent: -5 })).toBe(9501);
  });

  it("마이너스 퍼센트로 내린다", () => {
    expect(computeAdjustedPrice(40000, { kind: "percent", percent: -20 })).toBe(32000);
  });
});

describe("buildAdjustmentPreview", () => {
  it("퍼센트는 칸마다 결과가 다르다 — 그래서 범위를 보여준다", () => {
    const preview = buildAdjustmentPreview(CELLS, { kind: "percent", percent: 10 });
    expect(preview.rows.map((row) => row.newPrice)).toEqual([44000, 66000]);
    expect(preview.newMin).toBe(44000);
    expect(preview.newMax).toBe(66000);
  });

  it("금액은 전부 같은 값이라 범위가 한 점이다", () => {
    const preview = buildAdjustmentPreview(CELLS, { amount: 50000, kind: "amount" });
    expect(preview.newMin).toBe(50000);
    expect(preview.newMax).toBe(50000);
  });

  it("**현재 가격이 없는 칸은 빠지고, 몇 개인지 알려준다**", () => {
    // 퍼센트는 기준가가 있어야 계산되고, 「원래 안 팔던 날」에 값을 넣는 건 다른 행위다.
    const preview = buildAdjustmentPreview(
      [...CELLS, { date: "2026-10-03", price: null, roomKey: "A", roomLabel: "201" }],
      { kind: "percent", percent: 10 },
    );
    expect(preview.rows).toHaveLength(2);
    expect(preview.skippedNoPrice).toBe(1);
  });

  it("평균을 낸다 — % 배지의 기준이다", () => {
    const preview = buildAdjustmentPreview(CELLS, { kind: "percent", percent: 0 });
    expect(preview.currentAverage).toBe(50000);
    expect(preview.newAverage).toBe(50000);
  });

  it("값이 안 바뀌는 칸은 changedCount 에 안 센다", () => {
    // 0이면 보낼 이유가 없다 — 크레딧만 쓰고 채널에 같은 값을 다시 밀어 넣는다.
    const preview = buildAdjustmentPreview(CELLS, { kind: "percent", percent: 0 });
    expect(preview.changedCount).toBe(0);
  });

  it("날짜 → 객실 순으로 정렬한다", () => {
    const preview = buildAdjustmentPreview(
      [
        { date: "2026-10-02", price: 1, roomKey: "B", roomLabel: "202" },
        { date: "2026-10-01", price: 1, roomKey: "B", roomLabel: "202" },
        { date: "2026-10-01", price: 1, roomKey: "A", roomLabel: "201" },
      ],
      { amount: 2, kind: "amount" },
    );
    expect(preview.rows.map((row) => `${row.date} ${row.roomLabel}`)).toEqual([
      "2026-10-01 201",
      "2026-10-01 202",
      "2026-10-02 202",
    ]);
  });

  it("빈 선택이면 전부 0", () => {
    const preview = buildAdjustmentPreview([], { amount: 1, kind: "amount" });
    expect(preview.rows).toEqual([]);
    expect(preview.newMin).toBe(0);
    expect(preview.changedCount).toBe(0);
  });
});

describe("금액 ↔ 퍼센트 상호 계산", () => {
  it("모드 토글이 없어서 서로를 계산해 준다", () => {
    expect(percentFromAmount(50000, 55000)).toBe(10);
    expect(amountFromPercent(50000, 10)).toBe(55000);
  });

  it("기준가가 없으면 계산하지 않는다 — 0으로 나누지 않는다", () => {
    expect(percentFromAmount(0, 55000)).toBeNull();
    expect(amountFromPercent(0, 10)).toBeNull();
  });

  it("프리셋은 저쪽과 같다", () => {
    expect([...PERCENT_PRESETS]).toEqual([-20, -10, -5, 5, 10, 20, 30]);
  });
});

describe("findAdjustmentWarnings", () => {
  it("0원 이하는 경고한다 — 그대로 나가면 공짜로 팔린다", () => {
    const preview = buildAdjustmentPreview(CELLS, { amount: 0, kind: "amount" });
    expect(findAdjustmentWarnings(preview)).toContain("zero");
  });

  it("반값 아래로 떨어지면 경고한다", () => {
    const preview = buildAdjustmentPreview(CELLS, { kind: "percent", percent: -60 });
    expect(findAdjustmentWarnings(preview)).toContain("huge_drop");
  });

  it("세 배를 넘으면 경고한다 — 자릿수 실수를 잡는다", () => {
    const preview = buildAdjustmentPreview(CELLS, { amount: 400000, kind: "amount" });
    expect(findAdjustmentWarnings(preview)).toContain("huge_rise");
  });

  it("평범한 조정에는 경고가 없다", () => {
    const preview = buildAdjustmentPreview(CELLS, { kind: "percent", percent: 10 });
    expect(findAdjustmentWarnings(preview)).toEqual([]);
  });
});
