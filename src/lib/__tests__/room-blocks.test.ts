import { describe, expect, it } from "vitest";
import { blockCoversDate, collectBlockedRooms } from "@/lib/room-blocks";

/**
 * 「블락만 걸고 예약은 안 넣은」 방을 공실로 보여주지 않기 위한 판정 (2026-09-11).
 *
 * 판매만 막아 두는 운영이 실제로 자주 쓰인다. 그 방을 「빈 객실」로 보여주면 팔 수 있는 방으로
 * 오인한다. 어드민 객실 현황과 모바일 빈 객실 목록이 **같은 답**을 내야 해서 판정을 한곳에 모았다.
 */
describe("blockCoversDate — 양끝 포함", () => {
  const block = { startDate: "2026-09-23", endDate: "2026-09-26" };

  it("시작일과 종료일 자신도 막힌 밤이다", () => {
    // 예약(체크아웃 제외)과 규칙이 다른 지점. 종료일을 빼면 마지막 밤이 공실로 보인다.
    expect(blockCoversDate(block, "2026-09-23")).toBe(true);
    expect(blockCoversDate(block, "2026-09-26")).toBe(true);
  });

  it("가운데 날도 막혀 있다", () => {
    expect(blockCoversDate(block, "2026-09-24")).toBe(true);
    expect(blockCoversDate(block, "2026-09-25")).toBe(true);
  });

  it("구간 밖은 막히지 않았다", () => {
    expect(blockCoversDate(block, "2026-09-22")).toBe(false);
    expect(blockCoversDate(block, "2026-09-27")).toBe(false);
  });

  it("하루짜리 블락도 성립한다", () => {
    expect(blockCoversDate({ startDate: "2026-10-01", endDate: "2026-10-01" }, "2026-10-01")).toBe(true);
  });
});

describe("collectBlockedRooms", () => {
  // 스크린샷에서 확인한 실제 블락 (스테이아리 O202·O203 9/23~9/26).
  const blocks = [
    { endDate: "2026-09-26", roomLabel: "202", startDate: "2026-09-23" },
    { endDate: "2026-09-26", roomLabel: "203", startDate: "2026-09-23" },
    { endDate: "2026-10-03", roomLabel: "101", startDate: "2026-10-01" },
  ];

  it("기준일에 걸친 방만 모은다", () => {
    expect(collectBlockedRooms(blocks, "2026-09-24", (b) => b.roomLabel)).toEqual(
      new Set(["202", "203"]),
    );
    expect(collectBlockedRooms(blocks, "2026-10-02", (b) => b.roomLabel)).toEqual(new Set(["101"]));
  });

  it("아무 방도 안 막힌 날은 빈 집합", () => {
    expect(collectBlockedRooms(blocks, "2026-09-30", (b) => b.roomLabel).size).toBe(0);
  });

  it("키 뽑는 방식을 화면이 정한다 — 어드민은 「건물::방」 축을 쓴다", () => {
    const axisBlocks = [{ endDate: "2026-09-26", roomKey: "스테이아리::202", startDate: "2026-09-23" }];
    expect(collectBlockedRooms(axisBlocks, "2026-09-23", (b) => b.roomKey)).toEqual(
      new Set(["스테이아리::202"]),
    );
  });
});
