// Annual leave — approval review queue (Phase 2, stage 2). Admin/approver-scoped: every query/write
// runs on the service-role client and is filtered by the CURRENT organization id. Approver rights are
// verified server-side here (platform admin, or an active org membership with a non-null
// `leave_approver_role`) — the SQL `is_leave_approver()` helper needs an auth context and is NOT used
// on this service-role path. Self-scope request submission lives in annual-leave-requests-server.ts.
// See migration 202607060002 and docs/product/26-annual-leave-workflow.md.

import "server-only";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type { AppSession } from "@/lib/session";
import { computeAnnualLeaveSummary, tokyoToday } from "@/lib/annual-leave";
import { getAnnualLeaveBaseline } from "@/lib/annual-leave-server";

type Service = ReturnType<typeof getSupabaseServiceClient>;

export type LeaveType = "annual" | "paid" | "special" | "other";
export type LeaveDurationUnit = "full" | "am" | "pm";
export type LeaveStatus = "requested" | "approved" | "rejected" | "cancelled";
export type LeaveStatusGroup = "pending" | "approved" | "rejectedCancelled" | "all";

export type LeaveQueueItem = {
  id: string;
  applicantName: string;
  applicantRole: string | null;
  avatarInitial: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  durationUnit: LeaveDurationUnit;
  daysCount: number;
  reason: string;
  submittedAt: string | null;
  status: LeaveStatus;
};

export type LeaveQueueSummary = {
  pendingCount: number;
  pendingDays: number;
  approvedThisWeekCount: number;
  balanceWarningName: string | null;
};

export type LeaveOverlap = {
  applicantName: string;
  avatarInitial: string;
  startDate: string;
  endDate: string;
  durationUnit: LeaveDurationUnit;
  status: LeaveStatus;
};

export type LeaveApprovalDetail = LeaveQueueItem & {
  emergencyContact: string;
  imageUrls: string[];
  balancePool: "paid" | "special" | "none";
  balanceBefore: number | null;
  balanceAfter: number | null;
  overlaps: LeaveOverlap[];
  submittedVia: string;
};

type RequestRow = {
  id: string;
  user_id: string;
  applicant_name: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  duration_unit: string;
  days_count: number;
  reason: string;
  emergency_contact: string;
  image_urls: string[];
  status: string;
  submitted_at: string | null;
  created_at: string;
};

const QUEUE_COLUMNS =
  "id, user_id, applicant_name, leave_type, start_date, end_date, duration_unit, days_count, reason, emergency_contact, image_urls, status, submitted_at, created_at";

function avatarInitialOf(name: string): string {
  return Array.from(name)[0] ?? "?";
}

function statusesForGroup(group: LeaveStatusGroup): LeaveStatus[] {
  switch (group) {
    case "pending":
      return ["requested"];
    case "approved":
      return ["approved"];
    case "rejectedCancelled":
      return ["rejected", "cancelled"];
    case "all":
      return ["requested", "approved", "rejected", "cancelled"];
  }
}

async function getLeaveApproverRole(
  service: Service,
  organizationId: string,
  userId: string,
): Promise<{ isApprover: boolean; approverRole: string | null }> {
  const pa = await service
    .from("platform_admins")
    .select("id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  if (pa.data) return { isApprover: true, approverRole: null };

  const m = await service
    .from("memberships")
    .select("leave_approver_role, status")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  const row = m.data as { leave_approver_role: string | null; status: string } | null;
  if (row && row.status === "active" && row.leave_approver_role) {
    return { isApprover: true, approverRole: row.leave_approver_role };
  }
  return { isApprover: false, approverRole: null };
}

function toQueueItem(row: RequestRow, roleByUser: Map<string, string>): LeaveQueueItem {
  return {
    id: row.id,
    applicantName: row.applicant_name,
    applicantRole: roleByUser.get(row.user_id) ?? null,
    avatarInitial: avatarInitialOf(row.applicant_name),
    leaveType: row.leave_type as LeaveType,
    startDate: row.start_date,
    endDate: row.end_date,
    durationUnit: row.duration_unit as LeaveDurationUnit,
    daysCount: Number(row.days_count),
    reason: row.reason,
    submittedAt: row.submitted_at,
    status: row.status as LeaveStatus,
  };
}

async function rolesByUser(
  service: Service,
  organizationId: string,
  userIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (userIds.length === 0) return map;
  const { data } = await service
    .from("memberships")
    .select("user_id, role")
    .eq("organization_id", organizationId)
    .in("user_id", Array.from(new Set(userIds)));
  ((data ?? []) as { user_id: string; role: string }[]).forEach((r) => map.set(r.user_id, r.role));
  return map;
}

/** Tokyo week (Mon–Sun) containing `today` (YYYY-MM-DD), returned as inclusive date strings. */
function tokyoWeekRange(today: string): { weekStart: string; weekEnd: string } {
  const [y, m, d] = today.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  const dow = base.getUTCDay(); // 0=Sun..6=Sat
  const daysSinceMonday = (dow + 6) % 7;
  const start = new Date(base);
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return {
    weekStart: start.toISOString().slice(0, 10),
    weekEnd: end.toISOString().slice(0, 10),
  };
}

async function poolRemainingFor(
  service: Service,
  organizationId: string,
  userId: string,
  pool: "paid" | "special",
): Promise<number | null> {
  const baseline = await getAnnualLeaveBaseline(service, organizationId, userId);
  if (!baseline) return null;
  const summary = computeAnnualLeaveSummary({
    hireDate: baseline.hireDate,
    baselineDate: baseline.baselineDate,
    baselineAmount: baseline.baseAmount,
    bonusBaselineAmount: baseline.bonusAmount,
    asOf: tokyoToday(),
  });
  return pool === "paid" ? summary.baseRemaining : summary.bonusRemaining;
}

function poolForType(leaveType: LeaveType): "paid" | "special" | "none" {
  if (leaveType === "paid") return "paid";
  if (leaveType === "special") return "special";
  return "none";
}

async function buildSummary(
  service: Service,
  organizationId: string,
): Promise<LeaveQueueSummary> {
  const today = tokyoToday();
  const { weekStart, weekEnd } = tokyoWeekRange(today);

  const [{ data: pendingData }, { data: approvedData }] = await Promise.all([
    service
      .from("annual_leave_requests")
      .select("id, user_id, applicant_name, leave_type, days_count")
      .eq("organization_id", organizationId)
      .eq("status", "requested"),
    service
      .from("annual_leave_requests")
      .select("user_id")
      .eq("organization_id", organizationId)
      .eq("status", "approved")
      .lte("start_date", weekEnd)
      .gte("end_date", weekStart),
  ]);

  const pending = (pendingData ?? []) as {
    id: string;
    user_id: string;
    applicant_name: string;
    leave_type: string;
    days_count: number;
  }[];
  const pendingCount = pending.length;
  const pendingDays = pending.reduce((sum, r) => sum + Number(r.days_count), 0);

  const approvedThisWeekCount = new Set(
    ((approvedData ?? []) as { user_id: string }[]).map((r) => r.user_id),
  ).size;

  let balanceWarningName: string | null = null;
  for (const r of pending) {
    const pool = poolForType(r.leave_type as LeaveType);
    if (pool === "none") continue;
    const baseline = await getAnnualLeaveBaseline(service, organizationId, r.user_id);
    if (!baseline) {
      // hire+6mo not yet reached / not set up — best-effort "미도래" flag
      balanceWarningName = r.applicant_name;
      break;
    }
    const remaining = await poolRemainingFor(service, organizationId, r.user_id, pool);
    if (remaining !== null && remaining - Number(r.days_count) < 0) {
      balanceWarningName = r.applicant_name;
      break;
    }
  }

  return { pendingCount, pendingDays, approvedThisWeekCount, balanceWarningName };
}

export async function getAdminLeaveQueue(
  session: AppSession,
  opts: { statusGroup: LeaveStatusGroup; type?: LeaveType | "all"; search?: string },
): Promise<{ isApprover: boolean; items: LeaveQueueItem[]; summary: LeaveQueueSummary }> {
  const service = getSupabaseServiceClient();
  const organizationId = session.organization.id;

  const { isApprover } = await getLeaveApproverRole(service, organizationId, session.user.id);
  if (!isApprover) {
    return {
      isApprover: false,
      items: [],
      summary: { pendingCount: 0, pendingDays: 0, approvedThisWeekCount: 0, balanceWarningName: null },
    };
  }

  let query = service
    .from("annual_leave_requests")
    .select(QUEUE_COLUMNS)
    .eq("organization_id", organizationId)
    .in("status", statusesForGroup(opts.statusGroup));

  if (opts.type && opts.type !== "all") {
    query = query.eq("leave_type", opts.type);
  }
  if (opts.search && opts.search.trim().length > 0) {
    const term = `%${opts.search.trim()}%`;
    query = query.or(`applicant_name.ilike.${term},reason.ilike.${term}`);
  }

  const { data } = await query
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as unknown as RequestRow[];
  const roleByUser = await rolesByUser(service, organizationId, rows.map((r) => r.user_id));
  const items = rows.map((r) => toQueueItem(r, roleByUser));

  const summary = await buildSummary(service, organizationId);

  return { isApprover: true, items, summary };
}

export async function getAdminLeaveApprovalDetail(
  session: AppSession,
  requestId: string,
): Promise<LeaveApprovalDetail | null> {
  const service = getSupabaseServiceClient();
  const organizationId = session.organization.id;

  const { isApprover } = await getLeaveApproverRole(service, organizationId, session.user.id);
  if (!isApprover) return null;

  const { data } = await service
    .from("annual_leave_requests")
    .select(QUEUE_COLUMNS)
    .eq("id", requestId)
    .eq("organization_id", organizationId)
    .not("status", "eq", "draft")
    .maybeSingle();
  const row = data as unknown as RequestRow | null;
  if (!row) return null;

  const roleByUser = await rolesByUser(service, organizationId, [row.user_id]);
  const item = toQueueItem(row, roleByUser);

  const balancePool = poolForType(item.leaveType);
  let balanceBefore: number | null = null;
  let balanceAfter: number | null = null;
  if (balancePool !== "none") {
    balanceBefore = await poolRemainingFor(service, organizationId, row.user_id, balancePool);
    balanceAfter = balanceBefore === null ? null : balanceBefore - item.daysCount;
  }

  const { data: overlapData } = await service
    .from("annual_leave_requests")
    .select("applicant_name, start_date, end_date, duration_unit, status")
    .eq("organization_id", organizationId)
    .neq("id", requestId)
    .in("status", ["requested", "approved"])
    .lte("start_date", row.end_date)
    .gte("end_date", row.start_date)
    .order("start_date", { ascending: true })
    .limit(10);

  const overlaps: LeaveOverlap[] = (
    (overlapData ?? []) as {
      applicant_name: string;
      start_date: string;
      end_date: string;
      duration_unit: string;
      status: string;
    }[]
  ).map((o) => ({
    applicantName: o.applicant_name,
    avatarInitial: avatarInitialOf(o.applicant_name),
    startDate: o.start_date,
    endDate: o.end_date,
    durationUnit: o.duration_unit as LeaveDurationUnit,
    status: o.status as LeaveStatus,
  }));

  return {
    ...item,
    emergencyContact: row.emergency_contact,
    imageUrls: row.image_urls,
    balancePool,
    balanceBefore,
    balanceAfter,
    overlaps,
    submittedVia: "mobile",
  };
}

export async function approveLeaveRequestForApprover(
  session: AppSession,
  requestId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const service = getSupabaseServiceClient();
  const organizationId = session.organization.id;

  const { isApprover, approverRole } = await getLeaveApproverRole(
    service,
    organizationId,
    session.user.id,
  );
  if (!isApprover) return { ok: false, error: "forbidden" };

  const { data: existing } = await service
    .from("annual_leave_requests")
    .select("status")
    .eq("id", requestId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  const row = existing as { status: string } | null;
  if (!row) return { ok: false, error: "not_found" };
  if (row.status !== "requested") return { ok: false, error: "not_requested" };

  const { error } = await service
    .from("annual_leave_requests")
    .update({
      status: "approved",
      approved_by_user_id: session.user.id,
      approved_role: approverRole,
      approved_at: new Date().toISOString(),
    } as never)
    .eq("id", requestId)
    .eq("organization_id", organizationId)
    .eq("status", "requested");
  if (error) return { ok: false, error: "approve_failed" };

  return { ok: true };
}

export async function rejectLeaveRequestForApprover(
  session: AppSession,
  requestId: string,
  reason?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const service = getSupabaseServiceClient();
  const organizationId = session.organization.id;

  const { isApprover } = await getLeaveApproverRole(service, organizationId, session.user.id);
  if (!isApprover) return { ok: false, error: "forbidden" };

  const { data: existing } = await service
    .from("annual_leave_requests")
    .select("status")
    .eq("id", requestId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  const row = existing as { status: string } | null;
  if (!row) return { ok: false, error: "not_found" };
  if (row.status !== "requested") return { ok: false, error: "not_requested" };

  const { error } = await service
    .from("annual_leave_requests")
    .update({
      status: "rejected",
      rejected_by_user_id: session.user.id,
      rejected_reason: reason ?? "",
      rejected_at: new Date().toISOString(),
    } as never)
    .eq("id", requestId)
    .eq("organization_id", organizationId)
    .eq("status", "requested");
  if (error) return { ok: false, error: "reject_failed" };

  return { ok: true };
}
