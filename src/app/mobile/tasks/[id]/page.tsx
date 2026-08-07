import { redirect } from "next/navigation";
import { TaskDetailView } from "@/components/tasks/task-detail-view";
import { MobileShell } from "@/components/shell/mobile-shell";
import { getDictionary } from "@/lib/i18n";
import { getMobileNavBadges } from "@/lib/nav-badges";
import { getOnboardingState } from "@/lib/onboarding";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { canEditTaskCore, getShareableUsers, getTaskDetail, taskAnchorDate } from "@/lib/tasks";
import { resolvedOccurrenceDates } from "@/lib/task-occurrences";
import { isStandardRecurrence, recurringOccurrencesInRange } from "@/lib/tasks-recurrence";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ occurrence?: string; view?: string }>;
};

export default async function MobileTaskDetailPage({ params, searchParams }: PageProps) {
  const [state, session, { id }, query] = await Promise.all([
    getOnboardingState(),
    getCurrentAppSession(),
    params,
    searchParams,
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
  const candidateOccurrence = typeof query.occurrence === "string" ? query.occurrence : "";
  const anchor = taskAnchorDate(task);
  const matchesRule =
    /^\d{4}-\d{2}-\d{2}$/.test(candidateOccurrence) &&
    !!anchor &&
    isStandardRecurrence(task.recurrenceRule) &&
    recurringOccurrencesInRange(
      task.recurrenceRule,
      anchor,
      candidateOccurrence,
      candidateOccurrence,
    ).length === 1;
  const [users, navBadges, resolvedDates] = await Promise.all([
    getShareableUsers(session),
    getMobileNavBadges(),
    matchesRule ? resolvedOccurrenceDates(task.id) : Promise.resolve(new Set<string>()),
  ]);
  const occurrenceDate = matchesRule && !resolvedDates.has(candidateOccurrence) ? candidateOccurrence : null;
  const returnView = ["today", "tomorrow", "calendar"].includes(query.view ?? "")
    ? (query.view as "today" | "tomorrow" | "calendar")
    : "today";

  return (
    <MobileShell activeItem="tasks" badges={navBadges} title={dict.tasks.detailTitle}>
      <TaskDetailView
        buildingLabels={dict.cleaning.buildingLabels}
        canEditCore={canEditTaskCore(session, task)}
        copy={dict.tasks}
        currentUserId={session.user.id}
        imgCopy={dict.requestImages}
        locale={locale}
        occurrenceDate={occurrenceDate}
        returnView={returnView}
        task={task}
        users={users}
      />
    </MobileShell>
  );
}
