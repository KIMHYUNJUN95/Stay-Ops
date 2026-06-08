import "server-only";

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { countUnreadNotifications } from "@/lib/notifications/queries";
import { getCurrentAppSession } from "@/lib/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

/**
 * Operational "unprocessed" counts shown as badges on the mobile side menu,
 * keyed by `mobileSidebarNavigation` item id.
 *
 * Definitions (kept consistent with what each list screen surfaces):
 * - cleaning:      cleaning_sessions still in progress (active timers)
 * - requests:      maintenance (open|in_progress) + orders (requested) + lost items (registered)
 * - announcements: published announcements the user has not read yet
 * - notifications: unread notifications (read_at is null)
 *
 * These are advisory UI counts only. Access/org-isolation is enforced by RLS +
 * server queries; every count fails closed to 0 so a missing table/migration
 * never breaks the shell.
 */
export type NavBadgeCounts = Partial<Record<string, number>>;

type SupabaseServerClient = SupabaseClient<Database>;

/** Run a head count query, returning 0 on any error instead of throwing. */
async function safeCount(
  run: () => PromiseLike<{ count: number | null; error: unknown }>,
): Promise<number> {
  try {
    const { count, error } = await run();
    return error ? 0 : count ?? 0;
  } catch {
    return 0;
  }
}

/** Unread = published announcements in the org minus those the user has read. */
async function countUnreadAnnouncements(
  supabase: SupabaseServerClient,
  orgId: string,
  userId: string,
): Promise<number> {
  try {
    const { data: published, error: publishedError } = await supabase
      .from("announcements")
      .select("id")
      .eq("organization_id", orgId)
      .eq("status", "published")
      .returns<{ id: string }[]>();

    if (publishedError) {
      return 0;
    }

    const ids = (published ?? []).map((row) => row.id);
    if (ids.length === 0) {
      return 0;
    }

    const { data: reads, error: readsError } = await supabase
      .from("announcement_reads")
      .select("announcement_id")
      .eq("organization_id", orgId)
      .eq("user_id", userId)
      .in("announcement_id", ids)
      .returns<{ announcement_id: string }[]>();

    if (readsError) {
      return 0;
    }

    const readIds = new Set((reads ?? []).map((row) => row.announcement_id));
    return ids.filter((id) => !readIds.has(id)).length;
  } catch {
    return 0;
  }
}

/**
 * Compute mobile side-menu badge counts for the current session.
 * `cache()` dedupes repeated calls within a single server request.
 */
export const getMobileNavBadges = cache(async (): Promise<NavBadgeCounts> => {
  const session = await getCurrentAppSession();
  if (!session || session.organization.id === "platform") {
    return {};
  }

  const orgId = session.organization.id;
  const userId = session.user.id;
  const supabase = await getSupabaseServerClient();

  const [cleaning, maintenance, orders, lost, announcements, notifications] =
    await Promise.all([
      safeCount(() =>
        supabase
          .from("cleaning_sessions")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .eq("status", "in_progress"),
      ),
      safeCount(() =>
        supabase
          .from("maintenance_reports")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .in("status", ["open", "in_progress"]),
      ),
      safeCount(() =>
        supabase
          .from("order_requests")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .eq("status", "requested"),
      ),
      safeCount(() =>
        supabase
          .from("lost_items")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .eq("status", "registered"),
      ),
      countUnreadAnnouncements(supabase, orgId, userId),
      countUnreadNotifications(supabase, {
        userId,
        organizationId: orgId,
      }).catch(() => 0),
    ]);

  return {
    cleaning,
    requests: maintenance + orders + lost,
    announcements,
    notifications,
  };
});
