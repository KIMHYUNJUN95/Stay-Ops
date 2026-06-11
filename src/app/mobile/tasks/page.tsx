import { redirect } from "next/navigation";
import { TasksWorkspace } from "@/components/tasks/tasks-workspace";
import { MobileShell } from "@/components/shell/mobile-shell";
import { getDictionary } from "@/lib/i18n";
import { getMobileNavBadges } from "@/lib/nav-badges";
import { getOnboardingState } from "@/lib/onboarding";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { getVisibleTasks, tokyoToday } from "@/lib/tasks";

type PageProps = {
  searchParams: Promise<{ view?: string; created?: string }>;
};

const VIEWS = ["today", "inbox", "my", "sent", "completed", "calendar"] as const;

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

  const [tasks, navBadges] = await Promise.all([
    getVisibleTasks(session),
    getMobileNavBadges(),
  ]);

  return (
    <MobileShell activeItem="tasks" badges={navBadges} title={dict.tasks.title}>
      <TasksWorkspace
        copy={dict.tasks}
        currentUserId={session.user.id}
        initialView={initialView}
        locale={locale}
        tasks={tasks}
        today={tokyoToday()}
      />
    </MobileShell>
  );
}
