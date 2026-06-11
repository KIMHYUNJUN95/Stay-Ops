import { redirect } from "next/navigation";
import { TaskCreateForm } from "@/components/tasks/task-create-form";
import { MobileShell } from "@/components/shell/mobile-shell";
import { getDictionary } from "@/lib/i18n";
import { getMobileNavBadges } from "@/lib/nav-badges";
import { getOnboardingState } from "@/lib/onboarding";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { canEditTaskCore, getShareableUsers, getTaskDetail, tokyoDateOf } from "@/lib/tasks";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function MobileTaskEditPage({ params, searchParams }: PageProps) {
  const [state, session, { id }, query] = await Promise.all([
    getOnboardingState(),
    getCurrentAppSession(),
    params,
    searchParams,
  ]);

  if (state.status === "unauthenticated") {
    redirect(`/auth/login?next=${encodeURIComponent(`/mobile/tasks/${id}/edit`)}`);
  }
  if (state.status !== "ready" || !session) {
    redirect("/onboarding");
  }
  if (!hasOrganizationContext(session)) {
    redirect("/admin");
  }

  const task = await getTaskDetail(session, id);
  if (!task) {
    redirect("/mobile/tasks");
  }
  const detailHref = `/mobile/tasks/${id}`;
  if (!canEditTaskCore(session, task)) {
    redirect(detailHref);
  }

  const locale = session.user.preferredLanguage;
  const dict = getDictionary(locale);
  const copy = dict.tasks;
  const serverError = query.error ? copy.errors[query.error] ?? copy.errors.save_failed : null;

  const [users, navBadges] = await Promise.all([
    getShareableUsers(session),
    getMobileNavBadges(),
  ]);

  return (
    <MobileShell activeItem="tasks" badges={navBadges} title={copy.editTask}>
      <TaskCreateForm
        backHref={detailHref}
        copy={copy}
        defaultDate={null}
        headerTitle={copy.editTask}
        imgCopy={dict.requestImages}
        locale={locale}
        initial={{
          title: task.title,
          description: task.description ?? "",
          scheduled: task.scheduledDate ?? "",
          due: tokyoDateOf(task.dueAt) ?? "",
          time: task.timeLabel ?? "",
          priority: task.priority,
          repeat: task.recurrenceRule ?? "",
          tags: task.tags,
          imageUrls: task.imageUrls,
        }}
        mode="edit"
        organizationId={session.organization.id}
        serverError={serverError}
        taskId={task.id}
        users={users}
      />
    </MobileShell>
  );
}
