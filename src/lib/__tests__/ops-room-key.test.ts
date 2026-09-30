import { describe, expect, it } from "vitest";
import { opsUnitRoomKey, resolveOpsRowRoomKey, type OpsOwnedUnit } from "@/lib/ops-room-key";

/**
 * 판매 캘린더 쓰기 액션은 화면이 보낸 행 키를 믿지 않고 **서버가 다시 계산한다**.
 * 계약: `src/lib/ops-room-key.ts`
 */
describe("opsUnitRoomKey", () => {
  it("builds `building::display label`", () => {
    expect(opsUnitRoomKey({ propertyName: "Test Bldg", roomLabel: "101" })).toBe("Test Bldg::101");
  });

  it("falls back to Unknown when the property name is missing", () => {
    expect(opsUnitRoomKey({ propertyName: null, roomLabel: "101" })).toBe("Unknown::101");
  });
});

describe("resolveOpsRowRoomKey", () => {
  const a: OpsOwnedUnit = { id: "a", propertyName: "Test Bldg", roomLabel: "101" };
  const b: OpsOwnedUnit = { id: "b", propertyName: "Test Bldg", roomLabel: "102" };
  const keyA = opsUnitRoomKey(a)!;

  it("accepts owned units whose server key matches the client key", () => {
    expect(resolveOpsRowRoomKey({ clientRoomKey: keyA, ownedUnits: [a, b], requestedRoomIds: ["a", "a"] })).toEqual({
      ok: true,
      roomIds: ["a"],
      roomKey: keyA,
    });
  });

  it("rejects when the client key differs from the server key", () => {
    expect(
      resolveOpsRowRoomKey({ clientRoomKey: opsUnitRoomKey(b)!, ownedUnits: [a], requestedRoomIds: ["a"] }).ok,
    ).toBe(false);
  });

  it("rejects a requested unit that is not in the caller's organization", () => {
    expect(resolveOpsRowRoomKey({ clientRoomKey: keyA, ownedUnits: [a], requestedRoomIds: ["a", "other-org"] }).ok).toBe(
      false,
    );
  });

  it("rejects units that belong to different rows", () => {
    expect(resolveOpsRowRoomKey({ clientRoomKey: keyA, ownedUnits: [a, b], requestedRoomIds: ["a", "b"] }).ok).toBe(
      false,
    );
  });

  it("rejects an empty request", () => {
    expect(resolveOpsRowRoomKey({ clientRoomKey: keyA, ownedUnits: [a], requestedRoomIds: [] }).ok).toBe(false);
  });
});
