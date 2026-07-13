"use client";

// TEMP design-verification route (unauthenticated) — renders the full leave console (sub-tabs + all
// views) inside the .adm scope with empty mock data so computed styles can be diffed against the
// handoff standalone. NOT committed; deleted after the pixel-fidelity pass.
import "@/components/admin/admin-console.css";
import { LeaveQueueClient } from "@/components/admin/attendance/leave-queue-client";

export default function LeavePreviewPage() {
  return (
    <div className="adm" style={{ background: "var(--bg)", minHeight: "100vh" }}>
      <div style={{ maxWidth: 1328, margin: "0 auto", padding: "18px 22px" }}>
        <LeaveQueueClient
          initialItems={[]}
          summary={{ pendingCount: 0, pendingDays: 0, approvedThisWeekCount: 0, balanceWarningName: null }}
          initialStatusGroup="all"
          initialType={null}
          initialSearch=""
          initialRequestId={null}
          locale="ko"
          applicants={[]}
          balances={[]}
          documents={[]}
          ledger={[]}
          currentUserId="preview"
          currentUserName="테스트"
        />
      </div>
    </div>
  );
}
