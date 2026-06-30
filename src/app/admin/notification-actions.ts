"use server";

import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  countUnreadNotifications,
  listNotificationsForUser,
  markAllNotificationsRead,
} from "@/lib/notifications/queries";
import { formatNotificationTimestamp, getNotificationDisplay } from "@/lib/notifications/display";

export type AdminNotifItem = {
  id: string;
  title: string;
  body: string;
  timeLabel: string;
  read: boolean;
  href: string | null;
};

export type AdminNotifData = { unread: number; items: AdminNotifItem[] };

async function scopeFromSession() {
  const session = await getCurrentAppSession();
  if (!session || !hasOrganizationContext(session)) return null;
  return {
    scope: { userId: session.user.id, organizationId: session.organization.id },
    locale: session.user.preferredLanguage,
  };
}

// Admin console bell popover — recent notifications + true unread count.
export async function getAdminNotifications(): Promise<AdminNotifData> {
  const ctx = await scopeFromSession();
  if (!ctx) return { unread: 0, items: [] };
  const supabase = await getSupabaseServerClient();
  try {
    const [list, unread] = await Promise.all([
      listNotificationsForUser(supabase, ctx.scope, { limit: 8 }),
      countUnreadNotifications(supabase, ctx.scope),
    ]);
    const items: AdminNotifItem[] = list.items.map((n) => {
      const d = getNotificationDisplay(n, ctx.locale);
      return {
        id: n.id,
        title: d.title,
        body: d.body,
        timeLabel: formatNotificationTimestamp(n.created_at, ctx.locale),
        read: n.read_at != null,
        href: n.href ?? null,
      };
    });
    return { unread, items };
  } catch {
    return { unread: 0, items: [] };
  }
}

export async function markAllAdminNotificationsRead(): Promise<{ ok: boolean }> {
  const ctx = await scopeFromSession();
  if (!ctx) return { ok: false };
  const supabase = await getSupabaseServerClient();
  try {
    await markAllNotificationsRead(supabase, ctx.scope);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
