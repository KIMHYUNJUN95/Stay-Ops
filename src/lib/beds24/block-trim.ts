/**
 * 차단을 풀 때 `room_blocks` 구간에서 **푼 밤만 잘라 낸다** — 순수(2026-10-06).
 *
 * 문서: docs/product/33-calendar-write-features.md → 「차단 해제는 구간을 잘라 낸다」
 *
 * 전에는 「시작일이 똑같고 첫 유닛 이름인 줄」만 지웠다. 그래서 10/5~10/6 차단에서 10/6 만 풀면(시작일 10/5 ≠ 10/6) 줄이
 * 그대로 남았고, 두 유닛짜리 방(302 · 302_2)은 두 번째 유닛 줄이 늘 남았다. 수기 예약의 겹침 검사가 이 줄을 보고 푼 밤을
 * 「이미 찬 밤」으로 막았다(아라키초A 302, 2026-10-06 사용자 신고). 블록은 양끝을 포함한다.
 */
export type TrimmableBlock = { id: string; start_date: string; end_date: string };

function shift(date: string, days: number): string {
  const at = new Date(`${date}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

export function trimBlockRows<T extends TrimmableBlock>(
  rows: readonly T[],
  range: { startDate: string; endDate: string },
): { deleteIds: string[]; keep: Array<T & { start_date: string; end_date: string }> } {
  const deleteIds: string[] = [];
  const keep: Array<T & { start_date: string; end_date: string }> = [];
  for (const row of rows) {
    if (row.end_date < range.startDate || row.start_date > range.endDate) continue;
    deleteIds.push(row.id);
    if (row.start_date < range.startDate) keep.push({ ...row, end_date: shift(range.startDate, -1) });
    if (row.end_date > range.endDate) keep.push({ ...row, start_date: shift(range.endDate, 1) });
  }
  return { deleteIds, keep };
}
