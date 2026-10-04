import { describe, expect, it } from "vitest";
import { getReservationGuests } from "@/lib/reservation-guests";

/**
 * 예약 인원(성인 · 어린이) — 예약 캘린더 공용 (2026-10-05).
 *
 * 계약: `src/lib/reservation-guests.ts` · docs/product/15-reservation-calendar.md
 */
describe("getReservationGuests", () => {
  it("Beds24 numAdult · numChild 를 나누고 합계는 둘을 더한다(전엔 성인만 합계로 나왔다)", () => {
    expect(getReservationGuests({ numAdult: 2, numChild: 2 })).toEqual({ adults: 2, children: 2, total: 4 });
  });

  it("어린이가 없으면 0, 문자열 숫자도 읽는다", () => {
    expect(getReservationGuests({ numAdult: "3" })).toEqual({ adults: 3, children: 0, total: 3 });
  });

  it("유아는 어린이에 합친다", () => {
    expect(getReservationGuests({ adults: 2, children: 1, infants: 1 })).toEqual({ adults: 2, children: 2, total: 4 });
  });

  it("성인 수가 없으면 합계 키만, 그것도 없으면 모름", () => {
    expect(getReservationGuests({ guests: 5 })).toEqual({ adults: null, children: null, total: 5 });
    expect(getReservationGuests({})).toEqual({ adults: null, children: null, total: null });
    expect(getReservationGuests(null)).toEqual({ adults: null, children: null, total: null });
  });
});
