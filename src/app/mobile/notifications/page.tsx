import { redirect } from "next/navigation";
import { SuggestionsNotif } from "@/components/suggestions/suggestions-notif";
import { getOnboardingState } from "@/lib/onboarding";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";

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

  return <SuggestionsNotif />;
}
