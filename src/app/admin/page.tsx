import { redirect } from "next/navigation";
import { AdminShell } from "@/components/shell/admin-shell";
import { DashboardHome } from "@/components/admin/dashboard-home";
import { canAccessAdminWeb } from "@/config/roles";
import { getDictionary } from "@/lib/i18n";
import { getOnboardingState } from "@/lib/onboarding";
import { getCurrentAppSession } from "@/lib/session";
import { getAdminDashboard } from "@/lib/admin-dashboard";

// Admin operations console — desktop dashboard home. Top-priority blocks wired to
// real domain data (cleaning / requests / attendance / announcements / tasks /
// reservations). See docs/product/05-admin-web-ia.md → "Dashboard Home Screen".
export default async function AdminDashboardPage() {
  const [state, session] = await Promise.all([getOnboardingState(), getCurrentAppSession()]);

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
  const localeTag = locale === "ko" ? "ko-KR" : locale === "ja" ? "ja-JP" : "en-US";
  const data = await getAdminDashboard(session);

  return (
    <AdminShell activeItem="dashboard" title={dictionary.admin.console.headerToday}>
      <DashboardHome data={data} c={dictionary.admin.console} locale={localeTag} />
    </AdminShell>
  );
}
