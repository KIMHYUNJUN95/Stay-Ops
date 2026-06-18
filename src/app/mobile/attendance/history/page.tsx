import { redirect } from "next/navigation";
import { MobileShell } from "@/components/shell/mobile-shell";
import { AttendanceHistory } from "@/components/attendance/attendance-history";
import { getMobileNavBadges } from "@/lib/nav-badges";
import { getOnboardingState } from "@/lib/onboarding";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { getAttendanceHistory, getAttendanceTodaySummary } from "@/lib/attendance-history";

// Attendance / 근태 — own attendance history (Step 5). Self-view only: every query is scoped to the
// authenticated user's id server-side; there is no client-supplied target user.
// See docs/product/21-attendance-payroll-workflow.md and docs/product/24-attendance-workflow.md.
export default async function MobileAttendanceHistoryPage() {
  const [state, session] = await Promise.all([getOnboardingState(), getCurrentAppSession()]);

  if (state.status === "unauthenticated") {
    redirect(`/auth/login?next=${encodeURIComponent("/mobile/attendance/history")}`);
  }
  if (state.status !== "ready" || !session) {
    redirect("/onboarding");
  }
  if (!hasOrganizationContext(session)) {
    redirect("/admin");
  }

  const [navBadges, summary, sessions] = await Promise.all([
    getMobileNavBadges(),
    getAttendanceTodaySummary(session.organization.id, session.user.id),
    getAttendanceHistory(session.organization.id, session.user.id),
  ]);

  return (
    <MobileShell activeItem="attendance" badges={navBadges} title="출퇴근 이력">
      <AttendanceHistory summary={summary} sessions={sessions} />
    </MobileShell>
  );
}
