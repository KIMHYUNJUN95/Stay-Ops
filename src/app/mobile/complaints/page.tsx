import { redirect } from "next/navigation";
import { MobileShell } from "@/components/shell/mobile-shell";
import { ComplaintList } from "@/components/complaints/complaint-list";
import { getMobileNavBadges } from "@/lib/nav-badges";
import { getOnboardingState } from "@/lib/onboarding";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { getDictionary } from "@/lib/i18n";
import { listComplaints, canWriteComplaint } from "@/lib/complaints";

// Complaints / 컴플레인 — Screen 1 (list). See docs/product/26-complaint-workflow.md.
export default async function MobileComplaintsPage() {
  const [state, session] = await Promise.all([getOnboardingState(), getCurrentAppSession()]);

  if (state.status === "unauthenticated") {
    redirect(`/auth/login?next=${encodeURIComponent("/mobile/complaints")}`);
  }
  if (state.status !== "ready" || !session) {
    redirect("/onboarding");
  }
  if (!hasOrganizationContext(session)) {
    redirect("/mobile/unavailable");
  }

  const locale = session.user.preferredLanguage;
  const dict = getDictionary(locale);

  const [complaints, navBadges] = await Promise.all([
    listComplaints({ session }),
    getMobileNavBadges(),
  ]);

  return (
    <MobileShell activeItem="complaints" badges={navBadges} title={dict.complaints.pageTitle}>
      <ComplaintList
        locale={locale}
        complaints={complaints}
        canCreate={canWriteComplaint(session.user.role)}
      />
    </MobileShell>
  );
}
