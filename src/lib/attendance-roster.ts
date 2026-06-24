// Server-only helper — 출근자 명단 데이터 조회.
// 매니저/오피스 권한 사용자의 일일 출근자 현황을 반환한다.

import "server-only";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type { AttendanceSessionRow } from "@/lib/attendance";

export type RosterStatusKey = "working" | "on_break" | "done" | "needs_review" | "void";

export type RosterEntry = {
  sessionId: string;
  userId: string;
  name: string;
  avatarInitial: string;
  role: string;        // display role label
  roleCode: string;    // raw role enum value from DB
  phoneNumber: string | null;
  siteName: string;
  clockInTimeLabel: string;    // HH:mm Asia/Tokyo
  clockOutTimeLabel: string | null;
  breakCount: number;
  closedBreakSeconds: number;
  hasOpenBreak: boolean;
  statusKey: RosterStatusKey;
  isVoid: boolean;
};

export type RosterDay = {
  operatingDate: string;  // "YYYY-MM-DD"
  entries: RosterEntry[];
  counts: {
    total: number;
    working: number;
    on_break: number;
    done: number;
    needs_review: number;
    void: number;
  };
};

function tokyoHHmm(iso: string | null): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function roleDisplayLabel(roleCode: string): string {
  switch (roleCode) {
    case "owner":               return "대표";
    case "office_admin":        return "오피스";
    case "cs_staff":            return "CS";
    case "field_manager":       return "필드 매니저";
    case "staff":               return "필드 직원";
    case "part_time_staff":     return "알바생";
    case "developer_super_admin": return "개발자";
    default:                    return roleCode;
  }
}

function deriveStatus(
  invalidatedAt: string | null,
  reviewState: string | null,
  clockOutAt: string | null,
  hasOpenBreak: boolean,
): RosterStatusKey {
  if (invalidatedAt) return "void";
  if (reviewState === "needs_review") return "needs_review";
  if (clockOutAt) return "done";
  if (hasOpenBreak) return "on_break";
  return "working";
}

export async function getAttendanceRoster(
  organizationId: string,
  operatingDate: string,
): Promise<RosterDay> {
  const supabase = getSupabaseServiceClient();

  // 1. 세션 조회 — select("*") 후 Row 타입으로 캐스팅하는 기존 패턴을 따른다
  const { data: rawSessions, error: sessErr } = await supabase
    .from("attendance_sessions")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("operating_date", operatingDate)
    .order("clock_in_at", { ascending: true });

  if (sessErr) throw sessErr;
  const sessions = (rawSessions ?? []) as AttendanceSessionRow[];
  if (sessions.length === 0) {
    return {
      operatingDate,
      entries: [],
      counts: { total: 0, working: 0, on_break: 0, done: 0, needs_review: 0, void: 0 },
    };
  }

  const userIds = [...new Set(sessions.map((s) => s.user_id).filter(Boolean))] as string[];
  const sessionIds = sessions.map((s) => s.id);
  const siteIds = [...new Set(sessions.map((s) => s.clock_in_site_id).filter(Boolean))] as string[];

  // 2. 프로필, 멤버십, 사이트 이름, 브레이크 병렬 조회
  type ProfileSnap = { id: string; name: string | null; phone_number: string | null };
  type MembershipSnap = { user_id: string; role: string };
  type SiteSnap = { id: string; name: string };
  type BreakSnap = { session_id: string; started_at: string; ended_at: string | null };

  const [profilesRes, membershipsRes, sitesRes, breaksRes] = await Promise.all([
    supabase.from("profiles").select("id, name, phone_number").in("id", userIds),
    supabase.from("memberships").select("user_id, role").in("user_id", userIds).eq("organization_id", organizationId).eq("status", "active"),
    siteIds.length > 0
      ? supabase.from("attendance_sites").select("id, name").in("id", siteIds)
      : Promise.resolve({ data: [] as SiteSnap[], error: null }),
    supabase.from("attendance_breaks").select("session_id, started_at, ended_at").in("session_id", sessionIds),
  ]);

  const profiles = (profilesRes.data ?? []) as unknown as ProfileSnap[];
  const memberships = (membershipsRes.data ?? []) as unknown as MembershipSnap[];
  const sites = (sitesRes.data ?? []) as unknown as SiteSnap[];

  const profileMap = new Map(profiles.map((p) => [p.id, p]));
  const membershipMap = new Map(memberships.map((m) => [m.user_id, m.role]));
  const siteMap = new Map(sites.map((s) => [s.id, s.name]));

  // session별 break 그룹핑
  const breaksData = (breaksRes.data ?? []) as unknown as BreakSnap[];
  const breaksBySession = new Map<string, { started_at: string; ended_at: string | null }[]>();
  for (const b of breaksData) {
    const arr = breaksBySession.get(b.session_id) ?? [];
    arr.push({ started_at: b.started_at, ended_at: b.ended_at });
    breaksBySession.set(b.session_id, arr);
  }

  // 3. 엔트리 조합
  const entries: RosterEntry[] = sessions.map((session) => {
    const profile = profileMap.get(session.user_id);
    const roleCode = membershipMap.get(session.user_id) ?? "";
    const breaks = breaksBySession.get(session.id) ?? [];
    const openBreak = breaks.find((b) => !b.ended_at) ?? null;
    const closedBreaks = breaks.filter((b) => b.ended_at);
    const closedBreakSeconds = closedBreaks.reduce((acc, b) => {
      if (!b.ended_at) return acc;
      return acc + Math.max(0, Math.floor(
        (new Date(b.ended_at).getTime() - new Date(b.started_at).getTime()) / 1000,
      ));
    }, 0);
    const hasOpenBreak = !!openBreak;
    const statusKey = deriveStatus(
      session.invalidated_at,
      session.review_state,
      session.clock_out_at,
      hasOpenBreak,
    );
    const rawName = profile?.name?.trim() ?? "";

    return {
      sessionId: session.id,
      userId: session.user_id,
      name: rawName || "?",
      avatarInitial: rawName ? rawName.slice(0, 1) : "?",
      role: roleDisplayLabel(roleCode),
      roleCode,
      phoneNumber: profile?.phone_number ?? null,
      siteName: siteMap.get(session.clock_in_site_id ?? "") ?? "",
      clockInTimeLabel: tokyoHHmm(session.clock_in_at) ?? "--:--",
      clockOutTimeLabel: tokyoHHmm(session.clock_out_at),
      breakCount: breaks.length,
      closedBreakSeconds,
      hasOpenBreak,
      statusKey,
      isVoid: !!session.invalidated_at,
    };
  });

  // 4. counts 집계
  const counts = {
    total: entries.length,
    working: 0,
    on_break: 0,
    done: 0,
    needs_review: 0,
    void: 0,
  };
  for (const e of entries) {
    counts[e.statusKey] += 1;
  }

  return { operatingDate, entries, counts };
}
