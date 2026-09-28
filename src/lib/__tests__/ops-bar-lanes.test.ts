import { describe, expect, it } from "vitest";
import { assignBarLanes, buildBarOverflowSegments, type LaneBar } from "@/lib/ops-bar-lanes";

/**
 * 예약 막대 층 배치.
 *
 * 계약: `src/lib/ops-bar-lanes.ts`
 * 원본: `BuildingCalendar.jsx` → `cancelledBarLaneMap`
 *
 * 층이 하나 어긋나면 막대가 겹치거나 빈 줄이 생기는데, 눈으로는 「원래 저런가」 싶어
 * 그냥 넘어간다. 그래서 테스트로 고정한다.
 */
const bar = (id: string, checkIn: string, checkOut: string, roomKey = "A"): LaneBar => ({
  checkIn,
  checkOut,
  id,
  roomKey,
});

describe("assignBarLanes", () => {
  it("안 겹치면 전부 0층", () => {
    const result = assignBarLanes([
      bar("a", "2026-10-01", "2026-10-03"),
      bar("b", "2026-10-05", "2026-10-07"),
    ]);
    expect(result.laneById.get("a")).toBe(0);
    expect(result.laneById.get("b")).toBe(0);
    expect(result.laneCountByRoom.get("A")).toBe(1);
  });

  it("겹치면 아래층으로 내린다", () => {
    const result = assignBarLanes([
      bar("a", "2026-10-01", "2026-10-05"),
      bar("b", "2026-10-03", "2026-10-07"),
    ]);
    expect(result.laneById.get("a")).toBe(0);
    expect(result.laneById.get("b")).toBe(1);
    expect(result.laneCountByRoom.get("A")).toBe(2);
  });

  it("체크아웃 날 밤은 비어 있다 — 맞닿으면 같은 층", () => {
    // 10/03 에 나가고 10/03 에 들어오면 그 밤은 하나뿐이다. 겹치지 않는다.
    const result = assignBarLanes([
      bar("a", "2026-10-01", "2026-10-03"),
      bar("b", "2026-10-03", "2026-10-05"),
    ]);
    expect(result.laneById.get("b")).toBe(0);
    expect(result.laneCountByRoom.get("A")).toBe(1);
  });

  it("층이 비면 다시 쓴다", () => {
    const result = assignBarLanes([
      bar("a", "2026-10-01", "2026-10-05"),
      bar("b", "2026-10-02", "2026-10-04"),
      bar("c", "2026-10-06", "2026-10-08"),
    ]);
    expect(result.laneById.get("a")).toBe(0);
    expect(result.laneById.get("b")).toBe(1);
    // a 가 10/05 에 끝났으므로 c 는 0층을 다시 쓴다 — 새 층을 만들지 않는다.
    expect(result.laneById.get("c")).toBe(0);
    expect(result.laneCountByRoom.get("A")).toBe(2);
  });

  it("다섯이 겹치면 다섯 층 — 실측 최댓값", () => {
    const bars: LaneBar[] = Array.from({ length: 5 }, (_, index) =>
      bar(`b${index}`, "2026-10-01", "2026-10-10"),
    );
    const result = assignBarLanes(bars);
    expect(new Set([...result.laneById.values()]).size).toBe(5);
    expect(result.laneCountByRoom.get("A")).toBe(5);
  });

  it("방마다 따로 센다", () => {
    const result = assignBarLanes([
      bar("a", "2026-10-01", "2026-10-05", "A"),
      bar("b", "2026-10-01", "2026-10-05", "B"),
    ]);
    expect(result.laneById.get("a")).toBe(0);
    expect(result.laneById.get("b")).toBe(0);
    expect(result.laneCountByRoom.get("A")).toBe(1);
    expect(result.laneCountByRoom.get("B")).toBe(1);
  });

  it("같은 날 시작하면 짧은 것을 먼저 — 층이 불필요하게 늘지 않게", () => {
    const result = assignBarLanes([
      bar("long", "2026-10-01", "2026-10-20"),
      bar("short1", "2026-10-01", "2026-10-02"),
      bar("short2", "2026-10-02", "2026-10-03"),
    ]);
    // 짧은 둘이 0층을 이어 쓰고, 긴 것이 1층으로 간다 → 2층이면 충분하다.
    expect(result.laneById.get("short1")).toBe(0);
    expect(result.laneById.get("short2")).toBe(0);
    expect(result.laneById.get("long")).toBe(1);
    expect(result.laneCountByRoom.get("A")).toBe(2);
  });

  it("넣은 순서가 뒤죽박죽이어도 결과가 같다", () => {
    const forward = assignBarLanes([
      bar("a", "2026-10-01", "2026-10-05"),
      bar("b", "2026-10-03", "2026-10-07"),
    ]);
    const backward = assignBarLanes([
      bar("b", "2026-10-03", "2026-10-07"),
      bar("a", "2026-10-01", "2026-10-05"),
    ]);
    expect(backward.laneById.get("a")).toBe(forward.laneById.get("a"));
    expect(backward.laneById.get("b")).toBe(forward.laneById.get("b"));
  });

  it("빈 입력은 빈 결과", () => {
    const result = assignBarLanes([]);
    expect(result.laneById.size).toBe(0);
    expect(result.laneCountByRoom.size).toBe(0);
  });
});

/**
 * 가려진 막대를 `+N` 으로 접기.
 *
 * 저쪽처럼 전부 쌓아 그리면 트랙이 세 배가 되고 줄이 늘어져 오히려 읽기 힘들다
 * (2026-09-28 사용자 지적). 0층만 그리고 나머지는 숫자로 남긴다.
 */
describe("buildBarOverflowSegments", () => {
  const segmentsOf = (bars: LaneBar[]) => buildBarOverflowSegments(bars, assignBarLanes(bars));

  it("겹치는 게 없으면 배지도 없다", () => {
    expect(
      segmentsOf([bar("a", "2026-10-01", "2026-10-03"), bar("b", "2026-10-05", "2026-10-07")]),
    ).toEqual([]);
  });

  it("가려진 막대가 덮는 밤에 배지가 선다", () => {
    // b 가 1층으로 밀린다. 덮는 밤은 10/03 · 10/04 두 밤(10/05 는 나가는 날).
    const segments = segmentsOf([
      bar("a", "2026-10-01", "2026-10-05"),
      bar("b", "2026-10-03", "2026-10-05"),
    ]);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      count: 1,
      endDate: "2026-10-04",
      roomKey: "A",
      startDate: "2026-10-03",
    });
    // 눌렀을 때는 **0층까지 포함해** 그 자리의 전부를 보여준다.
    expect(new Set(segments[0].barIds)).toEqual(new Set(["a", "b"]));
  });

  it("가려진 게 둘이면 +2", () => {
    const segments = segmentsOf([
      bar("a", "2026-10-01", "2026-10-10"),
      bar("b", "2026-10-01", "2026-10-10"),
      bar("c", "2026-10-01", "2026-10-10"),
    ]);
    expect(segments).toHaveLength(1);
    expect(segments[0].count).toBe(2);
    expect(segments[0].barIds).toHaveLength(3);
  });

  it("밤이 끊기면 배지를 나눈다 — 이어진 밤은 하나로 묶는다", () => {
    const segments = segmentsOf([
      bar("base", "2026-10-01", "2026-10-20"),
      bar("x", "2026-10-02", "2026-10-04"),
      bar("y", "2026-10-10", "2026-10-12"),
    ]);
    expect(segments.map((s) => `${s.startDate}~${s.endDate}`)).toEqual([
      "2026-10-02~2026-10-03",
      "2026-10-10~2026-10-11",
    ]);
  });

  it("방마다 따로 센다", () => {
    const segments = segmentsOf([
      bar("a1", "2026-10-01", "2026-10-05", "A"),
      bar("a2", "2026-10-01", "2026-10-05", "A"),
      bar("b1", "2026-10-01", "2026-10-05", "B"),
    ]);
    expect(segments.map((s) => s.roomKey)).toEqual(["A"]);
  });

  it("맞닿기만 하면 가려지지 않는다 — 배지도 없다", () => {
    expect(
      segmentsOf([bar("a", "2026-10-01", "2026-10-03"), bar("b", "2026-10-03", "2026-10-05")]),
    ).toEqual([]);
  });
});
