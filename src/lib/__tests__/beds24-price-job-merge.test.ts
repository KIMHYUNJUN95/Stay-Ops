import { describe, expect, it } from "vitest";
import {
  isWithinCoalesceWindow,
  mergePriceJobRoomUpdates,
  type MergeableJob,
} from "@/lib/beds24/price-job-merge";

/**
 * 작업 합치기.
 *
 * 틀리면 **중간 상태가 채널로 나간다** — 5만원으로 바꿨다가 6만원으로 바꿨는데 5만원이
 * 실제로 팔릴 수 있다. 순서가 결과를 바꾸면 안 된다.
 *
 * 계약: docs/product/33-calendar-write-features.md 「작업 큐」
 */

function job(id: string, createdAt: string, dates: Record<string, { p1?: number; m?: number }>): MergeableJob {
  return {
    createdAt,
    id,
    roomUpdates: [{ dates, externalRoomId: "450096", roomLabel: "오쿠보C" }],
  };
}

describe("isWithinCoalesceWindow", () => {
  it("2분 안이면 합친다", () => {
    expect(isWithinCoalesceWindow("2026-09-24T10:00:00Z", "2026-09-24T10:01:30Z")).toBe(true);
  });

  it("2분을 넘으면 안 합친다 — 오래된 작업이 빨려 들어오면 안 된다", () => {
    expect(isWithinCoalesceWindow("2026-09-24T10:00:00Z", "2026-09-24T10:03:00Z")).toBe(false);
  });

  it("앞뒤 순서와 무관하다", () => {
    expect(isWithinCoalesceWindow("2026-09-24T10:01:30Z", "2026-09-24T10:00:00Z")).toBe(true);
  });
});

describe("mergePriceJobRoomUpdates", () => {
  it("같은 날짜는 **나중 작업**이 이긴다", () => {
    const merged = mergePriceJobRoomUpdates([
      job("a", "2026-09-24T10:00:00Z", { "2026-10-01": { p1: 50000 } }),
      job("b", "2026-09-24T10:01:00Z", { "2026-10-01": { p1: 60000 } }),
    ]);
    expect(merged[0].dates["2026-10-01"]).toEqual({ p1: 60000 });
  });

  it("입력 순서가 바뀌어도 결과가 같다", () => {
    // 워커가 어떤 순서로 집어 오든 같은 값이 나가야 한다.
    const a = job("a", "2026-09-24T10:00:00Z", { "2026-10-01": { p1: 50000 } });
    const b = job("b", "2026-09-24T10:01:00Z", { "2026-10-01": { p1: 60000 } });
    expect(mergePriceJobRoomUpdates([a, b])).toEqual(mergePriceJobRoomUpdates([b, a]));
  });

  it("서로 다른 날짜는 둘 다 남는다", () => {
    const merged = mergePriceJobRoomUpdates([
      job("a", "2026-09-24T10:00:00Z", { "2026-10-01": { p1: 50000 } }),
      job("b", "2026-09-24T10:01:00Z", { "2026-10-02": { p1: 60000 } }),
    ]);
    expect(Object.keys(merged[0].dates).sort()).toEqual(["2026-10-01", "2026-10-02"]);
  });

  it("같은 날짜는 **항목별로 섞지 않고 통째로** 덮는다", () => {
    // 뒤 작업의 의도가 「이 날짜는 최소숙박만 건드린다」이므로 그대로 둔다.
    const merged = mergePriceJobRoomUpdates([
      job("a", "2026-09-24T10:00:00Z", { "2026-10-01": { p1: 50000 } }),
      job("b", "2026-09-24T10:01:00Z", { "2026-10-01": { m: 1 } }),
    ]);
    expect(merged[0].dates["2026-10-01"]).toEqual({ m: 1 });
  });

  it("객실이 다르면 따로 모은다", () => {
    const merged = mergePriceJobRoomUpdates([
      { createdAt: "2026-09-24T10:00:00Z", id: "a", roomUpdates: [
        { dates: { "2026-10-01": { p1: 1 } }, externalRoomId: "450096", roomLabel: null },
        { dates: { "2026-10-01": { p1: 2 } }, externalRoomId: "383971", roomLabel: null },
      ] },
    ]);
    expect(merged).toHaveLength(2);
  });

  it("라벨은 있는 쪽을 남긴다", () => {
    const merged = mergePriceJobRoomUpdates([
      { createdAt: "2026-09-24T10:00:00Z", id: "a", roomUpdates: [
        { dates: { "2026-10-01": { p1: 1 } }, externalRoomId: "450096", roomLabel: null },
      ] },
      { createdAt: "2026-09-24T10:01:00Z", id: "b", roomUpdates: [
        { dates: { "2026-10-02": { p1: 2 } }, externalRoomId: "450096", roomLabel: "오쿠보C" },
      ] },
    ]);
    expect(merged[0].roomLabel).toBe("오쿠보C");
  });

  it("빈 목록이면 빈 결과", () => {
    expect(mergePriceJobRoomUpdates([])).toEqual([]);
  });
});
