"use server";

import { revalidatePath } from "next/cache";
import {
  deleteNotifications as deleteNotificationsInDb,
  markAllNotificationsRead as markAllNotificationsReadInOrg,
  markNotificationRead,
} from "@/lib/notifications/queries";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";

function getNotificationScope() {
  const session = getCurrentAppSession();
  return session.then((value) => {
    if (!value || !hasOrganizationContext(value)) {
      return null;
    }
    return {
      userId: value.user.id,
      organizationId: value.organization.id,
    };
  });
}

export async function markNotificationAsRead(notificationId: string) {
  const scope = await getNotificationScope();
  if (!scope) {
    return { ok: false as const, error: "unauthorized" };
  }

  const supabase = await getSupabaseServerClient();
  const updated = await markNotificationRead(supabase, notificationId, scope);
  revalidatePath("/mobile/notifications");

  return { ok: updated as boolean };
}

export async function deleteNotifications(ids: string[]) {
  const scope = await getNotificationScope();
  if (!scope) return { ok: false as const, error: "unauthorized" };
  if (!ids.length) return { ok: true as const };

  const supabase = await getSupabaseServerClient();
  const ok = await deleteNotificationsInDb(supabase, ids, scope);
  if (!ok) return { ok: false as const, error: "delete_failed" };

  revalidatePath("/mobile/notifications");
  return { ok: true as const };
}

export async function markAllNotificationsRead() {
  const scope = await getNotificationScope();
  if (!scope) {
    return { ok: false as const, error: "unauthorized" };
  }

  const supabase = await getSupabaseServerClient();
  const updated = await markAllNotificationsReadInOrg(supabase, scope);
  if (!updated) {
    return { ok: false as const, error: "save_failed" };
  }

  revalidatePath("/mobile/notifications");
  return { ok: true as const };
}
