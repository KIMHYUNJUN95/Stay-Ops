import { redirect } from "next/navigation";
import { MobileShell } from "@/components/shell/mobile-shell";
import { AttendancePay } from "@/components/attendance/attendance-pay";
import { getMobileNavBadges } from "@/lib/nav-badges";
import { getOnboardingState } from "@/lib/onboarding";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { getMonthlyPayView } from "@/lib/attendance-pay";

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

function shiftYm(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const idx = (y * 12 + (m - 1)) + delta;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

// Attendance / 근태 — own monthly hourly pay (Step 10, EXPECTED pay). Self-view only: scoped to the
// authenticated user server-side. New screen in the existing design language (no 급여 frame existed).
// See docs/product/21-attendance-payroll-workflow.md and docs/product/24-attendance-workflow.md.
export default async function MobileAttendancePayPage({ searchParams }: PageProps) {
  const [state, session, params] = await Promise.all([
    getOnboardingState(),
    getCurrentAppSession(),
    searchParams,
  ]);

  if (state.status === "unauthenticated") {
    redirect(`/auth/login?next=${encodeURIComponent("/mobile/attendance/pay")}`);
  }
  if (state.status !== "ready" || !session) {
    redirect("/onboarding");
  }
  if (!hasOrganizationContext(session)) {
    redirect("/admin");
  }

  const ym = /^\d{4}-\d{2}$/.test(params.ym ?? "") ? (params.ym as string) : currentTokyoYm();
  const [navBadges, view] = await Promise.all([
    getMobileNavBadges(),
    getMonthlyPayView(session.organization.id, session.user.id, ym),
  ]);

  return (
    <MobileShell activeItem="attendance" badges={navBadges} title="급여">
      <AttendancePay view={view} prevYm={shiftYm(ym, -1)} nextYm={shiftYm(ym, 1)} />
    </MobileShell>
  );
}
