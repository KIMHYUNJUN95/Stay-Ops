import { describe, expect, it } from "vitest";
import { resolveReservationStatusFromBeds24Record } from "@/lib/beds24/reservation-status";

describe("resolveReservationStatusFromBeds24Record", () => {
  it("취소했다가 되살린 예약 — 상태가 confirmed 면 남은 cancelTime 은 무시한다 (2026-10-07, 86444948)", () => {
    expect(
      resolveReservationStatusFromBeds24Record({ cancelTime: "2026-06-29T04:05:08Z", id: 86444948, status: "confirmed" }),
    ).toBe("confirmed");
    expect(resolveReservationStatusFromBeds24Record({ cancelTime: "2025-09-04T07:23:16Z", status: "new" })).toBe("confirmed");
  });

  it("상태가 cancelled 면 취소", () => {
    expect(resolveReservationStatusFromBeds24Record({ cancelTime: "2026-10-06T00:00:00Z", status: "cancelled" })).toBe("cancelled");
    expect(resolveReservationStatusFromBeds24Record({ status: "cancelled" })).toBe("cancelled");
    expect(resolveReservationStatusFromBeds24Record({ status: 0 })).toBe("cancelled");
  });

  it("상태 값이 없는 취소 웹훅은 cancelTime · subStatus 로 취소", () => {
    expect(resolveReservationStatusFromBeds24Record({ cancelTime: "2026-10-06T00:00:00Z", id: 1 })).toBe("cancelled");
    expect(resolveReservationStatusFromBeds24Record({ id: 1, subStatus: "cancelled by guest" })).toBe("cancelled");
  });

  it("노쇼는 상태가 살아 있어도 노쇼", () => {
    expect(resolveReservationStatusFromBeds24Record({ status: "confirmed", subStatus: "no show" })).toBe("no_show");
  });

  it("아무 신호가 없으면 확정", () => {
    expect(resolveReservationStatusFromBeds24Record({ id: 1 })).toBe("confirmed");
    expect(resolveReservationStatusFromBeds24Record({ status: 1 })).toBe("confirmed");
  });
});
