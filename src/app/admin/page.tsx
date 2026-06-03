import { redirect } from "next/navigation";
import { AdminShell } from "@/components/shell/admin-shell";
import { Card } from "@/components/ui/card";
import { adminNavigation, getNavigationLabel } from "@/config/navigation";
import { canAccessAdminWeb } from "@/config/roles";
import { getDictionary } from "@/lib/i18n";
import { getOnboardingState } from "@/lib/onboarding";
import { getCurrentAppSession } from "@/lib/session";

export default async function AdminDashboardPage() {
  const [state, session] = await Promise.all([
    getOnboardingState(),
    getCurrentAppSession(),
  ]);

  if (state.status === "unauthenticated") {
    redirect("/auth/login?next=/admin");
  }

  if (state.status !== "ready" || !session) {
    redirect("/onboarding");
  }

  if (!canAccessAdminWeb(session.user.role)) {
    redirect("/mobile");
  }

  const locale = session.user.preferredLanguage;
  const dictionary = getDictionary(locale);
  const stats = [
    dictionary.admin.stats.checkIns,
    dictionary.admin.stats.cleaning,
    dictionary.admin.stats.openRequests,
  ];

  return (
    <AdminShell activeItem="dashboard" title={dictionary.admin.dashboardTitle}>
      <div className="grid gap-4 lg:grid-cols-3">
        {stats.map((item, index) => (
          <Card className="p-5" key={item}>
            <p className="text-sm font-semibold text-muted-foreground">{item}</p>
            <p className="mt-3 text-4xl font-black text-primary">
              {[4, 12, 7][index]}
            </p>
          </Card>
        ))}
      </div>

      <Card className="mt-6 p-5">
        <h2 className="text-xl font-black">
          {dictionary.admin.navigationContract}
        </h2>
        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {adminNavigation.map((item) => (
            <div
              className="rounded-xl border border-border bg-background/70 px-3 py-2 text-sm font-semibold"
              key={item.id}
            >
              {getNavigationLabel(item, locale)}
            </div>
          ))}
        </div>
      </Card>
    </AdminShell>
  );
}
