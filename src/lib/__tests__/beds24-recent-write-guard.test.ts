import { describe, expect, it } from "vitest";
import { findRowsContradictingRecentWrites, type RecentWrite } from "@/lib/beds24/recent-write-guard";

/**
 * 요금 동기화가 방금 쓴 값을 되돌리지 않게.
 *
 * 계약: `src/lib/beds24/recent-write-guard.ts` — 2026-09-30 가부키초 803 9/30 이 1박으로 쓴 뒤 2박으로 되돌아간 일.
 */
const row = (over: Partial<{ room_id: string; stay_date: string; price1: number | null; min_stay: number | null }> = {}) => ({
  min_stay: 2,
  price1: 21000,
  room_id: "r803",
  stay_date: "2026-09-30",
  ...over,
});
const write = (over: Partial<RecentWrite> = {}): RecentWrite => ({
  at: "2026-09-29T23:08:14Z",
  field: "min_stay",
  roomId: "r803",
  stayDate: "2026-09-30",
  value: 1,
  ...over,
});

describe("findRowsContradictingRecentWrites", () => {
  it("방금 1박으로 썼는데 동기화가 2박을 가져오면 그 칸을 믿지 않는다", () => {
    expect([...findRowsContradictingRecentWrites([row()], [write()])]).toEqual(["r803|2026-09-30"]);
  });

  it("쓴 값과 같으면 문제없다", () => {
    expect(findRowsContradictingRecentWrites([row({ min_stay: 1 })], [write()]).size).toBe(0);
  });

  it("가격도 같은 규칙", () => {
    expect(
      findRowsContradictingRecentWrites([row({ price1: 45000 })], [write({ field: "price1", value: 39000 })]).size,
    ).toBe(1);
  });

  it("같은 칸에 여러 번 썼으면 마지막 값이 기준", () => {
    const writes = [write({ at: "2026-09-29T23:08:00Z", value: 1 }), write({ at: "2026-09-29T23:11:00Z", value: 2 })];
    expect(findRowsContradictingRecentWrites([row({ min_stay: 2 })], writes).size).toBe(0);
    expect(findRowsContradictingRecentWrites([row({ min_stay: 1 })], writes).size).toBe(1);
  });

  it("쓴 적 없는 칸은 건드리지 않는다", () => {
    expect(findRowsContradictingRecentWrites([row({ stay_date: "2026-10-01" })], [write()]).size).toBe(0);
  });
});
