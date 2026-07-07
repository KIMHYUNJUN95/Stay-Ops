import "server-only";

import { redirect } from "next/navigation";
import { canAccessAdminWeb } from "@/config/roles";
import { getOnboardingState } from "@/lib/onboarding";
import { getCurrentAppSession, hasOrganizationContext, type AppSession } from "@/lib/session";

type RequireAdminPageSessionOptions = {
  nextPath: string;
};

/** Shared admin-page gate: auth -> onboarding/org context -> admin-web role access. */
export async function requireAdminPageSession({
  nextPath,
}: RequireAdminPageSessionOptions): Promise<AppSession> {
  const [state, session] = await Promise.all([getOnboardingState(), getCurrentAppSession()]);

  if (state.status === "unauthenticated") {
    redirect(`/auth/login?next=${encodeURIComponent(nextPath)}`);
  }
  if (state.status !== "ready" || !session || !hasOrganizationContext(session)) {
    redirect("/onboarding");
  }
  if (!canAccessAdminWeb(session.user.role)) {
    redirect("/mobile");
  }

  return session;
}
