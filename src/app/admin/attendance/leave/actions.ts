"use server";

// Annual leave — admin approval actions (Phase 2, stage 2). Thin wrappers over
// annual-leave-approvals-server.ts. Approver rights (platform admin / org membership with a non-null
// leave_approver_role) are enforced inside those lib functions. See migration 202607060002 and
// docs/product/26-annual-leave-workflow.md.

import { revalidatePath } from "next/cache";
import { requireAdminPageSession } from "@/lib/admin-page-auth";
import {
  approveLeaveRequestForApprover,
  cancelApprovedLeaveForApprover,
  isSessionLeaveApprover,
  rejectLeaveRequestForApprover,
} from "@/lib/annual-leave-approvals-server";
import {
  createAdminLeaveRequest,
  saveEmployeeLeaveBaseline,
  setLeaveApprover,
  type AdminLeaveRequestInput,
} from "@/lib/annual-leave-admin-server";

const LEAVE_PATH = "/admin/attendance/leave";

export async function approveLeaveRequestAction(
  requestId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireAdminPageSession({ nextPath: LEAVE_PATH });
  const result = await approveLeaveRequestForApprover(session, requestId);
  if (result.ok) revalidatePath(LEAVE_PATH);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function rejectLeaveRequestAction(
  requestId: string,
  reason?: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireAdminPageSession({ nextPath: LEAVE_PATH });
  const result = await rejectLeaveRequestForApprover(session, requestId, reason);
  if (result.ok) revalidatePath(LEAVE_PATH);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function cancelApprovedLeaveAction(
  requestId: string,
  reason?: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireAdminPageSession({ nextPath: LEAVE_PATH });
  const result = await cancelApprovedLeaveForApprover(session, requestId, reason);
  if (result.ok) revalidatePath(LEAVE_PATH);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function createAdminLeaveRequestAction(
  input: AdminLeaveRequestInput,
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const session = await requireAdminPageSession({ nextPath: LEAVE_PATH });
  const result = await createAdminLeaveRequest(session, input);
  if (result.ok) revalidatePath(LEAVE_PATH);
  return result.ok ? { ok: true, id: result.id } : { ok: false, error: result.error };
}

/** Edit an employee's hire date + granted balance (직원 잔여·부여 drawer editor). Approver-gated. */
export async function saveEmployeeLeaveBaselineAction(input: {
  userId: string;
  hireDate: string;
  grant: number;
  bonus: number;
}): Promise<{ ok: boolean; error?: string }> {
  const session = await requireAdminPageSession({ nextPath: LEAVE_PATH });
  if (!(await isSessionLeaveApprover(session))) return { ok: false, error: "not_approver" };
  const result = await saveEmployeeLeaveBaseline(session, input);
  if (result.ok) revalidatePath(LEAVE_PATH);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

/** Grant/revoke a member's leave-approval right (승인자 관리 toggle). Approver-gated. */
export async function setLeaveApproverAction(input: {
  userId: string;
  isApprover: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const session = await requireAdminPageSession({ nextPath: LEAVE_PATH });
  if (!(await isSessionLeaveApprover(session))) return { ok: false, error: "not_approver" };
  const result = await setLeaveApprover(session, input);
  if (result.ok) revalidatePath(LEAVE_PATH);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}
