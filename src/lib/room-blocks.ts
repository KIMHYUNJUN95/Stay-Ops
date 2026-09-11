/**
 * 차단 구간 판정 (2026-09-11).
 *
 * 블락의 `startDate`~`endDate` 는 **막힌 밤의 범위이며 양끝을 포함한다** — 9/23~9/26 이면
 * 23·24·25·26 네 밤이다. 예약(`check_out_date` 제외)과 규칙이 달라서, 같은 판정을 화면마다
 * 손으로 쓰면 한쪽만 어긋난다. 어드민 객실 현황과 모바일 「오늘 빈 객실」이 같은 답을 내야 한다.
 */

export type RoomBlockRange = {
  endDate: string;
  startDate: string;
};

/** 그 날 밤이 막혀 있는가. 양끝 포함. */
export function blockCoversDate(block: RoomBlockRange, date: string): boolean {
  return block.startDate <= date && date <= block.endDate;
}

/**
 * 기준일에 막혀 있는 방을 모은다.
 *
 * 방을 무엇으로 식별할지는 화면마다 다르다 — 어드민 캘린더는 `건물::방` 축 키를 쓰고, 모바일은
 * 방 이름만 쓴다. 그래서 키 뽑는 함수를 받는다.
 */
export function collectBlockedRooms<T extends RoomBlockRange>(
  blocks: readonly T[],
  date: string,
  toKey: (block: T) => string,
): Set<string> {
  const blocked = new Set<string>();
  for (const block of blocks) {
    if (blockCoversDate(block, date)) blocked.add(toKey(block));
  }
  return blocked;
}
