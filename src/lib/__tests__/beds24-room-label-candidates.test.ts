import { describe, expect, it } from "vitest";
import { roomLabelCandidates } from "@/lib/beds24/room-label-candidates";

/**
 * 회귀 테스트 — 아라키초A 401호가 통째로 사라졌던 건 (2026-09-17).
 *
 * Beds24 property 176430 에는 401호 유닛이 둘(`440617` · `515300`) 있는데 **이름이 같다.**
 * 예전 `upsertRoom` 은 `onConflict: "organization_id,room_label"` 로 upsert 해서 두 번째 방이
 * 첫 번째 행을 **덮어썼다** — 에러도 `skipped` 도 없이 방 하나가 증발했고, `515300` 으로 들어온
 * 예약 78건이 `room_label = "(unknown)"` 으로 쌓였다.
 *
 * 이제 `external_room_id` 로 방을 찾고, 라벨이 겹치면 접미사를 붙여 **각자 행을 갖는다.**
 * 접미사 규칙은 우리가 만든 게 아니라 Beds24 가 이미 쓰는 것이다(`201` / `201_2`).
 */
describe("roomLabelCandidates", () => {
  it("첫 후보는 Beds24 가 준 이름 그대로다", () => {
    // 겹치지 않는 대부분의 방이 접미사를 받으면 안 된다. 순서가 곧 규칙이다.
    expect(roomLabelCandidates("401")[0]).toBe("401");
  });

  it("겹치면 _2, _3 순으로 이어진다", () => {
    expect(roomLabelCandidates("401").slice(0, 3)).toEqual(["401", "401_2", "401_3"]);
  });

  it("Beds24 가 이미 쓰는 접미사 형식과 같다", () => {
    // 아라키초A 듀얼 유닛이 실제로 `201` / `201_2` 로 내려온다. 표시 계층(`getDisplayRoomLabel`)이
    // `_N` 을 떼어 한 행으로 합치므로, 우리가 붙이는 접미사도 같은 모양이어야 한다.
    expect(roomLabelCandidates("201")).toContain("201_2");
  });

  it("무한히 시도하지 않는다", () => {
    // 상한이 없으면 라벨이 전부 잡힌 상황에서 쿼리를 끝없이 던진다.
    const candidates = roomLabelCandidates("101");
    expect(candidates.length).toBeGreaterThan(1);
    expect(candidates.length).toBeLessThanOrEqual(9);
    expect(new Set(candidates).size).toBe(candidates.length);
  });
});
