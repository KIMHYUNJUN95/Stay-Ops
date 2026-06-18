// Attendance — worker SELF-VIEW history queries (Step 5).
//
// Server-only, strictly self-scoped: every query filters by the CURRENT user's id (passed by the
// caller from the authenticated session) AND the organization id. There is no path to another user's
// data — callers never accept a target user id from the client. Tokyo operating-date boundaries
// throughout. No pay calculation, no admin/org-wide reads, no correction/finalization here (later
// steps); the shapes leave room for those (e.g. reviewState / manualCreated / a future
// correctionStatus) without a rewrite.

import "server-only";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type {
  AttendanceSessionRow,
  AttendanceSessionStatus,
  AttendanceReviewState,
  AttendanceMethod,
  AttendanceCorrectionStatus,
} from "@/lib/attendance";
import { getCorrectionStatusBySession } from "@/lib/attendance-corrections";

export type AttendanceBreakView = {
  startedAt: string;
  endedAt: string | null;
  /** Closed-break duration in seconds; null while the break is still open. */
  durationSec: number | null;
  startedLabel: string;
  endedLabel: string | null;
};

export type AttendanceSessionView = {
  id: string;
  operatingDate: string; // YYYY-MM-DD (Tokyo)
  dateLabel: string; // e.g. "6월 17일 (화)"
  status: AttendanceSessionStatus;
  reviewState: AttendanceReviewState;
  manualCreated: boolean;
  isAbnormal: boolean;
  clockInAt: string | null;
  clockInLabel: string | null;
  clockInSiteName: string | null;
  clockInMethod: AttendanceMethod | null;
  clockOutAt: string | null;
  clockOutLabel: string | null;
  clockOutSiteName: string | null;
  clockOutMethod: AttendanceMethod | null;
  breaks: AttendanceBreakView[];
  breakCount: number;
  breakTotalSec: number; // closed breaks only
  /** Worked seconds for a completed session (in→out minus closed breaks); null while open. */
  workedSec: number | null;
  /** Latest correction request status for this session, if any (Step 6). */
  correctionStatus: AttendanceCorrectionStatus | null;
};

export type AttendanceTodaySummary = {
  date: string; // YYYY-MM-DD (Tokyo)
  sessionCount: number;
  hasOpenSession: boolean;
  workedSec: number; // completed sessions today + the open session's elapsed-minus-break at load time
  breakTotalSec: number; // closed breaks across today's sessions
};

const TZ = "Asia/Tokyo";

function tokyoDateKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function tokyoTimeLabel(iso: string | null): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/** "6월 17일 (화)" from a Tokyo YYYY-MM-DD operating date. */
function dateLabelOf(operatingDate: string): string {
  const d = new Date(`${operatingDate}T00:00:00+09:00`);
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: TZ,
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(d);
}

function closedBreakSeconds(startedAt: string, endedAt: string | null): number | null {
  if (!endedAt) return null;
  const secs = (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000;
  return secs > 0 ? Math.floor(secs) : 0;
}

type BreakRow = { session_id: string; started_at: string; ended_at: string | null };

function buildSessionView(
  s: AttendanceSessionRow,
  breakRows: BreakRow[],
  siteNames: Map<string, string>,
): AttendanceSessionView {
  const breaks: AttendanceBreakView[] = breakRows
    .slice()
    .sort((a, b) => a.started_at.localeCompare(b.started_at))
    .map((b) => ({
      startedAt: b.started_at,
      endedAt: b.ended_at,
      durationSec: closedBreakSeconds(b.started_at, b.ended_at),
      startedLabel: tokyoTimeLabel(b.started_at) ?? "--:--",
      endedLabel: tokyoTimeLabel(b.ended_at),
    }));

  const breakTotalSec = breaks.reduce((sum, b) => sum + (b.durationSec ?? 0), 0);

  let workedSec: number | null = null;
  if (s.status === "completed" && s.clock_in_at && s.clock_out_at) {
    const gross = (new Date(s.clock_out_at).getTime() - new Date(s.clock_in_at).getTime()) / 1000;
    workedSec = Math.max(0, Math.floor(gross) - breakTotalSec);
  }

  const status = s.status as AttendanceSessionStatus;
  const reviewState = s.review_state as AttendanceReviewState;

  return {
    id: s.id,
    operatingDate: s.operating_date,
    dateLabel: dateLabelOf(s.operating_date),
    status,
    reviewState,
    manualCreated: s.manual_created,
    isAbnormal: reviewState !== "normal" || status === "invalid",
    clockInAt: s.clock_in_at,
    clockInLabel: tokyoTimeLabel(s.clock_in_at),
    clockInSiteName: s.clock_in_site_id ? (siteNames.get(s.clock_in_site_id) ?? null) : null,
    clockInMethod: (s.clock_in_method as AttendanceMethod | null) ?? null,
    clockOutAt: s.clock_out_at,
    clockOutLabel: tokyoTimeLabel(s.clock_out_at),
    clockOutSiteName: s.clock_out_site_id ? (siteNames.get(s.clock_out_site_id) ?? null) : null,
    clockOutMethod: (s.clock_out_method as AttendanceMethod | null) ?? null,
    breaks,
    breakCount: breaks.length,
    breakTotalSec,
    workedSec,
    correctionStatus: null,
  };
}

/** Resolve display names for a set of site ids (one query). */
async function loadSiteNames(
  service: ReturnType<typeof getSupabaseServiceClient>,
  organizationId: string,
  siteIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (siteIds.length === 0) return map;
  const res = await service
    .from("attendance_sites")
    .select("id, name")
    .eq("organization_id", organizationId)
    .in("id", siteIds);
  for (const row of (res.data ?? []) as { id: string; name: string }[]) {
    map.set(row.id, row.name);
  }
  return map;
}

/** Load break rows for a set of session ids (one query), grouped by session. */
async function loadBreaks(
  service: ReturnType<typeof getSupabaseServiceClient>,
  sessionIds: string[],
): Promise<Map<string, BreakRow[]>> {
  const map = new Map<string, BreakRow[]>();
  if (sessionIds.length === 0) return map;
  const res = await service
    .from("attendance_breaks")
    .select("session_id, started_at, ended_at")
    .in("session_id", sessionIds)
    .order("started_at", { ascending: true });
  for (const row of (res.data ?? []) as BreakRow[]) {
    const list = map.get(row.session_id) ?? [];
    list.push(row);
    map.set(row.session_id, list);
  }
  return map;
}

/** [firstDay, firstDayOfNextMonth) for a YYYY-MM, as Tokyo operating-date strings. */
function monthRange(ym: string): { start: string; nextStart: string } {
  const [y, m] = ym.split("-").map(Number);
  const nextIdx = y * 12 + m; // m is 1-based → this already points at the next month
  const ny = Math.floor(nextIdx / 12);
  const nm = (nextIdx % 12) + 1;
  return {
    start: `${ym}-01`,
    nextStart: `${ny}-${String(nm).padStart(2, "0")}-01`,
  };
}

/**
 * The current user's own attendance sessions (newest first), each with its break rows resolved.
 * Self-scoped: `userId` is the authenticated user, never a client-supplied target.
 * When `ym` (YYYY-MM, Tokyo) is given, results are limited to that operating month.
 */
export async function getAttendanceHistory(
  organizationId: string,
  userId: string,
  ym?: string,
  limit = 60,
): Promise<AttendanceSessionView[]> {
  const service = getSupabaseServiceClient();
  let query = service
    .from("attendance_sessions")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("user_id", userId);
  if (ym && /^\d{4}-\d{2}$/.test(ym)) {
    const { start, nextStart } = monthRange(ym);
    query = query.gte("operating_date", start).lt("operating_date", nextStart);
  }
  const res = await query
    .order("operating_date", { ascending: false })
    .order("clock_in_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (res.error) return [];

  const sessions = (res.data ?? []) as AttendanceSessionRow[];
  if (sessions.length === 0) return [];

  const sessionIds = sessions.map((s) => s.id);
  const siteIds = Array.from(
    new Set(
      sessions.flatMap((s) => [s.clock_in_site_id, s.clock_out_site_id].filter(Boolean) as string[]),
    ),
  );

  const [breaksBySession, siteNames, correctionBySession] = await Promise.all([
    loadBreaks(service, sessionIds),
    loadSiteNames(service, organizationId, siteIds),
    getCorrectionStatusBySession(organizationId, userId, sessionIds),
  ]);

  return sessions.map((s) => {
    const view = buildSessionView(s, breaksBySession.get(s.id) ?? [], siteNames);
    view.correctionStatus = correctionBySession.get(s.id) ?? null;
    return view;
  });
}

/**
 * Today's (Tokyo) self summary: session count, whether a session is open, worked + break totals.
 * Self-scoped. Worked for the open session is computed at load time (the home has the live ticker).
 */
export async function getAttendanceTodaySummary(
  organizationId: string,
  userId: string,
): Promise<AttendanceTodaySummary> {
  const service = getSupabaseServiceClient();
  const today = tokyoDateKey(new Date());

  const res = await service
    .from("attendance_sessions")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("operating_date", today);

  const sessions = res.error ? [] : ((res.data ?? []) as AttendanceSessionRow[]);
  const sessionIds = sessions.map((s) => s.id);
  const breaksBySession = await loadBreaks(service, sessionIds);

  let workedSec = 0;
  let breakTotalSec = 0;
  let hasOpenSession = false;
  const nowMs = Date.now();

  for (const s of sessions) {
    const view = buildSessionView(s, breaksBySession.get(s.id) ?? [], new Map());
    breakTotalSec += view.breakTotalSec;
    if (s.status === "completed" && view.workedSec != null) {
      workedSec += view.workedSec;
    } else if (s.status === "open" && s.clock_in_at) {
      hasOpenSession = true;
      const gross = (nowMs - new Date(s.clock_in_at).getTime()) / 1000;
      workedSec += Math.max(0, Math.floor(gross) - view.breakTotalSec);
    }
  }

  return {
    date: today,
    sessionCount: sessions.length,
    hasOpenSession,
    workedSec,
    breakTotalSec,
  };
}
