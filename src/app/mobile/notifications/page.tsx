import { redirect } from "next/navigation";
import { Bell, Info } from "lucide-react";
import { NotificationList } from "@/components/notifications/notification-list";
import { MobileShell } from "@/components/shell/mobile-shell";
import { Card } from "@/components/ui/card";
import { listNotificationsForUser } from "@/lib/notifications/queries";
import type { NotificationRow } from "@/lib/notifications/types";
import { getDictionary } from "@/lib/i18n";
import { getOnboardingState } from "@/lib/onboarding";
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
    redirect("/admin");
  }

  const supabase = await getSupabaseServerClient();
  let notifications: NotificationRow[] = [];
  let schemaUnavailable = false;

  try {
    const result = await listNotificationsForUser(supabase, {
      userId: session.user.id,
      organizationId: session.organization.id,
    });
    notifications = result.items;
    schemaUnavailable = result.schemaUnavailable;
  } catch (error) {
    console.error("[notifications page] list failed:", error);
    schemaUnavailable = true;
  }

  const dictionary = getDictionary(session.user.preferredLanguage);
  const copy = dictionary.mobile.notifications;

  return (
    <MobileShell activeItem="notifications" title={copy.title}>
      <div className="space-y-4">
        <Card className="rounded-[24px] border border-slate-200/80 bg-white p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 ring-1 ring-slate-200/80">
              <Bell className="size-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-black text-slate-950">{copy.title}</h1>
              <p className="mt-1 text-xs font-medium text-muted-foreground">{copy.subtitle}</p>
            </div>
          </div>
        </Card>

        {schemaUnavailable ? (
          <Card className="flex items-start gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/80 p-4 text-sm text-amber-950">
            <Info className="mt-0.5 size-5 shrink-0 text-amber-700" aria-hidden="true" />
            <div>
              <p className="font-black">{copy.unavailableTitle}</p>
              <p className="mt-1 text-xs font-medium leading-5 text-amber-900/90">
                {copy.unavailableBody}
              </p>
            </div>
          </Card>
        ) : (
          <NotificationList
            copy={{
              empty: copy.empty,
              markAllRead: copy.markAllRead,
              openDetail: copy.openDetail,
              unread: copy.unread,
            }}
            items={notifications}
            locale={session.user.preferredLanguage}
          />
        )}
      </div>
    </MobileShell>
  );
}
