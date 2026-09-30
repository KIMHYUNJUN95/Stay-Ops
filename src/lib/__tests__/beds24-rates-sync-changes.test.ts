import { describe, expect, it } from "vitest";
import {
  buildRoomRatesWindow,
  findChangedRateCells,
  type RateValues,
} from "@/lib/beds24/room-rates-sync";

/**
 * 요금 동기화가 「바뀌었다」 신호를 **값이 실제로 바뀐 칸이 있을 때만** 보내는가 (2026-09-30).
 *
 * 쓴 행 수로 알리면 판매 캘린더가 신호 → 새로고침 → 동기화 → 신호 로 끝없이 돈다.
 */
const base: RateValues = {
  max_stay: 30,
  min_stay: 2,
  num_avail: 1,
  override_kind: "none",
  price1: 20000,
  price2: null,
  price3: null,
};

describe("findChangedRateCells", () => {
  it("값이 같으면 아무것도 안 바뀌었다", () => {
    const before = new Map([["r1|2026-10-01", base]]);
    expect(findChangedRateCells([{ ...base, room_id: "r1", stay_date: "2026-10-01" }], before).size).toBe(0);
  });

  it("가격 · 최소숙박 · 차단 · 재고 중 하나라도 다르면 바뀐 칸이다", () => {
    const before = new Map([
      ["r1|2026-10-01", base],
      ["r1|2026-10-02", base],
      ["r1|2026-10-03", base],
      ["r1|2026-10-04", base],
    ]);
    const changed = findChangedRateCells(
      [
        { ...base, price1: 21000, room_id: "r1", stay_date: "2026-10-01" },
        { ...base, min_stay: 3, room_id: "r1", stay_date: "2026-10-02" },
        { ...base, override_kind: "blackout", room_id: "r1", stay_date: "2026-10-03" },
        { ...base, room_id: "r1", stay_date: "2026-10-04" },
      ],
      before,
    );
    expect([...changed].sort()).toEqual(["r1|2026-10-01", "r1|2026-10-02", "r1|2026-10-03"]);
  });

  it("전에 없던 칸은 바뀐 것으로 본다", () => {
    expect(findChangedRateCells([{ ...base, room_id: "r2", stay_date: "2026-10-01" }], new Map())).toEqual(
      new Set(["r2|2026-10-01"]),
    );
  });

  it("null ↔ 값 도 바뀐 것이다", () => {
    const before = new Map([["r1|2026-10-01", { ...base, price2: null }]]);
    expect(
      findChangedRateCells([{ ...base, price2: 25000, room_id: "r1", stay_date: "2026-10-01" }], before).size,
    ).toBe(1);
  });
});

describe("buildRoomRatesWindow", () => {
  it("도쿄 날짜 기준 어제 ~ +12개월", () => {
    expect(buildRoomRatesWindow(new Date("2026-09-30T03:00:00Z"))).toEqual({
      from: "2026-09-29",
      to: "2027-09-30",
    });
  });

  it("UTC 로 전날이어도 도쿄 날짜로 자른다", () => {
    // 2026-09-30 16:00 UTC = 2026-10-01 01:00 JST
    expect(buildRoomRatesWindow(new Date("2026-09-30T16:00:00Z"))).toEqual({
      from: "2026-09-30",
      to: "2027-10-01",
    });
  });
});
