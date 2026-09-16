import { describe, expect, it } from "vitest";

/**
 * 예약을 버릴지 살릴지의 경계 (2026-09-16).
 *
 * 2022년 예약을 받아 보니 **189건이 통째로 거부됐다.** 이유는 게스트 이름이 비어 있어서였다 —
 * OTA 가 개인정보 보관기간이 지나면 이름을 지운다(`firstName: ""`, `lastName: ""`). 날짜·건물·
 * 금액은 멀쩡했다.
 *
 * **이름이 없는 것은 숙박이 없었다는 뜻이 아니다.** 그 예약은 매출을 냈고 객실을 차지했다.
 * 버리면 매출과 가동률이 조용히 낮아진다.
 */
const UNKNOWN_GUEST_NAME = "(unknown)";

/** `reservations-backfill.ts` 의 판정과 같은 규칙. */
function decide(row: {
  sourceReservationId: string | null;
  checkInDate: string | null;
  checkOutDate: string | null;
  guestName: string | null;
}): { keep: boolean; guestName?: string } {
  if (!row.sourceReservationId || !row.checkInDate || !row.checkOutDate) return { keep: false };
  return { keep: true, guestName: row.guestName ?? UNKNOWN_GUEST_NAME };
}

const base = {
  sourceReservationId: "37068548",
  checkInDate: "2022-12-28",
  checkOutDate: "2022-12-30",
  guestName: "Kim",
};

describe("예약 필수값 판정", () => {
  it("이름이 없어도 살린다 — 자리를 채운다", () => {
    const r = decide({ ...base, guestName: null });
    expect(r.keep).toBe(true);
    expect(r.guestName).toBe(UNKNOWN_GUEST_NAME);
  });

  it("이름이 있으면 그대로 쓴다", () => {
    expect(decide(base).guestName).toBe("Kim");
  });

  it("식별자가 없으면 버린다 — 어느 예약인지 알 수 없다", () => {
    expect(decide({ ...base, sourceReservationId: null }).keep).toBe(false);
  });

  it("날짜가 없으면 버린다 — 언제인지 모르면 쓸 수 없다", () => {
    expect(decide({ ...base, checkInDate: null }).keep).toBe(false);
    expect(decide({ ...base, checkOutDate: null }).keep).toBe(false);
  });

  it("2022년 실제 페이로드 모양 — 이름만 비어 있고 나머지는 멀쩡하다", () => {
    // firstName/lastName 이 빈 문자열이라 합쳐도 빈 값이 된다.
    const guestFullName = ["", ""].filter(Boolean).join(" ").trim();
    const guestName = guestFullName.length > 0 ? guestFullName : null;
    expect(decide({ ...base, guestName }).keep).toBe(true);
  });
});
