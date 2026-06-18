import { redirect } from "next/navigation";
import { MobileShell } from "@/components/shell/mobile-shell";
import { AttendanceHome } from "@/components/attendance/attendance-home";
import { getMobileNavBadges } from "@/lib/nav-badges";
import { getOnboardingState } from "@/lib/onboarding";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import {
  getCurrentOpenSession,
  hasOpenReminderResponseToday,
  isPastReminderTimeTokyo,
} from "@/lib/attendance-sessions";

type PageProps = {
  searchParams: Promise<{ state?: string }>;
};

// `?state=` is a design-preview override (break/loading still render as static design previews);
// without it the home renders from REAL session data (idle vs open).
const PREVIEW_STATES = ["idle", "open", "break", "loading"] as const;

// Attendance / 근태 — home (ring-hero clock). Step 3: wired to real open-session state.
// See docs/product/24-attendance-workflow.md and docs/product/21-attendance-payroll-workflow.md.
export default async function MobileAttendancePage({ searchParams }: PageProps) {
  const [state, session, params] = await Promise.all([
    getOnboardingState(),
    getCurrentAppSession(),
    searchParams,
  ]);

  if (state.status === "unauthenticated") {
    redirect(`/auth/login?next=${encodeURIComponent("/mobile/attendance")}`);
  }
  if (state.status !== "ready" || !session) {
    redirect("/onboarding");
  }
  if (!hasOrganizationContext(session)) {
    redirect("/admin");
  }

  const navBadges = await getMobileNavBadges();

  // Explicit `?state=` keeps the design-preview switcher working (static visuals, no real data).
  const previewState = PREVIEW_STATES.includes((params.state ?? "") as (typeof PREVIEW_STATES)[number])
    ? (params.state as (typeof PREVIEW_STATES)[number])
    : null;

  // Real state: open session with an open break → 휴게 중; open session → 근무 중; otherwise → 출근 전.
  const openSession = previewState
    ? null
    : await getCurrentOpenSession(session.organization.id, session.user.id);
  const homeState =
    previewState ??
    (openSession ? (openSession.openBreakStartedAt ? "break" : "open") : "idle");

  // 18:30 open-session reminder: shown once per Tokyo day while a session is still open and the user
  // hasn't answered yet. Suppressed in design-preview mode.
  let reminderOpenSessionId: string | null = null;
  if (!previewState && openSession && isPastReminderTimeTokyo()) {
    const answered = await hasOpenReminderResponseToday(session.organization.id, session.user.id);
    if (!answered) reminderOpenSessionId = openSession.id;
  }

  const name = session.user.name?.trim() || "사용자";
  const todayLabel = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
    timeZone: "Asia/Tokyo",
  }).format(new Date());

  return (
    <MobileShell activeItem="attendance" badges={navBadges} title="근태">
      <AttendanceHome
        state={homeState}
        todayLabel={todayLabel}
        userInitial={name.slice(0, 1)}
        userName={name}
        openSession={
          openSession
            ? {
                clockInAt: openSession.clockInAt,
                clockInTimeLabel: openSession.clockInTimeLabel,
                siteName: openSession.siteName,
                openBreakStartedAt: openSession.openBreakStartedAt,
                closedBreakSeconds: openSession.closedBreakSeconds,
                breakCount: openSession.breakCount,
              }
            : null
        }
        reminderOpenSessionId={reminderOpenSessionId}
      />
    </MobileShell>
  );
}
