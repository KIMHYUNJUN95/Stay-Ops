import { describe, expect, it } from "vitest";

import { isOpsRatesStale, opsRatesSyncedLabel } from "@/lib/ops-rates-freshness";

/**
 * 판매 캘린더 가격 신선도 문구 (2026-10-01).
 *
 * 가격은 재고 웹훅으로 들어오므로 「마지막으로 받은 시각」은 낡음이 아니다 — 바뀐 것 없는 먼 달이 「가격 9시간 전
 * 기준」으로 떴다(사용자 지적). 빨강은 웹훅 반영이 밀렸거나 24시간 넘게 아무것도 못 받았을 때만.
 */
const copy = {
  syncedHours: "가격 {n}시간 전 기준",
  syncedLive: "가격 실시간 반영 중",
  syncedNever: "가격 미수신",
  syncedPending: "가격 반영 대기 중",
};

describe("opsRatesSyncedLabel", () => {
  it("밀린 반영이 없으면 몇 시간 전에 받았어도 실시간 반영 중", () => {
    expect(opsRatesSyncedLabel({ ageMinutes: 3, pending: false }, copy)).toBe("가격 실시간 반영 중");
    expect(opsRatesSyncedLabel({ ageMinutes: 9 * 60, pending: false }, copy)).toBe("가격 실시간 반영 중");
  });

  it("웹훅을 받았는데 아직 못 읽은 건물이 있으면 반영 대기", () => {
    expect(opsRatesSyncedLabel({ ageMinutes: 3, pending: true }, copy)).toBe("가격 반영 대기 중");
  });

  it("24시간 넘게 아무것도 못 받았으면 몇 시간 전인지", () => {
    expect(opsRatesSyncedLabel({ ageMinutes: 30 * 60, pending: false }, copy)).toBe("가격 30시간 전 기준");
  });

  it("값이 없으면 미수신", () => {
    expect(opsRatesSyncedLabel({ ageMinutes: null, pending: false }, copy)).toBe("가격 미수신");
  });
});

describe("isOpsRatesStale", () => {
  it("밀린 반영 · 24시간 초과 · 값 없음만 빨강", () => {
    expect(isOpsRatesStale({ ageMinutes: 9 * 60, pending: false })).toBe(false);
    expect(isOpsRatesStale({ ageMinutes: 24 * 60, pending: false })).toBe(false);
    expect(isOpsRatesStale({ ageMinutes: 24 * 60 + 1, pending: false })).toBe(true);
    expect(isOpsRatesStale({ ageMinutes: 3, pending: true })).toBe(true);
    expect(isOpsRatesStale({ ageMinutes: null, pending: false })).toBe(true);
  });
});
