import { redirect } from "next/navigation";
import { MobileShell } from "@/components/shell/mobile-shell";
import { getMobileNavBadges } from "@/lib/nav-badges";
import { getOnboardingState } from "@/lib/onboarding";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import {
  getMyBugReports,
  getOrgBugReports,
  isBugReportReviewer,
} from "@/lib/bug-reports";
import { BugsListClient } from "./bugs-list-client";

export default async function MobileBugsPage() {
  const [state, session] = await Promise.all([
    getOnboardingState(),
    getCurrentAppSession(),
  ]);

  if (state.status === "unauthenticated") {
    redirect("/auth/login?next=/mobile/bugs");
  }
  if (state.status !== "ready" || !session) {
    redirect("/onboarding");
  }
  if (!hasOrganizationContext(session)) {
    redirect("/mobile/unavailable");
  }

  const isReviewer = isBugReportReviewer(session);

  const [reports, navBadges] = await Promise.all([
    isReviewer ? getOrgBugReports(session) : getMyBugReports(session),
    getMobileNavBadges(),
  ]);

  return (
    <MobileShell activeItem="bugs" badges={navBadges} title="버그 신고">
      <BugsListClient reports={reports} isReviewer={isReviewer} />
    </MobileShell>
  );
}
