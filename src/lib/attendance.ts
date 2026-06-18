// Attendance / Clock-In-Out / Payroll — shared types + constants (Step 1, schema-adjacent only).
//
// This module intentionally holds NO queries, server actions, or UI wiring yet. It exists so later
// steps (clock-in/out, breaks, history, corrections, admin review, payroll, finalization, export) can
// share the row types, the status/method/reason unions, and the schema-mirrored constants without
// re-deriving them. See docs/engineering/11-attendance-payroll-technical-design.md.
//
// IMPORTANT: every union below mirrors a DB CHECK constraint in
// supabase/migrations/202606170001_attendance_payroll.sql. Keep them in sync.

import type { Database } from "@/types/database";

// ── Row type aliases ──────────────────────────────────────────────────────────
export type AttendanceSiteRow = Database["public"]["Tables"]["attendance_sites"]["Row"];
export type AttendanceQrTokenRow = Database["public"]["Tables"]["attendance_qr_tokens"]["Row"];
export type AttendanceSessionRow = Database["public"]["Tables"]["attendance_sessions"]["Row"];
export type AttendanceBreakRow = Database["public"]["Tables"]["attendance_breaks"]["Row"];
export type AttendanceAttemptLogRow =
  Database["public"]["Tables"]["attendance_attempt_logs"]["Row"];
export type AttendanceCorrectionRequestRow =
  Database["public"]["Tables"]["attendance_correction_requests"]["Row"];
export type AttendanceSessionAuditRow =
  Database["public"]["Tables"]["attendance_session_audits"]["Row"];
export type EmploymentTypeHistoryRow =
  Database["public"]["Tables"]["employment_type_history"]["Row"];
export type HourlyRateHistoryRow = Database["public"]["Tables"]["hourly_rate_history"]["Row"];
export type AttendanceMonthSnapshotRow =
  Database["public"]["Tables"]["attendance_month_snapshots"]["Row"];
export type AttendanceExportLogRow =
  Database["public"]["Tables"]["attendance_export_logs"]["Row"];

// ── Session lifecycle ─────────────────────────────────────────────────────────
/** Session status. Only one `open` session per user is allowed at a time (DB partial unique index). */
export type AttendanceSessionStatus = "open" | "completed" | "reopened" | "invalid";

export const ATTENDANCE_SESSION_STATUSES: readonly AttendanceSessionStatus[] = [
  "open",
  "completed",
  "reopened",
  "invalid",
];

/** Review state. Abnormal sessions (e.g. midnight-crossing, missing clock-out) are `review_required`. */
export type AttendanceReviewState =
  | "normal"
  | "review_required"
  | "pending_correction"
  | "approved_correction"
  | "rejected_correction";

export const ATTENDANCE_REVIEW_STATES: readonly AttendanceReviewState[] = [
  "normal",
  "review_required",
  "pending_correction",
  "approved_correction",
  "rejected_correction",
];

// ── Authentication methods ──────────────────────────────────────────────────────
/**
 * Attendance auth method. The PWA first release only uses `gps_qr` (and `manual` for admin-created
 * sessions). `gps_wifi` is MODELED for a later non-PWA / extended release and must stay inactive in
 * the current PWA — the UI shows Wi-Fi attendance as `준비중`.
 */
export type AttendanceMethod = "gps_qr" | "gps_wifi" | "manual";

export const ATTENDANCE_METHODS: readonly AttendanceMethod[] = ["gps_qr", "gps_wifi", "manual"];

/** Methods a normal (non-admin) PWA clock-in/out may produce in this release. */
export const ATTENDANCE_ACTIVE_PWA_METHODS: readonly AttendanceMethod[] = ["gps_qr"];

/** Wi-Fi is designed but not active in the current PWA. */
export const ATTENDANCE_WIFI_ACTIVE = false;

// ── Attempt logs ────────────────────────────────────────────────────────────────
export type AttendanceActionType = "clock_in" | "clock_out" | "break_start" | "break_end";

export const ATTENDANCE_ACTION_TYPES: readonly AttendanceActionType[] = [
  "clock_in",
  "clock_out",
  "break_start",
  "break_end",
];

export type AttendanceFailureReason =
  | "gps_denied"
  | "gps_unavailable"
  | "outside_radius"
  | "qr_invalid"
  | "qr_scan_failed"
  | "wifi_not_supported"
  | "wifi_not_matched"
  | "open_break_blocks_clock_out"
  | "midnight_crossing"
  | "open_session_exists";

export const ATTENDANCE_FAILURE_REASONS: readonly AttendanceFailureReason[] = [
  "gps_denied",
  "gps_unavailable",
  "outside_radius",
  "qr_invalid",
  "qr_scan_failed",
  "wifi_not_supported",
  "wifi_not_matched",
  "open_break_blocks_clock_out",
  "midnight_crossing",
  "open_session_exists",
];

// ── Correction / exception requests ─────────────────────────────────────────────
export type AttendanceCorrectionStatus = "requested" | "in_review" | "approved" | "rejected";

export const ATTENDANCE_CORRECTION_STATUSES: readonly AttendanceCorrectionStatus[] = [
  "requested",
  "in_review",
  "approved",
  "rejected",
];

export type AttendanceCorrectionReason =
  | "missing_clock_in"
  | "missing_clock_out"
  | "wrong_time"
  | "wrong_site"
  | "auth_failed"
  | "other";

export const ATTENDANCE_CORRECTION_REASONS: readonly AttendanceCorrectionReason[] = [
  "missing_clock_in",
  "missing_clock_out",
  "wrong_time",
  "wrong_site",
  "auth_failed",
  "other",
];

// ── Session audit actions ────────────────────────────────────────────────────────
export type AttendanceAuditAction =
  | "manual_create"
  | "manual_update"
  | "invalidate"
  | "correction_apply"
  | "reopen"
  | "finalize";

export const ATTENDANCE_AUDIT_ACTIONS: readonly AttendanceAuditAction[] = [
  "manual_create",
  "manual_update",
  "invalidate",
  "correction_apply",
  "reopen",
  "finalize",
];

// ── Employment / payroll ─────────────────────────────────────────────────────────
export type EmploymentType = "hourly" | "salaried";

export const EMPLOYMENT_TYPES: readonly EmploymentType[] = ["hourly", "salaried"];

export type AttendanceSnapshotStatus = "draft" | "finalized" | "superseded" | "reopened";

export const ATTENDANCE_SNAPSHOT_STATUSES: readonly AttendanceSnapshotStatus[] = [
  "draft",
  "finalized",
  "superseded",
  "reopened",
];

export type AttendanceExportScope = "monthly_bulk" | "single_user";

export const ATTENDANCE_EXPORT_SCOPES: readonly AttendanceExportScope[] = [
  "monthly_bulk",
  "single_user",
];

// ── Schema-mirrored constants ────────────────────────────────────────────────────
/** Default allowed GPS radius for a site, in meters (per-site override allowed). Mirrors DB default. */
export const ATTENDANCE_DEFAULT_RADIUS_METERS = 100;

/** Max photos on a correction request — mirrors the DB CHECK constraint. */
export const ATTENDANCE_CORRECTION_MAX_IMAGES = 5;

/** Hourly monthly gross is rounded to the nearest this many yen at calculation time. */
export const ATTENDANCE_GROSS_ROUNDING_YEN = 10;

/** Tokyo-time hour for the once-per-day open-session reminder (18:30). */
export const ATTENDANCE_OPEN_SESSION_REMINDER_HOUR = 18;
export const ATTENDANCE_OPEN_SESSION_REMINDER_MINUTE = 30;
