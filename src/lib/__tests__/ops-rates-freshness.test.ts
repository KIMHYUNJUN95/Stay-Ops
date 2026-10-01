import { describe, expect, it } from "vitest";

import { isOpsRatesStale, opsRatesSyncedLabel } from "@/lib/ops-rates-freshness";

/**
 * 판매 캘린더 가격 신선도 문구 (2026-10-01).
 *
 * 「가격 N분 전 기준」을 늘 적으면 몇 분 된 값도 옛 가격처럼 읽혔다(사용자 지적). 15분 안은 「실시간 반영 중」.
 */
const copy = {
  syncedHours: "가격 {n}시간 전 기준",
  syncedLive: "가격 실시간 반영 중",
  syncedMinutes: "가격 {n}분 전 기준",
  syncedNever: "가격 미수신",
};

describe("opsRatesSyncedLabel", () => {
  it("15분 안이면 실시간 반영 중", () => {
    expect(opsRatesSyncedLabel(0, copy)).toBe("가격 실시간 반영 중");
    expect(opsRatesSyncedLabel(15, copy)).toBe("가격 실시간 반영 중");
  });

  it("넘으면 몇 분 · 몇 시간 전인지", () => {
    expect(opsRatesSyncedLabel(16, copy)).toBe("가격 16분 전 기준");
    expect(opsRatesSyncedLabel(7 * 60 + 5, copy)).toBe("가격 7시간 전 기준");
  });

  it("값이 없으면 미수신", () => {
    expect(opsRatesSyncedLabel(null, copy)).toBe("가격 미수신");
  });
});

describe("isOpsRatesStale", () => {
  it("15분까지는 낡지 않았다", () => {
    expect(isOpsRatesStale(15)).toBe(false);
    expect(isOpsRatesStale(16)).toBe(true);
    expect(isOpsRatesStale(null)).toBe(true);
  });
});
