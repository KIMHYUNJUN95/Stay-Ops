/**
 * 「최근 예약」 시간대 — **순수하다**(2026-10-05 사용자 결정).
 *
 * 도메인 계약: docs/product/33-calendar-write-features.md 「최근 예약」
 *
 * - 기본: **지금부터 정확히 48시간 전 ~ 지금**(2026-10-07 사용자 결정). 예전 「도쿄 이틀 전 0시 ~ 지금」은 하루 중 시각에 따라
 *   창이 48 ~ 72시간으로 늘어나 아침에 본 N건과 밤에 본 N건이 다른 뜻이었다 — 수요 신호를 보는 화면이라 창 길이를 고정한다.
 *   같은 화면의 「가격 개입 성공」도 48시간 기준이다.
 * - 직접 지정: 날짜 단위(시작일 0시 ~ 끝날 24시). 지정한 그날만 유지되고 다음 도쿄 자정이 지나면 기본으로 돌아간다
 *   (화면이 지정한 날짜를 함께 기억해 비교한다).
 */

export const RECENT_BOOKINGS_DEFAULT_HOURS = 48;
/** 직접 지정할 수 있는 가장 긴 폭 — 이보다 길면 「최근」이 아니다. */
export const RECENT_BOOKINGS_MAX_SPAN_DAYS = 31;

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const TOKYO_OFFSET_MS = 9 * HOUR_MS;

/** 도쿄 날짜(`YYYY-MM-DD`). */
export function tokyoDateOf(ms: number): string {
  return new Date(ms + TOKYO_OFFSET_MS).toISOString().slice(0, 10);
}

/** 도쿄 날짜 + `HH:mm` → 시각(ms). */
export function tokyoMs(date: string, time = "00:00"): number {
  return Date.parse(`${date}T${time}:00+09:00`);
}

/** 도쿄 시각 → `{ date, time }`. */
export function tokyoParts(ms: number): { date: string; time: string } {
  const iso = new Date(ms + TOKYO_OFFSET_MS).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

export function defaultRecentRange(nowMs: number): { fromMs: number; toMs: number } {
  return { fromMs: nowMs - RECENT_BOOKINGS_DEFAULT_HOURS * HOUR_MS, toMs: nowMs };
}

/** 다음 도쿄 자정까지 남은 ms — 화면이 그때 기본 범위로 다시 받는다. */
export function msUntilNextTokyoMidnight(nowMs: number): number {
  return tokyoMs(tokyoDateOf(nowMs)) + DAY_MS - nowMs;
}

/**
 * 받은 시간대를 거른다. 끝이 없으면 지금. 시작 ≥ 끝, 폭이 너무 넓음, 숫자가 아님 → `null`(기본으로).
 */
export function resolveRecentRange(
  nowMs: number,
  requested: { from?: string | null; to?: string | null } | null | undefined,
): { fromMs: number; toMs: number; isDefault: boolean; endsNow: boolean } {
  const fallback = { ...defaultRecentRange(nowMs), endsNow: true, isDefault: true };
  if (!requested?.from) return fallback;
  const fromMs = Date.parse(requested.from);
  const toMs = requested.to ? Math.min(Date.parse(requested.to), nowMs) : nowMs;
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs) return fallback;
  if (toMs - fromMs > RECENT_BOOKINGS_MAX_SPAN_DAYS * DAY_MS) return fallback;
  return { endsNow: toMs === nowMs, fromMs, isDefault: false, toMs };
}
