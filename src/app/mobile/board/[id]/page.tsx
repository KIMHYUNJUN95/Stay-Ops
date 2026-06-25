import { redirect } from "next/navigation";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { getOnboardingState } from "@/lib/onboarding";
import { BoardDetailClient } from "./board-detail-client";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function BoardPostPage({ params }: PageProps) {
  const { id } = await params;

  const [state, session] = await Promise.all([
    getOnboardingState(),
    getCurrentAppSession(),
  ]);

  if (state.status === "unauthenticated") {
    redirect(`/auth/login?next=/mobile/board/${id}`);
  }

  if (state.status !== "ready" || !session) {
    redirect("/onboarding");
  }

  if (!hasOrganizationContext(session)) {
    redirect("/mobile/unavailable");
  }

  return <BoardDetailClient postId={id} locale={session.user.preferredLanguage} />;
}
