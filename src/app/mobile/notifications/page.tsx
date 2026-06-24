import { redirect } from "next/navigation";
import { NotificationList } from "@/components/notifications/notification-list";
import { MobileShell } from "@/components/shell/mobile-shell";
import { getDictionary } from "@/lib/i18n";
import { listNotificationsForUser } from "@/lib/notifications/queries";
import { getOnboardingState } from "@/lib/onboarding";
import { getMobileNavBadges } from "@/lib/nav-badges";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export default async function MobileNotificationsPage() {
  const [state, session] = await Promise.all([
    getOnboardingState(),
    getCurrentAppSession(),
  ]);

  if (state.status === "unauthenticated") {
    redirect("/auth/login?next=/mobile/notifications");
  }
  if (state.status !== "ready" || !session) {
    redirect("/onboarding");
  }
  if (!hasOrganizationContext(session)) {
    redirect("/mobile/unavailable");
  }

  const locale = session.user.preferredLanguage;
  const dictionary = getDictionary(locale);
  const copy = dictionary.mobile.notifications;
  const supabase = await getSupabaseServerClient();

  const [{ items, schemaUnavailable }, navBadges] = await Promise.all([
    listNotificationsForUser(supabase, {
      userId: session.user.id,
      organizationId: session.organization.id,
    }),
    getMobileNavBadges(),
  ]);

  return (
    <MobileShell badges={navBadges} title={copy.title}>
      <div className="px-1 pb-6">
        {schemaUnavailable ? (
          <>
            <div className="space-y-1 mb-4">
              <h1 className="text-[24px] font-extrabold tracking-[-0.02em] text-foreground">
                {copy.title}
              </h1>
              <p className="text-sm text-muted-foreground">{copy.subtitle}</p>
            </div>
            <section className="rounded-[28px] border border-dashed border-border bg-muted/30 px-5 py-6">
              <h2 className="text-sm font-bold text-foreground">{copy.unavailableTitle}</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {copy.unavailableBody}
              </p>
            </section>
          </>
        ) : (
          <NotificationList
            items={items}
            locale={locale}
            copy={{
              title: copy.title,
              subtitle: copy.subtitle,
              markAllRead: copy.markAllRead,
              empty: copy.empty,
              unread: copy.unread,
              openDetail: copy.openDetail,
              deleteMode: copy.deleteMode,
              cancelSelect: copy.cancelSelect,
              selectAll: copy.selectAll,
              deselectAll: copy.deselectAll,
              deleteSelected: copy.deleteSelected,
              swipeDeleteBtn: copy.swipeDeleteBtn,
            }}
          />
        )}
      </div>
    </MobileShell>
  );
}
