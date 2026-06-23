import { redirect } from "next/navigation";
import { SuggestionsNotif } from "@/components/suggestions/suggestions-notif";
import { MobileShell } from "@/components/shell/mobile-shell";
import { getOnboardingState } from "@/lib/onboarding";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { getMobileNavBadges } from "@/lib/nav-badges";

// Notifications screen — rendered as the Feedback Box "frame 9" mockup (UI/UX
// only, static sample data, no app chrome). The live data-driven UI lives in
// `src/components/notifications/notification-list.tsx`, preserved for re-wiring
// once the backend is connected. See docs/product/22-staff-suggestions-workflow.md.
export default async function MobileNotificationsPage() {
  const [state, session] = await Promise.all([
    getOnboardingState(),
    getCurrentAppSession(),
  ]);

  if (state.status === "unauthenticated") {
    redirect("/auth/login?next=/mobile/notifications");
  }
  if (state.status !== "ready" || !session) {
    redirect("/onboarding");
  }
  if (!hasOrganizationContext(session)) {
    redirect("/admin");
  }

  const navBadges = await getMobileNavBadges();

  return (
    <MobileShell badges={navBadges} title="알림">
      <SuggestionsNotif />
    </MobileShell>
  );
}
