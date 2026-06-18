"use server";

// Attendance — admin correction-review actions (Step 7).
//
// Privileged review of correction requests: claim (in_review), approve (with AUTHORITATIVE application
// to the session + audit), reject (required comment). Only `owner` / `attendance_payroll_admin` (or
// platform admins) may call these — enforced server-side via `isAttendancePayrollAdmin`. User-submitted
// desired values are only proposals; on approval the admin confirms the FINAL values (defaulting to the
// proposals) and those are written to the session. The review-queue UI lives in the web dashboard
// (deferred); these actions are the backend it will call. Self-view (worker history / request status)
// reflects the new state on next load (dynamic routes; revalidated here too).
//
// Not in this step: manual session creation, payroll, finalization, dashboard, export, notifications.

import { revalidatePath } from "next/cache";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { isAttendancePayrollAdmin } from "@/lib/attendance-review";
import { runPayrollExport, type PayrollExportResult } from "@/lib/attendance-export";
import {
  getFinalizationEligibility,
  getCurrentFinalizedSnapshot,
  monthFirstDay,
  type FinalizationBlockers,
} from "@/lib/attendance-finalization";
import { getMonthlyPayView } from "@/lib/attendance-pay";
import {
  ATTENDANCE_REVIEW_STATES,
  type AttendanceCorrectionRequestRow,
  type AttendanceMonthSnapshotRow,
  type AttendanceReviewState,
  type AttendanceSessionRow,
} from "@/lib/attendance";

export type ReviewActionResult =
  | { ok: true }
  | { ok: false; reason: "forbidden" | "not_found" | "invalid" | "comment_required" | "error" };

/** Admin-confirmed final values on approval (default to the requester's proposals when omitted). */
export type ApproveCorrectionInput = {
  requestId: string;
  /** ISO instants; null/undefined → fall back to the request's desired value (then leave unchanged). */
  finalClockInAt?: string | null;
  finalClockOutAt?: string | null;
  finalSiteId?: string | null;
  comment?: string | null;
};

function revalidateSelfView() {
  revalidatePath("/mobile/attendance/history");
  revalidatePath("/mobile/attendance/correction/status");
  revalidatePath("/mobile/attendance");
}

async function loadRequest(
  service: ReturnType<typeof getSupabaseServiceClient>,
  organizationId: string,
  requestId: string,
): Promise<AttendanceCorrectionRequestRow | null> {
  const res = await service
    .from("attendance_correction_requests")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", requestId)
    .maybeSingle();
  return (res.data as AttendanceCorrectionRequestRow | null) ?? null;
}

/** Move a `requested` correction to `in_review` (admin claims it). Request-only; no session change. */
export async function setCorrectionInReview(requestId: string): Promise<ReviewActionResult> {
  const session = await getCurrentAppSession();
  if (!session || !hasOrganizationContext(session)) return { ok: false, reason: "error" };
  const organizationId = session.organization.id;
  const service = getSupabaseServiceClient();
  if (!(await isAttendancePayrollAdmin(service, organizationId, session.user.id))) {
    return { ok: false, reason: "forbidden" };
  }

  const request = await loadRequest(service, organizationId, requestId);
  if (!request) return { ok: false, reason: "not_found" };
  if (request.status !== "requested") return { ok: false, reason: "invalid" };

  const upd = await service
    .from("attendance_correction_requests")
    .update({ status: "in_review", reviewed_by_user_id: session.user.id } as never)
    .eq("id", requestId)
    .eq("status", "requested");
  if (upd.error) return { ok: false, reason: "error" };

  revalidateSelfView();
  return { ok: true };
}

/**
 * Approve a correction request and APPLY the admin-confirmed final values to the linked session, with
 * an audit row. Session-less (exception) requests are marked approved but cannot apply (manual session
 * creation is a later step). Approve comment is optional.
 */
export async function approveCorrectionRequest(
  input: ApproveCorrectionInput,
): Promise<ReviewActionResult> {
  const session = await getCurrentAppSession();
  if (!session || !hasOrganizationContext(session)) return { ok: false, reason: "error" };
  const organizationId = session.organization.id;
  const actorId = session.user.id;
  const service = getSupabaseServiceClient();
  if (!(await isAttendancePayrollAdmin(service, organizationId, actorId))) {
    return { ok: false, reason: "forbidden" };
  }

  const request = await loadRequest(service, organizationId, input.requestId);
  if (!request) return { ok: false, reason: "not_found" };
  if (request.status !== "requested" && request.status !== "in_review") {
    return { ok: false, reason: "invalid" };
  }

  // Final authoritative values: admin override, else the requester's proposal.
  const finalInAt = input.finalClockInAt ?? request.desired_clock_in_at;
  const finalOutAt = input.finalClockOutAt ?? request.desired_clock_out_at;
  const finalSiteId = input.finalSiteId ?? request.desired_clock_in_site_id;
  const nowIso = new Date().toISOString();

  if (request.session_id) {
    const sRes = await service
      .from("attendance_sessions")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("id", request.session_id)
      .maybeSingle();
    const s = sRes.data as AttendanceSessionRow | null;
    if (!s) return { ok: false, reason: "not_found" };

    const update: Record<string, unknown> = { review_state: "approved_correction" };
    if (finalInAt != null) update.clock_in_at = finalInAt;
    if (finalOutAt != null) update.clock_out_at = finalOutAt;
    if (finalSiteId != null) {
      update.clock_in_site_id = finalSiteId;
      update.clock_out_site_id = finalSiteId;
    }
    // A now-complete session that was still open becomes completed.
    const resultingOut = finalOutAt ?? s.clock_out_at;
    const resultingIn = finalInAt ?? s.clock_in_at;
    if (s.status === "open" && resultingIn && resultingOut) update.status = "completed";

    const updRes = await service
      .from("attendance_sessions")
      .update(update as never)
      .eq("id", s.id)
      .eq("organization_id", organizationId);
    if (updRes.error) return { ok: false, reason: "error" };

    // Audit the authoritative change.
    const before = {
      clock_in_at: s.clock_in_at,
      clock_out_at: s.clock_out_at,
      clock_in_site_id: s.clock_in_site_id,
      clock_out_site_id: s.clock_out_site_id,
      status: s.status,
      review_state: s.review_state,
    };
    await service.from("attendance_session_audits").insert({
      organization_id: organizationId,
      session_id: s.id,
      actor_user_id: actorId,
      action_type: "correction_apply",
      reason: input.comment?.trim() ? input.comment.trim() : "정정 요청 승인",
      before_json: before,
      after_json: update,
    } as never);
  }

  const upd = await service
    .from("attendance_correction_requests")
    .update({
      status: "approved",
      review_comment: input.comment?.trim() ? input.comment.trim() : null,
      reviewed_by_user_id: actorId,
      reviewed_at: nowIso,
    } as never)
    .eq("id", request.id);
  if (upd.error) return { ok: false, reason: "error" };

  revalidateSelfView();
  return { ok: true };
}

/**
 * Reject a correction request. A reject comment is REQUIRED. The session is left UNCHANGED (its values
 * and review state are preserved — a rejected proposal must not silently alter authoritative data); the
 * rejection itself is auditable on the request row (reviewer + time + comment).
 */
export async function rejectCorrectionRequest(
  requestId: string,
  comment: string,
): Promise<ReviewActionResult> {
  const session = await getCurrentAppSession();
  if (!session || !hasOrganizationContext(session)) return { ok: false, reason: "error" };
  const organizationId = session.organization.id;
  const service = getSupabaseServiceClient();
  if (!(await isAttendancePayrollAdmin(service, organizationId, session.user.id))) {
    return { ok: false, reason: "forbidden" };
  }
  if (!comment.trim()) return { ok: false, reason: "comment_required" };

  const request = await loadRequest(service, organizationId, requestId);
  if (!request) return { ok: false, reason: "not_found" };
  if (request.status !== "requested" && request.status !== "in_review") {
    return { ok: false, reason: "invalid" };
  }

  const upd = await service
    .from("attendance_correction_requests")
    .update({
      status: "rejected",
      review_comment: comment.trim(),
      reviewed_by_user_id: session.user.id,
      reviewed_at: new Date().toISOString(),
    } as never)
    .eq("id", requestId);
  if (upd.error) return { ok: false, reason: "error" };

  revalidateSelfView();
  return { ok: true };
}

// ── Manual session management (Step 8) ───────────────────────────────────────
// Privileged manual attendance: create a session for a worker, authoritatively update one, or
// invalidate (never delete) a bad one. owner / attendance_payroll_admin only (server-enforced). Every
// action requires an admin reason and writes an `attendance_session_audits` row. Manual sessions carry
// manual_created flags and stay compatible with later payroll/finalization (clock-in/out + breaks).
// There is NO admin PC/web dashboard in this step — these are the backend the deferred web dashboard
// will call. Site-master management stays owner-only (unchanged).

export type ManualSessionResult =
  | { ok: true; id: string }
  | { ok: false; reason: "forbidden" | "invalid" | "reason_required" | "target_invalid" | "open_conflict" | "not_found" | "error" };

export type SimpleManualResult =
  | { ok: true }
  | { ok: false; reason: "forbidden" | "invalid" | "reason_required" | "not_found" | "error" };

export type CreateManualSessionInput = {
  userId: string;
  operatingDate: string; // YYYY-MM-DD (Tokyo)
  clockInTime: string; // "HH:mm"
  clockOutTime: string | null; // "HH:mm" → completed; null → open
  clockInSiteId: string;
  clockOutSiteId: string | null;
  reason: string;
};

export type UpdateManualSessionInput = {
  sessionId: string;
  reason: string;
  // Each field: omit (undefined) = leave unchanged; null = clear; value = set.
  clockInTime?: string | null;
  clockOutTime?: string | null;
  clockInSiteId?: string | null;
  clockOutSiteId?: string | null;
  reviewState?: AttendanceReviewState;
};

function isHhmm(v: string): boolean {
  return /^\d{2}:\d{2}$/.test(v);
}
function isYmd(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}
function tokyoInstant(baseDate: string, hhmm: string): string | null {
  const d = new Date(`${baseDate}T${hhmm}:00+09:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function isOrgSite(
  service: ReturnType<typeof getSupabaseServiceClient>,
  organizationId: string,
  siteId: string,
): Promise<boolean> {
  const res = await service
    .from("attendance_sites")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("id", siteId)
    .maybeSingle();
  return !!res.data;
}

/** Manually create an attendance session for a worker (privileged). */
export async function createManualAttendanceSession(
  input: CreateManualSessionInput,
): Promise<ManualSessionResult> {
  const session = await getCurrentAppSession();
  if (!session || !hasOrganizationContext(session)) return { ok: false, reason: "error" };
  const organizationId = session.organization.id;
  const actorId = session.user.id;
  const service = getSupabaseServiceClient();
  if (!(await isAttendancePayrollAdmin(service, organizationId, actorId))) {
    return { ok: false, reason: "forbidden" };
  }

  if (!input.reason.trim()) return { ok: false, reason: "reason_required" };
  if (!isYmd(input.operatingDate) || !isHhmm(input.clockInTime)) return { ok: false, reason: "invalid" };
  if (input.clockOutTime && !isHhmm(input.clockOutTime)) return { ok: false, reason: "invalid" };

  // Target must be an active member of this org.
  const member = await service
    .from("memberships")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", input.userId)
    .eq("status", "active")
    .maybeSingle();
  if (!member.data) return { ok: false, reason: "target_invalid" };

  if (!(await isOrgSite(service, organizationId, input.clockInSiteId))) {
    return { ok: false, reason: "invalid" };
  }
  if (input.clockOutSiteId && !(await isOrgSite(service, organizationId, input.clockOutSiteId))) {
    return { ok: false, reason: "invalid" };
  }

  const clockInAt = tokyoInstant(input.operatingDate, input.clockInTime);
  const clockOutAt = input.clockOutTime ? tokyoInstant(input.operatingDate, input.clockOutTime) : null;
  if (!clockInAt) return { ok: false, reason: "invalid" };

  const status = clockOutAt ? "completed" : "open";
  // An open manual session would collide with the worker's existing open session (partial unique).
  if (status === "open") {
    const open = await service
      .from("attendance_sessions")
      .select("id")
      .eq("user_id", input.userId)
      .eq("status", "open")
      .maybeSingle();
    if (open.data) return { ok: false, reason: "open_conflict" };
  }

  const insertFields = {
    organization_id: organizationId,
    user_id: input.userId,
    operating_date: input.operatingDate,
    status,
    review_state: "normal",
    clock_in_at: clockInAt,
    clock_in_site_id: input.clockInSiteId,
    clock_in_method: "manual",
    clock_out_at: clockOutAt,
    clock_out_site_id: clockOutAt ? (input.clockOutSiteId ?? input.clockInSiteId) : null,
    clock_out_method: clockOutAt ? "manual" : null,
    manual_created: true,
    manual_created_by_user_id: actorId,
    manual_created_reason: input.reason.trim(),
  };

  const ins = (await service
    .from("attendance_sessions")
    .insert(insertFields as never)
    .select("id")
    .single()) as { data: { id: string } | null; error: { message: string } | null };
  if (ins.error || !ins.data) return { ok: false, reason: "error" };
  const sessionId = ins.data.id;

  await service.from("attendance_session_audits").insert({
    organization_id: organizationId,
    session_id: sessionId,
    actor_user_id: actorId,
    action_type: "manual_create",
    reason: input.reason.trim(),
    before_json: {},
    after_json: insertFields,
  } as never);

  revalidateSelfView();
  return { ok: true, id: sessionId };
}

/** Authoritatively update an attendance session (privileged). Mandatory reason + audit. */
export async function updateAttendanceSessionAdmin(
  input: UpdateManualSessionInput,
): Promise<SimpleManualResult> {
  const session = await getCurrentAppSession();
  if (!session || !hasOrganizationContext(session)) return { ok: false, reason: "error" };
  const organizationId = session.organization.id;
  const actorId = session.user.id;
  const service = getSupabaseServiceClient();
  if (!(await isAttendancePayrollAdmin(service, organizationId, actorId))) {
    return { ok: false, reason: "forbidden" };
  }
  if (!input.reason.trim()) return { ok: false, reason: "reason_required" };

  const sRes = await service
    .from("attendance_sessions")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", input.sessionId)
    .maybeSingle();
  const s = sRes.data as AttendanceSessionRow | null;
  if (!s) return { ok: false, reason: "not_found" };

  const update: Record<string, unknown> = {};

  if (input.clockInTime !== undefined) {
    if (input.clockInTime === null) {
      update.clock_in_at = null;
    } else {
      if (!isHhmm(input.clockInTime)) return { ok: false, reason: "invalid" };
      const at = tokyoInstant(s.operating_date, input.clockInTime);
      if (!at) return { ok: false, reason: "invalid" };
      update.clock_in_at = at;
    }
  }
  if (input.clockOutTime !== undefined) {
    if (input.clockOutTime === null) {
      update.clock_out_at = null;
    } else {
      if (!isHhmm(input.clockOutTime)) return { ok: false, reason: "invalid" };
      const at = tokyoInstant(s.operating_date, input.clockOutTime);
      if (!at) return { ok: false, reason: "invalid" };
      update.clock_out_at = at;
    }
  }
  if (input.clockInSiteId !== undefined) {
    if (input.clockInSiteId !== null && !(await isOrgSite(service, organizationId, input.clockInSiteId))) {
      return { ok: false, reason: "invalid" };
    }
    update.clock_in_site_id = input.clockInSiteId;
  }
  if (input.clockOutSiteId !== undefined) {
    if (input.clockOutSiteId !== null && !(await isOrgSite(service, organizationId, input.clockOutSiteId))) {
      return { ok: false, reason: "invalid" };
    }
    update.clock_out_site_id = input.clockOutSiteId;
  }
  if (input.reviewState !== undefined) {
    if (!ATTENDANCE_REVIEW_STATES.includes(input.reviewState)) return { ok: false, reason: "invalid" };
    update.review_state = input.reviewState;
  }

  if (Object.keys(update).length === 0) return { ok: false, reason: "invalid" };

  // Status coherence: a session with both ends becomes completed; clearing an end re-opens it.
  const resultingIn = "clock_in_at" in update ? (update.clock_in_at as string | null) : s.clock_in_at;
  const resultingOut = "clock_out_at" in update ? (update.clock_out_at as string | null) : s.clock_out_at;
  if (s.status !== "invalid") {
    if (resultingIn && resultingOut) update.status = "completed";
    else if (s.status === "completed" && !resultingOut) update.status = "open";
  }

  const before = {
    clock_in_at: s.clock_in_at,
    clock_out_at: s.clock_out_at,
    clock_in_site_id: s.clock_in_site_id,
    clock_out_site_id: s.clock_out_site_id,
    status: s.status,
    review_state: s.review_state,
  };

  const updRes = await service
    .from("attendance_sessions")
    .update(update as never)
    .eq("id", s.id)
    .eq("organization_id", organizationId);
  if (updRes.error) return { ok: false, reason: "error" };

  await service.from("attendance_session_audits").insert({
    organization_id: organizationId,
    session_id: s.id,
    actor_user_id: actorId,
    action_type: "manual_update",
    reason: input.reason.trim(),
    before_json: before,
    after_json: update,
  } as never);

  revalidateSelfView();
  return { ok: true };
}

/** Invalidate a session instead of deleting it (privileged). Mandatory reason + audit. */
export async function invalidateAttendanceSession(
  sessionId: string,
  reason: string,
): Promise<SimpleManualResult> {
  const session = await getCurrentAppSession();
  if (!session || !hasOrganizationContext(session)) return { ok: false, reason: "error" };
  const organizationId = session.organization.id;
  const actorId = session.user.id;
  const service = getSupabaseServiceClient();
  if (!(await isAttendancePayrollAdmin(service, organizationId, actorId))) {
    return { ok: false, reason: "forbidden" };
  }
  if (!reason.trim()) return { ok: false, reason: "reason_required" };

  const sRes = await service
    .from("attendance_sessions")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", sessionId)
    .maybeSingle();
  const s = sRes.data as AttendanceSessionRow | null;
  if (!s) return { ok: false, reason: "not_found" };
  if (s.status === "invalid") return { ok: false, reason: "invalid" };

  const nowIso = new Date().toISOString();
  const before = { status: s.status, review_state: s.review_state };
  const after = {
    status: "invalid",
    invalidated_at: nowIso,
    invalidated_by_user_id: actorId,
    invalidated_reason: reason.trim(),
  };

  const updRes = await service
    .from("attendance_sessions")
    .update(after as never)
    .eq("id", s.id)
    .eq("organization_id", organizationId);
  if (updRes.error) return { ok: false, reason: "error" };

  await service.from("attendance_session_audits").insert({
    organization_id: organizationId,
    session_id: s.id,
    actor_user_id: actorId,
    action_type: "invalidate",
    reason: reason.trim(),
    before_json: before,
    after_json: after,
  } as never);

  revalidateSelfView();
  return { ok: true };
}

// ── Monthly finalization / reopen (Step 11) ──────────────────────────────────
// Per-person per-month, MANUAL, privileged (owner / attendance_payroll_admin). Finalize is blocked
// while unresolved items remain (review-required / pending corrections / open sessions / already
// finalized). The final gross comes from the same expected-pay helpers. Snapshots are HISTORY-preserving
// (never overwritten): reopen flips the finalized row to `reopened`; a later finalize supersedes prior
// rows and links via `supersedes_snapshot_id`. Finalize + reopen are audited in `audit_logs`. The
// admin finalize/reopen UI is in the deferred web dashboard — none is built here.

export type FinalizeResult =
  | { ok: true; id: string }
  | {
      ok: false;
      reason: "forbidden" | "invalid" | "target_invalid" | "blocked" | "not_hourly" | "error";
      blockers?: FinalizationBlockers;
    };

export type ReopenResult =
  | { ok: true }
  | { ok: false; reason: "forbidden" | "reason_required" | "not_finalized" | "invalid" | "error" };

function revalidatePay() {
  revalidatePath("/mobile/attendance/pay");
}

/** Finalize one user-month for an hourly worker (privileged). Blocked while unresolved items remain. */
export async function finalizeAttendanceMonth(input: {
  userId: string;
  ym: string;
}): Promise<FinalizeResult> {
  const session = await getCurrentAppSession();
  if (!session || !hasOrganizationContext(session)) return { ok: false, reason: "error" };
  const organizationId = session.organization.id;
  const actorId = session.user.id;
  const service = getSupabaseServiceClient();
  if (!(await isAttendancePayrollAdmin(service, organizationId, actorId))) {
    return { ok: false, reason: "forbidden" };
  }
  if (!/^\d{4}-\d{2}$/.test(input.ym)) return { ok: false, reason: "invalid" };

  const member = await service
    .from("memberships")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", input.userId)
    .eq("status", "active")
    .maybeSingle();
  if (!member.data) return { ok: false, reason: "target_invalid" };

  const elig = await getFinalizationEligibility(organizationId, input.userId, input.ym);
  if (!elig.eligible) return { ok: false, reason: "blocked", blockers: elig.blockers };

  const pay = await getMonthlyPayView(organizationId, input.userId, input.ym);
  if (!pay.hourlyEligible) return { ok: false, reason: "not_hourly" };

  const firstDay = monthFirstDay(input.ym);

  // History preservation: supersede any prior non-superseded, non-finalized rows for this user-month
  // (e.g. a previous `reopened` row), capturing the latest to link the new snapshot to.
  const priorRes = await service
    .from("attendance_month_snapshots")
    .select("id, status")
    .eq("organization_id", organizationId)
    .eq("user_id", input.userId)
    .eq("target_month", firstDay)
    .neq("status", "superseded")
    .order("created_at", { ascending: false });
  const priorRows = (priorRes.data ?? []) as { id: string; status: string }[];
  const supersedesId = priorRows[0]?.id ?? null;
  if (priorRows.length > 0) {
    await service
      .from("attendance_month_snapshots")
      .update({ status: "superseded" } as never)
      .eq("organization_id", organizationId)
      .eq("user_id", input.userId)
      .eq("target_month", firstDay)
      .neq("status", "superseded");
  }

  const nowIso = new Date().toISOString();
  const ins = (await service
    .from("attendance_month_snapshots")
    .insert({
      organization_id: organizationId,
      user_id: input.userId,
      target_month: firstDay,
      status: "finalized",
      total_paid_minutes: pay.totalPaidMinutes,
      gross_amount: pay.expectedGross,
      rate_breakdown: pay.rateSegments,
      finalized_by_user_id: actorId,
      finalized_at: nowIso,
      supersedes_snapshot_id: supersedesId,
    } as never)
    .select("id")
    .single()) as { data: { id: string } | null; error: { message: string } | null };
  if (ins.error || !ins.data) return { ok: false, reason: "error" };

  await service.from("audit_logs").insert({
    organization_id: organizationId,
    actor_user_id: actorId,
    action: "attendance_month_finalize",
    target_type: "attendance_month_snapshot",
    target_id: ins.data.id,
    metadata: {
      user_id: input.userId,
      target_month: firstDay,
      gross_amount: pay.expectedGross,
      total_paid_minutes: pay.totalPaidMinutes,
      supersedes_snapshot_id: supersedesId,
    },
  } as never);

  revalidatePay();
  return { ok: true, id: ins.data.id };
}

/** Reopen a finalized user-month (privileged). Reason required; prior history preserved. */
export async function reopenAttendanceMonth(input: {
  userId: string;
  ym: string;
  reason: string;
}): Promise<ReopenResult> {
  const session = await getCurrentAppSession();
  if (!session || !hasOrganizationContext(session)) return { ok: false, reason: "error" };
  const organizationId = session.organization.id;
  const actorId = session.user.id;
  const service = getSupabaseServiceClient();
  if (!(await isAttendancePayrollAdmin(service, organizationId, actorId))) {
    return { ok: false, reason: "forbidden" };
  }
  if (!/^\d{4}-\d{2}$/.test(input.ym)) return { ok: false, reason: "invalid" };
  if (!input.reason.trim()) return { ok: false, reason: "reason_required" };

  const snap = await getCurrentFinalizedSnapshot(service, organizationId, input.userId, input.ym);
  if (!snap) return { ok: false, reason: "not_finalized" };

  // Flip the finalized row to `reopened` (kept as history; no `finalized` row remains → expected pay
  // resumes). A later finalize will supersede it.
  const updRes = await service
    .from("attendance_month_snapshots")
    .update({ status: "reopened" } as never)
    .eq("id", (snap as AttendanceMonthSnapshotRow).id)
    .eq("status", "finalized");
  if (updRes.error) return { ok: false, reason: "error" };

  await service.from("audit_logs").insert({
    organization_id: organizationId,
    actor_user_id: actorId,
    action: "attendance_month_reopen",
    target_type: "attendance_month_snapshot",
    target_id: (snap as AttendanceMonthSnapshotRow).id,
    metadata: {
      user_id: input.userId,
      target_month: monthFirstDay(input.ym),
      reason: input.reason.trim(),
    },
  } as never);

  revalidatePay();
  return { ok: true };
}

// ── Finalized-only payroll export (Step 13) ──────────────────────────────────
// Privileged (owner / attendance_payroll_admin) export of FINALIZED data only — monthly bulk or
// per-person. Privilege + finalized-only filtering + the `attendance_export_logs` audit row all live in
// `runPayrollExport`; these thin actions resolve the session and return the CSV for the caller (the
// deferred web dashboard) to download. The interim format is a structured CSV until the operator's final
// Excel template is provided. No admin export UI is built here.

export async function exportMonthlyPayroll(ym: string): Promise<PayrollExportResult> {
  const session = await getCurrentAppSession();
  if (!session || !hasOrganizationContext(session)) return { ok: false, reason: "error" };
  const service = getSupabaseServiceClient();
  return runPayrollExport(service, session.organization.id, session.user.id, {
    scope: "monthly_bulk",
    ym,
  });
}

export async function exportUserPayroll(userId: string, ym: string): Promise<PayrollExportResult> {
  const session = await getCurrentAppSession();
  if (!session || !hasOrganizationContext(session)) return { ok: false, reason: "error" };
  const service = getSupabaseServiceClient();
  return runPayrollExport(service, session.organization.id, session.user.id, {
    scope: "single_user",
    ym,
    userId,
  });
}
