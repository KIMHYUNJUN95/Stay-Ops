import { AdminShell } from "@/components/shell/admin-shell";
import { AttendanceSubnav } from "@/components/admin/attendance/attendance-subnav";
import { LeaveQueueClient } from "@/components/admin/attendance/leave-queue-client";
import {
  getAdminLeaveQueue,
  type LeaveStatusGroup,
  type LeaveType,
} from "@/lib/annual-leave-approvals-server";
import { requireAdminPageSession } from "@/lib/admin-page-auth";
import { getDictionary } from "@/lib/i18n";
import { CircleAlert } from "lucide-react";

const STATUS_GROUPS: LeaveStatusGroup[] = ["pending", "approved", "rejectedCancelled", "all"];
const LEAVE_TYPES: LeaveType[] = ["annual", "paid", "special", "other"];

// Admin · Attendance · Leave approval review (Slice 1).
// Only the "승인 심사" sub-tab is functional this slice; the other four leave sub-tabs
// (팀 캘린더 / 직원 잔여·부여 / 승인자 관리 / 문서) render as disabled placeholders.
// See docs/product/26-annual-leave-workflow.md.
export default async function AdminAttendanceLeavePage({
  searchParams,
}: {
  searchParams: Promise<{ statusGroup?: string; type?: string; q?: string; requestId?: string }>;
}) {
  const [session, params] = await Promise.all([
    requireAdminPageSession({ nextPath: "/admin/attendance/leave" }),
    searchParams,
  ]);

  const locale = session.user.preferredLanguage;
  const dictionary = getDictionary(locale);
  const c = dictionary.admin.attendanceConsole;
  const lc = dictionary.admin.leaveConsole;

  const statusGroup: LeaveStatusGroup = STATUS_GROUPS.includes(
    params.statusGroup as LeaveStatusGroup,
  )
    ? (params.statusGroup as LeaveStatusGroup)
    : "pending";
  const type: LeaveType | undefined = LEAVE_TYPES.includes(params.type as LeaveType)
    ? (params.type as LeaveType)
    : undefined;
  const search = typeof params.q === "string" ? params.q : undefined;

  // The client filters by status group / type / search locally (its tabs are buttons, not links) and
  // needs the FULL set to compute the per-group counts, so always fetch every group here. The URL's
  // statusGroup/type/search are passed through only as the client's initial UI state (deep-linking).
  const queue = await getAdminLeaveQueue(session, { statusGroup: "all" });

  return (
    <AdminShell activeItem="attendance" title={lc.header}>
      <AttendanceSubnav active="leave" monthLabel={lc.header} c={c} />
      {queue.isApprover ? (
        <LeaveQueueClient
          initialItems={queue.items}
          summary={queue.summary}
          initialStatusGroup={statusGroup}
          initialType={type ?? null}
          initialSearch={search ?? ""}
          initialRequestId={typeof params.requestId === "string" ? params.requestId : null}
          locale={locale}
        />
      ) : (
        <div className="card">
          <div className="state">
            <span className="state__ic empty">
              <span className="ic">
                <CircleAlert />
              </span>
            </span>
            <div className="state__t">{lc.noDataTitle}</div>
            <div className="state__s">{lc.noDataBody}</div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
