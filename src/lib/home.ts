import type { AppSession } from "@/lib/session";
import { getCleaningOperatingDateKey } from "@/lib/cleaning";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type ReservationStatus = Database["public"]["Enums"]["reservation_status"];

const EXCLUDED_RESERVATION_STATUSES: readonly ReservationStatus[] = [
  "cancelled",
  "no_show",
];

type ReservationCountRow = {
  check_in_date: string;
  check_out_date: string;
  status: ReservationStatus;
};

export type HomeActivityEventType =
  | "cleaning_completed"
  | "lost_item_reported"
  | "maintenance_reported";

export type HomeActivityEvent = {
  id: string;
  room: string;
  taskLabel?: string; // only present for cleaning_completed events
  timestamp: string; // ISO UTC
  type: HomeActivityEventType;
};

export type HomeCheckInOutCounts = {
  checkIns: number;
  checkOuts: number;
};

export type HomeActiveSession = {
  id: string;
  room_label: string;
  started_at: string;
  task_label: string;
};

export type HomeResult<T> =
  | { status: "ok"; data: T }
  | { status: "empty" }
  | { status: "error" };

/** UTC window covering today 00:00–24:00 in JST (Asia/Tokyo = UTC+9). */
function getTodayJstUtcRange() {
  const today = getCleaningOperatingDateKey();
  const start = new Date(`${today}T00:00:00+09:00`);
  const end = new Date(start.getTime() + 86_400_000);
  return { end: end.toISOString(), start: start.toISOString() };
}

export async function getHomeCheckInOutCounts(
  session: AppSession,
): Promise<HomeResult<HomeCheckInOutCounts>> {
  if (session.organization.id === "platform") return { status: "empty" };
  try {
    const supabase = await getSupabaseServerClient();
    const today = getCleaningOperatingDateKey();
    const { data, error } = await supabase
      .from("reservations")
      .select("check_in_date, check_out_date, status")
      .eq("organization_id", session.organization.id)
      .or(`check_in_date.eq.${today},check_out_date.eq.${today}`);
    if (error) return { status: "error" };
    const rows = ((data ?? []) as ReservationCountRow[]).filter(
      (r) => !EXCLUDED_RESERVATION_STATUSES.includes(r.status),
    );
    return {
      status: "ok",
      data: {
        checkIns: rows.filter((r) => r.check_in_date === today).length,
        checkOuts: rows.filter((r) => r.check_out_date === today).length,
      },
    };
  } catch {
    return { status: "error" };
  }
}

export async function getHomeTodayActivity(
  session: AppSession,
  limit = 5,
): Promise<HomeResult<HomeActivityEvent[]>> {
  if (session.organization.id === "platform") return { status: "empty" };
  try {
    const supabase = await getSupabaseServerClient();
    const today = getCleaningOperatingDateKey();
    const { start, end } = getTodayJstUtcRange();

    const [cleaningRes, lostRes, maintRes] = await Promise.all([
      supabase
        .from("cleaning_sessions")
        .select("id, room_label, task_label, completed_at")
        .eq("organization_id", session.organization.id)
        .eq("cleaning_date", today)
        .eq("status", "completed")
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false })
        .limit(limit),
      supabase
        .from("lost_items")
        .select("id, room_label, created_at")
        .eq("organization_id", session.organization.id)
        .gte("created_at", start)
        .lt("created_at", end)
        .order("created_at", { ascending: false })
        .limit(limit),
      supabase
        .from("maintenance_reports")
        .select("id, room_label, created_at")
        .eq("organization_id", session.organization.id)
        .gte("created_at", start)
        .lt("created_at", end)
        .order("created_at", { ascending: false })
        .limit(limit),
    ]);

    if (cleaningRes.error || lostRes.error || maintRes.error) {
      return { status: "error" };
    }

    type CleaningActivityRow = { id: string; room_label: string; task_label: string; completed_at: string | null };
    type SimpleActivityRow = { id: string; room_label: string; created_at: string };

    const events: HomeActivityEvent[] = [];

    for (const row of (cleaningRes.data ?? []) as CleaningActivityRow[]) {
      if (row.completed_at) {
        events.push({
          id: `cleaning-${row.id}`,
          room: row.room_label,
          taskLabel: row.task_label,
          timestamp: row.completed_at,
          type: "cleaning_completed",
        });
      }
    }
    for (const row of (lostRes.data ?? []) as SimpleActivityRow[]) {
      events.push({
        id: `lost-${row.id}`,
        room: row.room_label,
        timestamp: row.created_at,
        type: "lost_item_reported",
      });
    }
    for (const row of (maintRes.data ?? []) as SimpleActivityRow[]) {
      events.push({
        id: `maint-${row.id}`,
        room: row.room_label,
        timestamp: row.created_at,
        type: "maintenance_reported",
      });
    }

    const sorted = events
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit);

    if (sorted.length === 0) return { status: "empty" };
    return { status: "ok", data: sorted };
  } catch {
    return { status: "error" };
  }
}

export async function getHomeActiveCleaningSession(
  session: AppSession,
): Promise<HomeResult<HomeActiveSession>> {
  if (session.organization.id === "platform") return { status: "empty" };
  try {
    const supabase = await getSupabaseServerClient();
    const today = getCleaningOperatingDateKey();
    const { data, error } = await supabase
      .from("cleaning_sessions")
      .select("id, room_label, task_label, started_at")
      .eq("organization_id", session.organization.id)
      .eq("staff_user_id", session.user.id)
      .eq("cleaning_date", today)
      .eq("status", "in_progress")
      .maybeSingle();
    if (error) return { status: "error" };
    if (!data) return { status: "empty" };
    return { status: "ok", data: data as HomeActiveSession };
  } catch {
    return { status: "error" };
  }
}

/** Format ISO UTC timestamp as HH:MM in JST. */
export function formatActivityTimeJst(isoTimestamp: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(new Date(isoTimestamp));
}
