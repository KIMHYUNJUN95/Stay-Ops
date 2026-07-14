"use server";

import { requireAdminSession } from "@/lib/admin-session";
import { getAdminCleaningHistory, type AdminCleaningHistoryItem } from "@/lib/admin-cleaning";
import { canForceCompleteCleaning, getCleaningOperatingDateKey } from "@/lib/cleaning";
import {
  buildCleaningHistoryWorkbookBase64,
  formatCleaningDuration,
  type CleaningHistoryWorkbookRow,
} from "@/lib/cleaning-history-workbook";
import { buildCleaningHistoryReportHtml } from "@/lib/cleaning-history-report";
import { getDictionary, type Locale } from "@/lib/i18n";
import { buildSessionRoomLabel } from "@/lib/room-label-normalization";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { fmtDate, toMin, type BuildingKey, type CleaningTaskType } from "@/components/admin/cleaning/cleaning-console-data";

// Server actions backing the 기록 (history) tab's Excel/PDF export. The client sends the raw,
// already-filtered history rows (canonical building/type keys, not display strings) — every visible
// string is resolved here from the actor's own session locale, so the exported file always matches
// the signed-in user's language regardless of what the client happened to render. Reuses the same
// green-ledger workbook/report template as the attendance payroll export
// (src/lib/attendance-payroll-workbook.ts / attendance-payroll-report.ts) for a unified look across
// every export in the admin console. See docs/product/07-cleaning-workflow.md →
// "2026-07-14 청소 기록 내보내기".

export type CleaningHistoryExportRow = {
  date: string; // yyyy-mm-dd
  building: BuildingKey | null;
  buildingRaw: string;
  room: string;
  type: CleaningTaskType;
  staffName: string;
  start: string;
  dur: number; // minutes
  proxy: boolean;
  note: string;
};

export type CleaningHistoryWorkbookResult =
  | { ok: true; filename: string; base64: string; rowCount: number }
  | { ok: false; reason: "forbidden" | "empty" | "error" };

export type CleaningHistoryReportResult =
  | { ok: true; html: string; rowCount: number }
  | { ok: false; reason: "forbidden" | "empty" | "error" };

function compactRangePart(value: string): string {
  return value.replace(/-/g, "");
}

export type FetchCleaningHistoryResult =
  | { ok: true; items: AdminCleaningHistoryItem[] }
  | { ok: false; reason: "invalid" | "error" };

// Called by the history board whenever the user picks a new date range in AdminDateRangePicker —
// only the current month is preloaded server-side by page.tsx, so any other range is fetched here.
export async function fetchAdminCleaningHistory(
  from: string,
  to: string,
): Promise<FetchCleaningHistoryResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    return { ok: false, reason: "invalid" };
  }
  const session = await requireAdminSession();
  try {
    const items = await getAdminCleaningHistory(session, { startDate: from, endDate: to });
    return { ok: true, items };
  } catch {
    return { ok: false, reason: "error" };
  }
}

function minToHHMM(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

function typeLabelOf(type: CleaningTaskType, t: ReturnType<typeof getDictionary>["cleaning"]["console"]): string {
  if (type === "checkout") return t.tyCheckout;
  if (type === "simple") return t.tySimple;
  if (type === "longstay") return t.tyLongstay;
  return t.tySetup;
}

function buildWorkbookRows(
  rows: CleaningHistoryExportRow[],
  locale: Locale,
  localeTag: string,
): CleaningHistoryWorkbookRow[] {
  const dictionary = getDictionary(locale);
  const t = dictionary.cleaning.console;
  const buildingLabels = dictionary.cleaning.buildingLabels;

  return rows.map((r) => {
    const startMin = toMin(r.start) ?? 0;
    return {
      date: fmtDate(r.date, localeTag),
      building: (r.building ? buildingLabels[r.building] : null) ?? r.buildingRaw,
      room: r.room,
      type: typeLabelOf(r.type, t),
      staff: r.staffName || "—",
      start: r.start,
      end: minToHHMM(startMin + r.dur),
      durationLabel: formatCleaningDuration(r.dur),
      durationMinutes: r.dur,
      status: r.proxy ? t.stProxy : t.stNormal,
      note: r.note,
    };
  });
}

function reportMeta(orgName: string, locale: Locale, localeTag: string, from: string, to: string) {
  const t = getDictionary(locale).cleaning.console;
  const generatedAt = new Intl.DateTimeFormat(localeTag, {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
  return {
    title: t.exportTitle,
    rangeLabel: `${fmtDate(from, localeTag)} – ${fmtDate(to, localeTag)}`,
    orgName,
    generatedLabel: `${t.exportGeneratedLabel} · ${generatedAt}`,
    colNo: t.colNo,
    colDate: t.colDate,
    colBuilding: t.building,
    colRoom: t.colRoom,
    colType: t.colType,
    colStaff: t.colStaff,
    colStart: t.colStart,
    colEnd: t.colEnd,
    colDur: t.colDur,
    colStatus: t.colStatus,
    colNote: t.colNote,
    totalLabel: t.exportTotalLabel,
  };
}

export async function exportCleaningHistoryWorkbook(
  rows: CleaningHistoryExportRow[],
  from: string,
  to: string,
): Promise<CleaningHistoryWorkbookResult> {
  const session = await requireAdminSession();
  if (rows.length === 0) return { ok: false, reason: "empty" };

  const locale = session.user.preferredLanguage;
  const localeTag = locale === "ko" ? "ko-KR" : locale === "ja" ? "ja-JP" : "en-US";
  const wbRows = buildWorkbookRows(rows, locale, localeTag);
  const labels = { ...reportMeta(session.organization.name ?? "", locale, localeTag, from, to) };
  const base64 = await buildCleaningHistoryWorkbookBase64(wbRows, labels);

  return {
    ok: true,
    filename: `cleaning-history_${compactRangePart(from)}_${compactRangePart(to)}.xlsx`,
    base64,
    rowCount: wbRows.length,
  };
}

export async function exportCleaningHistoryReport(
  rows: CleaningHistoryExportRow[],
  from: string,
  to: string,
): Promise<CleaningHistoryReportResult> {
  const session = await requireAdminSession();
  if (rows.length === 0) return { ok: false, reason: "empty" };

  const locale = session.user.preferredLanguage;
  const localeTag = locale === "ko" ? "ko-KR" : locale === "ja" ? "ja-JP" : "en-US";
  const wbRows = buildWorkbookRows(rows, locale, localeTag);
  const labels = {
    ...reportMeta(session.organization.name ?? "", locale, localeTag, from, to),
    printLabel: getDictionary(locale).cleaning.console.exportPrint,
  };
  const html = buildCleaningHistoryReportHtml(wbRows, labels, localeTag);

  return { ok: true, html, rowCount: wbRows.length };
}

// ── 강제완료 (관리자 대리 완료) ─────────────────────────────────────────────
// The console's only mutating action. Writes via the service-role client (RLS bypass) after an
// app-level role check, matching the attendance admin-write pattern
// (isAttendancePayrollAdmin + getSupabaseServiceClient in src/app/admin/attendance/actions.ts) —
// the cleaning_sessions UPDATE/INSERT RLS policies have no admin-on-behalf-of-another-staff branch,
// so this intentionally does not rely on RLS for authorization.

export type ForceCompleteCleaningInput = {
  sessionId: string | null; // existing session → UPDATE; null (room never started) → INSERT
  roomKey: string;
  buildingRaw: string; // canonical property name, e.g. "아라키초A"
  room: string; // canonical room label, e.g. "201"
  taskType: CleaningTaskType;
  staffId: string;
  start: string; // "HH:MM"
  end: string; // "HH:MM"
  note: string;
};

export type ForceCompleteCleaningResult =
  | { ok: true }
  | { ok: false; reason: "forbidden" | "invalid" | "error" };

function taskTypeToTaskLabel(type: CleaningTaskType): string {
  if (type === "longstay") return "long_stay";
  if (type === "simple") return "simple";
  return "checkout";
}

function tokyoDateTimeIso(hhmm: string): string | null {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return null;
  return `${getCleaningOperatingDateKey()}T${hhmm}:00+09:00`;
}

export async function forceCompleteCleaningSession(
  input: ForceCompleteCleaningInput,
): Promise<ForceCompleteCleaningResult> {
  const session = await requireAdminSession();
  if (!canForceCompleteCleaning(session.user.role)) {
    return { ok: false, reason: "forbidden" };
  }

  const startIso = tokyoDateTimeIso(input.start);
  const endIso = tokyoDateTimeIso(input.end);
  if (!startIso || !endIso || !input.staffId) {
    return { ok: false, reason: "invalid" };
  }
  const durationSeconds = Math.max(
    0,
    Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000),
  );

  const service = getSupabaseServiceClient();
  const organizationId = session.organization.id;

  // Staff must be a real, active member of this org — never trust a client-supplied id blindly.
  const membership = await service
    .from("memberships")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("user_id", input.staffId)
    .eq("status", "active")
    .maybeSingle();
  if (!membership.data) {
    return { ok: false, reason: "invalid" };
  }

  if (input.sessionId) {
    const { error } = await service
      .from("cleaning_sessions")
      .update({
        status: "completed",
        staff_user_id: input.staffId,
        started_at: startIso,
        completed_at: endIso,
        duration_seconds: durationSeconds,
        notes: input.note || null,
        completed_by_admin: session.user.id,
      } as never)
      .eq("id", input.sessionId)
      .eq("organization_id", organizationId);
    if (error) return { ok: false, reason: "error" };
    return { ok: true };
  }

  const { error } = await service.from("cleaning_sessions").insert({
    organization_id: organizationId,
    room_label: buildSessionRoomLabel(input.buildingRaw, input.room),
    task_label: taskTypeToTaskLabel(input.taskType),
    staff_user_id: input.staffId,
    cleaning_date: getCleaningOperatingDateKey(),
    status: "completed",
    started_at: startIso,
    completed_at: endIso,
    duration_seconds: durationSeconds,
    notes: input.note || null,
    completed_by_admin: session.user.id,
  } as never);
  if (error) return { ok: false, reason: "error" };
  return { ok: true };
}
