import { describe, expect, it } from "vitest";
import {
  defaultRecentRange,
  msUntilNextTokyoMidnight,
  resolveRecentRange,
  tokyoDateOf,
  tokyoParts,
} from "@/lib/ops-recent-bookings-range";

// 2026-10-05 15:00 도쿄 = 06:00 UTC.
const NOW = Date.parse("2026-10-05T06:00:00Z");

describe("최근 예약 시간대", () => {
  // 2026-10-07 — 「이틀 전 0시 ~ 지금」은 시각에 따라 48 ~ 72시간이었다. 언제 열어도 정확히 48시간.
  it("기본 = 지금부터 정확히 48시간 전 ~ 지금", () => {
    const range = defaultRecentRange(NOW);
    expect(new Date(range.fromMs).toISOString()).toBe("2026-10-03T06:00:00.000Z"); // 10/03 15:00 도쿄
    expect(range.toMs).toBe(NOW);
    const lateNight = Date.parse("2026-10-05T14:30:00Z"); // 10/05 23:30 도쿄 — 예전엔 71.5시간
    expect(lateNight - defaultRecentRange(lateNight).fromMs).toBe(48 * 3_600_000);
  });

  it("도쿄 날짜 · 다음 자정(직접 지정이 풀리는 때)", () => {
    const justAfter = Date.parse("2026-10-05T15:00:30Z"); // 10/06 00:00:30 도쿄
    expect(tokyoDateOf(justAfter)).toBe("2026-10-06");
    expect(msUntilNextTokyoMidnight(NOW)).toBe(9 * 3_600_000);
  });

  it("직접 지정 — 끝이 지금 이후면 지금으로 자르고, 거꾸로 · 31일 초과는 기본", () => {
    const custom = resolveRecentRange(NOW, { from: "2026-10-04T09:00:00Z", to: "2026-10-04T18:00:00Z" });
    expect(custom).toMatchObject({ endsNow: false, isDefault: false });
    const future = resolveRecentRange(NOW, { from: "2026-10-04T09:00:00Z", to: "2026-10-09T00:00:00Z" });
    expect(future).toMatchObject({ endsNow: true, isDefault: false, toMs: NOW });
    expect(resolveRecentRange(NOW, { from: "2026-10-05T00:00:00Z", to: "2026-10-04T00:00:00Z" }).isDefault).toBe(true);
    expect(resolveRecentRange(NOW, { from: "2026-08-01T00:00:00Z", to: null }).isDefault).toBe(true);
    expect(resolveRecentRange(NOW, null)).toMatchObject({ endsNow: true, isDefault: true });
  });

  it("도쿄 시각 쪼개기", () => {
    expect(tokyoParts(NOW)).toEqual({ date: "2026-10-05", time: "15:00" });
  });
});
