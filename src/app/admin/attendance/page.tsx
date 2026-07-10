import { AdminShell } from "@/components/shell/admin-shell";
import { AttendanceSubnav } from "@/components/admin/attendance/attendance-subnav";
import { AttendanceOverview } from "@/components/admin/attendance/attendance-overview";
import { currentTokyoYm, getAdminAttendanceOverview } from "@/lib/admin-attendance";
import { requireAdminPageSession } from "@/lib/admin-page-auth";
import { getDictionary } from "@/lib/i18n";

// Admin · Attendance Overview (Slice 1).
// Shell sub-tab bar + KPI bar + review/correction cards + payroll/transport summary.
// The selected month is controlled by the shared attendance subnav month picker.
// See docs/product/05-admin-web-ia.md → "Attendance / Payroll / Transportation".
export default async function AdminAttendanceOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string }>;
}) {
  const [session, params] = await Promise.all([
    requireAdminPageSession({ nextPath: "/admin/attendance" }),
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
  const data = await getAdminAttendanceOverview(session, localeTag, requestedYm);

  return (
    <AdminShell activeItem="attendance" title={c.headerOverview}>
      <AttendanceSubnav
        active="overview"
        monthLabel={data.monthLabel}
        c={c}
        ym={data.ym}
        localeTag={localeTag}
        badges={{
          queue: { n: data.kpi.reviewSessions + data.kpi.corrOpen, urgent: data.kpi.urgent > 0 },
          payroll: { n: data.kpi.payEstimated },
          transport: { n: data.kpi.trPending },
        }}
      />
      <AttendanceOverview data={data} c={c} localeTag={localeTag} />
    </AdminShell>
  );
}
