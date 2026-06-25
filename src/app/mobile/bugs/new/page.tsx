import { redirect } from "next/navigation";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { getOnboardingState } from "@/lib/onboarding";
import { getDictionary } from "@/lib/i18n";
import { BugComposeClient } from "./bug-compose-client";

export default async function MobileBugComposePage() {
  const [state, session] = await Promise.all([
    getOnboardingState(),
    getCurrentAppSession(),
  ]);

  if (state.status === "unauthenticated") {
    redirect("/auth/login?next=/mobile/bugs/new");
  }
  if (state.status !== "ready" || !session) {
    redirect("/onboarding");
  }
  if (!hasOrganizationContext(session)) {
    redirect("/mobile/unavailable");
  }

  const copy = getDictionary(session.user.preferredLanguage).bugs;

  return <BugComposeClient copy={copy} />;
}
