import { redirect } from "next/navigation";
import { TasksWorkspace } from "@/components/tasks/tasks-workspace";
import { MobileShell } from "@/components/shell/mobile-shell";
import { getDictionary } from "@/lib/i18n";
import { getMobileNavBadges } from "@/lib/nav-badges";
import { getOnboardingState } from "@/lib/onboarding";
import { getVisibleProjects } from "@/lib/projects";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { getShareableUsers, getVisibleTasks, tokyoToday } from "@/lib/tasks";

type PageProps = {
  searchParams: Promise<{ view?: string; created?: string }>;
};

const VIEWS = [
  "today",
  "tomorrow",
  "inbox",
  "projects",
  "sent",
  "completed",
  "calendar",
] as const;

export default async function MobileTasksPage({ searchParams }: PageProps) {
  const [state, session, params] = await Promise.all([
    getOnboardingState(),
    getCurrentAppSession(),
    searchParams,
  ]);

  if (state.status === "unauthenticated") {
    redirect(`/auth/login?next=${encodeURIComponent("/mobile/tasks")}`);
  }
  if (state.status !== "ready" || !session) {
    redirect("/onboarding");
  }
  if (!hasOrganizationContext(session)) {
    redirect("/admin");
  }

  const locale = session.user.preferredLanguage;
  const dict = getDictionary(locale);
  const initialView = VIEWS.includes((params.view ?? "") as (typeof VIEWS)[number])
    ? (params.view as (typeof VIEWS)[number])
    : "today";

  const [allVisible, projects, shareableUsers, navBadges] = await Promise.all([
    getVisibleTasks(session),
    getVisibleProjects(session),
    getShareableUsers(session),
    getMobileNavBadges(),
  ]);
  // Project tasks live only in the Projects tab; the Completed tab still surfaces project
  // completions via its filter, so those are passed separately.
  const tasks = allVisible.filter((t) => !t.projectId);
  const projectCompletedTasks = allVisible.filter(
    (t) => t.projectId && t.status === "completed",
  );

  return (
    <MobileShell activeItem="tasks" badges={navBadges} title={dict.tasks.title}>
      <TasksWorkspace
        buildingLabels={dict.cleaning.buildingLabels}
        copy={dict.tasks}
        currentUserId={session.user.id}
        initialView={initialView}
        locale={locale}
        projectCompletedTasks={projectCompletedTasks}
        projects={projects}
        shareableUsers={shareableUsers}
        tasks={tasks}
        today={tokyoToday()}
      />
    </MobileShell>
  );
}
