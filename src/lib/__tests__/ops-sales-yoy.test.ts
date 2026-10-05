import { describe, expect, it } from "vitest";
import { buildOpsSalesSummary } from "@/lib/ops-sales-summary";
import { buildSalesYoy, shiftDateYear } from "@/lib/ops-sales-yoy";

describe("shiftDateYear", () => {
  it("moves to the same date one year back, clamping 2/29", () => {
    expect(shiftDateYear("2026-10-01", -1)).toBe("2025-10-01");
    expect(shiftDateYear("2028-02-29", -1)).toBe("2027-02-28");
    expect(shiftDateYear("2027-01-01", -1)).toBe("2026-01-01");
  });
});

describe("buildSalesYoy", () => {
  const room = (key: string, propertyName: string) => ({ inCatalog: true, key, label: key.split("::")[1], propertyName });
  const stay = (id: string, roomKey: string, price: number) => ({
    checkIn: "2026-10-05",
    checkOut: "2026-10-07",
    id,
    propertyName: roomKey.split("::")[0],
    raw: { price, referer: "Airbnb", status: "1" },
    roomKey,
    status: "confirmed",
  });
  const current = buildOpsSalesSummary({
    blocks: [],
    endExclusive: "2026-11-01",
    properties: ["A", "N"],
    reservations: [stay("1", "A::101", 30000), stay("2", "A::102", 20000), stay("3", "N::1", 50000)],
    rooms: [room("A::101", "A"), room("A::102", "A"), room("N::1", "N"), room("N::2", "N")],
    start: "2026-10-01",
    today: "2026-10-01",
  });
  const previous = {
    endExclusive: "2025-11-01",
    firstStay: { A: "2023-01-01", N: "2026-08-05" },
    rooms: [
      { key: "A::101", propertyName: "A", revenue: 25000 },
      { key: "A::102", propertyName: "A", revenue: 0 },
      { key: "N::1", propertyName: "N", revenue: 0 },
    ],
    start: "2025-10-01",
  };

  it("splits the change into existing rooms and rooms with no sales last year", () => {
    const yoy = buildSalesYoy({ current, included: () => true, previous });
    expect(yoy.currentRevenue).toBe(100000);
    expect(yoy.previousRevenue).toBe(25000);
    expect(yoy.changePct).toBeCloseTo(300, 9);
    expect(yoy.comparable).toMatchObject({ current: 30000, previous: 25000, roomCount: 1 });
    expect(yoy.newRooms.count).toBe(2);
    expect(yoy.newRooms.revenue).toBe(70000);
    // 차이 = 기존 객실 증감 + 전년 매출 없던 객실.
    expect(yoy.currentRevenue - yoy.previousRevenue).toBe(yoy.comparable.current - yoy.comparable.previous + yoy.newRooms.revenue);
    const [a, n] = yoy.newRooms.groups;
    expect(a).toMatchObject({ propertyName: "A", reason: "no_sales", wholeBuilding: false });
    expect(a.rooms.map((r) => r.key)).toEqual(["A::102"]);
    expect(n).toMatchObject({ firstStay: "2026-08-05", propertyName: "N", reason: "not_open", wholeBuilding: true });
  });

  it("respects the buildings in the totals and returns null change without last-year sales", () => {
    const onlyN = buildSalesYoy({ current, included: (name) => name === "N", previous });
    expect(onlyN.previousRevenue).toBe(0);
    expect(onlyN.changePct).toBeNull();
    expect(onlyN.newRooms.groups.map((g) => g.propertyName)).toEqual(["N"]);
  });
});
