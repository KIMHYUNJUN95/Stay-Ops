"use server";

// Annual leave — admin approval actions (Phase 2, stage 2). Thin wrappers over
// annual-leave-approvals-server.ts. Approver rights (platform admin / org membership with a non-null
// leave_approver_role) are enforced inside those lib functions. See migration 202607060002 and
// docs/product/26-annual-leave-workflow.md.

import { revalidatePath } from "next/cache";
import { requireAdminPageSession } from "@/lib/admin-page-auth";
import {
  approveLeaveRequestForApprover,
  rejectLeaveRequestForApprover,
} from "@/lib/annual-leave-approvals-server";

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
