/**
 * 판매 캘린더의 BLOCK 막대 — 날짜별 「막힘」을 방마다 **이어진 구간**으로 묶는다. 순수하다.
 *
 * 도메인 계약: `docs/product/33-calendar-write-features.md` → 「차단은 12개월 전부 보인다」
 *
 * ## 왜 (2026-09-29)
 *
 * 예전 BLOCK 막대는 `room_blocks` 만 봤다. 그건 현장 예약 캘린더용 동기화라 **이번 달 + 2개월**만
 * 채운다(`room-blocks-sync.ts`). 판매 캘린더는 12개월을 보는데 그 너머의 Beds24 차단(예: 아라키초B
 * 2027-05-01~06-11)은 **빈 칸처럼** 보였다(2026-09-29 발견 — 사용자 결정: 12개월 전부 보이게).
 *
 * 격자는 이미 12개월 요금(`room_daily_rates`)을 읽고 있고, 거기에 칸마다 `override_kind` 가 있다.
 * 그걸로 막대를 그리고, 요금 칸이 없는 날만 `room_blocks` 로 채운다(판정은 `ops-calendar.ts`).
 * 끝이 열린 「판매 전」 차단도 숨기지 않는다 — 전부 보이게(사용자 결정).
 */

export type BlockRange = { id: string; roomKey: string; startDate: string; endDate: string };

/**
 * `dates` 는 화면의 연속 날짜(정렬됨). `isBlocked` 가 참인 밤이 이어지면 한 구간이다(양끝 포함).
 * 같은 입력이면 같은 id 가 나온다 — React 키가 매번 바뀌면 막대가 깜빡인다.
 */
export function buildBlockRanges(args: {
  roomKeys: readonly string[];
  dates: readonly string[];
  isBlocked: (roomKey: string, date: string) => boolean;
}): BlockRange[] {
  const ranges: BlockRange[] = [];
  for (const roomKey of args.roomKeys) {
    let start: string | null = null;
    let last: string | null = null;
    const flush = () => {
      if (start && last) ranges.push({ endDate: last, id: `block:${roomKey}:${start}`, roomKey, startDate: start });
      start = null;
      last = null;
    };
    for (const date of args.dates) {
      if (args.isBlocked(roomKey, date)) {
        if (start === null) start = date;
        last = date;
      } else {
        flush();
      }
    }
    flush();
  }
  return ranges;
}
