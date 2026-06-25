import { notFound, redirect } from "next/navigation";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { getOnboardingState } from "@/lib/onboarding";
import { getBoardPost, ensureBoardPostRead } from "@/lib/board-queries";
import { getDictionary } from "@/lib/i18n";
import { BoardDetailClient } from "./board-detail-client";

type PageProps = {
  params: Promise<{ id: string }>;
};

const MANAGER_ROLES = new Set(["owner", "office_admin"]);

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

  const post = await getBoardPost({ session, id });
  if (!post) {
    notFound();
  }

  // Read receipt (server-side, no revalidate) — mirrors ensureAnnouncementRead. The nav unread badge
  // recomputes on the next request.
  await ensureBoardPostRead(session, id);

  return (
    <BoardDetailClient
      post={post}
      viewerId={session.user.id}
      viewerInitial={session.user.name?.charAt(0) || "·"}
      canManage={MANAGER_ROLES.has(session.user.role)}
      organizationId={session.organization.id}
      locale={session.user.preferredLanguage}
      copy={getDictionary(session.user.preferredLanguage).board}
    />
  );
}
