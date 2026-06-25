import { notFound, redirect } from "next/navigation";
import { MobileShell } from "@/components/shell/mobile-shell";
import { getMobileNavBadges } from "@/lib/nav-badges";
import { getOnboardingState } from "@/lib/onboarding";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { getBugReportDetail, isBugReportReviewer } from "@/lib/bug-reports";
import { BugDetailClient } from "./bug-detail-client";

type PageProps = { params: Promise<{ id: string }> };

export default async function MobileBugDetailPage({ params }: PageProps) {
  const { id } = await params;

  const [state, session] = await Promise.all([
    getOnboardingState(),
    getCurrentAppSession(),
  ]);

  if (state.status === "unauthenticated") {
    redirect(`/auth/login?next=/mobile/bugs/${id}`);
  }
  if (state.status !== "ready" || !session) {
    redirect("/onboarding");
  }
  if (!hasOrganizationContext(session)) {
    redirect("/mobile/unavailable");
  }

  const bug = await getBugReportDetail(session, id);
  if (!bug) {
    notFound();
  }

  const isReviewer = isBugReportReviewer(session);
  const viewerIsAuthor = bug.reportedByUserId === session.user.id;

  const navBadges = await getMobileNavBadges();

  return (
    <MobileShell activeItem="bugs" badges={navBadges} title="버그 신고">
      <BugDetailClient
        bug={bug}
        viewerIsAuthor={viewerIsAuthor}
        isReviewer={isReviewer}
      />
    </MobileShell>
  );
}
