import { describe, expect, it } from "vitest";
import { buildRoomBlockWindow } from "@/lib/beds24/room-blocks-sync";

/**
 * 블락 조회 창 (2026-09-11).
 *
 * 예약 백필과 **같은 창**을 써야 한다. 창이 어긋나면 캘린더에 예약은 있는데 블락은 없는 달이
 * 생긴다. 그리고 창의 끝은 「판매 미오픈 blackout 을 버리는 기준」이기도 하다 — 구간의 끝이
 * 창 끝에 닿으면 차단이 아니라 미오픈으로 보고 건너뛴다.
 */
describe("buildRoomBlockWindow", () => {
  it("당월 1일부터 2개월 뒤 말일까지 (JST 기준)", () => {
    expect(buildRoomBlockWindow(new Date("2026-09-11T03:00:00Z"))).toEqual({
      from: "2026-09-01",
      to: "2026-11-30",
    });
  });

  it("연말을 넘어가도 해가 올바르게 넘어간다", () => {
    expect(buildRoomBlockWindow(new Date("2026-11-05T03:00:00Z"))).toEqual({
      from: "2026-11-01",
      to: "2027-01-31",
    });
    expect(buildRoomBlockWindow(new Date("2026-12-31T03:00:00Z"))).toEqual({
      from: "2026-12-01",
      to: "2027-02-28",
    });
  });

  it("UTC 로 전날이어도 도쿄 날짜 기준으로 달을 고른다", () => {
    // 2026-09-30 16:00 UTC = 2026-10-01 01:00 JST → 10월 창이어야 한다.
    expect(buildRoomBlockWindow(new Date("2026-09-30T16:00:00Z"))).toEqual({
      from: "2026-10-01",
      to: "2026-12-31",
    });
  });
});
