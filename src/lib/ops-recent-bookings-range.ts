/**
 * 「최근 예약」 시간대 — **순수하다**(2026-10-05 사용자 결정).
 *
 * 도메인 계약: docs/product/33-calendar-write-features.md 「최근 예약」
 *
 * - 기본: **도쿄 기준 이틀 전 0시 ~ 지금**. 오늘이 10/05 면 10/03 00:00 부터. 도쿄 자정이 지나면 하루씩 밀린다.
 * - 직접 지정: 시작 · 끝(도쿄 날짜 + 시각). 지정한 그날만 유지되고 다음 도쿄 자정이 지나면 기본으로 돌아간다
 *   (화면이 지정한 날짜를 함께 기억해 비교한다).
 */

export const RECENT_BOOKINGS_DEFAULT_DAYS_BACK = 2;
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
  const today = tokyoDateOf(nowMs);
  return { fromMs: tokyoMs(today) - RECENT_BOOKINGS_DEFAULT_DAYS_BACK * DAY_MS, toMs: nowMs };
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
