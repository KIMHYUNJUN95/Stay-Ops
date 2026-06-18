import { redirect } from "next/navigation";
import { MobileShell } from "@/components/shell/mobile-shell";
import { AttendanceCapture } from "@/components/attendance/attendance-capture";
import { getMobileNavBadges } from "@/lib/nav-badges";
import { getOnboardingState } from "@/lib/onboarding";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { getDictionary } from "@/lib/i18n";

type PageProps = {
  searchParams: Promise<{ mode?: string }>;
};

// Attendance / 근태 — GPS + QR capture (clock-in or clock-out). Step 3: wired to real actions.
// See docs/product/24-attendance-workflow.md and docs/product/21-attendance-payroll-workflow.md.
export default async function MobileAttendanceCapturePage({ searchParams }: PageProps) {
  const [state, session, params] = await Promise.all([
    getOnboardingState(),
    getCurrentAppSession(),
    searchParams,
  ]);

  if (state.status === "unauthenticated") {
    redirect(`/auth/login?next=${encodeURIComponent("/mobile/attendance/capture")}`);
  }
  if (state.status !== "ready" || !session) {
    redirect("/onboarding");
  }
  if (!hasOrganizationContext(session)) {
    redirect("/admin");
  }

  const dict = getDictionary(session.user.preferredLanguage);
  const navBadges = await getMobileNavBadges();
  const mode = params.mode === "out" ? "out" : "in";

  return (
    <MobileShell
      activeItem="attendance"
      badges={navBadges}
      title={mode === "out" ? dict.attendance.captureOutTitle : dict.attendance.captureInTitle}
      hideBottomNav
    >
      <AttendanceCapture mode={mode} locale={session.user.preferredLanguage} />
    </MobileShell>
  );
}
