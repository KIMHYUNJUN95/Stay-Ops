import "server-only";

import type { BuildingKey, CleaningTaskType } from "@/components/admin/cleaning/cleaning-console-data";
import {
  cleaningOperatingTimeZone,
  getCleaningStaffOptions,
  getOrgCleaningSessionsFiltered,
  getOrgTodayCleaningSessions,
  isCleaningTaskKey,
  type CleaningSessionRow,
  type CleaningSessionWithStaff,
  type CleaningStaffOption,
} from "@/lib/cleaning";
import { getCleaningTargets, type SettingTarget } from "@/lib/cleaning-targets";
import type { CleaningExportFilters } from "@/lib/export/cleaning-filters";
import {
  buildLegacyAliasToRoomKeyMap,
  buildSessionLabelToRoomKeyMap,
  buildSessionRoomLabel,
  CANONICAL_TO_BUILDING_KEY,
  getDisplayRoomLabel,
  getDisplaySessionRoomLabel,
  resolveRoomKey,
} from "@/lib/room-label-normalization";
import { getActiveRoomCatalogServer, type ActiveRoomCatalogItem } from "@/lib/rooms";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { AppSession } from "@/lib/session";

// Real-data layer for the admin cleaning console's "오늘 현황" (today) board — overlays real
// cleaning_sessions status onto the reservation-derived today targets (same source as
// /mobile/cleaning), but unlike the mobile "unprocessed queue" the admin board keeps every room
// visible with its current status instead of removing processed ones. See
// docs/product/07-cleaning-workflow.md → "2026-07-14 어드민 청소 대시보드 — 백엔드 연동".

export type AdminCleaningStatus = "pending" | "progress" | "done";

export type AdminCleaningTask = {
  id: string;
  sessionId: string | null;
  roomKey: string;
  building: BuildingKey | null;
  buildingRaw: string;
  room: string;
  type: CleaningTaskType;
  status: AdminCleaningStatus;
  staffId: string | null;
  staffName: string | null;
  start: string | null;
  end: string | null;
  note: string;
  reports: { lost?: number; issue?: number; lostIds?: string[]; issueIds?: string[] } | null;
  proxy: boolean;
  guest: string | null;
  pax: number | null;
  hasArrivalToday: boolean;
};

export type AdminSettingTarget = {
  roomKey: string;
  building: BuildingKey | null;
  buildingRaw: string;
  room: string;
  guest: string;
  pax: number | null;
};

export type AdminCleaningTodayData = {
  tasks: AdminCleaningTask[];
  setupTargets: AdminSettingTarget[];
  staff: CleaningStaffOption[];
  /** True if any of today's data sources failed to load — KPI strip shows "-" instead of a count. */
  loadError: boolean;
};

function taskLabelToType(taskLabel: string): CleaningTaskType {
  if (!isCleaningTaskKey(taskLabel)) return "checkout";
  if (taskLabel === "long_stay") return "longstay";
  return taskLabel;
}

function buildingKeyOf(canonicalPropertyName: string): BuildingKey | null {
  const key = CANONICAL_TO_BUILDING_KEY[canonicalPropertyName];
  return (key as BuildingKey | undefined) ?? null;
}

function formatTokyoTime(iso: string | null): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: cleaningOperatingTimeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/** Most relevant session for a room today: prefer in_progress, then completed; cancelled-only → none. */
function pickRelevantSession(sessions: CleaningSessionRow[]): CleaningSessionRow | null {
  const live = sessions.filter((s) => s.status !== "cancelled");
  if (live.length === 0) return null;
  const inProgress = live.find((s) => s.status === "in_progress");
  if (inProgress) return inProgress;
  return live[0]; // already ordered started_at desc by getOrgTodayCleaningSessions
}

type ReportLinks = { lostIds: string[]; issueIds: string[] };

// Collects the actual lost-item/maintenance-report ids per session (not just counts) so the detail
// panel's report tiles can navigate straight to the linked record instead of just showing a number.
async function collectReportLinksBySession(
  organizationId: string,
  sessionIds: string[],
): Promise<Map<string, ReportLinks>> {
  const result = new Map<string, ReportLinks>();
  if (sessionIds.length === 0) return result;

  const supabase = await getSupabaseServerClient();
  const [lostRes, issueRes] = await Promise.all([
    supabase
      .from("lost_items")
      .select("id, cleaning_session_id")
      .eq("organization_id", organizationId)
      .in("cleaning_session_id", sessionIds),
    supabase
      .from("maintenance_reports")
      .select("id, cleaning_session_id")
      .eq("organization_id", organizationId)
      .in("cleaning_session_id", sessionIds),
  ]);

  for (const row of (lostRes.data ?? []) as { id: string; cleaning_session_id: string | null }[]) {
    if (!row.cleaning_session_id) continue;
    const entry = result.get(row.cleaning_session_id) ?? { lostIds: [], issueIds: [] };
    entry.lostIds.push(row.id);
    result.set(row.cleaning_session_id, entry);
  }
  for (const row of (issueRes.data ?? []) as { id: string; cleaning_session_id: string | null }[]) {
    if (!row.cleaning_session_id) continue;
    const entry = result.get(row.cleaning_session_id) ?? { lostIds: [], issueIds: [] };
    entry.issueIds.push(row.id);
    result.set(row.cleaning_session_id, entry);
  }
  return result;
}

export async function getAdminCleaningToday(session: AppSession): Promise<AdminCleaningTodayData> {
  const organizationId = session.organization.id;

  let loadError = false;
  const [targetsResult, roomCatalog, orgTodaySessions, staff] = await Promise.all([
    getCleaningTargets(organizationId).catch(() => {
      loadError = true;
      return null;
    }),
    getActiveRoomCatalogServer(organizationId).catch(() => undefined),
    getOrgTodayCleaningSessions(organizationId).catch(() => {
      loadError = true;
      return [] as CleaningSessionRow[];
    }),
    getCleaningStaffOptions(organizationId).catch(() => {
      loadError = true;
      return [] as CleaningStaffOption[];
    }),
  ]);

  const catalog: ActiveRoomCatalogItem[] = roomCatalog ?? [];
  const catalogLabelMap = buildSessionLabelToRoomKeyMap(catalog);
  const legacyAliasMap = buildLegacyAliasToRoomKeyMap(catalog);
  const staffNameById = new Map(staff.map((s) => [s.id, s.name] as const));

  // Resolve every today session to a roomKey; group by roomKey to find the one relevant session
  // (in_progress > completed > none-if-only-cancelled) per room.
  const sessionsByRoomKey = new Map<string, CleaningSessionRow[]>();
  for (const s of orgTodaySessions) {
    const resolved = resolveRoomKey(s.room_label, catalogLabelMap, legacyAliasMap);
    const key = resolved.roomKey ?? `unresolved:${s.room_label}`;
    const list = sessionsByRoomKey.get(key) ?? [];
    list.push(s);
    sessionsByRoomKey.set(key, list);
  }

  const targetRoomKeys = new Set<string>();
  const tasks: AdminCleaningTask[] = [];

  if (targetsResult) {
    for (const target of targetsResult.cleaningList) {
      targetRoomKeys.add(target.roomKey);
      const matched = pickRelevantSession(sessionsByRoomKey.get(target.roomKey) ?? []);

      let status: AdminCleaningStatus = "pending";
      if (matched?.status === "in_progress") status = "progress";
      else if (matched?.status === "completed") status = "done";

      tasks.push({
        id: matched?.id ?? `pending:${target.roomKey}`,
        sessionId: matched?.id ?? null,
        roomKey: target.roomKey,
        building: buildingKeyOf(target.canonicalPropertyName),
        buildingRaw: target.canonicalPropertyName,
        room: getDisplayRoomLabel(target.canonicalPropertyName, target.canonicalRoomLabel),
        type: matched ? taskLabelToType(matched.task_label) : "checkout",
        status,
        staffId: matched?.staff_user_id ?? null,
        staffName: matched ? (staffNameById.get(matched.staff_user_id) ?? null) : null,
        start: formatTokyoTime(matched?.started_at ?? null),
        end: formatTokyoTime(matched?.completed_at ?? null),
        note: matched?.notes ?? "",
        reports: null, // filled below once session ids are known
        proxy: Boolean(matched?.completed_by_admin),
        guest: target.hasTurnover ? target.arrivingGuestName : null,
        pax: target.hasTurnover ? target.arrivingPax : null,
        hasArrivalToday: target.hasTurnover,
      });
    }
  }

  // Sessions today that don't correspond to any reservation-driven target (manual / long-stay
  // cleanings started from the mobile "기타" section, or ad-hoc rooms) — still surfaced as cards
  // so real data never silently drops work that's actually happening.
  for (const [roomKey, sessions] of sessionsByRoomKey) {
    if (targetRoomKeys.has(roomKey)) continue;
    const relevant = pickRelevantSession(sessions);
    if (!relevant) continue; // only cancelled sessions for this room — nothing to show

    let buildingRaw = relevant.room_label;
    let room = getDisplaySessionRoomLabel(relevant.room_label);
    const catalogMatch = catalog.find(
      (item) =>
        buildSessionRoomLabel(item.propertyName, item.canonicalRoomLabel) === relevant.room_label ||
        item.canonicalRoomLabel === relevant.room_label,
    );
    if (catalogMatch) {
      buildingRaw = catalogMatch.propertyName;
      room = getDisplayRoomLabel(catalogMatch.propertyName, catalogMatch.canonicalRoomLabel);
    }

    tasks.push({
      id: relevant.id,
      sessionId: relevant.id,
      roomKey,
      building: buildingKeyOf(buildingRaw),
      buildingRaw,
      room,
      type: taskLabelToType(relevant.task_label),
      status: relevant.status === "in_progress" ? "progress" : "done",
      staffId: relevant.staff_user_id,
      staffName: staffNameById.get(relevant.staff_user_id) ?? null,
      start: formatTokyoTime(relevant.started_at),
      end: formatTokyoTime(relevant.completed_at),
      note: relevant.notes ?? "",
      reports: null,
      proxy: Boolean(relevant.completed_by_admin),
      guest: null,
      pax: null,
      hasArrivalToday: false,
    });
  }

  // Attach linked lost-item/maintenance-report ids (and derived counts) for every task backed by a
  // real session, so the detail panel's report tiles can navigate straight to the linked record.
  const sessionIds = tasks.map((t) => t.sessionId).filter((id): id is string => id !== null);
  const reportLinks = await collectReportLinksBySession(organizationId, sessionIds).catch(
    () => new Map<string, ReportLinks>(),
  );
  for (const task of tasks) {
    if (!task.sessionId) continue;
    const links = reportLinks.get(task.sessionId);
    if (!links || (links.lostIds.length === 0 && links.issueIds.length === 0)) continue;
    task.reports = {
      lost: links.lostIds.length || undefined,
      issue: links.issueIds.length || undefined,
      lostIds: links.lostIds.length ? links.lostIds : undefined,
      issueIds: links.issueIds.length ? links.issueIds : undefined,
    };
  }

  const setupTargets: AdminSettingTarget[] = targetsResult
    ? targetsResult.settingList.map((target: SettingTarget) => ({
        roomKey: target.roomKey,
        building: buildingKeyOf(target.canonicalPropertyName),
        buildingRaw: target.canonicalPropertyName,
        room: getDisplayRoomLabel(target.canonicalPropertyName, target.canonicalRoomLabel),
        guest: target.arrivingGuestName,
        pax: target.arrivingPax,
      }))
    : [];

  return { tasks, setupTargets, staff, loadError };
}

/* ============================================================
   기록 (history) tab — thin wrapper over the existing getOrgCleaningSessionsFiltered, mapped into
   the shape the admin console's history table/export already expect.
   ============================================================ */

export type AdminCleaningHistoryItem = {
  id: string;
  date: string;
  building: BuildingKey | null;
  buildingRaw: string;
  room: string;
  type: CleaningTaskType;
  staffId: string;
  staffName: string;
  start: string;
  dur: number;
  proxy: boolean;
  note: string;
};

function mapSessionToHistoryItem(
  s: CleaningSessionWithStaff,
  catalog: readonly ActiveRoomCatalogItem[],
): AdminCleaningHistoryItem {
  let buildingRaw = s.room_label;
  let room = getDisplaySessionRoomLabel(s.room_label);
  const catalogMatch = catalog.find(
    (item) =>
      buildSessionRoomLabel(item.propertyName, item.canonicalRoomLabel) === s.room_label ||
      item.canonicalRoomLabel === s.room_label,
  );
  if (catalogMatch) {
    buildingRaw = catalogMatch.propertyName;
    room = getDisplayRoomLabel(catalogMatch.propertyName, catalogMatch.canonicalRoomLabel);
  }

  return {
    id: s.id,
    date: s.cleaning_date,
    building: buildingKeyOf(buildingRaw),
    buildingRaw,
    room,
    type: taskLabelToType(s.task_label),
    staffId: s.staff_user_id,
    staffName: s.staff_name,
    start: formatTokyoTime(s.started_at) ?? "",
    dur: Math.round((s.duration_seconds ?? 0) / 60),
    proxy: Boolean(s.completed_by_admin),
    note: s.notes ?? "",
  };
}

/** 기록 탭 필터(기간·건물·직원·상태) 적용 조회. status 필터를 안 넘기면 완료 건만 보여준다
 * (진행중/취소는 기록 화면에서 다루지 않는다 — 오늘 현황에서 이미 보임). */
export async function getAdminCleaningHistory(
  session: AppSession,
  filters: CleaningExportFilters,
  roomCatalog?: readonly ActiveRoomCatalogItem[],
): Promise<AdminCleaningHistoryItem[]> {
  const catalog = roomCatalog ?? (await getActiveRoomCatalogServer(session.organization.id).catch(() => undefined)) ?? [];
  const sessions = await getOrgCleaningSessionsFiltered(
    session,
    { ...filters, status: filters.status ?? "completed" },
    catalog,
  );
  return sessions.map((s) => mapSessionToHistoryItem(s, catalog));
}

