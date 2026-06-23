// Attendance — hourly EXPECTED-PAY calculation + self monthly pay view (Step 10).
//
// Gross PRINCIPAL only, expected (not finalized). Confirmed rules (decision-log 2026-06-17):
//   - hourly users only (salaried users get no pay here)
//   - only RESOLVED/usable sessions count: completed + (review_state normal|approved_correction) +
//     both clock ends + NO pending correction; excluded = open/reopened/invalid, review_required,
//     pending correction (requested|in_review)
//   - paid minutes in 1-minute units; recorded breaks excluded; NO auto break deduction
//   - NO overtime/holiday/night premiums
//   - effective-date rate: the rate active on a Tokyo operating date applies to that whole day; the
//     past is never recalculated with a newer rate
//   - final monthly gross rounds to the nearest 10 yen (at the monthly layer only)
//
// Self-only: callers pass the authenticated user's id; no client-supplied target. The pure helpers are
// reusable by the later finalization/snapshot/export steps. No finalization/locking here.

import "server-only";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type {
  AttendanceSessionRow,
  AttendanceCorrectionStatus,
  EmploymentType,
} from "@/lib/attendance";

const TZ = "Asia/Tokyo";

// ── Pure calculation helpers (reusable for finalization) ─────────────────────────

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

/** Paid seconds for one resolved session = worked − closed breaks (never negative). */
export function paidSecondsForSession(
  clockInAt: string,
  clockOutAt: string,
  closedBreakSec: number,
): number {
  const gross = (new Date(clockOutAt).getTime() - new Date(clockInAt).getTime()) / 1000;
  return Math.max(0, Math.floor(gross) - closedBreakSec);
}

/** Round a yen amount to the nearest 10 yen (monthly final layer). */
export function roundToNearest10(yen: number): number {
  return Math.round(yen / 10) * 10;
}

/** Daily gross (exact yen, unrounded) for paid minutes at a rate. 1-minute units. */
function dailyGrossExact(paidMinutes: number, hourlyRate: number): number {
  return (hourlyRate * paidMinutes) / 60;
}

// ── View types ───────────────────────────────────────────────────────────────

export type PayExcludeReason =
  | "open"
  | "invalid"
  | "review_required"
  | "pending_correction"
  | null;

export type PayDaySessionView = {
  sessionId: string;
  clockInLabel: string | null;
  clockOutLabel: string | null;
  breakTotalSec: number;
  paidMinutes: number; // 0 when excluded
  dailyGrossExact: number; // 0 when excluded
  included: boolean;
  excludeReason: PayExcludeReason;
};

export type PayDayView = {
  date: string; // YYYY-MM-DD (Tokyo)
  dateLabel: string;
  employmentType: EmploymentType | null;
  hourlyRate: number | null;
  paidMinutes: number;
  grossExact: number;
  sessions: PayDaySessionView[];
};

export type RateSegmentView = { rate: number; paidMinutes: number; gross: number };

/** Finalized snapshot reflected into the self pay view (Step 11). */
export type PayFinalizationView = {
  finalized: true;
  gross: number; // locked finalized gross (yen)
  paidMinutes: number;
  finalizedAtLabel: string | null;
};

export type MonthlyPayView = {
  ym: string; // YYYY-MM
  monthLabel: string;
  /** True when at least one day in the month is hourly-employed. */
  hourlyEligible: boolean;
  /** True when the user was salaried for the whole month (no hourly day) → no pay totals. */
  salariedOnly: boolean;
  totalPaidMinutes: number;
  /** Expected monthly gross, rounded to the nearest 10 yen. */
  expectedGross: number;
  /** Count of hourly-day sessions excluded from pay (unresolved / pending / open / invalid). */
  excludedCount: number;
  rateSegments: RateSegmentView[];
  days: PayDayView[];
  /** Present when the user-month is finalized — the screen shows finalized (locked) pay (Step 11). */
  finalization: PayFinalizationView | null;
};

// ── Tokyo helpers ────────────────────────────────────────────────────────────

function tokyoTimeLabel(iso: string | null): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function dayLabelOf(date: string): string {
  const d = new Date(`${date}T00:00:00+09:00`);
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: TZ,
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(d);
}

function monthLabelOf(ym: string): string {
  const d = new Date(`${ym}-01T00:00:00+09:00`);
  return new Intl.DateTimeFormat("ko-KR", { timeZone: TZ, year: "numeric", month: "long" }).format(d);
}

/** Inclusive last day (YYYY-MM-DD) of a Tokyo YYYY-MM. */
function lastDayOfMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); // day 0 of next month = last of this
  return `${ym}-${String(last).padStart(2, "0")}`;
}

function excludeReasonFor(
  s: AttendanceSessionRow,
  correctionStatus: AttendanceCorrectionStatus | null,
): PayExcludeReason {
  if (s.status === "invalid") return "invalid";
  if (s.status === "open" || s.status === "reopened") return "open";
  if (!s.clock_in_at || !s.clock_out_at) return "open";
  if (correctionStatus === "requested" || correctionStatus === "in_review") return "pending_correction";
  if (s.review_state !== "normal" && s.review_state !== "approved_correction") return "review_required";
  return null; // usable
}

// ── Monthly self-pay view ────────────────────────────────────────────────────

type Service = ReturnType<typeof getSupabaseServiceClient>;

async function loadClosedBreakSeconds(
  service: Service,
  sessionIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (sessionIds.length === 0) return map;
  const res = await service
    .from("attendance_breaks")
    .select("session_id, started_at, ended_at")
    .in("session_id", sessionIds);
  for (const r of (res.data ?? []) as {
    session_id: string;
    started_at: string;
    ended_at: string | null;
  }[]) {
    if (!r.ended_at) continue;
    const secs = (new Date(r.ended_at).getTime() - new Date(r.started_at).getTime()) / 1000;
    if (secs > 0) map.set(r.session_id, (map.get(r.session_id) ?? 0) + Math.floor(secs));
  }
  return map;
}

async function loadCorrectionStatuses(
  service: Service,
  organizationId: string,
  userId: string,
  sessionIds: string[],
): Promise<Map<string, AttendanceCorrectionStatus>> {
  const map = new Map<string, AttendanceCorrectionStatus>();
  if (sessionIds.length === 0) return map;
  const res = await service
    .from("attendance_correction_requests")
    .select("session_id, status, created_at")
    .eq("organization_id", organizationId)
    .eq("requested_by_user_id", userId)
    .in("session_id", sessionIds)
    .order("created_at", { ascending: false });
  for (const r of (res.data ?? []) as {
    session_id: string | null;
    status: string;
    created_at: string;
  }[]) {
    if (r.session_id && !map.has(r.session_id)) {
      map.set(r.session_id, r.status as AttendanceCorrectionStatus);
    }
  }
  return map;
}

/**
 * The user's own monthly hourly expected-pay view for a Tokyo `ym` (YYYY-MM). Self-scoped. Salaried
 * months return `salariedOnly` with no pay totals. Reflects current usable attendance (completed
 * sessions, breaks, approved corrections, rate/employment history) — expected, not finalized.
 */
export async function getMonthlyPayView(
  organizationId: string,
  userId: string,
  ym: string,
): Promise<MonthlyPayView> {
  const service = getSupabaseServiceClient();
  const firstDay = `${ym}-01`;
  const lastDay = lastDayOfMonth(ym);

  const [sessRes, rateRes, empRes, finalizedRow] = await Promise.all([
    service
      .from("attendance_sessions")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .gte("operating_date", firstDay)
      .lte("operating_date", lastDay)
      .order("operating_date", { ascending: true }),
    service
      .from("hourly_rate_history")
      .select("hourly_rate, effective_from, effective_to")
      .eq("organization_id", organizationId)
      .eq("user_id", userId),
    service
      .from("employment_type_history")
      .select("employment_type, effective_from, effective_to")
      .eq("organization_id", organizationId)
      .eq("user_id", userId),
    service
      .from("attendance_month_snapshots")
      .select("gross_amount, total_paid_minutes, finalized_at")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .eq("target_month", `${ym}-01`)
      .eq("status", "finalized")
      .maybeSingle(),
  ]);

  const sessions = (sessRes.data ?? []) as AttendanceSessionRow[];
  const rateRows = (rateRes.data ?? []) as {
    hourly_rate: number;
    effective_from: string;
    effective_to: string | null;
  }[];
  const empRows = (empRes.data ?? []) as {
    employment_type: string;
    effective_from: string;
    effective_to: string | null;
  }[];

  const sessionIds = sessions.map((s) => s.id);
  const [breakSecs, correctionStatuses] = await Promise.all([
    loadClosedBreakSeconds(service, sessionIds),
    loadCorrectionStatuses(service, organizationId, userId, sessionIds),
  ]);

  // Group sessions by operating date.
  const byDate = new Map<string, AttendanceSessionRow[]>();
  for (const s of sessions) {
    const list = byDate.get(s.operating_date) ?? [];
    list.push(s);
    byDate.set(s.operating_date, list);
  }

  const days: PayDayView[] = [];
  let totalPaidMinutes = 0;
  let totalGrossExact = 0;
  let excludedCount = 0;
  let hourlyEligible = false;
  const segments = new Map<number, { paidMinutes: number; gross: number }>();

  for (const date of Array.from(byDate.keys()).sort()) {
    const dayRate = resolveEffective(rateRows, date)?.hourly_rate ?? null;
    const empType = (resolveEffective(empRows, date)?.employment_type as EmploymentType | null) ?? null;
    const isHourly = empType === "hourly";
    if (isHourly) hourlyEligible = true;

    let dayPaidMinutes = 0;
    let dayGrossExact = 0;
    const sessionViews: PayDaySessionView[] = [];

    for (const s of byDate.get(date)!) {
      const breakTotalSec = breakSecs.get(s.id) ?? 0;
      const reason = excludeReasonFor(s, correctionStatuses.get(s.id) ?? null);
      const usable = reason === null;

      let paidMinutes = 0;
      let grossExact = 0;
      // Pay only applies to hourly days with a known rate and a usable session.
      if (isHourly && usable && dayRate != null && s.clock_in_at && s.clock_out_at) {
        const paidSec = paidSecondsForSession(s.clock_in_at, s.clock_out_at, breakTotalSec);
        paidMinutes = Math.floor(paidSec / 60);
        grossExact = dailyGrossExact(paidMinutes, dayRate);
        dayPaidMinutes += paidMinutes;
        dayGrossExact += grossExact;
        const seg = segments.get(dayRate) ?? { paidMinutes: 0, gross: 0 };
        seg.paidMinutes += paidMinutes;
        seg.gross += grossExact;
        segments.set(dayRate, seg);
      } else if (isHourly && !usable) {
        excludedCount += 1;
      }

      sessionViews.push({
        sessionId: s.id,
        clockInLabel: tokyoTimeLabel(s.clock_in_at),
        clockOutLabel: tokyoTimeLabel(s.clock_out_at),
        breakTotalSec,
        paidMinutes,
        dailyGrossExact: grossExact,
        included: isHourly && usable && dayRate != null,
        excludeReason: reason,
      });
    }

    totalPaidMinutes += dayPaidMinutes;
    totalGrossExact += dayGrossExact;
    days.push({
      date,
      dateLabel: dayLabelOf(date),
      employmentType: empType,
      hourlyRate: dayRate,
      paidMinutes: dayPaidMinutes,
      grossExact: dayGrossExact,
      sessions: sessionViews,
    });
  }

  const rateSegments: RateSegmentView[] = Array.from(segments.entries())
    .map(([rate, v]) => ({ rate, paidMinutes: v.paidMinutes, gross: Math.round(v.gross) }))
    .sort((a, b) => a.rate - b.rate);

  // Reflect a finalized snapshot (Step 11): when present, the screen shows the locked finalized pay.
  const snap = finalizedRow.data as {
    gross_amount: number;
    total_paid_minutes: number;
    finalized_at: string | null;
  } | null;

  return {
    ym,
    monthLabel: monthLabelOf(ym),
    hourlyEligible,
    // salariedOnly: 세션 유무와 관계없이 고용 유형 이력으로만 판단.
    // 해당 월과 겹치는 employment_type_history 레코드 중 salaried가 하나라도 있고
    // hourly 날이 없는(hourlyEligible === false) 경우에 true.
    // 세션이 0개인 신입 월급제 직원 첫 달도 올바르게 true가 됨.
    salariedOnly:
      !hourlyEligible &&
      empRows.some(
        (r) =>
          r.employment_type === "salaried" &&
          r.effective_from <= lastDay &&
          (r.effective_to == null || r.effective_to >= firstDay),
      ),
    totalPaidMinutes,
    expectedGross: roundToNearest10(totalGrossExact),
    excludedCount,
    rateSegments,
    days,
    finalization: snap
      ? {
          finalized: true,
          gross: snap.gross_amount,
          paidMinutes: snap.total_paid_minutes,
          finalizedAtLabel: snap.finalized_at
            ? new Intl.DateTimeFormat("ko-KR", {
                timeZone: TZ,
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              }).format(new Date(snap.finalized_at))
            : null,
        }
      : null,
  };
}
