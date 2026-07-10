import { CircleAlert } from "lucide-react";
import { AdminShell } from "@/components/shell/admin-shell";
import { AttendanceSubnav } from "@/components/admin/attendance/attendance-subnav";
import { AttendancePayrollClient } from "@/components/admin/attendance/attendance-payroll-client";
import {
  currentTokyoYm,
  getAdminAttendanceBadgeStats,
  getAdminAttendancePayroll,
} from "@/lib/admin-attendance";
import { requireAdminPageSession } from "@/lib/admin-page-auth";
import { getDictionary } from "@/lib/i18n";

// Admin · Attendance · Payroll (Slice 4).
// Monthly per-user payroll review wired to existing `getMonthlyPayView` +
// finalize/reopen/export server actions. Month is controlled by the shared attendance subnav picker.
// See docs/product/05-admin-web-ia.md → "Attendance / Payroll / Transportation".
export default async function AdminAttendancePayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string }>;
}) {
  const [session, params] = await Promise.all([
    requireAdminPageSession({ nextPath: "/admin/attendance/payroll" }),
    searchParams,
  ]);

  const locale = session.user.preferredLanguage;
  const dictionary = getDictionary(locale);
  const c = dictionary.admin.attendanceConsole;
  const localeTag = locale === "ko" ? "ko-KR" : locale === "ja" ? "ja-JP" : "en-US";
  const requestedYm =
    typeof params.ym === "string" && /^\d{4}-\d{2}$/.test(params.ym)
      ? params.ym
      : currentTokyoYm();

  const [badgeStats, payroll] = await Promise.all([
    getAdminAttendanceBadgeStats(session, requestedYm),
    getAdminAttendancePayroll(session, requestedYm, localeTag),
  ]);

  return (
    <AdminShell activeItem="attendance" title={c.headerPayroll}>
      <AttendanceSubnav
        active="payroll"
        monthLabel={payroll.monthLabel}
        c={c}
        ym={payroll.ym}
        localeTag={localeTag}
        badges={{
          queue: {
            n: badgeStats.queueOpen,
            urgent: badgeStats.queueUrgent > 0,
          },
          payroll: { n: payroll.kpi.hourlyTarget },
          transport: { n: badgeStats.transportPending },
        }}
      />

      {payroll.isPrivileged ? (
        <AttendancePayrollClient
          key={payroll.ym}
          ym={payroll.ym}
          monthLabel={payroll.monthLabel}
          initialRows={payroll.rows}
          initialKpi={payroll.kpi}
          locale={locale}
          localeTag={localeTag}
        />
      ) : (
        <div className="card">
          <div className="state">
            <span className="state__ic empty">
              <span className="ic">
                <CircleAlert />
              </span>
            </span>
            <div className="state__t">{c.payNoDataTitle}</div>
            <div className="state__s">{c.payNoDataBody}</div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
