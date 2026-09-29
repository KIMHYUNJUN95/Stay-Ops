/**
 * Beds24 실시간 신호 — 서버와 브라우저가 같이 쓰는 이름. **순수하다.**
 *
 * 도메인 계약: `docs/product/33-calendar-write-features.md` → 「화면도 웹훅 기준으로」
 *
 * Beds24 데이터(예약·요금·차단)가 우리 표에 들어오면 서버가 조직 채널로 **신호 하나**를 보낸다
 * (Supabase Realtime broadcast). 신호에는 데이터가 없다 — 「바뀌었다」뿐이다. 받은 화면은 서버
 * 컴포넌트를 다시 불러(`router.refresh()`) 평소와 같은 권한·조직 검사로 새 값을 읽는다.
 *
 * 표마다 postgres 변경 알림을 켜지 않는 이유: 재고 웹훅 한 번에 요금 12개월(건물당 ~9,500행)을
 * 다시 쓰므로 알림이 행 수만큼 쏟아진다.
 */

export const BEDS24_LIVE_EVENT = "changed";

export type Beds24LiveKind = "reservations" | "rates" | "blocks";

export function beds24LiveTopic(organizationId: string): string {
  return `beds24-live:${organizationId}`;
}
