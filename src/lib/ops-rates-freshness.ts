/**
 * 판매 캘린더 오른쪽 위 「가격 신선도」 문구 — 데스크톱 · 모바일 공용(2026-10-01).
 *
 * 도메인 계약: `docs/product/33-calendar-write-features.md` → 「가격 신선도 표시」
 *
 * 가격은 **재고 웹훅**으로 들어온다 — Beds24 에서 바뀌면 그 건물 12개월을 다시 읽는다. 그래서 「마지막으로 받은
 * 시각」은 낡음의 척도가 아니다(바뀐 게 없으면 9시간 전에 받은 값도 맞다). 실제로 틀릴 수 있는 경우만 빨갛게 적는다:
 *
 * 1. `pending` — 웹훅을 받았는데 아직 못 읽은 건물이 보이는 화면에 있다(쿨다운 · 가격 작업 · 읽기 실패).
 * 2. 가장 오래된 값이 `OPS_RATES_SAFETY_HOURS` 를 넘었다 — 웹훅도 주기 동기화(안전망)도 그만큼 아무것도 못 했다는
 *    뜻이라 배달이 끊겼을 수 있다.
 *
 * 그 밖에는 「가격 실시간 반영 중」.
 */
export const OPS_RATES_SAFETY_HOURS = 24;

export type OpsRatesFreshness = {
  /** 이 창에서 가장 오래된 요금을 받은 지 몇 분. `null` = 요금이 아예 없다. */
  ageMinutes: number | null;
  /** 보이는 건물 중 웹훅 반영이 밀린 곳이 있다. */
  pending: boolean;
};

export function isOpsRatesStale({ ageMinutes, pending }: OpsRatesFreshness): boolean {
  return pending || ageMinutes === null || ageMinutes > OPS_RATES_SAFETY_HOURS * 60;
}

export function opsRatesSyncedLabel(
  freshness: OpsRatesFreshness,
  copy: { syncedLive: string; syncedPending: string; syncedHours: string; syncedNever: string },
): string {
  if (freshness.ageMinutes === null) return copy.syncedNever;
  if (freshness.pending) return copy.syncedPending;
  if (freshness.ageMinutes > OPS_RATES_SAFETY_HOURS * 60) {
    return copy.syncedHours.replace("{n}", String(Math.floor(freshness.ageMinutes / 60)));
  }
  return copy.syncedLive;
}
