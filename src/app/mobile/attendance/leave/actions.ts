"use server";

// Annual leave — self-service server action for the Phase 1 backend (hire_date + starting balance
// only). Self-only: acts on the authenticated user's own profile/baseline row, never another user's.
// All writes use the service-role client (RLS denies direct authenticated writes).

import { revalidatePath } from "next/cache";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { setAnnualLeaveBaselineForUser } from "@/lib/annual-leave-server";
import {
  cancelLeaveRequest,
  createLeaveRequest,
  deleteLeaveRequestDraft,
  updateDraftLeaveRequest,
  type LeaveDurationUnit,
  type LeaveRequestType,
} from "@/lib/annual-leave-requests-server";

const LEAVE_PATH = "/mobile/attendance/leave";
const LEAVE_HISTORY_PATH = "/mobile/attendance/leave/history";
const LEAVE_TYPES: LeaveRequestType[] = ["annual", "paid", "special", "other"];
const DURATION_UNITS: LeaveDurationUnit[] = ["full", "am", "pm"];

export type SetAnnualLeaveBaselineResult = { ok: true } | { ok: false; error: string };

export async function setAnnualLeaveBaselineAction(input: {
  hireDate: string;
  baseAmount: number;
  bonusAmount?: number;
}): Promise<SetAnnualLeaveBaselineResult> {
  const session = await getCurrentAppSession();
  if (!session || !hasOrganizationContext(session)) return { ok: false, error: "auth" };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.hireDate)) return { ok: false, error: "invalid_hire_date" };
  if (!Number.isFinite(input.baseAmount) || input.baseAmount < 0) {
    return { ok: false, error: "invalid_base_amount" };
  }
  if (input.bonusAmount !== undefined && (!Number.isFinite(input.bonusAmount) || input.bonusAmount < 0)) {
    return { ok: false, error: "invalid_bonus_amount" };
  }

  const service = getSupabaseServiceClient();
  const result = await setAnnualLeaveBaselineForUser(
    service,
    session.organization.id,
    session.user.id,
    input,
  );
  if (!result.ok) return result;

  revalidatePath(LEAVE_PATH);
  return { ok: true };
}

// ── Request submission (Phase 2, stage 1 — approval action is not implemented yet) ──

export type SubmitLeaveRequestResult = { ok: true; id: string } | { ok: false; error: string };

export async function submitLeaveRequestAction(input: {
  /** Set when continuing an existing draft — updates that row instead of creating a new one. */
  requestId?: string;
  applicantName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  durationUnit: string;
  daysCount: number;
  reason: string;
  emergencyContact: string;
  asDraft?: boolean;
}): Promise<SubmitLeaveRequestResult> {
  const session = await getCurrentAppSession();
  if (!session || !hasOrganizationContext(session)) return { ok: false, error: "auth" };

  if (!LEAVE_TYPES.includes(input.leaveType as LeaveRequestType)) return { ok: false, error: "invalid_leave_type" };
  if (!DURATION_UNITS.includes(input.durationUnit as LeaveDurationUnit)) {
    return { ok: false, error: "invalid_duration_unit" };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(input.endDate)) {
    return { ok: false, error: "invalid_dates" };
  }
  if (input.endDate < input.startDate) return { ok: false, error: "invalid_date_range" };
  if (!Number.isFinite(input.daysCount) || input.daysCount <= 0) return { ok: false, error: "invalid_days_count" };
  if (!input.asDraft && !input.reason.trim()) return { ok: false, error: "missing_reason" };
  if (!input.asDraft && !input.emergencyContact.trim()) return { ok: false, error: "missing_emergency_contact" };

  const service = getSupabaseServiceClient();
  const requestInput = {
    applicantName: input.applicantName,
    leaveType: input.leaveType as LeaveRequestType,
    startDate: input.startDate,
    endDate: input.endDate,
    durationUnit: input.durationUnit as LeaveDurationUnit,
    daysCount: input.daysCount,
    reason: input.reason,
    emergencyContact: input.emergencyContact,
    asDraft: input.asDraft,
  };
  const result = input.requestId
    ? await updateDraftLeaveRequest(service, session.organization.id, session.user.id, input.requestId, requestInput)
    : await createLeaveRequest(service, session.organization.id, session.user.id, requestInput);
  if (!result.ok) return result;

  revalidatePath(LEAVE_PATH);
  revalidatePath(LEAVE_HISTORY_PATH);
  return result;
}

export type CancelLeaveRequestResult =
  | { ok: true; startDate: string; endDate: string; daysCount: number }
  | { ok: false; error: string };

export async function cancelLeaveRequestAction(requestId: string): Promise<CancelLeaveRequestResult> {
  const session = await getCurrentAppSession();
  if (!session || !hasOrganizationContext(session)) return { ok: false, error: "auth" };

  const service = getSupabaseServiceClient();
  const result = await cancelLeaveRequest(service, session.organization.id, session.user.id, requestId);
  if (!result.ok) return result;

  revalidatePath(LEAVE_PATH);
  revalidatePath(LEAVE_HISTORY_PATH);
  return result;
}

export type DeleteLeaveRequestDraftResult = { ok: true } | { ok: false; error: string };

export async function deleteLeaveRequestDraftAction(requestId: string): Promise<DeleteLeaveRequestDraftResult> {
  const session = await getCurrentAppSession();
  if (!session || !hasOrganizationContext(session)) return { ok: false, error: "auth" };

  const service = getSupabaseServiceClient();
  const result = await deleteLeaveRequestDraft(service, session.organization.id, session.user.id, requestId);
  if (!result.ok) return result;

  revalidatePath(LEAVE_PATH);
  revalidatePath(LEAVE_HISTORY_PATH);
  return result;
}
