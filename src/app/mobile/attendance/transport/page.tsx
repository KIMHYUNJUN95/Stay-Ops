import { redirect } from "next/navigation";
import { MobileShell } from "@/components/shell/mobile-shell";
import { TransportStatement } from "@/components/attendance/transport-statement";
import { getMobileNavBadges } from "@/lib/nav-badges";
import { getOnboardingState } from "@/lib/onboarding";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { getDictionary } from "@/lib/i18n";

// Mobile — 교통비 정산서 (Transport Expense Statement).
// Design-only: uses mock data from the "09 정산서" HTML mockup.
// See docs/product/24-attendance-workflow.md.
export default async function MobileTransportPage() {
  const [state, session] = await Promise.all([getOnboardingState(), getCurrentAppSession()]);

  if (state.status === "unauthenticated") {
    redirect(`/auth/login?next=${encodeURIComponent("/mobile/attendance/transport")}`);
  }
  if (state.status !== "ready" || !session) {
    redirect("/onboarding");
  }
  if (!hasOrganizationContext(session)) {
    redirect("/mobile/unavailable");
  }

  const [navBadges, dict] = await Promise.all([
    getMobileNavBadges(),
    Promise.resolve(getDictionary(session.user.preferredLanguage)),
  ]);

  const locale = session.user.preferredLanguage;
  const localeTag = locale === "ko" ? "ko-KR" : locale === "ja" ? "ja-JP" : "en-US";

  // Tokyo month label for the statement header (e.g. "2026년 6월")
  const monthLabel = new Intl.DateTimeFormat(localeTag, {
    year: "numeric",
    month: "long",
    timeZone: "Asia/Tokyo",
  }).format(new Date());

  const userName = session.user.name?.trim() || dict.attendance.userFallback;

  return (
    <MobileShell activeItem="attendance" badges={navBadges} title={dict.transport.pageTitle}>
      <TransportStatement
        locale={locale}
        userName={userName}
        teamName="청소팀"
        monthLabel={monthLabel}
      />
    </MobileShell>
  );
}
