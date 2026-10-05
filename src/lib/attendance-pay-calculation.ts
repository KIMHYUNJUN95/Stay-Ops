/** Effective-date row resolution: the row whose [effective_from, effective_to] covers `date`, latest. */
export function resolveEffective<T extends { effective_from: string; effective_to: string | null }>(
  rows: T[],
  date: string,
): T | null {
  let best: T | null = null;
  for (const r of rows) {
    if (r.effective_from <= date && (r.effective_to == null || r.effective_to >= date)) {
      if (!best || r.effective_from > best.effective_from) best = r;
    }
  }
  return best;
}

export type BreakInterval = { session_id: string; started_at: string; ended_at: string | null };
export type SessionWindow = { id: string; clock_in_at: string | null; clock_out_at: string | null };

/**
 * 세션별 휴게 초 — **급여에서 빼는 휴게는 근무 시간 안의 것만** (2026-10-05).
 *
 * - 휴게를 세션의 [출근, 퇴근] 안으로 자른다. 관리자가 출퇴근 시각을 옮겨 휴게가 근무 밖으로 나가면 그 부분은 빼지 않는다
 *   (전에는 근무 밖 휴게도 그대로 차감했다).
 * - **닫힌 세션에 열린 휴게**가 남아 있으면 퇴근 시각에 끝난 것으로 본다. 모바일은 휴게 중 퇴근을 막지만 관리자 수정 ·
 *   정정 승인으로 닫으면 휴게가 열린 채 남는다 — 전에는 이 휴게를 아예 빼지 않아 과지급이 됐다. 휴게 종료도 퇴근도
 *   찍지 않고 떠난 경우라 그 뒤는 일하지 않은 시간으로 본다.
 * - 아직 열린 세션의 열린 휴게는 세지 않는다(끝나지 않았다).
 */
export function breakSecondsBySession(
  breaks: readonly BreakInterval[],
  sessions: readonly SessionWindow[],
): Map<string, number> {
  const windows = new Map(sessions.map((s) => [s.id, s]));
  const totals = new Map<string, number>();
  for (const b of breaks) {
    const session = windows.get(b.session_id);
    if (!session) continue;
    const endIso = b.ended_at ?? session.clock_out_at;
    if (!endIso) continue;
    let start = new Date(b.started_at).getTime();
    let end = new Date(endIso).getTime();
    if (session.clock_in_at) start = Math.max(start, new Date(session.clock_in_at).getTime());
    if (session.clock_out_at) end = Math.min(end, new Date(session.clock_out_at).getTime());
    const secs = Math.floor((end - start) / 1000);
    if (secs > 0) totals.set(b.session_id, (totals.get(b.session_id) ?? 0) + secs);
  }
  return totals;
}

/** Paid seconds for one resolved session = worked - closed breaks (never negative). */
export function paidSecondsForSession(
  clockInAt: string,
  clockOutAt: string,
  closedBreakSec: number,
): number {
  const gross = (new Date(clockOutAt).getTime() - new Date(clockInAt).getTime()) / 1000;
  return Math.max(0, Math.floor(gross) - closedBreakSec);
}

/** Round a yen amount up to the nearest 10-yen ceiling. e.g. 93 -> 100, 100 -> 100. */
export function roundToNearest10(yen: number): number {
  return Math.ceil(yen / 10) * 10;
}

/** Daily gross (exact yen, unrounded) for paid minutes at a rate. 1-minute units. */
export function dailyGrossExact(paidMinutes: number, hourlyRate: number): number {
  return (hourlyRate * paidMinutes) / 60;
}

/**
 * Exact (unrounded) applied yen for one attendance allowance on a date that has recognized paid work.
 *   daily_fixed  → the flat amount once for the day (paid minutes irrelevant beyond "has paid work")
 *   hourly_extra → amount is an extra yen-per-hour, multiplied by the date's recognized paid minutes
 * Never rounds; the monthly gross layer applies the single 10-yen ceiling.
 */
export function allowanceCalculatedExact(
  type: "daily_fixed" | "hourly_extra",
  amountYen: number,
  paidMinutes: number,
): number {
  return type === "hourly_extra" ? (amountYen * paidMinutes) / 60 : amountYen;
}

export function reconcileDailyPaysToTotal<T extends { workMinutes: number; dailyPay: number }>(
  rows: T[],
  targetPayrollTotal: number,
): T[] {
  const displayedTotal = rows.reduce((sum, row) => sum + row.dailyPay, 0);
  const delta = targetPayrollTotal - displayedTotal;
  if (delta === 0) return rows;

  const lastPaidIndex = rows.findLastIndex((row) => row.workMinutes > 0);
  if (lastPaidIndex < 0) return rows;

  return rows.map((row, index) =>
    index === lastPaidIndex ? { ...row, dailyPay: row.dailyPay + delta } : row,
  );
}
