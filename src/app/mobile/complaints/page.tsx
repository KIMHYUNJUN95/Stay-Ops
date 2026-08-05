import { redirect } from "next/navigation";
import { MobileShell } from "@/components/shell/mobile-shell";
import { ComplaintList } from "@/components/complaints/complaint-list";
import { ComplaintViewTabs } from "@/components/complaints/complaint-view-tabs";
import { ReviewList } from "@/components/complaints/review-list";
import { getMobileNavBadges } from "@/lib/nav-badges";
import { getOnboardingState } from "@/lib/onboarding";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { getDictionary } from "@/lib/i18n";
import { listComplaints, canWriteComplaint } from "@/lib/complaints";
import { listExternalReviews } from "@/lib/external-reviews";

type PageProps = {
  searchParams: Promise<{ view?: string }>;
};

// Complaints / 컴플레인 — 2뷰 진입점 (수동 컴플레인 / 외부 리뷰).
// See docs/product/25-complaint-workflow.md, docs/product/16-mobile-navigation.md.
export default async function MobileComplaintsPage({ searchParams }: PageProps) {
  const [state, session, params] = await Promise.all([
    getOnboardingState(),
    getCurrentAppSession(),
    searchParams,
  ]);

  if (state.status === "unauthenticated") {
    redirect(`/auth/login?next=${encodeURIComponent("/mobile/complaints")}`);
  }
  if (state.status !== "ready" || !session) {
    redirect("/onboarding");
  }
  if (!hasOrganizationContext(session)) {
    redirect("/mobile/unavailable");
  }

  const view = params.view === "reviews" ? "reviews" : "manual";
  const locale = session.user.preferredLanguage;
  const dict = getDictionary(locale);
  const navBadges = await getMobileNavBadges();

  if (view === "reviews") {
    const reviews = await listExternalReviews({ session });
    return (
      <MobileShell activeItem="complaints" badges={navBadges} title={dict.complaints.pageTitle}>
        <ComplaintViewTabs view={view} dict={dict} />
        <ReviewList locale={locale} reviews={reviews} />
      </MobileShell>
    );
  }

  const complaints = await listComplaints({ session });
  return (
    <MobileShell activeItem="complaints" badges={navBadges} title={dict.complaints.pageTitle}>
      <ComplaintViewTabs view={view} dict={dict} />
      <ComplaintList
        locale={locale}
        complaints={complaints}
        canCreate={canWriteComplaint(session.user.role)}
      />
    </MobileShell>
  );
}
