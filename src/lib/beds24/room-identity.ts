/**
 * 이미 있는 방에 덮어쓸 값. **가격 소스를 모르면(`undefined`) 그 칸을 아예 빼서** 저장된 링크를
 * 지키고, 아는 경우(`null` 포함)에만 갱신한다 — `room-sync.ts` 의 `upsertRoom` · `priceSourceRoomId` 참고.
 */
export function buildRoomIdentityUpdate(
  shared: {
    organization_id: string;
    property_id: string;
    external_provider: "beds24";
    external_room_id: string | null;
  },
  priceSourceRoomId: string | null | undefined,
) {
  return {
    organization_id: shared.organization_id,
    property_id: shared.property_id,
    external_provider: shared.external_provider,
    external_room_id: shared.external_room_id,
    ...(priceSourceRoomId === undefined ? {} : { external_price_source_room_id: priceSourceRoomId }),
  };
}
