// Attendance — monthly finalization eligibility + snapshot reads (Step 11).
//
// Per-person per-month finalization is MANUAL and privileged (owner / attendance_payroll_admin). This
// module holds the server-side eligibility checks (the documented blocking rules) and the snapshot
// reads; the privileged finalize/reopen ACTIONS live in src/app/admin/attendance/actions.ts. The admin
// review/finalize UI is in the deferred web dashboard — there is no admin app UI here.

import "server-only";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { resolveEffective } from "@/lib/attendance-pay-calculation";
import type { AttendanceMonthSnapshotRow } from "@/lib/attendance";

type Service = ReturnType<typeof getSupabaseServiceClient>;

/** First day (YYYY-MM-01) the snapshot's target_month is keyed on. */
export function monthFirstDay(ym: string): string {
  return `${ym}-01`;
}

/** Inclusive last day (YYYY-MM-DD) of a Tokyo YYYY-MM. */
export function monthLastDay(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${ym}-${String(last).padStart(2, "0")}`;
}

export type FinalizationBlockers = {
  reviewRequired: number;
  pendingCorrections: number;
  openSessions: number;
  openBreaks: number;
  missingRates: number;
  alreadyFinalized: boolean;
};

export type FinalizationEligibility = {
  eligible: boolean;
  blockers: FinalizationBlockers;
};

/**
 * The current FINALIZED snapshot for a user-month, or null. After a reopen the row becomes `reopened`
 * (no `finalized` row), so this returns null and expected-pay resumes.
 */
export async function getCurrentFinalizedSnapshot(
  service: Service,
  organizationId: string,
  userId: string,
  ym: string,
): Promise<AttendanceMonthSnapshotRow | null> {
  const res = await service
    .from("attendance_month_snapshots")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("target_month", monthFirstDay(ym))
    .eq("status", "finalized")
    .maybeSingle();
  if (res.error) throw new Error(`attendance_snapshot_read_failed:${res.error.message}`);
  return (res.data as AttendanceMonthSnapshotRow | null) ?? null;
}

/**
 * Can this user-month be finalized? Blocked while any unresolved item remains: review-required
 * sessions, pending correction requests (on month sessions), open/incomplete sessions, or an
 * already-finalized snapshot (must reopen first). Server-side; never rely on UI disabling.
 */
export async function getFinalizationEligibility(
  organizationId: string,
  userId: string,
  ym: string,
): Promise<FinalizationEligibility> {
  const service = getSupabaseServiceClient();
  const firstDay = monthFirstDay(ym);
  const lastDay = monthLastDay(ym);

  const sessRes = await service
    .from("attendance_sessions")
    .select("id, operating_date, status, review_state, clock_in_at, clock_out_at")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .gte("operating_date", firstDay)
    .lte("operating_date", lastDay);
  if (sessRes.error) throw new Error(`attendance_sessions_read_failed:${sessRes.error.message}`);
  const sessions = (sessRes.data ?? []) as {
    id: string;
    operating_date: string;
    status: string;
    review_state: string;
    clock_in_at: string | null;
    clock_out_at: string | null;
  }[];

  const reviewRequired = sessions.filter(
    (s) => s.status !== "invalid" && s.review_state === "review_required",
  ).length;
  const openSessions = sessions.filter(
    // `abandoned`(퇴근 미기록 후 운영일 경과)도 미해소로 센다 — 출근은 막지 않되 **마감은 막아야**
    // 누군가 반드시 정리하게 된다. 정리 경로는 정정 요청 승인 / 관리자 직접 수정 / 무효 처리.
    (s) =>
      s.status !== "invalid" &&
      (s.status === "open" ||
        s.status === "reopened" ||
        s.status === "abandoned" ||
        !s.clock_in_at ||
        !s.clock_out_at),
  ).length;

  const sessionIds = sessions.map((s) => s.id);
  let openBreaks = 0;
  if (sessionIds.length > 0) {
    const breaksRes = await service
      .from("attendance_breaks")
      .select("id")
      .in("session_id", sessionIds)
      .is("ended_at", null);
    if (breaksRes.error) throw new Error(`attendance_breaks_read_failed:${breaksRes.error.message}`);
    openBreaks = (breaksRes.data ?? []).length;
  }

  const [employmentRes, rateRes] = await Promise.all([
    service
      .from("employment_type_history")
      .select("employment_type, effective_from, effective_to")
      .eq("organization_id", organizationId)
      .eq("user_id", userId),
    service
      .from("hourly_rate_history")
      .select("hourly_rate, effective_from, effective_to")
      .eq("organization_id", organizationId)
      .eq("user_id", userId),
  ]);
  if (employmentRes.error) {
    throw new Error(`attendance_employment_read_failed:${employmentRes.error.message}`);
  }
  if (rateRes.error) throw new Error(`attendance_rate_read_failed:${rateRes.error.message}`);
  const employmentRows = (employmentRes.data ?? []) as {
    employment_type: string;
    effective_from: string;
    effective_to: string | null;
  }[];
  const rateRows = (rateRes.data ?? []) as {
    hourly_rate: number;
    effective_from: string;
    effective_to: string | null;
  }[];
  const missingRateDates = new Set<string>();
  for (const attendanceSession of sessions) {
    if (
      attendanceSession.status === "invalid" ||
      !attendanceSession.clock_in_at ||
      !attendanceSession.clock_out_at
    ) {
      continue;
    }
    const employment = resolveEffective(employmentRows, attendanceSession.operating_date);
    if (
      employment?.employment_type === "hourly" &&
      !resolveEffective(rateRows, attendanceSession.operating_date)
    ) {
      missingRateDates.add(attendanceSession.operating_date);
    }
  }
  const missingRates = missingRateDates.size;

  let pendingCorrections = 0;
  // Session-linked corrections: any pending request tied to a session in this month.
  if (sessionIds.length > 0) {
    const cr = await service
      .from("attendance_correction_requests")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("requested_by_user_id", userId)
      .in("status", ["requested", "in_review"])
      .in("session_id", sessionIds);
    if (cr.error) throw new Error(`attendance_corrections_read_failed:${cr.error.message}`);
    pendingCorrections += (cr.data ?? []).length;
  }
  // Session-less corrections: exception requests not tied to any session, targeting this month.
  const crNull = await service
    .from("attendance_correction_requests")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("requested_by_user_id", userId)
    .in("status", ["requested", "in_review"])
    .is("session_id", null)
    .eq("target_month", firstDay);
  if (crNull.error) throw new Error(`attendance_corrections_read_failed:${crNull.error.message}`);
  pendingCorrections += (crNull.data ?? []).length;

  const alreadyFinalized =
    (await getCurrentFinalizedSnapshot(service, organizationId, userId, ym)) != null;

  const blockers: FinalizationBlockers = {
    reviewRequired,
    pendingCorrections,
    openSessions,
    openBreaks,
    missingRates,
    alreadyFinalized,
  };
  const eligible =
    reviewRequired === 0 &&
    pendingCorrections === 0 &&
    openSessions === 0 &&
    openBreaks === 0 &&
    missingRates === 0 &&
    !alreadyFinalized;

  return { eligible, blockers };
}
