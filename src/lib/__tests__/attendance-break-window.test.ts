import { describe, expect, it } from "vitest";
import { breakSecondsBySession } from "@/lib/attendance-pay-calculation";

/**
 * 급여에서 빼는 휴게 — 근무 시간 안의 것만 (2026-10-05).
 *
 * 계약: `breakSecondsBySession` (`src/lib/attendance-pay-calculation.ts`) · docs/product/24-attendance-workflow.md
 */
const session = { clock_in_at: "2026-10-05T00:00:00Z", clock_out_at: "2026-10-05T08:00:00Z", id: "s1" };
const brk = (started_at: string, ended_at: string | null) => ({ ended_at, session_id: "s1", started_at });

describe("breakSecondsBySession", () => {
  it("닫힌 휴게는 그대로 뺀다", () => {
    expect(breakSecondsBySession([brk("2026-10-05T03:00:00Z", "2026-10-05T04:00:00Z")], [session]).get("s1")).toBe(3600);
  });

  it("근무 밖으로 나간 부분은 빼지 않는다(관리자가 출근 시각을 옮긴 경우)", () => {
    const moved = { ...session, clock_in_at: "2026-10-05T03:30:00Z" };
    expect(breakSecondsBySession([brk("2026-10-05T03:00:00Z", "2026-10-05T04:00:00Z")], [moved]).get("s1")).toBe(1800);
    expect(breakSecondsBySession([brk("2026-10-05T09:00:00Z", "2026-10-05T10:00:00Z")], [session]).has("s1")).toBe(false);
  });

  it("닫힌 세션에 열린 휴게가 남았으면 퇴근 시각까지 뺀다(전엔 0 — 과지급)", () => {
    expect(breakSecondsBySession([brk("2026-10-05T07:00:00Z", null)], [session]).get("s1")).toBe(3600);
  });

  it("아직 열린 세션의 열린 휴게는 세지 않는다", () => {
    const open = { ...session, clock_out_at: null };
    expect(breakSecondsBySession([brk("2026-10-05T07:00:00Z", null)], [open]).has("s1")).toBe(false);
  });
});
