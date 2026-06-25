import { redirect } from "next/navigation";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { getOnboardingState } from "@/lib/onboarding";
import { getDictionary } from "@/lib/i18n";
import { BoardComposeClient } from "./board-compose-client";

export default async function BoardComposePage() {
  const [state, session] = await Promise.all([
    getOnboardingState(),
    getCurrentAppSession(),
  ]);
  if (state.status === "unauthenticated") {
    redirect("/auth/login?next=/mobile/board/compose");
  }
  if (state.status !== "ready" || !session) {
    redirect("/onboarding");
  }
  if (!hasOrganizationContext(session)) {
    redirect("/mobile/unavailable");
  }

  const dictionary = getDictionary(session.user.preferredLanguage);
  return (
    <BoardComposeClient
      copy={dictionary.board}
      orgId={session.organization.id}
    />
  );
}
