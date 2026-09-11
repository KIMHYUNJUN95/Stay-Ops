import { describe, expect, it } from "vitest";
import { shiftMonthKey } from "@/components/admin/shared/admin-month-key";

/**
 * 달력 화살표가 「잘 안 눌리던」 버그의 회귀 방지 (2026-09-11).
 *
 * 원인은 클릭 처리가 아니라 달 산수였다. 도쿄 1일 00시는 UTC 로 전달 말일이라, `Date` 에
 * `setUTCMonth(+1)` 을 하면 없는 날짜가 되어 JS 가 굴려버린다 — 3·5·7·10·12월에서는 다음 달로
 * 가지 못하고 제자리였고, prev 는 한 달씩 건너뛰었다.
 */
describe("shiftMonthKey", () => {
  it("모든 달에서 정확히 한 달씩 움직인다", () => {
    // 버그 당시 제자리였던 달들이 여기 다 들어 있다.
    const expected: [string, string, string][] = [
      ["2026-01", "2026-02", "2025-12"],
      ["2026-02", "2026-03", "2026-01"],
      ["2026-03", "2026-04", "2026-02"],
      ["2026-04", "2026-05", "2026-03"],
      ["2026-05", "2026-06", "2026-04"],
      ["2026-06", "2026-07", "2026-05"],
      ["2026-07", "2026-08", "2026-06"],
      ["2026-08", "2026-09", "2026-07"],
      ["2026-09", "2026-10", "2026-08"],
      ["2026-10", "2026-11", "2026-09"],
      ["2026-11", "2026-12", "2026-10"],
      ["2026-12", "2027-01", "2026-11"],
    ];
    for (const [month, next, prev] of expected) {
      expect(shiftMonthKey(month, 1)).toBe(next);
      expect(shiftMonthKey(month, -1)).toBe(prev);
    }
  });

  it("연말·연초를 넘는다", () => {
    expect(shiftMonthKey("2026-12", 1)).toBe("2027-01");
    expect(shiftMonthKey("2026-01", -1)).toBe("2025-12");
    expect(shiftMonthKey("2026-06", 12)).toBe("2027-06");
    expect(shiftMonthKey("2026-06", -12)).toBe("2025-06");
  });

  it("여러 달을 한 번에 움직여도 어긋나지 않는다", () => {
    expect(shiftMonthKey("2026-01", 25)).toBe("2028-02");
    expect(shiftMonthKey("2026-01", -25)).toBe("2023-12");
  });

  it("0 은 제자리다", () => {
    expect(shiftMonthKey("2026-09", 0)).toBe("2026-09");
  });

  it("한 칸씩 24번 가면 정확히 2년 뒤다 — 누적 오차가 없다", () => {
    let month = "2026-01";
    for (let i = 0; i < 24; i++) month = shiftMonthKey(month, 1);
    expect(month).toBe("2028-01");
  });
});
