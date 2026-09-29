import { describe, expect, it } from "vitest";
import {
  attributePriceConversions,
  type AttributionCell,
  type AttributionReservation,
} from "@/lib/ops-price-attribution";

/**
 * 가격 개입 전환 판정.
 *
 * 계약: `src/lib/ops-price-attribution.ts`
 * 원본: 저쪽 `priceAttribution.js` — 규칙이 곧 「가격 조정이 효과가 있었나」의 근거라 고정한다.
 */
const H = 3_600_000;
const T0 = Date.parse("2026-10-20T05:00:00Z"); // 가격을 바꾼 시각

const cell = (over: Partial<AttributionCell> = {}): AttributionCell => ({
  appliedAtMs: T0,
  changedBy: "김현준",
  groupId: "job1",
  newValue: 39000,
  oldValue: 45000,
  roomKey: "A::401",
  stayDate: "2026-11-03",
  ...over,
});
const booking = (over: Partial<AttributionReservation> = {}): AttributionReservation => ({
  checkIn: "2026-11-03",
  checkOut: "2026-11-05",
  createdAtMs: T0 + 19.5 * H,
  id: "r1",
  roomKey: "A::401",
  ...over,
});

describe("attributePriceConversions", () => {
  it("같은 방 · 바꾼 날짜를 덮고 · 48시간 안 · 그때 비어 있었으면 전환이다", () => {
    const [conversion] = attributePriceConversions({
      cells: [cell(), cell({ newValue: 40000, oldValue: 46000, stayDate: "2026-11-04" })],
      reservations: [booking()],
    });
    expect(conversion).toMatchObject({
      delta: -6000,
      groupId: "job1",
      hoursToBooking: 19.5,
      newAverage: 39500,
      oldAverage: 45500,
      percent: -13.2,
      reservationId: "r1",
    });
    expect(conversion.nights.map((night) => night.date)).toEqual(["2026-11-03", "2026-11-04"]);
  });

  it("48시간이 지나서 들어온 예약은 아니다 — 경계는 포함", () => {
    expect(attributePriceConversions({ cells: [cell()], reservations: [booking({ createdAtMs: T0 + 48 * H })] })).toHaveLength(1);
    expect(attributePriceConversions({ cells: [cell()], reservations: [booking({ createdAtMs: T0 + 48 * H + 1 })] })).toHaveLength(0);
  });

  it("가격을 바꾸기 전(또는 같은 순간)에 들어온 예약은 아니다", () => {
    expect(attributePriceConversions({ cells: [cell()], reservations: [booking({ createdAtMs: T0 })] })).toHaveLength(0);
  });

  it("다른 방이거나 바꾼 날짜를 안 덮으면 아니다", () => {
    expect(attributePriceConversions({ cells: [cell()], reservations: [booking({ roomKey: "A::402" })] })).toHaveLength(0);
    expect(
      attributePriceConversions({
        cells: [cell()],
        reservations: [booking({ checkIn: "2026-11-04", checkOut: "2026-11-06" })],
      }),
    ).toHaveLength(0);
  });

  it("이미 팔린 날의 가격을 바꾼 것은 전환이 아니다 — 그때 비어 있었어야 한다", () => {
    // 11/3 은 가격을 바꾸기 전부터 다른 예약이 차지하고 있었다(나중에 옮겨진 것이라 해도).
    const earlier = booking({ createdAtMs: T0 - 5 * H, id: "old", checkIn: "2026-11-03", checkOut: "2026-11-04" });
    expect(
      attributePriceConversions({
        cells: [cell()],
        reservations: [earlier, booking({ checkIn: "2026-11-03", checkOut: "2026-11-04" })],
      }).map((c) => c.reservationId),
    ).toEqual([]);
  });

  it("생성 시각을 모르는 예약은 「처음부터 있었다」로 센다 — 그 밤은 비어 있지 않았다", () => {
    const unknown = booking({ createdAtMs: null, id: "unknown", checkIn: "2026-11-03", checkOut: "2026-11-04" });
    expect(
      attributePriceConversions({
        cells: [cell()],
        reservations: [unknown, booking({ checkIn: "2026-11-03", checkOut: "2026-11-04" })],
      }),
    ).toHaveLength(0);
  });

  it("후보가 여럿이면 가장 최근 개입", () => {
    const [conversion] = attributePriceConversions({
      cells: [cell(), cell({ appliedAtMs: T0 + 10 * H, groupId: "job2", newValue: 37000, oldValue: 39000 })],
      reservations: [booking()],
    });
    expect(conversion.groupId).toBe("job2");
    expect(conversion.hoursToBooking).toBe(9.5);
  });

  it("이전 값을 모르면 % 는 비운다", () => {
    const [conversion] = attributePriceConversions({ cells: [cell({ oldValue: null })], reservations: [booking()] });
    expect(conversion.percent).toBeNull();
    expect(conversion.delta).toBeNull();
  });

  it("최근에 들어온 예약이 먼저", () => {
    const got = attributePriceConversions({
      cells: [cell(), cell({ roomKey: "A::402" })],
      reservations: [booking({ createdAtMs: T0 + 2 * H }), booking({ createdAtMs: T0 + 5 * H, id: "r2", roomKey: "A::402" })],
    });
    expect(got.map((c) => c.reservationId)).toEqual(["r2", "r1"]);
  });
});
