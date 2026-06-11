import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { TaskCreateForm } from "@/components/tasks/task-create-form";
import { MobileShell } from "@/components/shell/mobile-shell";
import { getDictionary } from "@/lib/i18n";
import { getMobileNavBadges } from "@/lib/nav-badges";
import { getOnboardingState } from "@/lib/onboarding";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { getShareableUsers } from "@/lib/tasks";

type PageProps = {
  searchParams: Promise<{ date?: string; error?: string; title?: string }>;
};

export default async function MobileTaskNewPage({ searchParams }: PageProps) {
  const [state, session, params] = await Promise.all([
    getOnboardingState(),
    getCurrentAppSession(),
    searchParams,
  ]);

  if (state.status === "unauthenticated") {
    redirect(`/auth/login?next=${encodeURIComponent("/mobile/tasks/new")}`);
  }
  if (state.status !== "ready" || !session) {
    redirect("/onboarding");
  }
  if (!hasOrganizationContext(session)) {
    redirect("/admin");
  }

  const locale = session.user.preferredLanguage;
  const dict = getDictionary(locale);
  const copy = dict.tasks;
  const defaultDate = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "") ? params.date! : null;
  // Title carried over from Quick Add (capped, trimmed) so escalating to full create keeps it.
  const defaultTitle = (params.title ?? "").trim().slice(0, 200) || undefined;
  const serverError = params.error ? copy.errors[params.error] ?? copy.errors.save_failed : null;

  const [users, navBadges] = await Promise.all([
    getShareableUsers(session),
    getMobileNavBadges(),
  ]);

  return (
    <MobileShell activeItem="tasks" badges={navBadges} title={copy.newTask}>
      <div className="flex items-center gap-[11px] px-0.5 pb-3 pt-2">
        <Link
          aria-label={copy.backToList}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-700"
          href="/mobile/tasks"
        >
          <ChevronLeft className="size-[19px]" aria-hidden="true" />
        </Link>
        <div className="min-w-0">
          <p className="text-[19px] font-black tracking-[-0.03em] text-foreground">{copy.newTask}</p>
          <p className="text-[12px] font-medium text-muted-foreground">{copy.detailedCreateHint}</p>
        </div>
      </div>

      <TaskCreateForm
        copy={copy}
        defaultDate={defaultDate}
        defaultTitle={defaultTitle}
        imgCopy={dict.requestImages}
        organizationId={session.organization.id}
        serverError={serverError}
        users={users}
      />
    </MobileShell>
  );
}
