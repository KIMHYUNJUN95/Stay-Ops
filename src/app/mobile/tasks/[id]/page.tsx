import { redirect } from "next/navigation";
import { TaskDetailView } from "@/components/tasks/task-detail-view";
import { MobileShell } from "@/components/shell/mobile-shell";
import { getDictionary } from "@/lib/i18n";
import { getMobileNavBadges } from "@/lib/nav-badges";
import { getOnboardingState } from "@/lib/onboarding";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { canEditTaskCore, getShareableUsers, getTaskDetail } from "@/lib/tasks";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function MobileTaskDetailPage({ params }: PageProps) {
  const [state, session, { id }] = await Promise.all([
    getOnboardingState(),
    getCurrentAppSession(),
    params,
  ]);

  if (state.status === "unauthenticated") {
    redirect(`/auth/login?next=${encodeURIComponent(`/mobile/tasks/${id}`)}`);
  }
  if (state.status !== "ready" || !session) {
    redirect("/onboarding");
  }
  if (!hasOrganizationContext(session)) {
    redirect("/mobile/unavailable");
  }

  const task = await getTaskDetail(session, id);
  if (!task) {
    redirect("/mobile/tasks");
  }

  const locale = session.user.preferredLanguage;
  const dict = getDictionary(locale);
  const [users, navBadges] = await Promise.all([
    getShareableUsers(session),
    getMobileNavBadges(),
  ]);

  return (
    <MobileShell activeItem="tasks" badges={navBadges} title={dict.tasks.detailTitle}>
      <TaskDetailView
        buildingLabels={dict.cleaning.buildingLabels}
        canEditCore={canEditTaskCore(session, task)}
        copy={dict.tasks}
        currentUserId={session.user.id}
        imgCopy={dict.requestImages}
        locale={locale}
        task={task}
        users={users}
      />
    </MobileShell>
  );
}
