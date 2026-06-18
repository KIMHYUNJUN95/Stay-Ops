// Attendance — correction / exception request reads (Step 6).
//
// Server-only, self-scoped reads for the worker correction flow: the form's source-session context +
// active site list, the status screen's request view, and the per-session correction status used to
// surface request state in self-history. No admin/org-wide reads, no approve/reject (Step 7). Shapes
// carry review_comment / reviewer so the later admin-review step can render without a rewrite.

import "server-only";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type {
  AttendanceCorrectionRequestRow,
  AttendanceCorrectionReason,
  AttendanceCorrectionStatus,
} from "@/lib/attendance";

const TZ = "Asia/Tokyo";

export const CORRECTION_REASON_LABELS: Record<AttendanceCorrectionReason, string> = {
  missing_clock_in: "출근 누락",
  missing_clock_out: "퇴근 누락",
  wrong_time: "시각 오류",
  wrong_site: "장소 오류",
  auth_failed: "인증 실패",
  other: "기타",
};

export const CORRECTION_STATUS_LABELS: Record<AttendanceCorrectionStatus, string> = {
  requested: "요청됨",
  in_review: "검토 중",
  approved: "승인",
  rejected: "반려",
};

function tokyoTimeLabel(iso: string | null): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function dateLabelOf(operatingDate: string): string {
  const d = new Date(`${operatingDate}T00:00:00+09:00`);
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: TZ,
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(d);
}

export type CorrectionSiteOption = { id: string; name: string };

/** Active attendance sites in the org (for the desired-site picker). Read-only, member-readable. */
export async function listActiveAttendanceSites(
  organizationId: string,
): Promise<CorrectionSiteOption[]> {
  const res = await getSupabaseServiceClient()
    .from("attendance_sites")
    .select("id, name")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  return (res.data ?? []) as CorrectionSiteOption[];
}

export type CorrectionSessionContext = {
  sessionId: string;
  operatingDate: string;
  dateLabel: string;
  clockInTime: string | null; // "HH:mm"
  clockOutTime: string | null;
  siteName: string | null;
};

/** Source-session context for the correction form. Self-scoped (returns null if not the user's). */
export async function getSessionCorrectionContext(
  organizationId: string,
  userId: string,
  sessionId: string,
): Promise<CorrectionSessionContext | null> {
  const service = getSupabaseServiceClient();
  const res = await service
    .from("attendance_sessions")
    .select("id, user_id, operating_date, clock_in_at, clock_out_at, clock_in_site_id")
    .eq("organization_id", organizationId)
    .eq("id", sessionId)
    .maybeSingle();
  const s = res.data as {
    id: string;
    user_id: string;
    operating_date: string;
    clock_in_at: string | null;
    clock_out_at: string | null;
    clock_in_site_id: string | null;
  } | null;
  if (res.error || !s || s.user_id !== userId) return null;

  let siteName: string | null = null;
  if (s.clock_in_site_id) {
    const siteRes = await service
      .from("attendance_sites")
      .select("name")
      .eq("organization_id", organizationId)
      .eq("id", s.clock_in_site_id)
      .maybeSingle();
    siteName = (siteRes.data as { name: string } | null)?.name ?? null;
  }

  return {
    sessionId: s.id,
    operatingDate: s.operating_date,
    dateLabel: dateLabelOf(s.operating_date),
    clockInTime: tokyoTimeLabel(s.clock_in_at),
    clockOutTime: tokyoTimeLabel(s.clock_out_at),
    siteName,
  };
}

export type CorrectionRequestView = {
  id: string;
  status: AttendanceCorrectionStatus;
  statusLabel: string;
  reasonType: AttendanceCorrectionReason;
  reasonLabel: string;
  sessionId: string | null;
  targetDateLabel: string | null; // null = exception (session-less) request
  desiredClockInLabel: string | null;
  desiredClockOutLabel: string | null;
  desiredSiteName: string | null;
  memo: string | null;
  imageUrls: string[];
  photoCount: number;
  reviewComment: string | null;
  reviewerName: string | null;
  reviewedAtLabel: string | null;
  createdAtLabel: string;
};

async function toRequestView(
  service: ReturnType<typeof getSupabaseServiceClient>,
  organizationId: string,
  row: AttendanceCorrectionRequestRow,
): Promise<CorrectionRequestView> {
  let targetDateLabel: string | null = null;
  if (row.session_id) {
    const sRes = await service
      .from("attendance_sessions")
      .select("operating_date")
      .eq("organization_id", organizationId)
      .eq("id", row.session_id)
      .maybeSingle();
    const od = (sRes.data as { operating_date: string } | null)?.operating_date ?? null;
    if (od) targetDateLabel = dateLabelOf(od);
  }

  let desiredSiteName: string | null = null;
  const siteId = row.desired_clock_in_site_id ?? row.desired_clock_out_site_id;
  if (siteId) {
    const siteRes = await service
      .from("attendance_sites")
      .select("name")
      .eq("organization_id", organizationId)
      .eq("id", siteId)
      .maybeSingle();
    desiredSiteName = (siteRes.data as { name: string } | null)?.name ?? null;
  }

  let reviewerName: string | null = null;
  if (row.reviewed_by_user_id) {
    const pRes = await service
      .from("profiles")
      .select("name")
      .eq("id", row.reviewed_by_user_id)
      .maybeSingle();
    reviewerName = (pRes.data as { name: string } | null)?.name ?? null;
  }

  const status = row.status as AttendanceCorrectionStatus;
  const reasonType = row.reason_type as AttendanceCorrectionReason;

  return {
    id: row.id,
    status,
    statusLabel: CORRECTION_STATUS_LABELS[status] ?? status,
    reasonType,
    reasonLabel: CORRECTION_REASON_LABELS[reasonType] ?? reasonType,
    sessionId: row.session_id,
    targetDateLabel,
    desiredClockInLabel: tokyoTimeLabel(row.desired_clock_in_at),
    desiredClockOutLabel: tokyoTimeLabel(row.desired_clock_out_at),
    desiredSiteName,
    memo: row.memo,
    imageUrls: row.image_urls ?? [],
    photoCount: (row.image_urls ?? []).length,
    reviewComment: row.review_comment,
    reviewerName,
    reviewedAtLabel: tokyoTimeLabel(row.reviewed_at),
    createdAtLabel: tokyoTimeLabel(row.created_at) ?? "",
  };
}

/**
 * One of the user's OWN correction requests — by id, or the latest if `requestId` is null. Self-scoped
 * (returns null if the id is not the user's). Used by the status screen.
 */
export async function getCorrectionRequestView(
  organizationId: string,
  userId: string,
  requestId: string | null,
): Promise<CorrectionRequestView | null> {
  const service = getSupabaseServiceClient();
  let query = service
    .from("attendance_correction_requests")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("requested_by_user_id", userId);
  query = requestId
    ? query.eq("id", requestId)
    : query.order("created_at", { ascending: false }).limit(1);

  const res = await query.maybeSingle();
  const row = res.data as AttendanceCorrectionRequestRow | null;
  if (res.error || !row) return null;
  return toRequestView(service, organizationId, row);
}

/**
 * Latest correction status per session for the given session ids (self-scoped). Used to surface
 * request state on the self-history cards/detail.
 */
export async function getCorrectionStatusBySession(
  organizationId: string,
  userId: string,
  sessionIds: string[],
): Promise<Map<string, AttendanceCorrectionStatus>> {
  const map = new Map<string, AttendanceCorrectionStatus>();
  if (sessionIds.length === 0) return map;
  const res = await getSupabaseServiceClient()
    .from("attendance_correction_requests")
    .select("session_id, status, created_at")
    .eq("organization_id", organizationId)
    .eq("requested_by_user_id", userId)
    .in("session_id", sessionIds)
    .order("created_at", { ascending: false });
  for (const row of (res.data ?? []) as {
    session_id: string | null;
    status: string;
    created_at: string;
  }[]) {
    if (row.session_id && !map.has(row.session_id)) {
      map.set(row.session_id, row.status as AttendanceCorrectionStatus);
    }
  }
  return map;
}
