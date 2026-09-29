/**
 * 오늘 빈방만 — 판매 캘린더. **순수하다.**
 *
 * 도메인 계약: `docs/product/33-calendar-write-features.md` → 이식 상태 「오늘 빈방만」
 * 원본: STAY ARI Manager `roomsVacantTodaySet` (`BuildingCalendar.jsx`)
 *
 * 「오늘 밤」을 차지한 **살아 있는 예약**이 없는 방. 저쪽과 같이 —
 * - 취소된 예약은 안 센다.
 * - **차단(블록)은 안 센다** — 차단된 방도 「빈방」으로 남는다. 저쪽이 그렇게 했고, 판매 조정
 *   화면이라 막아 둔 방도 보여야 풀지 말지 판단한다.
 * - 오늘 체크아웃하는 예약은 오늘 밤을 차지하지 않는다(`checkIn ≤ 오늘 < checkOut`).
 */
export function opsVacantRoomKeys(args: {
  roomKeys: readonly string[];
  bars: ReadonlyArray<{ roomKey: string; checkIn: string; checkOut: string; isCancelled: boolean }>;
  /** 도쿄 운영일 `YYYY-MM-DD`. */
  today: string;
}): Set<string> {
  const booked = new Set<string>();
  for (const bar of args.bars) {
    if (bar.isCancelled) continue;
    if (bar.checkIn <= args.today && args.today < bar.checkOut) booked.add(bar.roomKey);
  }
  return new Set(args.roomKeys.filter((key) => !booked.has(key)));
}
