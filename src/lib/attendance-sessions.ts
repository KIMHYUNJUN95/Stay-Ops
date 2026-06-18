// Attendance — worker session reads (Step 3).
//
// Server-only helpers for rendering the worker attendance home from REAL data. Step 3 only needs the
// current open session (to switch the home between 출근 전 / 근무 중); breaks, history, corrections, and
// payroll come in later steps.

import "server-only";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type { AttendanceSessionRow } from "@/lib/attendance";

export type OpenAttendanceSession = {
  id: string;
  clockInAt: string | null;
  clockInTimeLabel: string;
  siteId: string | null;
  siteName: string;
  /** Non-null when a break is currently open (the user is on break). */
  openBreakStartedAt: string | null;
  /** Sum of CLOSED break durations on this session, in seconds. */
  closedBreakSeconds: number;
  /** Total break count on this session (closed + the open one). */
  breakCount: number;
};

/** Has the user already answered the 18:30 open-session reminder today (Tokyo)? */
export async function hasOpenReminderResponseToday(
  organizationId: string,
  userId: string,
): Promise<boolean> {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const res = await getSupabaseServiceClient()
    .from("attendance_open_session_reminders")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("operating_date", today)
    .maybeSingle();
  return !!res.data;
}

/** True when Tokyo wall-clock time is at/after 18:30 (the open-session reminder threshold). */
export function isPastReminderTimeTokyo(): boolean {
  const hm = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m >= 18 * 60 + 30;
}

/** HH:mm in Asia/Tokyo. */
function tokyoTimeLabel(iso: string | null): string {
  if (!iso) return "--:--";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/**
 * The user's current open work session (status = 'open'), or null. Org-scoped; the partial unique
 * index guarantees at most one. Resolves the clock-in site name for the home's info strip.
 */
export async function getCurrentOpenSession(
  organizationId: string,
  userId: string,
): Promise<OpenAttendanceSession | null> {
  const service = getSupabaseServiceClient();
  const { data, error } = await service
    .from("attendance_sessions")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("status", "open")
    .maybeSingle();
  if (error || !data) return null;

  const session = data as AttendanceSessionRow;

  let siteName = "—";
  if (session.clock_in_site_id) {
    const siteRes = await service
      .from("attendance_sites")
      .select("name")
      .eq("organization_id", organizationId)
      .eq("id", session.clock_in_site_id)
      .maybeSingle();
    const site = siteRes.data as { name: string } | null;
    if (site?.name) siteName = site.name;
  }

  // Break aggregation: keep individual rows in the DB; here we only derive the live summary the home
  // needs (on-break? + closed-break total + count). Open-break duration is computed live on the client.
  const breaksRes = await service
    .from("attendance_breaks")
    .select("started_at, ended_at")
    .eq("session_id", session.id)
    .order("started_at", { ascending: true });
  const breaks = (breaksRes.data ?? []) as { started_at: string; ended_at: string | null }[];

  let closedBreakSeconds = 0;
  let openBreakStartedAt: string | null = null;
  for (const b of breaks) {
    if (b.ended_at) {
      const secs = (new Date(b.ended_at).getTime() - new Date(b.started_at).getTime()) / 1000;
      if (secs > 0) closedBreakSeconds += secs;
    } else {
      openBreakStartedAt = b.started_at;
    }
  }

  return {
    id: session.id,
    clockInAt: session.clock_in_at,
    clockInTimeLabel: tokyoTimeLabel(session.clock_in_at),
    siteId: session.clock_in_site_id,
    siteName,
    openBreakStartedAt,
    closedBreakSeconds: Math.floor(closedBreakSeconds),
    breakCount: breaks.length,
  };
}
