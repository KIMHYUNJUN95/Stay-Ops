import {
  canAccessFieldOperations,
  type Role,
} from "@/config/roles";
import type { CleaningExportFilters } from "@/lib/export/cleaning-filters";
import { resolveRequestCatalogLocation } from "@/lib/request-location";
import type { ActiveRoomCatalogItem } from "@/lib/rooms";
import type { AppSession } from "@/lib/session";
import type { Database } from "@/types/database";

export type CleaningSessionRow =
  Database["public"]["Tables"]["cleaning_sessions"]["Row"];

export type CleaningSessionWithStaff = CleaningSessionRow & {
  staff_name: string;
};

type ProfileName = {
  id: string;
  name: string;
};

export const cleaningTaskKeys = ["checkout", "simple", "long_stay"] as const;
export const cleaningOperatingTimeZone = "Asia/Tokyo";
export const cleaningMobileAccessRoles = [
  "developer_super_admin",
  "owner",
  "field_manager",
  "staff",
  "part_time_staff",
] as const satisfies readonly Role[];

// Roles allowed to force-complete a cleaning session on another staff member's behalf from the
// admin console (관리자 대리 완료). Matches docs/product/07-cleaning-workflow.md → 강제완료 스펙.
export const cleaningForceCompleteRoles = [
  "developer_super_admin",
  "owner",
  "senior_managing_director",
  "office_admin",
  "field_manager",
] as const satisfies readonly Role[];

export function canForceCompleteCleaning(role: string) {
  return (cleaningForceCompleteRoles as readonly string[]).includes(role);
}

export function isCleaningTaskKey(
  value: string,
): value is (typeof cleaningTaskKeys)[number] {
  return (cleaningTaskKeys as readonly string[]).includes(value);
}

export function canAccessMobileCleaning(role: string) {
  return (
    role === "developer_super_admin" ||
    canAccessFieldOperations(role as Role)
  );
}

export function getCleaningOperatingDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: cleaningOperatingTimeZone,
    year: "numeric",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

export function formatDuration(totalSeconds: number | null) {
  if (totalSeconds === null) {
    return "-";
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

async function getSupabase() {
  const { getSupabaseServerClient } = await import("@/lib/supabase/server");
  return getSupabaseServerClient();
}

/**
 * 진행 중인 청소 **한 건** — 날짜와 무관하게 찾는다.
 *
 * DB 의 `cleaning_sessions_one_active_per_org_user_idx` 는 (organization_id, staff_user_id) 당
 * `in_progress` 를 하나로 제한하는데 **날짜 조건이 없다.** 그런데 화면은 오늘 날짜 세션만
 * 읽고 있어서(`getMyTodayCleaningSessions`), 어제 이전에 시작하고 완료하지 않은 세션이 남으면:
 *   - 화면에는 아무것도 안 보이고
 *   - 새 청소·셋팅을 시작하면 unique 위반(23505)으로 `already_active` 만 뜨고
 *   - 그 세션을 완료·취소할 UI 가 없어 **영구 교착**이 된다.
 *
 * 실제로 2026-06-30 에 시작된 세션이 34일간 남아 그 사용자의 모든 시작을 막고 있었다
 * (2026-08-04 발견). 그래서 활성 세션은 날짜를 빼고 조회해 화면이 항상 그것을 보여주게 한다.
 */
export async function getMyActiveCleaningSession(session: AppSession) {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("cleaning_sessions")
    .select("*")
    .eq("organization_id", session.organization.id)
    .eq("staff_user_id", session.user.id)
    .eq("status", "in_progress")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? null) as CleaningSessionRow | null;
}

export async function getMyTodayCleaningSessions(session: AppSession) {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("cleaning_sessions")
    .select("*")
    .eq("organization_id", session.organization.id)
    .eq("staff_user_id", session.user.id)
    .eq("cleaning_date", getCleaningOperatingDateKey())
    .order("started_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as CleaningSessionRow[];
}

// Returns room_label + status for all sessions in the org today.
// Used by the cleaning page to build the "already processed" exclusion set.
export async function getOrgTodayCleaningRoomLabels(
  organizationId: string,
): Promise<{ room_label: string; status: string }[]> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("cleaning_sessions")
    .select("room_label, status")
    .eq("organization_id", organizationId)
    .eq("cleaning_date", getCleaningOperatingDateKey());

  if (error) throw new Error(error.message);
  return (data ?? []) as { room_label: string; status: string }[];
}

// Full session rows for the org, today (org-wide, every staff member) — used by the admin console
// to overlay real cleaning-session status onto the reservation-derived today targets.
export async function getOrgTodayCleaningSessions(
  organizationId: string,
): Promise<CleaningSessionRow[]> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("cleaning_sessions")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("cleaning_date", getCleaningOperatingDateKey())
    .order("started_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as CleaningSessionRow[];
}

export type CleaningStaffOption = { id: string; name: string };

// Org members eligible to be assigned a cleaning session (mobile field roles), for the admin
// console's staff filter/summary/force-complete assignee picker. Narrower than
// getOrgMemberOptions, which returns every org member regardless of role.
export async function getCleaningStaffOptions(
  organizationId: string,
): Promise<CleaningStaffOption[]> {
  const supabase = await getSupabase();
  // cleaningMobileAccessRoles includes "developer_super_admin" (platform-only); memberships.role is
  // the organization_role DB enum, which never stores that value — passing it through `.in()` makes
  // Postgres reject the whole query (invalid enum input), silently emptying this list. Filter it out
  // before querying (same pattern as orgAdminWebRoles in admin/announcements/[id]/page.tsx).
  const queryableRoles = (cleaningMobileAccessRoles as readonly string[]).filter(
    (role) => role !== "developer_super_admin",
  );
  const { data: membershipData, error } = await supabase
    .from("memberships")
    .select("user_id, role, status")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .in("role", queryableRoles);

  if (error) throw new Error(error.message);

  const userIds = [...new Set((membershipData ?? []).map((m) => (m as { user_id: string }).user_id))];
  if (userIds.length === 0) return [];

  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("id, name")
    .in("id", userIds);

  if (profileError) throw new Error(profileError.message);

  return ((profileData ?? []) as ProfileName[])
    .map((profile) => ({ id: profile.id, name: profile.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

export async function getCleaningSessionsForDate(
  session: AppSession,
  dateKey: string,
  options?: {
    filters?: Omit<CleaningExportFilters, "startDate" | "endDate">;
    roomCatalog?: readonly ActiveRoomCatalogItem[];
  },
) {
  return getOrgCleaningSessionsFiltered(
    session,
    {
      startDate: dateKey,
      endDate: dateKey,
      ...options?.filters,
    },
    options?.roomCatalog,
  );
}

export async function getCleaningSessionsInRange(
  session: AppSession,
  startDate: string,
  endDate: string,
): Promise<CleaningSessionWithStaff[]> {
  return getOrgCleaningSessionsFiltered(session, { startDate, endDate });
}

async function attachStaffNames(
  sessions: CleaningSessionRow[],
): Promise<CleaningSessionWithStaff[]> {
  if (sessions.length === 0) {
    return [];
  }

  const supabase = await getSupabase();
  const staffIds = Array.from(new Set(sessions.map((item) => item.staff_user_id)));
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, name")
    .in("id", staffIds);

  if (profileError) {
    throw new Error(profileError.message);
  }

  const profileNames = (profiles ?? []) as ProfileName[];
  const names = new Map(
    profileNames.map((profile) => [profile.id, profile.name] as const),
  );

  return sessions.map((sessionRow) => ({
    ...sessionRow,
    staff_name: names.get(sessionRow.staff_user_id) ?? "",
  })) satisfies CleaningSessionWithStaff[];
}

function filterSessionsByProperty(
  sessions: CleaningSessionRow[],
  propertyName: string,
  roomCatalog: readonly ActiveRoomCatalogItem[] | undefined,
): CleaningSessionRow[] {
  if (!roomCatalog || roomCatalog.length === 0) {
    return sessions.filter((row) => row.room_label.includes(propertyName));
  }

  return sessions.filter((row) => {
    const location = resolveRequestCatalogLocation(row.room_label, roomCatalog, {});
    return location.buildingName === propertyName;
  });
}

export async function getOrgCleaningSessionsFiltered(
  session: AppSession,
  filters: CleaningExportFilters,
  roomCatalog?: readonly ActiveRoomCatalogItem[],
): Promise<CleaningSessionWithStaff[]> {
  const supabase = await getSupabase();
  let query = supabase
    .from("cleaning_sessions")
    .select("*")
    .eq("organization_id", session.organization.id)
    .gte("cleaning_date", filters.startDate)
    .lte("cleaning_date", filters.endDate);

  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.staffUserId) {
    query = query.eq("staff_user_id", filters.staffUserId);
  }

  const { data, error } = await query
    .order("cleaning_date", { ascending: true })
    .order("started_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  let sessions = (data ?? []) as CleaningSessionRow[];
  if (filters.propertyName) {
    sessions = filterSessionsByProperty(sessions, filters.propertyName, roomCatalog);
  }

  return attachStaffNames(sessions);
}
