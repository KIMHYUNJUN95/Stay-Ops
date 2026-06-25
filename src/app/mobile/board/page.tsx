import { redirect } from "next/navigation";
import { getMobileNavBadges } from "@/lib/nav-badges";
import { MobileShell } from "@/components/shell/mobile-shell";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { getOnboardingState } from "@/lib/onboarding";
import { BoardFeedClient } from "./board-feed-client";

export default async function MobileBoardPage() {
  const [state, session] = await Promise.all([
    getOnboardingState(),
    getCurrentAppSession(),
  ]);

  if (state.status === "unauthenticated") {
    redirect("/auth/login?next=/mobile/board");
  }

  if (state.status !== "ready" || !session) {
    redirect("/onboarding");
  }

  if (!hasOrganizationContext(session)) {
    redirect("/mobile/unavailable");
  }

  const navBadges = await getMobileNavBadges();

  return (
    <MobileShell activeItem="board" title="" badges={navBadges}>
      <BoardFeedClient locale={session.user.preferredLanguage} />
    </MobileShell>
  );
}
