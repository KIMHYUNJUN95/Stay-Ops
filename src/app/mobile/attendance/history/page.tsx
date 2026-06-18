import { redirect } from "next/navigation";
import { MobileShell } from "@/components/shell/mobile-shell";
import { AttendanceHistory } from "@/components/attendance/attendance-history";
import { getMobileNavBadges } from "@/lib/nav-badges";
import { getOnboardingState } from "@/lib/onboarding";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { getAttendanceHistory, getAttendanceTodaySummary } from "@/lib/attendance-history";
import { getDictionary } from "@/lib/i18n";

type PageProps = {
  searchParams: Promise<{ ym?: string }>;
};

function currentTokyoYm(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date())
    .slice(0, 7);
}

// Attendance / 근태 — own attendance history (Step 5). Self-view only: every query is scoped to the
// authenticated user's id server-side; there is no client-supplied target user. A `?ym=YYYY-MM`
// param (Tokyo) selects the operating month; defaults to the current month.
// See docs/product/21-attendance-payroll-workflow.md and docs/product/24-attendance-workflow.md.
export default async function MobileAttendanceHistoryPage({ searchParams }: PageProps) {
  const [state, session, params] = await Promise.all([
    getOnboardingState(),
    getCurrentAppSession(),
    searchParams,
  ]);

  if (state.status === "unauthenticated") {
    redirect(`/auth/login?next=${encodeURIComponent("/mobile/attendance/history")}`);
  }
  if (state.status !== "ready" || !session) {
    redirect("/onboarding");
  }
  if (!hasOrganizationContext(session)) {
    redirect("/admin");
  }

  const dict = getDictionary(session.user.preferredLanguage);
  const currentYm = currentTokyoYm();
  const ym = /^\d{4}-\d{2}$/.test(params.ym ?? "") ? (params.ym as string) : currentYm;

  const [navBadges, summary, sessions] = await Promise.all([
    getMobileNavBadges(),
    getAttendanceTodaySummary(session.organization.id, session.user.id),
    getAttendanceHistory(session.organization.id, session.user.id, ym),
  ]);

  return (
    <MobileShell activeItem="attendance" badges={navBadges} title={dict.attendance.historyTitle}>
      <AttendanceHistory
        summary={summary}
        sessions={sessions}
        ym={ym}
        currentYm={currentYm}
        locale={session.user.preferredLanguage}
      />
    </MobileShell>
  );
}
