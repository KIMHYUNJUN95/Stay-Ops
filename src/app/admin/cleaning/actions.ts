"use server";

import { requireAdminSession } from "@/lib/admin-session";
import { getAdminCleaningHistory, type AdminCleaningHistoryItem } from "@/lib/admin-cleaning";
import { canForceCompleteCleaning, getCleaningOperatingDateKey } from "@/lib/cleaning";
import {
  buildAdminExportMeta,
  compactRangePart,
  type AdminExportMeta,
} from "@/lib/admin-export-meta";
import {
  buildAdminTableWorkbookBase64,
  type AdminTableColumn,
  type AdminTableExportRow,
  type AdminTableSheet,
} from "@/lib/admin-table-workbook";
import { buildAdminTableReportHtml } from "@/lib/admin-table-report";
import type { AdminReportExportResult, AdminWorkbookExportResult } from "@/lib/admin-export-result";
import { getDictionary, type Locale } from "@/lib/i18n";
import { buildSessionRoomLabel } from "@/lib/room-label-normalization";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { fmtDate, toMin, type BuildingKey, type CleaningTaskType } from "@/components/admin/cleaning/cleaning-console-data";

// Server actions backing the 기록 (history) tab's Excel/PDF export. The client sends the raw,
// already-filtered history rows (canonical building/type keys, not display strings) — every visible
// string is resolved here from the actor's own session locale, so the exported file always matches
// the signed-in user's language regardless of what the client happened to render. Builds through the
// canonical admin table exporters (src/lib/admin-table-workbook.ts / admin-table-report.ts) that every
// other /admin/* export also uses. See docs/product/07-cleaning-workflow.md →
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

export type CleaningHistoryWorkbookResult = AdminWorkbookExportResult;
export type CleaningHistoryReportResult = AdminReportExportResult;

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

function formatCleaningDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

function typeLabelOf(type: CleaningTaskType, t: ReturnType<typeof getDictionary>["cleaning"]["console"]): string {
  if (type === "checkout") return t.tyCheckout;
  if (type === "simple") return t.tySimple;
  if (type === "longstay") return t.tyLongstay;
  return t.tySetup;
}

function cleaningColumns(locale: Locale): AdminTableColumn[] {
  const t = getDictionary(locale).cleaning.console;
  return [
    { key: "date", label: t.colDate, width: 11, printWidth: 8 },
    { key: "building", label: t.building, width: 14, printWidth: 11 },
    { key: "room", label: t.colRoom, width: 10, printWidth: 7 },
    { key: "type", label: t.colType, width: 13, printWidth: 10 },
    { key: "staff", label: t.colStaff, width: 16, printWidth: 12 },
    { key: "start", label: t.colStart, width: 10, printWidth: 7 },
    { key: "end", label: t.colEnd, width: 10, printWidth: 7 },
    { key: "dur", label: t.colDur, width: 11, printWidth: 8, bold: true },
    { key: "status", label: t.colStatus, width: 14, printWidth: 10 },
    { key: "note", label: t.colNote, width: 34, printWidth: 16, wrap: true },
  ];
}

function cleaningTableRows(
  rows: CleaningHistoryExportRow[],
  locale: Locale,
  localeTag: string,
): AdminTableExportRow[] {
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
      dur: formatCleaningDuration(r.dur),
      status: r.proxy ? t.stProxy : t.stNormal,
      note: r.note,
    };
  });
}

function cleaningSheet(
  rows: CleaningHistoryExportRow[],
  meta: AdminExportMeta,
  from: string,
  to: string,
): AdminTableSheet {
  const t = getDictionary(meta.locale).cleaning.console;
  const totalMinutes = rows.reduce((sum, r) => sum + r.dur, 0);
  return {
    sheetName: t.exportTitle,
    title: t.exportTitle,
    rangeLabel: `${fmtDate(from, meta.localeTag)} – ${fmtDate(to, meta.localeTag)}`,
    colNoLabel: meta.shared.colNo,
    totalLabel: meta.shared.exportTotalLabel,
    columns: cleaningColumns(meta.locale),
    rows: cleaningTableRows(rows, meta.locale, meta.localeTag),
    totals: { dur: formatCleaningDuration(totalMinutes) },
  };
}

export async function exportCleaningHistoryWorkbook(
  rows: CleaningHistoryExportRow[],
  from: string,
  to: string,
): Promise<CleaningHistoryWorkbookResult> {
  const session = await requireAdminSession();
  if (rows.length === 0) return { ok: false, reason: "empty" };

  const meta = buildAdminExportMeta(session);
  const sheet = cleaningSheet(rows, meta, from, to);
  const base64 = await buildAdminTableWorkbookBase64({
    orgName: meta.orgName,
    generatedLabel: meta.generatedLabel,
    sheets: [sheet],
  });

  return {
    ok: true,
    filename: `cleaning-history_${compactRangePart(from)}_${compactRangePart(to)}.xlsx`,
    base64,
    rowCount: sheet.rows.length,
  };
}

export async function exportCleaningHistoryReport(
  rows: CleaningHistoryExportRow[],
  from: string,
  to: string,
): Promise<CleaningHistoryReportResult> {
  const session = await requireAdminSession();
  if (rows.length === 0) return { ok: false, reason: "empty" };

  const meta = buildAdminExportMeta(session);
  const sheet = cleaningSheet(rows, meta, from, to);
  const html = buildAdminTableReportHtml({
    orgName: meta.orgName,
    generatedLabel: meta.generatedLabel,
    printLabel: meta.shared.exportPrint,
    localeTag: meta.localeTag,
    sheets: [sheet],
  });

  return { ok: true, html, rowCount: sheet.rows.length };
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
