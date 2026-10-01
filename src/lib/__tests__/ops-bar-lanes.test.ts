import { describe, expect, it } from "vitest";
import { assignBarLanes, assignBlockLanes, type LaneBar } from "@/lib/ops-bar-lanes";

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

describe("assignBlockLanes — 차단이 예약과 겹치면 아래층", () => {
  const bar = (checkIn: string, checkOut: string, lane = 0) => ({ checkIn, checkOut, lane });
  const block = (id: string, startDate: string, endDate: string) => ({ id, startDate, endDate });

  it("예약 없는 밤의 차단은 0층 — 평소 모습 그대로", () => {
    const result = assignBlockLanes([bar("2026-10-01", "2026-10-03")], [block("b", "2026-10-05", "2026-10-06")]);
    expect(result.laneById.get("b")).toBe(0);
    expect(result.laneCount).toBe(1);
  });

  it("예약이 있는 밤에 건 차단은 1층으로 내려간다(바바 9: Kira Turner 위 BLOCK)", () => {
    const result = assignBlockLanes(
      [bar("2026-09-30", "2026-10-01"), bar("2026-10-01", "2026-10-05")],
      [block("b", "2026-10-01", "2026-10-01")],
    );
    expect(result.laneById.get("b")).toBe(1);
    expect(result.laneCount).toBe(2);
  });

  it("체크아웃 날부터 건 차단은 아래층 — 막대가 체크아웃 칸 앞 절반에서 겹친다(아라키초A 302 Théo Mourian)", () => {
    const result = assignBlockLanes([bar("2026-09-28", "2026-10-05")], [block("b", "2026-10-05", "2026-10-06")]);
    expect(result.laneById.get("b")).toBe(1);
    expect(result.laneCount).toBe(2);
  });

  it("체크인 전날에 끝나는 차단도 겹치지 않는다", () => {
    const result = assignBlockLanes([bar("2026-10-03", "2026-10-05")], [block("b", "2026-10-01", "2026-10-02")]);
    expect(result.laneById.get("b")).toBe(0);
  });

  it("취소 보기의 층이 이미 있으면 그 아래 빈 층을 찾는다", () => {
    const result = assignBlockLanes(
      [bar("2026-10-01", "2026-10-04", 0), bar("2026-10-02", "2026-10-03", 1)],
      [block("b", "2026-10-02", "2026-10-02")],
    );
    expect(result.laneById.get("b")).toBe(2);
    expect(result.laneCount).toBe(3);
  });

  it("겹치는 차단끼리도 층을 나눈다", () => {
    const result = assignBlockLanes(
      [bar("2026-10-01", "2026-10-05")],
      [block("a", "2026-10-02", "2026-10-03"), block("b", "2026-10-03", "2026-10-04")],
    );
    expect(result.laneById.get("a")).toBe(1);
    expect(result.laneById.get("b")).toBe(2);
  });
});
