/**
 * 요금 동기화가 **우리가 방금 쓴 값을 옛 값으로 되돌리지 않게**. **순수하다.**
 *
 * 도메인 계약: `docs/product/33-calendar-write-features.md` → 「동기화가 방금 쓴 값을 되돌리던 것」
 *
 * 2026-09-30 실측: 우리 앱이 08:08~08:11(도쿄)에 최소숙박 3칸을 쓰고 Beds24 되읽기로 확인까지 했는데,
 * 08:32 에 판매 캘린더를 열 때 돈 요금 새로고침이 세 칸 모두 **쓰기 전 값**을 받아 우리 표를 덮었다.
 * Beds24 에는 우리 값이 그대로 있었다. 같은 조회 주소에 대한 Beds24 쪽 캐시로 보이지만(확정은 못 함),
 * 원인과 무관하게 막는다.
 *
 * 규칙: 동기화가 받은 값이 **최근 우리 작업이 쓴 값**(가격 `price1` · 최소숙박)과 다르면 그 칸은 믿지
 * 않는다 — 호출부가 객실 단위로 **다시 읽어**(캐시 우회) 그 값을 쓰고, 다시 읽지 못하면 그 칸은 덮지
 * 않는다. 그 사이 사람이 Beds24 에서 정말 바꿨다면 다시 읽은 값이 그걸 가져온다.
 */

export type RecentWrite = {
  roomId: string;
  stayDate: string;
  field: "price1" | "min_stay";
  value: number;
  /** ISO — 같은 칸에 여러 번 썼으면 **마지막**이 기준이다. */
  at: string;
};

export type SyncedRateRow = {
  room_id: string;
  stay_date: string;
  price1: number | null;
  min_stay: number | null;
};

/** 최근 쓰기와 어긋나는 칸(`roomId|YYYY-MM-DD`). */
export function findRowsContradictingRecentWrites(
  rows: ReadonlyArray<SyncedRateRow>,
  writes: ReadonlyArray<RecentWrite>,
): Set<string> {
  const latest = new Map<string, RecentWrite>();
  for (const write of writes) {
    const key = `${write.roomId}|${write.stayDate}|${write.field}`;
    const previous = latest.get(key);
    if (!previous || previous.at < write.at) latest.set(key, write);
  }
  const conflicts = new Set<string>();
  for (const row of rows) {
    for (const field of ["price1", "min_stay"] as const) {
      const write = latest.get(`${row.room_id}|${row.stay_date}|${field}`);
      if (write && row[field] !== write.value) conflicts.add(`${row.room_id}|${row.stay_date}`);
    }
  }
  return conflicts;
}
