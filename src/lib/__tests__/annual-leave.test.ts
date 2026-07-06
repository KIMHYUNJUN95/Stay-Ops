import { describe, expect, it } from "vitest";
import { computeAnnualLeaveSummary, getScheduledGrants } from "../annual-leave";

describe("annual-leave accrual schedule", () => {
  it("grants 10/11/12 days at 6/18/30 months, then +2/year up to the 20-day cap", () => {
    const grants = getScheduledGrants("2020-01-15", "2027-06-01").filter((g) => g.kind === "base");
    expect(grants.slice(0, 7).map((g) => g.amount)).toEqual([10, 11, 12, 14, 16, 18, 20]);
    expect(grants.slice(0, 7).map((g) => g.date)).toEqual([
      "2020-07-15",
      "2021-07-15",
      "2022-07-15",
      "2023-07-15",
      "2024-07-15",
      "2025-07-15",
      "2026-07-15",
    ]);
    // stays flat at 20 after the cap is reached
    expect(grants[7].amount).toBe(20);
  });

  it("grants a one-time +4 bonus at the 4-year mark, separate from the base cap", () => {
    const grants = getScheduledGrants("2020-01-15", "2025-01-01");
    const bonuses = grants.filter((g) => g.kind === "bonus");
    expect(bonuses).toHaveLength(1);
    expect(bonuses[0]).toEqual({ kind: "bonus", date: "2024-01-15", amount: 4 });
  });
});

describe("computeAnnualLeaveSummary", () => {
  it("keeps the baseline untouched by the engine's expiry logic", () => {
    const summary = computeAnnualLeaveSummary({
      hireDate: "2020-01-15",
      baselineDate: "2026-01-01",
      baselineAmount: 5,
      asOf: "2030-01-01",
    });
    const baseline = summary.buckets.find((b) => b.kind === "baseline");
    expect(baseline?.expiresOn).toBeNull();
    expect(baseline?.expired).toBe(false);
    expect(baseline?.remaining).toBe(5);
  });

  it("adds grants that land after the baseline date, ignores ones before it", () => {
    const summary = computeAnnualLeaveSummary({
      hireDate: "2020-01-15",
      baselineDate: "2026-07-01",
      baselineAmount: 5,
      asOf: "2026-08-01",
    });
    // the 2026-07-15 grant (20d, per the schedule above) lands after the baseline date
    expect(summary.remaining).toBe(5 + 20);
  });

  it("lapses an unused grant 2 years after it was granted", () => {
    const summary = computeAnnualLeaveSummary({
      hireDate: "2020-01-15",
      baselineDate: "2022-08-01",
      baselineAmount: 0,
      // the 2023-07-15 grant (14d) expires 2025-07-15 — ask one day after that
      asOf: "2025-07-16",
    });
    const grantBucket = summary.buckets.find((b) => b.grantedOn === "2023-07-15");
    expect(grantBucket?.expired).toBe(true);
    expect(grantBucket?.remaining).toBe(0);
  });

  it("consumes used days FIFO, oldest bucket first", () => {
    const summary = computeAnnualLeaveSummary({
      hireDate: "2020-01-15",
      baselineDate: "2026-07-01",
      baselineAmount: 5,
      usedDays: 8,
      asOf: "2026-08-01",
    });
    const baseline = summary.buckets.find((b) => b.kind === "baseline");
    const grant = summary.buckets.find((b) => b.kind === "base" && b.grantedOn === "2026-07-15");
    expect(baseline?.remaining).toBe(0); // 5d fully consumed first
    expect(grant?.remaining).toBe(17); // remaining 3d of usage eats into the 20d grant
    expect(summary.remaining).toBe(17);
  });

  it("reports the next upcoming grant", () => {
    const summary = computeAnnualLeaveSummary({
      hireDate: "2020-01-15",
      baselineDate: "2026-01-01",
      baselineAmount: 0,
      asOf: "2026-06-01",
    });
    expect(summary.nextGrant).toEqual({ kind: "base", date: "2026-07-15", amount: 20 });
  });

  it("keeps the 4-year bonus (특별휴가) pool separate from the paid-leave (유급) pool", () => {
    const summary = computeAnnualLeaveSummary({
      hireDate: "2020-01-15",
      baselineDate: "2023-06-01",
      baselineAmount: 0,
      // bonus grants 2024-01-15; ask well before its 2-year expiry
      asOf: "2024-02-01",
    });
    expect(summary.bonusRemaining).toBe(4);
    expect(summary.baseRemaining).toBe(summary.remaining - 4);
    expect(summary.baseRemaining + summary.bonusRemaining).toBe(summary.remaining);
  });

  it("only draws specialUsedDays from the bonus pool, never the paid-leave pool", () => {
    const summary = computeAnnualLeaveSummary({
      hireDate: "2020-01-15",
      // after the 2023-07-15 base grant, before the 2024-07-15 one — only the
      // 2024-01-15 bonus grant lands in this window
      baselineDate: "2023-08-01",
      baselineAmount: 10,
      usedDays: 0,
      specialUsedDays: 3,
      asOf: "2024-02-01",
    });
    expect(summary.bonusRemaining).toBe(1); // 4d bonus - 3d special usage
    expect(summary.baseRemaining).toBe(10); // untouched by specialUsedDays
  });

  it("tracks a pre-existing 특별휴가 starting balance (bonusBaselineAmount) in the bonus pool, not the base pool", () => {
    const summary = computeAnnualLeaveSummary({
      hireDate: "2020-01-15",
      baselineDate: "2023-08-01",
      baselineAmount: 10,
      bonusBaselineAmount: 2,
      // before the 4-year bonus grant (2024-01-15) so only the manual bonus baseline applies
      asOf: "2023-12-01",
    });
    expect(summary.baseRemaining).toBe(10);
    expect(summary.bonusRemaining).toBe(2);
  });
});
