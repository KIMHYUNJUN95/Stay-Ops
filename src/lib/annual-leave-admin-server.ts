// Annual leave — admin-side request creation (Phase 2, stage 1b). The admin console lets an approver
// file a leave request on behalf of another employee (proxy) or for themselves. Every query/write runs
// on the service-role client and is filtered by the CURRENT organization id. Reuses createLeaveRequest
// (self-scope submission) for the actual insert. Day-count normalization mirrors the mobile leave-form
// (src/components/attendance/leave-form.tsx) exactly. See docs/product/26-annual-leave-workflow.md.

import "server-only";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type { AppSession } from "@/lib/session";
import type { LeaveType, LeaveDurationUnit } from "@/lib/annual-leave-approvals-server";
import { createLeaveRequest } from "@/lib/annual-leave-requests-server";
import { getAnnualLeaveBaseline } from "@/lib/annual-leave-server";
import { computeAnnualLeaveSummary, tokyoToday } from "@/lib/annual-leave";

const BEREAVEMENT_DAYS = 3;

export type LeaveApplicantOption = { id: string; name: string };

/** Balance snapshot for a prospective applicant — powers the request modal's live "잔여 영향" preview.
 *  `ineligible` = no hire-date/baseline set yet (treated as not-yet-accrued / 미도래). */
export type ApplicantLeaveSummary = {
  userId: string;
  name: string;
  role: string | null;
  hireDate: string | null;
  baseRemaining: number;
  bonusRemaining: number;
  ineligible: boolean;
  nextGrantDate: string | null;
};

export async function getApplicantLeaveSummary(
  session: AppSession,
  userId: string,
): Promise<ApplicantLeaveSummary | null> {
  const service = getSupabaseServiceClient();
  const organizationId = session.organization.id;

  const { data: memData } = await service
    .from("memberships")
    .select("role, status")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  const membership = memData as { role: string; status: string } | null;
  if (!membership || membership.status !== "active") return null;

  const { data: profData } = await service
    .from("profiles")
    .select("name")
    .eq("id", userId)
    .maybeSingle();
  const name = (profData as { name: string } | null)?.name ?? "";

  const baseline = await getAnnualLeaveBaseline(service, organizationId, userId);
  if (!baseline) {
    return {
      userId,
      name,
      role: membership.role,
      hireDate: null,
      baseRemaining: 0,
      bonusRemaining: 0,
      ineligible: true,
      nextGrantDate: null,
    };
  }

  const summary = computeAnnualLeaveSummary({
    hireDate: baseline.hireDate,
    baselineDate: baseline.baselineDate,
    baselineAmount: baseline.baseAmount,
    bonusBaselineAmount: baseline.bonusAmount,
    asOf: tokyoToday(),
  });

  return {
    userId,
    name,
    role: membership.role,
    hireDate: baseline.hireDate,
    baseRemaining: summary.baseRemaining,
    bonusRemaining: summary.bonusRemaining,
    ineligible: false,
    nextGrantDate: summary.nextBaseGrant?.date ?? null,
  };
}

export type AdminLeaveRequestInput = {
  targetUserId: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  durationUnit: LeaveDurationUnit;
  reason: string;
  emergencyContact: string;
};

/** Active org members eligible as proxy-request targets (active-only — invited members can't yet
 *  receive requests, and createAdminLeaveRequest validates active membership anyway). */
export async function listLeaveApplicants(session: AppSession): Promise<LeaveApplicantOption[]> {
  const service = getSupabaseServiceClient();
  const { data: memberships } = await service
    .from("memberships")
    .select("user_id")
    .eq("organization_id", session.organization.id)
    .eq("status", "active");

  const userIds = [...new Set(((memberships ?? []) as { user_id: string }[]).map((m) => m.user_id))];
  if (userIds.length === 0) return [];

  const { data: profiles } = await service.from("profiles").select("id, name").in("id", userIds);

  return ((profiles ?? []) as { id: string; name: string }[])
    .map((p) => ({ id: p.id, name: p.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

function addDaysISO(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

function diffDaysISO(start: string, end: string): number {
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const startMs = Date.UTC(sy, sm - 1, sd);
  const endMs = Date.UTC(ey, em - 1, ed);
  return Math.round((endMs - startMs) / 86400000) + 1;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeDays(input: AdminLeaveRequestInput): {
  startDate: string;
  endDate: string;
  durationUnit: LeaveDurationUnit;
  daysCount: number;
} | null {
  const { leaveType, startDate } = input;
  if (!ISO_DATE.test(startDate)) return null;

  // 경조휴가: 회사 부여 고정 3일. durationUnit 강제 "full", endDate = startDate + 2일.
  if (leaveType === "annual") {
    return {
      startDate,
      endDate: addDaysISO(startDate, BEREAVEMENT_DAYS - 1),
      durationUnit: "full",
      daysCount: BEREAVEMENT_DAYS,
    };
  }

  // 반차(오전/오후): 단일일.
  if (input.durationUnit === "am" || input.durationUnit === "pm") {
    return {
      startDate,
      endDate: startDate,
      durationUnit: input.durationUnit,
      daysCount: 0.5,
    };
  }

  // 종일: 양끝 포함 일수.
  const { endDate } = input;
  if (!ISO_DATE.test(endDate)) return null;
  const rangeDays = diffDaysISO(startDate, endDate);
  if (rangeDays < 1) return null;
  return { startDate, endDate, durationUnit: "full", daysCount: rangeDays };
}

/**
 * Files a leave request (self or proxy) from the admin console. Lands as `requested` in the approval
 * queue. `targetUserId` must be an active member of the session org (org isolation). Any admin-web
 * accessor may file — this console is a management surface, so no separate approver right is required.
 */
export async function createAdminLeaveRequest(
  session: AppSession,
  input: AdminLeaveRequestInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const service = getSupabaseServiceClient();
  const organizationId = session.organization.id;

  if (!input.targetUserId) return { ok: false, error: "target_not_found" };
  if (input.reason.trim().length === 0) return { ok: false, error: "invalid_reason" };

  const membership = await service
    .from("memberships")
    .select("status")
    .eq("organization_id", organizationId)
    .eq("user_id", input.targetUserId)
    .maybeSingle();
  if ((membership.data as { status: string } | null)?.status !== "active") {
    return { ok: false, error: "target_not_found" };
  }

  const profile = await service
    .from("profiles")
    .select("name")
    .eq("id", input.targetUserId)
    .maybeSingle();
  const applicantName = (profile.data as { name: string } | null)?.name;
  if (!applicantName) return { ok: false, error: "target_not_found" };

  const normalized = normalizeDays(input);
  if (!normalized) return { ok: false, error: "invalid_dates" };

  const result = await createLeaveRequest(service, organizationId, input.targetUserId, {
    applicantName,
    leaveType: input.leaveType,
    startDate: normalized.startDate,
    endDate: normalized.endDate,
    durationUnit: normalized.durationUnit,
    daysCount: normalized.daysCount,
    reason: input.reason,
    emergencyContact: input.emergencyContact,
    asDraft: false,
  });
  if (!result.ok) return { ok: false, error: "create_failed" };
  return { ok: true, id: result.id };
}
