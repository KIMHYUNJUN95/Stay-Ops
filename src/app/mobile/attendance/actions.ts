"use server";

// Attendance — GPS + QR clock-in / clock-out core (Step 3) + break tracking (Step 4).
//
// One server action drives clock-in/clock-out from the worker capture screen; two more drive break
// start/end from the home screen. ALL validation is server-side (auth + org, QR token, GPS-vs-radius,
// open-session + open-break rules); clock-in/out attempts — success or failure — are recorded in
// `attendance_attempt_logs`. Writes use the service-role client (RLS denies direct authenticated
// writes; see docs/engineering/05-rls-permissions.md). PWA active method is `gps_qr` only; Wi-Fi is not
// activated here.
//
// Not in this step: correction requests, payroll, notifications.

import { revalidatePath } from "next/cache";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { getAttendancePayrollAdminUserIds } from "@/lib/attendance-review";
import { notifyAttendanceAdmins } from "@/lib/notifications/create";
import {
  ATTENDANCE_CORRECTION_REASONS,
  ATTENDANCE_CORRECTION_MAX_IMAGES,
  type AttendanceActionType,
  type AttendanceCorrectionReason,
  type AttendanceFailureReason,
  type AttendanceQrTokenRow,
  type AttendanceSiteRow,
  type AttendanceSessionRow,
} from "@/lib/attendance";

export type AttendanceScanMode = "in" | "out";

export type AttendanceScanInput = {
  mode: AttendanceScanMode;
  /** Raw token string decoded from the on-site QR (null when the scan produced nothing). */
  token: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  /** Set when the client could not obtain GPS at all. */
  gpsError: "denied" | "unavailable" | null;
  userAgent?: string | null;
};

export type AttendanceScanSuccess = {
  ok: true;
  kind: AttendanceScanMode;
  siteName: string;
  atIso: string;
  timeLabel: string;
  method: "gps_qr";
};

export type AttendanceScanFailure = {
  ok: false;
  reason: "gps" | "radius" | "qr" | "open_session" | "no_session" | "open_break" | "error";
  siteName?: string;
  distanceMeters?: number;
  radiusMeters?: number;
};

export type AttendanceScanResult = AttendanceScanSuccess | AttendanceScanFailure;

/** Tokyo calendar date (YYYY-MM-DD) of an instant — operational date boundary (Asia/Tokyo). */
function tokyoDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** HH:mm in Asia/Tokyo, for the success summary shown in the UI. */
function tokyoTimeLabel(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/** Great-circle distance in meters between two lat/long points (haversine). */
function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000; // Earth radius (m)
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export async function submitAttendanceScan(
  input: AttendanceScanInput,
): Promise<AttendanceScanResult> {
  const session = await getCurrentAppSession();
  if (!session || !hasOrganizationContext(session)) {
    return { ok: false, reason: "error" };
  }
  const organizationId = session.organization.id;
  const userId = session.user.id;
  const service = getSupabaseServiceClient();
  const actionType: AttendanceActionType = input.mode === "in" ? "clock_in" : "clock_out";
  const deviceInfo = { userAgent: input.userAgent ?? null };

  async function logAttempt(args: {
    success: boolean;
    failureReason: AttendanceFailureReason | null;
    resolvedSiteId: string | null;
  }) {
    await service.from("attendance_attempt_logs").insert({
      organization_id: organizationId,
      user_id: userId,
      action_type: actionType,
      method: "gps_qr",
      success: args.success,
      failure_reason: args.failureReason,
      resolved_site_id: args.resolvedSiteId,
      latitude: input.latitude,
      longitude: input.longitude,
      accuracy_meters: input.accuracy,
      device_info: deviceInfo,
    } as never);
  }

  // 1) QR token must be present and resolve to an active token in THIS org.
  if (!input.token) {
    await logAttempt({ success: false, failureReason: "qr_scan_failed", resolvedSiteId: null });
    return { ok: false, reason: "qr" };
  }

  const tokenRes = await service
    .from("attendance_qr_tokens")
    .select("*")
    .eq("token", input.token)
    .eq("is_active", true)
    .maybeSingle();
  const tokenRow = tokenRes.data as AttendanceQrTokenRow | null;
  if (tokenRes.error || !tokenRow || tokenRow.organization_id !== organizationId) {
    await logAttempt({ success: false, failureReason: "qr_invalid", resolvedSiteId: null });
    return { ok: false, reason: "qr" };
  }

  // 2) Resolve the site behind the token; it must exist in-org and be active.
  const siteRes = await service
    .from("attendance_sites")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", tokenRow.site_id)
    .maybeSingle();
  const site = siteRes.data as AttendanceSiteRow | null;
  if (siteRes.error || !site || !site.is_active) {
    await logAttempt({ success: false, failureReason: "qr_invalid", resolvedSiteId: tokenRow.site_id });
    return { ok: false, reason: "qr" };
  }

  // 3) GPS is mandatory.
  if (input.gpsError || input.latitude == null || input.longitude == null) {
    await logAttempt({
      success: false,
      failureReason: input.gpsError === "denied" ? "gps_denied" : "gps_unavailable",
      resolvedSiteId: site.id,
    });
    return { ok: false, reason: "gps", siteName: site.name };
  }

  // 4) GPS must be within the site's allowed radius.
  const dist = distanceMeters(site.latitude, site.longitude, input.latitude, input.longitude);
  if (dist > site.allowed_radius_meters) {
    await logAttempt({ success: false, failureReason: "outside_radius", resolvedSiteId: site.id });
    return {
      ok: false,
      reason: "radius",
      siteName: site.name,
      distanceMeters: Math.round(dist),
      radiusMeters: site.allowed_radius_meters,
    };
  }

  const nowIso = new Date().toISOString();

  if (input.mode === "in") {
    // 5a) One open session per user within this org.
    const openRes = await service
      .from("attendance_sessions")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .eq("status", "open")
      .maybeSingle();
    if (openRes.data) {
      await logAttempt({ success: false, failureReason: "open_session_exists", resolvedSiteId: site.id });
      return { ok: false, reason: "open_session", siteName: site.name };
    }

    const insertRes = await service
      .from("attendance_sessions")
      .insert({
        organization_id: organizationId,
        user_id: userId,
        operating_date: tokyoDate(nowIso),
        status: "open",
        review_state: "normal",
        clock_in_at: nowIso,
        clock_in_site_id: site.id,
        clock_in_method: "gps_qr",
        clock_in_qr_token_id: tokenRow.id,
        clock_in_latitude: input.latitude,
        clock_in_longitude: input.longitude,
        clock_in_accuracy_meters: input.accuracy,
        clock_in_device_info: deviceInfo,
      } as never)
      .select("id")
      .single();
    if (insertRes.error) {
      await logAttempt({ success: false, failureReason: null, resolvedSiteId: site.id });
      return { ok: false, reason: "error", siteName: site.name };
    }

    await logAttempt({ success: true, failureReason: null, resolvedSiteId: site.id });
    return {
      ok: true,
      kind: "in",
      siteName: site.name,
      atIso: nowIso,
      timeLabel: tokyoTimeLabel(nowIso),
      method: "gps_qr",
    };
  }

  // 5b) Clock-out requires an existing open session for this user within this org.
  const openRes = await service
    .from("attendance_sessions")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("status", "open")
    .maybeSingle();
  const open = openRes.data as AttendanceSessionRow | null;
  if (openRes.error || !open) {
    // No matching failure_reason enum value for "no open session"; record success=false with null
    // reason (the UI surfaces the specific message).
    await logAttempt({ success: false, failureReason: null, resolvedSiteId: site.id });
    return { ok: false, reason: "no_session", siteName: site.name };
  }

  // Strict rule: clock-out is blocked while a break is still open. Do NOT auto-close the break.
  const openBreakRes = await service
    .from("attendance_breaks")
    .select("id")
    .eq("session_id", open.id)
    .is("ended_at", null)
    .maybeSingle();
  if (openBreakRes.data) {
    await logAttempt({ success: false, failureReason: "open_break_blocks_clock_out", resolvedSiteId: site.id });
    return { ok: false, reason: "open_break", siteName: site.name };
  }

  // Midnight-crossing is abnormal — do not silently normalize. Flag for later review (full midnight
  // sweep is a later step); never downgrade an already-flagged session.
  const crossedMidnight = open.operating_date !== tokyoDate(nowIso);
  const reviewState = crossedMidnight ? "review_required" : open.review_state;

  const updateRes = await service
    .from("attendance_sessions")
    .update({
      status: "completed",
      review_state: reviewState,
      clock_out_at: nowIso,
      clock_out_site_id: site.id,
      clock_out_method: "gps_qr",
      clock_out_qr_token_id: tokenRow.id,
      clock_out_latitude: input.latitude,
      clock_out_longitude: input.longitude,
      clock_out_accuracy_meters: input.accuracy,
      clock_out_device_info: deviceInfo,
    } as never)
    .eq("id", open.id)
    .eq("status", "open");
  if (updateRes.error) {
    await logAttempt({ success: false, failureReason: null, resolvedSiteId: site.id });
    return { ok: false, reason: "error", siteName: site.name };
  }

  await logAttempt({ success: true, failureReason: null, resolvedSiteId: site.id });

  // Admin alert for an abnormal (midnight-crossing) session that needs review.
  if (crossedMidnight) {
    const adminIds = await getAttendancePayrollAdminUserIds(service, organizationId);
    await notifyAttendanceAdmins(service, {
      organizationId,
      recipientUserIds: adminIds,
      actorUserId: userId,
      dedupeBase: `attendance_abnormal:${open.id}`,
      href: "/mobile/attendance",
      sourceId: open.id,
      payload: {
        event: "abnormal_session",
        subjectUserId: userId,
        subjectName: session.user.name ?? null,
        sessionId: open.id,
      },
    });
  }

  return {
    ok: true,
    kind: "out",
    siteName: site.name,
    atIso: nowIso,
    timeLabel: tokyoTimeLabel(nowIso),
    method: "gps_qr",
  };
}

// ── Breaks (Step 4) ──────────────────────────────────────────────────────────
// Break start/end is not a GPS/QR attendance action — it has no `attendance_attempt_logs` row (that
// table's `method` is GPS-oriented and required). The `attendance_breaks` rows ARE the record. Same
// logic for salaried and hourly users; only hourly pay later excludes recorded break time.

export type BreakActionResult =
  | { ok: true }
  | { ok: false; reason: "no_session" | "already_on_break" | "no_open_break" | "error" };

/** Resolve the caller's single open session id (status = 'open') within an org, or null. */
async function getOpenSessionId(
  service: ReturnType<typeof getSupabaseServiceClient>,
  userId: string,
  organizationId: string,
): Promise<string | null> {
  const res = await service
    .from("attendance_sessions")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("status", "open")
    .maybeSingle();
  const row = res.data as { id: string } | null;
  return res.error ? null : (row?.id ?? null);
}

/** Start a break on the open session. Fails if there is no open session or a break is already open. */
export async function startBreak(): Promise<BreakActionResult> {
  const session = await getCurrentAppSession();
  if (!session || !hasOrganizationContext(session)) return { ok: false, reason: "error" };
  const service = getSupabaseServiceClient();

  const sessionId = await getOpenSessionId(service, session.user.id, session.organization.id);
  if (!sessionId) return { ok: false, reason: "no_session" };

  const openBreakRes = await service
    .from("attendance_breaks")
    .select("id")
    .eq("session_id", sessionId)
    .is("ended_at", null)
    .maybeSingle();
  if (openBreakRes.data) return { ok: false, reason: "already_on_break" };

  const ins = await service.from("attendance_breaks").insert({
    organization_id: session.organization.id,
    session_id: sessionId,
    started_at: new Date().toISOString(),
  } as never);
  if (ins.error) return { ok: false, reason: "error" };

  revalidatePath("/mobile/attendance");
  return { ok: true };
}

/** End the currently open break. Fails if there is no open session or no open break. */
export async function endBreak(): Promise<BreakActionResult> {
  const session = await getCurrentAppSession();
  if (!session || !hasOrganizationContext(session)) return { ok: false, reason: "error" };
  const service = getSupabaseServiceClient();

  const sessionId = await getOpenSessionId(service, session.user.id, session.organization.id);
  if (!sessionId) return { ok: false, reason: "no_session" };

  const openBreakRes = await service
    .from("attendance_breaks")
    .select("id")
    .eq("session_id", sessionId)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const openBreak = openBreakRes.data as { id: string } | null;
  if (openBreakRes.error || !openBreak) return { ok: false, reason: "no_open_break" };

  const upd = await service
    .from("attendance_breaks")
    .update({ ended_at: new Date().toISOString() } as never)
    .eq("id", openBreak.id)
    .is("ended_at", null);
  if (upd.error) return { ok: false, reason: "error" };

  revalidatePath("/mobile/attendance");
  return { ok: true };
}

// ── Correction / exception requests (Step 6) ─────────────────────────────────
// A user requests a correction for THEIR OWN record (current or previous Tokyo month only). The request
// only SUGGESTS values — it never mutates the authoritative session. An admin confirms final values
// later (Step 7). Supports session-linked requests and session-less exception requests (e.g. from a
// failed clock-in). Self-only + month-range enforced server-side.

export type CreateCorrectionInput = {
  /** Source session (self-owned), or null for an exception request not tied to a session. */
  sessionId: string | null;
  reasonType: AttendanceCorrectionReason;
  memo: string | null;
  /** Desired clock-in/out wall time "HH:mm" (Tokyo), combined with the base date; null = unset. */
  desiredInTime: string | null;
  desiredOutTime: string | null;
  /** A single desired site applied to both in/out (the design's "출/퇴근 동일"); null = unset. */
  desiredSiteId: string | null;
  imageUrls: string[];
};

export type CreateCorrectionResult =
  | { ok: true; id: string }
  | { ok: false; reason: "forbidden" | "out_of_range" | "invalid" | "error" };

/** Tokyo YYYY-MM of "now". */
function tokyoYearMonthNow(): string {
  return tokyoDate(new Date().toISOString()).slice(0, 7);
}

/** The Tokyo YYYY-MM immediately before the given YYYY-MM. */
function previousYearMonth(ym: string): string {
  const [y, m] = ym.split("-").map((n) => Number(n));
  if (m <= 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** Combine a Tokyo base date (YYYY-MM-DD) + wall time "HH:mm" into an ISO instant, or null. */
function tokyoInstant(baseDate: string, hhmm: string | null): string | null {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const d = new Date(`${baseDate}T${hhmm}:00+09:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function createAttendanceCorrectionRequest(
  input: CreateCorrectionInput,
): Promise<CreateCorrectionResult> {
  const session = await getCurrentAppSession();
  if (!session || !hasOrganizationContext(session)) return { ok: false, reason: "error" };
  const organizationId = session.organization.id;
  const userId = session.user.id;
  const service = getSupabaseServiceClient();

  if (!ATTENDANCE_CORRECTION_REASONS.includes(input.reasonType)) {
    return { ok: false, reason: "invalid" };
  }
  const imageUrls = (input.imageUrls ?? []).slice(0, ATTENDANCE_CORRECTION_MAX_IMAGES);

  // Resolve the base date the correction concerns + verify self-ownership of any linked session.
  let baseDate: string;
  let sessionId: string | null = null;
  if (input.sessionId) {
    const res = await service
      .from("attendance_sessions")
      .select("id, user_id, operating_date")
      .eq("organization_id", organizationId)
      .eq("id", input.sessionId)
      .maybeSingle();
    const row = res.data as { id: string; user_id: string; operating_date: string } | null;
    if (res.error || !row || row.user_id !== userId) return { ok: false, reason: "forbidden" };
    baseDate = row.operating_date;
    sessionId = row.id;
  } else {
    baseDate = tokyoDate(new Date().toISOString());
  }

  // Allowed window: current Tokyo month + previous month only.
  const ym = baseDate.slice(0, 7);
  const currentYm = tokyoYearMonthNow();
  if (ym !== currentYm && ym !== previousYearMonth(currentYm)) {
    return { ok: false, reason: "out_of_range" };
  }

  // Validate the optional desired site belongs to this org (drop if not found).
  let desiredSiteId: string | null = null;
  if (input.desiredSiteId) {
    const siteRes = await service
      .from("attendance_sites")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("id", input.desiredSiteId)
      .maybeSingle();
    if (siteRes.data) desiredSiteId = input.desiredSiteId;
  }

  const ins = (await service
    .from("attendance_correction_requests")
    .insert({
      organization_id: organizationId,
      session_id: sessionId,
      requested_by_user_id: userId,
      status: "requested",
      reason_type: input.reasonType,
      memo: input.memo?.trim() ? input.memo.trim() : null,
      desired_clock_in_at: tokyoInstant(baseDate, input.desiredInTime),
      desired_clock_out_at: tokyoInstant(baseDate, input.desiredOutTime),
      desired_clock_in_site_id: desiredSiteId,
      desired_clock_out_site_id: desiredSiteId,
      image_urls: imageUrls,
      target_month: `${ym}-01`,
    } as never)
    .select("id")
    .single()) as { data: { id: string } | null; error: { message: string } | null };
  if (ins.error || !ins.data) return { ok: false, reason: "error" };

  // Admin alert: notify owner + attendance_payroll_admin (privileged only; never the requester).
  const adminIds = await getAttendancePayrollAdminUserIds(service, organizationId);
  await notifyAttendanceAdmins(service, {
    organizationId,
    recipientUserIds: adminIds,
    actorUserId: userId,
    dedupeBase: `attendance_correction:${ins.data.id}`,
    href: "/mobile/attendance",
    sourceId: ins.data.id,
    payload: {
      event: "correction_created",
      subjectUserId: userId,
      subjectName: session.user.name ?? null,
      correctionId: ins.data.id,
    },
  });

  revalidatePath("/mobile/attendance/correction/status");
  revalidatePath("/mobile/attendance/history");
  return { ok: true, id: ins.data.id };
}

// ── 18:30 open-session reminder response (Step 14) ───────────────────────────
// Worker answers the once-per-Tokyo-day open-session prompt. `still_working` suppresses the prompt for
// the rest of the day; `left_work` does NOT auto clock-out — the client routes to the correction flow.
// Self-only: records against the authenticated user's own open session.

export type ReminderResponse = "still_working" | "left_work";
export type ReminderResult =
  | { ok: true; sessionId: string | null }
  | { ok: false; reason: "no_session" | "error" };

export async function respondOpenSessionReminder(
  response: ReminderResponse,
): Promise<ReminderResult> {
  const session = await getCurrentAppSession();
  if (!session || !hasOrganizationContext(session)) return { ok: false, reason: "error" };
  if (response !== "still_working" && response !== "left_work") return { ok: false, reason: "error" };
  const organizationId = session.organization.id;
  const userId = session.user.id;
  const service = getSupabaseServiceClient();

  const openRes = await service
    .from("attendance_sessions")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("status", "open")
    .maybeSingle();
  const open = openRes.data as { id: string } | null;
  if (!open) return { ok: false, reason: "no_session" };

  const today = tokyoDate(new Date().toISOString());
  const up = await service
    .from("attendance_open_session_reminders")
    .upsert(
      {
        organization_id: organizationId,
        user_id: userId,
        operating_date: today,
        response,
        responded_at: new Date().toISOString(),
      } as never,
      { onConflict: "organization_id,user_id,operating_date" },
    );
  if (up.error) return { ok: false, reason: "error" };

  revalidatePath("/mobile/attendance");
  return { ok: true, sessionId: open.id };
}
