import { describe, expect, it } from "vitest";
import { buildRoomIdentityUpdate } from "@/lib/beds24/room-identity";

/**
 * 방 정보 갱신이 **가격 링크를 지우지 않는다** (2026-09-29 회귀).
 *
 * 예약 웹훅 경로는 가격 규칙을 모른다. 예전에는 기본값 `null` 로 덮어써서 웹훅이 올 때마다
 * 그 유닛의 가격 소스 링크가 지워졌다(판매 유닛 17개). 모르면 칸을 빼야 한다.
 */
const shared = {
  external_provider: "beds24" as const,
  external_room_id: "648399",
  organization_id: "org",
  property_id: "prop",
};

describe("buildRoomIdentityUpdate", () => {
  it("가격 소스를 모르면(웹훅) 그 칸을 아예 보내지 않는다 — 저장된 링크를 지킨다", () => {
    expect(buildRoomIdentityUpdate(shared, undefined)).not.toHaveProperty("external_price_source_room_id");
  });

  it("방 마스터 동기화가 링크를 알려 주면 갱신한다", () => {
    expect(buildRoomIdentityUpdate(shared, "450096")).toMatchObject({
      external_price_source_room_id: "450096",
    });
  });

  it("「소스가 없다(자기가 소스)」도 명시적으로 알려 주면 반영한다", () => {
    expect(buildRoomIdentityUpdate(shared, null)).toMatchObject({ external_price_source_room_id: null });
  });
});
