// 출근자 명단 페이지 — 매니저/오피스 역할만 접근 가능.
// cleaningRecordViewerRoles에 포함되지 않으면 /mobile/attendance 로 리다이렉트.

import { redirect } from "next/navigation";
import { MobileShell } from "@/components/shell/mobile-shell";
import { AttendanceRoster } from "@/components/attendance/attendance-roster";
import { getMobileNavBadges } from "@/lib/nav-badges";
import { getOnboardingState } from "@/lib/onboarding";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { getAttendanceRoster } from "@/lib/attendance-roster";
import { cleaningRecordViewerRoles } from "@/config/roles";
import { getDictionary } from "@/lib/i18n";

type PageProps = {
  searchParams: Promise<{ date?: string }>;
};

export default async function AttendanceRosterPage({ searchParams }: PageProps) {
  const [onboardingState, session, params] = await Promise.all([
    getOnboardingState(),
    getCurrentAppSession(),
    searchParams,
  ]);

  if (onboardingState.status === "unauthenticated") {
    redirect(`/auth/login?next=${encodeURIComponent("/mobile/attendance/roster")}`);
  }
  if (onboardingState.status !== "ready" || !session) {
    redirect("/onboarding");
  }
  if (!hasOrganizationContext(session)) {
    redirect("/mobile/unavailable");
  }

  // 역할 게이트 — 매니저/오피스급이 아니면 출근자 명단 접근 불가
  if (!(cleaningRecordViewerRoles as readonly string[]).includes(session.user.role)) {
    redirect("/mobile/attendance");
  }

  const todayDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());

  // searchParams에서 날짜 파싱 — 미래/과거 90일 초과는 오늘로 clamp
  let operatingDate = todayDate;
  if (params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
    if (params.date <= todayDate) {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const minDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(ninetyDaysAgo);
      operatingDate = params.date >= minDate ? params.date : todayDate;
    }
  }

  const [navBadges, rosterDay] = await Promise.all([
    getMobileNavBadges(),
    getAttendanceRoster(session.organization.id, operatingDate),
  ]);

  const locale = session.user.preferredLanguage;
  const dict = getDictionary(locale);

  return (
    <MobileShell activeItem="attendance" badges={navBadges} title={dict.attendance.rosterPageTitle}>
      <AttendanceRoster
        rosterDay={rosterDay}
        operatingDate={operatingDate}
        todayDate={todayDate}
        locale={locale}
      />
    </MobileShell>
  );
}
