/**
 * 큰방 위쪽 정렬 — 판매 캘린더. **순수하다.**
 *
 * 도메인 계약: `docs/product/33-calendar-write-features.md` → 「큰방 위쪽 정렬」
 * 원본: STAY ARI Manager `29e714c` (`LARGE_ROOMS_BY_BUILDING`, 2026-09-25)
 *
 * 운영상 큰방을 먼저 확인하는 일이 많아 **그 건물 안에서** 큰방을 위로 모은다. 대상은
 * **STAY ARI Apartment Hotel 하나뿐**이다(2026-09-29 사용자 확인). 다른 건물은 순서가 그대로다.
 *
 * 바꾸는 것은 **표시 순서뿐**이다 — 격자의 계산(갭·점유·레인)은 전부 행 키로 하므로 순서가 달라도
 * 결과가 같다. 드래그 선택도 이 순서를 그대로 써야 화면과 어긋나지 않는다(격자가 정렬된 목록을
 * 한 번만 만들어 모든 곳에 쓴다).
 */

/** 건물 표시 이름 → 큰방 번호. 객실명의 앞 `O`(STAY ARI 표기)는 떼고 비교한다. */
export const OPS_LARGE_ROOMS_BY_PROPERTY: Readonly<Record<string, readonly string[]>> = {
  "STAY ARI Apartment Hotel": ["101", "102", "201", "202", "302"],
};

function roomNumber(label: string): string {
  return label.trim().replace(/^O/i, "");
}

export function isOpsLargeRoom(propertyName: string, displayRoomLabel: string): boolean {
  const large = OPS_LARGE_ROOMS_BY_PROPERTY[propertyName];
  return !!large && large.includes(roomNumber(displayRoomLabel));
}

/** 이 목록에 큰방이 하나라도 있나 — 토글을 보일지 정한다. */
export function hasOpsLargeRooms(rooms: ReadonlyArray<{ propertyName: string; displayRoomLabel: string }>): boolean {
  return rooms.some((room) => isOpsLargeRoom(room.propertyName, room.displayRoomLabel));
}

/**
 * 각 건물 묶음 안에서 큰방을 앞으로(큰방끼리·나머지끼리는 원래 순서). 건물 순서는 그대로다.
 * 옮길 것이 없으면 **받은 배열을 그대로** 돌려준다(불필요한 재계산을 막는다).
 */
export function orderOpsLargeRoomsFirst<T extends { propertyName: string; displayRoomLabel: string }>(
  rooms: readonly T[],
): readonly T[] {
  if (!hasOpsLargeRooms(rooms)) return rooms;
  const groups: { property: string; large: T[]; rest: T[] }[] = [];
  for (const room of rooms) {
    let group = groups.at(-1);
    if (!group || group.property !== room.propertyName) {
      group = { large: [], property: room.propertyName, rest: [] };
      groups.push(group);
    }
    (isOpsLargeRoom(room.propertyName, room.displayRoomLabel) ? group.large : group.rest).push(room);
  }
  return groups.flatMap((group) => [...group.large, ...group.rest]);
}
