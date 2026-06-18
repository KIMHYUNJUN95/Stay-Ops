// Attendance — monthly finalization eligibility + snapshot reads (Step 11).
//
// Per-person per-month finalization is MANUAL and privileged (owner / attendance_payroll_admin). This
// module holds the server-side eligibility checks (the documented blocking rules) and the snapshot
// reads; the privileged finalize/reopen ACTIONS live in src/app/admin/attendance/actions.ts. The admin
// review/finalize UI is in the deferred web dashboard — there is no admin app UI here.

import "server-only";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
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
    .select("id, status, review_state, clock_out_at")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .gte("operating_date", firstDay)
    .lte("operating_date", lastDay);
  const sessions = (sessRes.data ?? []) as {
    id: string;
    status: string;
    review_state: string;
    clock_out_at: string | null;
  }[];

  const reviewRequired = sessions.filter((s) => s.review_state === "review_required").length;
  const openSessions = sessions.filter(
    (s) => s.status !== "invalid" && (s.status === "open" || s.status === "reopened" || !s.clock_out_at),
  ).length;

  const sessionIds = sessions.map((s) => s.id);
  let pendingCorrections = 0;
  if (sessionIds.length > 0) {
    const cr = await service
      .from("attendance_correction_requests")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("requested_by_user_id", userId)
      .in("status", ["requested", "in_review"])
      .in("session_id", sessionIds);
    pendingCorrections = (cr.data ?? []).length;
  }

  const alreadyFinalized =
    (await getCurrentFinalizedSnapshot(service, organizationId, userId, ym)) != null;

  const blockers: FinalizationBlockers = {
    reviewRequired,
    pendingCorrections,
    openSessions,
    alreadyFinalized,
  };
  const eligible =
    reviewRequired === 0 && pendingCorrections === 0 && openSessions === 0 && !alreadyFinalized;

  return { eligible, blockers };
}
