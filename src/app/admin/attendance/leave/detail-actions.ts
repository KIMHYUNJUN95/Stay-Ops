"use server";

// Client-callable wrapper around the leave-approval detail query — resolves the session
// server-side (never trust a client-supplied session) before delegating to the lib helper.
// Separate from actions.ts (backend-owned: approve/reject) to keep ownership boundaries clean.
import { getCurrentAppSession } from "@/lib/session";
import {
  getAdminLeaveApprovalDetail,
  type LeaveApprovalDetail,
} from "@/lib/annual-leave-approvals-server";
import {
  getApplicantLeaveSummary,
  type ApplicantLeaveSummary,
} from "@/lib/annual-leave-admin-server";

export async function loadLeaveApprovalDetail(
  requestId: string,
): Promise<LeaveApprovalDetail | null> {
  const session = await getCurrentAppSession();
  if (!session) return null;
  return getAdminLeaveApprovalDetail(session, requestId);
}

/** Live balance for the request modal's "잔여 영향" preview when an applicant is picked. */
export async function loadApplicantLeaveSummary(
  userId: string,
): Promise<ApplicantLeaveSummary | null> {
  const session = await getCurrentAppSession();
  if (!session) return null;
  return getApplicantLeaveSummary(session, userId);
}
