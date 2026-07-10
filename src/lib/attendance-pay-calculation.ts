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
