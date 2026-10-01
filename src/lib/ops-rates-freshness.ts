/**
 * 판매 캘린더 오른쪽 위 「가격 신선도」 문구 — 데스크톱 · 모바일 공용(2026-10-01).
 *
 * 도메인 계약: `docs/product/33-calendar-write-features.md` → 「가격 신선도 표시」
 *
 * 가격은 Beds24 가격 웹훅 + 화면을 열 때의 당겨오기로 들어온다. **15분 안**이면 「실시간 반영 중」으로 적는다 —
 * 예전처럼 「N분 전 기준」을 늘 적으면 몇 분 된 값도 옛 가격처럼 읽혔다(사용자 지적). 15분을 넘으면 그때는
 * 정말 낡은 것이니 몇 분 · 몇 시간 전 값인지 빨갛게 적는다(`isOpsRatesStale`).
 */
export const OPS_RATES_LIVE_MINUTES = 15;

export function isOpsRatesStale(ageMinutes: number | null): boolean {
  return ageMinutes === null || ageMinutes > OPS_RATES_LIVE_MINUTES;
}

export function opsRatesSyncedLabel(
  ageMinutes: number | null,
  copy: { syncedLive: string; syncedMinutes: string; syncedHours: string; syncedNever: string },
): string {
  if (ageMinutes === null) return copy.syncedNever;
  if (ageMinutes <= OPS_RATES_LIVE_MINUTES) return copy.syncedLive;
  if (ageMinutes < 60) return copy.syncedMinutes.replace("{n}", String(ageMinutes));
  return copy.syncedHours.replace("{n}", String(Math.floor(ageMinutes / 60)));
}
