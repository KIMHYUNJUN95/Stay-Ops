import { describe, expect, it } from "vitest";
import { groupLocalRatePatches, planPriceJobResume } from "@/lib/beds24/price-job-worker";
import { mismatchFailure } from "@/lib/beds24/price-write-verification";

/**
 * 가격·최소숙박 워커 — 쿨다운에 걸려 다시 대기로 돌린 작업을 이어 돌기 · 로컬 반영 묶기.
 *
 * 계약: `src/lib/beds24/price-job-worker.ts` — `planPriceJobResume` · `groupLocalRatePatches`
 */

const update = (externalRoomId: string, dates: Record<string, { p1?: number; m?: number }> = { "2026-10-01": { p1: 10000 } }) => ({
  dates,
  externalRoomId,
  roomLabel: null,
});

describe("planPriceJobResume", () => {
  it("처음 도는 작업은 건너뛸 것이 없다", () => {
    const plan = planPriceJobResume([{ results: [], roomUpdates: [update("A"), update("B")] }]);
    expect(plan.carried).toEqual([]);
    expect([...plan.skip]).toEqual([]);
  });

  it("쿨다운 전에 끝낸 객실(성공·실패)은 건너뛰고 결과를 이어 붙인다 — 못 보낸 객실만 다시", () => {
    const results = [
      { error: null, externalRoomId: "A", success: true },
      { error: "room_rejected", externalRoomId: "B", success: false },
    ];
    const plan = planPriceJobResume([
      { results, roomUpdates: [update("A"), update("B"), update("C")] },
    ]);
    expect([...plan.skip].sort()).toEqual(["A", "B"]);
    expect(plan.carried).toEqual(results);
  });

  it("흡수한 형제의 결과도 본다 — 같은 결과를 함께 받았다", () => {
    const results = [{ error: null, externalRoomId: "B", success: true }];
    const plan = planPriceJobResume([
      { results, roomUpdates: [update("A")] },
      { results, roomUpdates: [update("B")] },
    ]);
    expect([...plan.skip]).toEqual(["B"]);
  });

  it("새로 흡수된 작업이 같은 객실을 고쳤으면 다시 보낸다 — 합친 값이 바뀌었다", () => {
    const plan = planPriceJobResume([
      { results: [{ error: null, externalRoomId: "A", success: true }], roomUpdates: [update("A")] },
      { results: [], roomUpdates: [update("A", { "2026-10-01": { p1: 12000 } })] },
    ]);
    expect([...plan.skip]).toEqual([]);
    expect(plan.carried).toEqual([]);
  });

  it("이번 대상이 아닌 객실의 결과는 가져오지 않는다", () => {
    const plan = planPriceJobResume([
      { results: [{ error: null, externalRoomId: "Z", success: true }], roomUpdates: [update("A")] },
    ]);
    expect(plan.carried).toEqual([]);
  });
});

describe("groupLocalRatePatches", () => {
  const rooms = new Map([["A", "uuid-a"], ["B", "uuid-b"]]);

  it("같은 열 모양이면 한 번에 — 객실을 가로질러 묶는다", () => {
    const groups = groupLocalRatePatches({
      organizationId: "org",
      roomIdByExternal: rooms,
      syncedAt: "2026-09-30T00:00:00.000Z",
      updates: [update("A", { "2026-10-01": { p1: 1 }, "2026-10-02": { p1: 2 } }), update("B")],
    });
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(3);
    expect(groups[0][0]).toEqual({
      organization_id: "org",
      price1: 1,
      room_id: "uuid-a",
      stay_date: "2026-10-01",
      synced_at: "2026-09-30T00:00:00.000Z",
    });
  });

  it("열 모양이 다르면 가른다 — 섞으면 안 보낸 열이 null 로 지워진다", () => {
    const groups = groupLocalRatePatches({
      organizationId: "org",
      roomIdByExternal: rooms,
      syncedAt: "t",
      updates: [update("A", { "2026-10-01": { p1: 1 }, "2026-10-02": { m: 2 } })],
    });
    expect(groups).toHaveLength(2);
    expect(groups.map((rows) => Object.keys(rows[0]).sort())).toEqual([
      ["organization_id", "price1", "room_id", "stay_date", "synced_at"],
      ["min_stay", "organization_id", "room_id", "stay_date", "synced_at"],
    ]);
  });

  it("우리 방 마스터에 없는 유닛은 건너뛴다", () => {
    expect(
      groupLocalRatePatches({ organizationId: "org", roomIdByExternal: rooms, syncedAt: "t", updates: [update("X")] }),
    ).toEqual([]);
  });
});

describe("mismatchFailure", () => {
  it("문구가 아니라 코드 + 개수 + 첫 건", () => {
    expect(
      mismatchFailure([
        { actual: 45000, date: "2027-02-13", expected: 41580, field: "price1" },
        { actual: null, date: "2027-02-14", expected: 41580, field: "price1" },
      ]),
    ).toEqual({
      error: "verify_mismatch",
      params: { actual: 45000, date: "2027-02-13", expected: 41580, field: "price1", n: 2 },
    });
  });

  it("없는 값은 빈 문자열", () => {
    expect(mismatchFailure([{ actual: null, date: "2026-11-26", expected: 2, field: "minStay" }]).params).toMatchObject({
      actual: "",
    });
  });
});
