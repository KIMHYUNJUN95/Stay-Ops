import { redirect } from "next/navigation";
import { AdminShell } from "@/components/shell/admin-shell";
import { canAccessAdminWeb } from "@/config/roles";
import { adminNavigation, getNavigationLabel } from "@/config/navigation";
import { getDictionary } from "@/lib/i18n";
import { getOnboardingState } from "@/lib/onboarding";
import { getCurrentAppSession } from "@/lib/session";

// Admin · Check-In/Out — placeholder until the full check-in/out console module ships.
// Renders inside the console shell so the sidebar links resolve (no 404).
// See docs/product/05-admin-web-ia.md → "Reservations / Calendar".
export default async function AdminCheckInOutPage() {
  const [state, session] = await Promise.all([getOnboardingState(), getCurrentAppSession()]);

  if (state.status === "unauthenticated") {
    redirect("/auth/login?next=/admin/check-in-out");
  }
  if (state.status !== "ready" || !session) {
    redirect("/onboarding");
  }
  if (!canAccessAdminWeb(session.user.role)) {
    redirect("/mobile");
  }

  const locale = session.user.preferredLanguage;
  const dictionary = getDictionary(locale);
  const c = dictionary.admin.console;
  const navItem = adminNavigation.find((item) => item.id === "check-in-out");
  const title = navItem ? getNavigationLabel(navItem, locale) : c.opsCheckIn;

  return (
    <AdminShell activeItem="check-in-out" title={title}>
      <div className="adm">
        <div
          className="card"
          style={{ maxWidth: 560, margin: "40px auto 0", padding: "40px 32px", textAlign: "center" }}
        >
          <p style={{ fontSize: 17, fontWeight: 900, letterSpacing: "-0.02em" }}>
            {c.modulePendingTitle}
          </p>
          <p style={{ marginTop: 10, fontSize: 13.5, fontWeight: 600, color: "var(--muted)", lineHeight: 1.6 }}>
            {c.modulePendingBody}
          </p>
        </div>
      </div>
    </AdminShell>
  );
}
