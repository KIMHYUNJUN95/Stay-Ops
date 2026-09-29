import { describe, expect, it } from "vitest";
import { buildBlockRanges } from "@/lib/ops-block-ranges";

/**
 * BLOCK 막대 — 날짜별 막힘을 이어진 구간으로.
 *
 * 계약: `src/lib/ops-block-ranges.ts`
 * 예전에는 3개월 창의 `room_blocks` 만 봐서 그 너머 차단이 빈 칸으로 보였다(2026-09-29).
 */
const dates = ["2027-05-01", "2027-05-02", "2027-05-03", "2027-05-04", "2027-05-05"];

describe("buildBlockRanges", () => {
  it("이어진 밤은 한 구간 — 양끝 포함", () => {
    const blocked = new Set(["A|2027-05-02", "A|2027-05-03", "A|2027-05-04"]);
    expect(
      buildBlockRanges({ dates, isBlocked: (room, date) => blocked.has(`${room}|${date}`), roomKeys: ["A"] }),
    ).toEqual([{ endDate: "2027-05-04", id: "block:A:2027-05-02", roomKey: "A", startDate: "2027-05-02" }]);
  });

  it("끊기면 나눈다", () => {
    const blocked = new Set(["A|2027-05-01", "A|2027-05-03"]);
    const got = buildBlockRanges({ dates, isBlocked: (room, date) => blocked.has(`${room}|${date}`), roomKeys: ["A"] });
    expect(got.map((range) => [range.startDate, range.endDate])).toEqual([
      ["2027-05-01", "2027-05-01"],
      ["2027-05-03", "2027-05-03"],
    ]);
  });

  it("창 끝까지 이어지는 차단(판매 전)도 숨기지 않는다", () => {
    const got = buildBlockRanges({ dates, isBlocked: (_, date) => date >= "2027-05-03", roomKeys: ["A"] });
    expect(got).toEqual([{ endDate: "2027-05-05", id: "block:A:2027-05-03", roomKey: "A", startDate: "2027-05-03" }]);
  });

  it("방마다 따로", () => {
    const got = buildBlockRanges({ dates, isBlocked: (room) => room === "B", roomKeys: ["A", "B"] });
    expect(got.map((range) => range.roomKey)).toEqual(["B"]);
  });
});
