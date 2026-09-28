import { describe, expect, it } from "vitest";
import {
  readBeds24CancelTargetId,
  resolveStayUnit,
  splitGuestName,
  stayNights,
  validateManualBooking,
  type ManualBookingInput,
} from "@/lib/ops-manual-booking";

/**
 * 수동 예약 생성 규칙.
 *
 * 계약: `src/lib/ops-manual-booking.ts`
 * 원본: `BuildingCalendar.jsx` → `ManualBookingModal`
 *
 * **예약은 roomId 하나에 붙는다.** 숙박 중간에 유닛이 바뀌면 뒷날짜에는 잠긴 유닛이 되어
 * 채널에서 사라진다. 눈으로는 절대 못 잡으므로 테스트로 고정한다.
 */
const base: ManualBookingInput = {
  arrival: "2026-10-10",
  departure: "2026-10-12",
  guestName: "Kim Hyunjun",
  numAdult: 2,
  numChild: 0,
  roomKey: "가부키초__803",
  totalPrice: 50000,
};
const TODAY = "2026-10-01";

describe("validateManualBooking", () => {
  it("정상 입력은 통과", () => {
    expect(validateManualBooking(base, TODAY)).toBeNull();
  });

  it("체크아웃이 체크인 이하면 막는다 — 팔 밤이 없다", () => {
    expect(validateManualBooking({ ...base, departure: "2026-10-10" }, TODAY)).toBe("bad_dates");
    expect(validateManualBooking({ ...base, departure: "2026-10-09" }, TODAY)).toBe("bad_dates");
  });

  it("지난 날짜로는 못 만든다", () => {
    expect(validateManualBooking({ ...base, arrival: "2026-09-30", departure: "2026-10-02" }, TODAY)).toBe(
      "past_arrival",
    );
  });

  it("손님 이름은 필수 — 공백만은 안 된다", () => {
    expect(validateManualBooking({ ...base, guestName: "   " }, TODAY)).toBe("no_guest_name");
  });

  it("금액은 숫자여야 하고 음수는 안 된다 (0 은 허용 — 무상 투숙이 있다)", () => {
    expect(validateManualBooking({ ...base, totalPrice: null }, TODAY)).toBe("bad_price");
    expect(validateManualBooking({ ...base, totalPrice: -1 }, TODAY)).toBe("bad_price");
    expect(validateManualBooking({ ...base, totalPrice: 0 }, TODAY)).toBeNull();
  });

  it("성인은 1명 이상", () => {
    expect(validateManualBooking({ ...base, numAdult: 0 }, TODAY)).toBe("bad_occupancy");
    expect(validateManualBooking({ ...base, numChild: -1 }, TODAY)).toBe("bad_occupancy");
  });

  it("60박을 넘으면 막는다 — 실수로 1년을 잡는 것을 서버에서도 막는다", () => {
    expect(
      validateManualBooking({ ...base, arrival: "2026-10-10", departure: "2027-01-10" }, TODAY),
    ).toBe("stay_too_long");
  });
});

describe("stayNights", () => {
  it("체크아웃 날 밤은 빠진다", () => {
    expect(stayNights("2026-10-10", "2026-10-13")).toEqual([
      "2026-10-10",
      "2026-10-11",
      "2026-10-12",
    ]);
  });

  it("1박", () => {
    expect(stayNights("2026-10-10", "2026-10-11")).toEqual(["2026-10-10"]);
  });

  it("달을 넘어간다", () => {
    expect(stayNights("2026-10-30", "2026-11-02")).toEqual([
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
    ]);
  });
});

describe("resolveStayUnit", () => {
  it("전 기간 같은 유닛이면 그것을 쓴다", () => {
    expect(
      resolveStayUnit(
        new Map([
          ["2026-10-10", ["648398"]],
          ["2026-10-11", ["648398"]],
        ]),
      ),
    ).toEqual({ externalRoomId: "648398", ok: true });
  });

  it("교체 구간처럼 둘 다 살아 있는 밤이 섞여도 **교집합**이 있으면 통과", () => {
    // 저쪽은 날짜마다 선호를 골라 비교하느라 이런 숙박을 괜히 거부했다.
    expect(
      resolveStayUnit(
        new Map([
          ["2026-09-30", ["383971"]],
          ["2026-10-01", ["383971", "601545"]],
          ["2026-10-02", ["383971", "601545"]],
        ]),
      ),
    ).toEqual({ externalRoomId: "383971", ok: true });
  });

  it("유닛이 중간에 갈리면 거부하고 **갈리는 밤**을 알려준다", () => {
    expect(
      resolveStayUnit(
        new Map([
          ["2026-10-03", ["383971", "601545"]],
          ["2026-10-04", ["383971", "601545"]],
          ["2026-10-05", ["601545"]],
          ["2026-10-06", ["601545"]],
        ]),
      ),
    ).toEqual({ externalRoomId: "601545", ok: true });

    expect(
      resolveStayUnit(
        new Map([
          ["2026-09-29", ["383971"]],
          ["2026-10-05", ["601545"]],
        ]),
      ),
    ).toEqual({ conflictDates: ["2026-10-05"], ok: false, reason: "unit_changes" });
  });

  it("팔 유닛이 없는 밤이 있으면 그 밤들을 돌려준다", () => {
    expect(
      resolveStayUnit(
        new Map([
          ["2026-10-10", ["648398"]],
          ["2026-10-11", []],
          ["2026-10-12", []],
        ]),
      ),
    ).toEqual({
      conflictDates: ["2026-10-11", "2026-10-12"],
      ok: false,
      reason: "no_active_unit",
    });
  });

  it("여럿이 살아남으면 가장 작은 id 로 고정 — 같은 입력은 같은 결과여야 한다", () => {
    const result = resolveStayUnit(
      new Map([
        ["2026-10-10", ["601545", "383971"]],
        ["2026-10-11", ["383971", "601545"]],
      ]),
    );
    expect(result).toEqual({ externalRoomId: "383971", ok: true });
  });

  it("빈 입력은 거부", () => {
    expect(resolveStayUnit(new Map())).toEqual({
      conflictDates: [],
      ok: false,
      reason: "no_active_unit",
    });
  });
});

describe("splitGuestName", () => {
  it("첫 토큰이 이름, 나머지가 성", () => {
    expect(splitGuestName("Kim Hyunjun")).toEqual({ firstName: "Kim", lastName: "Hyunjun" });
    expect(splitGuestName("Maria del Carmen Ruiz")).toEqual({
      firstName: "Maria",
      lastName: "del Carmen Ruiz",
    });
  });

  it("한 단어면 성은 `.` — Beds24 가 빈 값을 거절한다", () => {
    expect(splitGuestName("김현준")).toEqual({ firstName: "김현준", lastName: "." });
  });

  it("공백만이면 Guest 로 채운다", () => {
    expect(splitGuestName("   ")).toEqual({ firstName: "Guest", lastName: "." });
  });

  it("가운데 공백이 여러 개여도 하나로 줄인다", () => {
    expect(splitGuestName("  Lee   Seon  hee ")).toEqual({
      firstName: "Lee",
      lastName: "Seon hee",
    });
  });
});

/**
 * 취소 대상 예약번호.
 *
 * `readBeds24BookingId` 는 `apiReference` 를 먼저 봐서 **채널 예약코드**를 돌려준다.
 * 그 값으로 취소를 부르면 엉뚱한 예약이 취소되거나 조용히 아무 일도 안 일어난다.
 */
describe("readBeds24CancelTargetId", () => {
  it("bookId 를 먼저 본다", () => {
    expect(readBeds24CancelTargetId({ bookId: "5722782894", id: 999 })).toBe("5722782894");
  });

  it("bookId 가 없으면 숫자 id 를 쓴다 — 우리 데이터의 실제 모양", () => {
    expect(readBeds24CancelTargetId({ apiReference: "HMZEYJJX5W", id: "92553068" })).toBe(
      "92553068",
    );
  });

  it("숫자를 숫자로 받아도 된다", () => {
    expect(readBeds24CancelTargetId({ id: 92553068 })).toBe("92553068");
  });

  it("**채널 예약코드는 절대 쓰지 않는다**", () => {
    expect(readBeds24CancelTargetId({ apiReference: "HMZEYJJX5W" })).toBeNull();
    expect(readBeds24CancelTargetId({ id: "HMZEYJJX5W" })).toBeNull();
  });

  it("없으면 null — 모르는 값으로 취소를 시도하지 않는다", () => {
    expect(readBeds24CancelTargetId(null)).toBeNull();
    expect(readBeds24CancelTargetId({})).toBeNull();
    expect(readBeds24CancelTargetId([{ id: 1 }])).toBeNull();
  });
});
