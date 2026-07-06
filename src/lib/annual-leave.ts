// Annual-leave accrual calculation, based on hire date.
// Policy confirmed 2026-07-06 (see docs/product/26-annual-leave-workflow.md):
//   - first grant 10d at 6 months, then 11d/12d at each of the next two
//     anniversaries of that grant, then +2d per year, capped at 20d — this is the
//     "유급 휴가"(paid leave) pool, used by the "paid" leave-request type
//   - a separate one-time +4d bonus at the 4-year mark (outside the 20d cap) — this
//     bucket is its own pool, spent only via the "특별휴가"(special) leave-request
//     type, never mixed with the paid-leave pool
//   - unused leave lapses 2 years after its grant date (confirmed up to 2 years;
//     policy beyond 2 years is still pending company confirmation)
//   - bereavement leave ("경조휴가", the "annual" request type) and unpaid leave
//     ("기타") are NOT part of this hire-date accrual at all — see leave-form.tsx
//
// This module is pure (no Supabase/session imports) so it can run on both server and client.
// `hire_date` lives on `profiles`; the self-entered starting balance lives in
// `annual_leave_baselines` (migration 202607060001) — see src/lib/annual-leave-server.ts for the
// DB read/write side and src/app/mobile/attendance/leave/actions.ts for the self-service action.

const BASE_SCHEDULE_MONTHS = [6, 18, 30, 42, 54, 66, 78];
const BASE_SCHEDULE_AMOUNTS = [10, 11, 12, 14, 16, 18, 20];
const BASE_SCHEDULE_STEP_MONTHS = 12;
const BASE_SCHEDULE_CAP = 20;

const BONUS_AT_MONTHS = 48;
const BONUS_AMOUNT = 4;

export const LEAVE_EXPIRY_YEARS = 2;

export type LeaveGrantEvent = {
  kind: "base" | "bonus";
  date: string; // ISO date (YYYY-MM-DD)
  amount: number;
};

export type LeaveBucketKind = "baseline" | "base" | "bonus";

export type LeaveBucket = {
  id: string;
  kind: LeaveBucketKind;
  grantedOn: string;
  amount: number;
  expiresOn: string | null; // null = engine does not manage this bucket's expiry (baseline)
};

export type LeaveBucketState = LeaveBucket & { remaining: number; expired: boolean };

export type AnnualLeaveSummary = {
  /** "유급 휴가" pool remaining — baseline + base-schedule grants only. */
  baseRemaining: number;
  /** "특별휴가" pool remaining — the one-time 4-year bonus, spent separately. */
  bonusRemaining: number;
  /** baseRemaining + bonusRemaining, for callers that just want a single total. */
  remaining: number;
  buckets: LeaveBucketState[];
  /** Earliest upcoming grant across both pools, for a generic "next grant" display. */
  nextGrant: LeaveGrantEvent | null;
  /** Earliest upcoming "유급 휴가" (base-schedule) grant only. */
  nextBaseGrant: LeaveGrantEvent | null;
  /** The 4-year bonus grant, only while it's still upcoming (null once it has landed). */
  nextBonusGrant: LeaveGrantEvent | null;
};

function addMonthsUTC(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + months, d)).toISOString().slice(0, 10);
}

function addYearsUTC(iso: string, years: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y + years, m - 1, d)).toISOString().slice(0, 10);
}

function compareISO(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** All automatic base + bonus grant events from hire date up to just past `asOf`. */
export function getScheduledGrants(hireDate: string, asOf: string): LeaveGrantEvent[] {
  const events: LeaveGrantEvent[] = BASE_SCHEDULE_MONTHS.map((months, i) => ({
    kind: "base" as const,
    date: addMonthsUTC(hireDate, months),
    amount: BASE_SCHEDULE_AMOUNTS[i],
  }));

  let months = BASE_SCHEDULE_MONTHS[BASE_SCHEDULE_MONTHS.length - 1] + BASE_SCHEDULE_STEP_MONTHS;
  for (let guard = 0; guard < 200; guard += 1) {
    const date = addMonthsUTC(hireDate, months);
    events.push({ kind: "base", date, amount: BASE_SCHEDULE_CAP });
    if (compareISO(date, asOf) > 0) break;
    months += BASE_SCHEDULE_STEP_MONTHS;
  }

  events.push({ kind: "bonus", date: addMonthsUTC(hireDate, BONUS_AT_MONTHS), amount: BONUS_AMOUNT });

  return events.sort((a, b) => compareISO(a.date, b.date));
}

/**
 * Baseline bucket (the employee-entered current balance) plus every automatic
 * grant that lands *after* the baseline was recorded — grants on or before that
 * date are assumed to already be reflected in the baseline number.
 */
export function buildLeaveBuckets(params: {
  hireDate: string;
  baselineDate: string;
  baselineAmount: number;
  bonusBaselineAmount?: number;
  asOf: string;
}): LeaveBucket[] {
  const { hireDate, baselineDate, baselineAmount, bonusBaselineAmount = 0, asOf } = params;
  const buckets: LeaveBucket[] = [
    { id: "baseline", kind: "baseline", grantedOn: baselineDate, amount: baselineAmount, expiresOn: null },
  ];
  if (bonusBaselineAmount > 0) {
    // a pre-existing 특별휴가 balance the employee already had — opaque to the engine (no known grant
    // date to expire it against), same reasoning as the base baseline bucket above.
    buckets.push({ id: "baseline-bonus", kind: "bonus", grantedOn: baselineDate, amount: bonusBaselineAmount, expiresOn: null });
  }

  getScheduledGrants(hireDate, asOf)
    .filter((g) => compareISO(g.date, baselineDate) > 0 && compareISO(g.date, asOf) <= 0)
    .forEach((g, i) => {
      buckets.push({
        id: `${g.kind}-${i}-${g.date}`,
        kind: g.kind,
        grantedOn: g.date,
        amount: g.amount,
        expiresOn: addYearsUTC(g.date, LEAVE_EXPIRY_YEARS),
      });
    });

  return buckets.sort((a, b) => compareISO(a.grantedOn, b.grantedOn));
}

/**
 * Applies used days FIFO (oldest bucket first) within each pool, then lapses
 * whatever is left past expiry. `usedDays` only draws from the baseline/base
 * ("유급 휴가") pool; `specialUsedDays` only draws from the bonus ("특별휴가")
 * pool — the two pools are never mixed.
 */
export function computeAnnualLeaveSummary(params: {
  hireDate: string;
  baselineDate: string;
  baselineAmount: number;
  bonusBaselineAmount?: number;
  usedDays?: number;
  specialUsedDays?: number;
  asOf: string;
}): AnnualLeaveSummary {
  const { hireDate, baselineDate, baselineAmount, bonusBaselineAmount = 0, usedDays = 0, specialUsedDays = 0, asOf } =
    params;
  const buckets = buildLeaveBuckets({ hireDate, baselineDate, baselineAmount, bonusBaselineAmount, asOf });

  function applyUsage(pool: LeaveBucket[], usage: number): LeaveBucketState[] {
    let unassignedUsage = usage;
    return pool.map((b) => {
      const consumed = Math.min(b.amount, Math.max(0, unassignedUsage));
      unassignedUsage -= consumed;
      const expired = b.expiresOn !== null && compareISO(b.expiresOn, asOf) < 0;
      return { ...b, remaining: expired ? 0 : b.amount - consumed, expired };
    });
  }

  const basePool = buckets.filter((b) => b.kind !== "bonus");
  const bonusPool = buckets.filter((b) => b.kind === "bonus");
  const stated = [...applyUsage(basePool, usedDays), ...applyUsage(bonusPool, specialUsedDays)].sort((a, b) =>
    compareISO(a.grantedOn, b.grantedOn),
  );

  const baseRemaining = stated.filter((b) => b.kind !== "bonus").reduce((sum, b) => sum + b.remaining, 0);
  const bonusRemaining = stated.filter((b) => b.kind === "bonus").reduce((sum, b) => sum + b.remaining, 0);
  const upcoming = getScheduledGrants(hireDate, asOf)
    .filter((g) => compareISO(g.date, asOf) > 0)
    .sort((a, b) => compareISO(a.date, b.date));
  const nextGrant = upcoming[0] ?? null;
  const nextBaseGrant = upcoming.find((g) => g.kind === "base") ?? null;
  const nextBonusGrant = upcoming.find((g) => g.kind === "bonus") ?? null;

  return {
    baseRemaining,
    bonusRemaining,
    remaining: baseRemaining + bonusRemaining,
    buckets: stated,
    nextGrant,
    nextBaseGrant,
    nextBonusGrant,
  };
}

export function tokyoToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
}
