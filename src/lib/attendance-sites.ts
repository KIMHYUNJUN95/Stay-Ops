// Attendance — site master + QR token backend helpers (Step 2).
//
// Caller-agnostic, server-only data helpers for attendance SITE MASTER and QR LIFECYCLE. These are the
// reusable primitives the future OWNER-ONLY web-dashboard server actions will call, and what the dev
// temp-QR tool (src/app/api/dev/attendance/temp-qr) uses to provision test data.
//
// IMPORTANT — authorization boundary:
//   These functions DO NOT check who the caller is. Site master / QR issuance is OWNER-ONLY per the
//   product rules (docs/product/21 → "Owner-only Authority"), and that check MUST be enforced by the
//   caller BEFORE invoking these (the web-dashboard server action verifies `role === 'owner'`; the dev
//   tool is gated to local development). Every helper is organization-scoped — always pass the owner's
//   organization id so org isolation holds even though the service client bypasses RLS.
//
// No worker clock-in/out, break, correction, or payroll logic here — that is Step 3+.

import "server-only";
import { randomBytes } from "node:crypto";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type { AttendanceSiteRow, AttendanceQrTokenRow } from "@/lib/attendance";
import { ATTENDANCE_DEFAULT_RADIUS_METERS } from "@/lib/attendance";
import type { Database } from "@/types/database";

// The project's database.ts omits Relationships, so service.rpc() is not typed. This provides just
// enough typing for the one RPC we call (mirrors src/app/onboarding/actions.ts).
type IssueQrRpcClient = {
  rpc(
    fn: "issue_attendance_qr",
    args: { p_org: string; p_site: string; p_created_by: string; p_token: string },
  ): Promise<{ data: AttendanceQrTokenRow | null; error: { message: string } | null }>;
};

export type CreateAttendanceSiteInput = {
  organizationId: string;
  name: string;
  latitude: number;
  longitude: number;
  allowedRadiusMeters?: number;
  propertyId?: string | null;
  wifiSsids?: string[];
  isActive?: boolean;
};

export type UpdateAttendanceSitePatch = {
  name?: string;
  /** 인쇄물 표기용(주로 영문). 빈 문자열이면 null 로 저장해 `name` 폴백으로 돌아간다. */
  printName?: string | null;
  latitude?: number;
  longitude?: number;
  allowedRadiusMeters?: number;
  propertyId?: string | null;
  wifiSsids?: string[];
  isActive?: boolean;
};

/** A site-specific, server-verifiable QR token value. */
export function generateAttendanceQrToken(): string {
  return `att_${randomBytes(24).toString("base64url")}`;
}

// ── Reads ───────────────────────────────────────────────────────────────────────

/** All sites for an org, newest first. (Active + inactive — the admin list shows both.) */
export async function listAttendanceSites(organizationId: string): Promise<AttendanceSiteRow[]> {
  const { data, error } = await getSupabaseServiceClient()
    .from("attendance_sites")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(`Failed to list attendance sites: ${error.message}`);
  }
  return (data ?? []) as AttendanceSiteRow[];
}

/** One site (org-scoped), or null if not found in that org. */
export async function getAttendanceSite(
  organizationId: string,
  siteId: string,
): Promise<AttendanceSiteRow | null> {
  const { data, error } = await getSupabaseServiceClient()
    .from("attendance_sites")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", siteId)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load attendance site: ${error.message}`);
  }
  return (data as AttendanceSiteRow | null) ?? null;
}

/** The single active QR token for a site, or null if none is active. */
export async function getActiveQrToken(
  organizationId: string,
  siteId: string,
): Promise<AttendanceQrTokenRow | null> {
  const { data, error } = await getSupabaseServiceClient()
    .from("attendance_qr_tokens")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("site_id", siteId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load active QR token: ${error.message}`);
  }
  return (data as AttendanceQrTokenRow | null) ?? null;
}

/** Full QR token history for a site (active + revoked), newest first. */
export async function getQrTokenHistory(
  organizationId: string,
  siteId: string,
): Promise<AttendanceQrTokenRow[]> {
  const { data, error } = await getSupabaseServiceClient()
    .from("attendance_qr_tokens")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("site_id", siteId)
    .order("issued_at", { ascending: false });
  if (error) {
    throw new Error(`Failed to load QR token history: ${error.message}`);
  }
  return (data ?? []) as AttendanceQrTokenRow[];
}

// ── Writes (service-role; caller must already be authorized as owner) ─────────────

export async function createAttendanceSite(
  input: CreateAttendanceSiteInput,
): Promise<AttendanceSiteRow> {
  const { data, error } = await getSupabaseServiceClient()
    .from("attendance_sites")
    .insert({
      organization_id: input.organizationId,
      name: input.name,
      latitude: input.latitude,
      longitude: input.longitude,
      allowed_radius_meters: input.allowedRadiusMeters ?? ATTENDANCE_DEFAULT_RADIUS_METERS,
      property_id: input.propertyId ?? null,
      wifi_ssids: input.wifiSsids ?? [],
      is_active: input.isActive ?? true,
    })
    .select("*")
    .single();
  if (error) {
    throw new Error(`Failed to create attendance site: ${error.message}`);
  }
  return data as AttendanceSiteRow;
}

export async function updateAttendanceSite(
  organizationId: string,
  siteId: string,
  patch: UpdateAttendanceSitePatch,
): Promise<AttendanceSiteRow> {
  const update: Database["public"]["Tables"]["attendance_sites"]["Update"] = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.printName !== undefined) update.print_name = patch.printName || null;
  if (patch.latitude !== undefined) update.latitude = patch.latitude;
  if (patch.longitude !== undefined) update.longitude = patch.longitude;
  if (patch.allowedRadiusMeters !== undefined) update.allowed_radius_meters = patch.allowedRadiusMeters;
  if (patch.propertyId !== undefined) update.property_id = patch.propertyId;
  if (patch.wifiSsids !== undefined) update.wifi_ssids = patch.wifiSsids;
  if (patch.isActive !== undefined) update.is_active = patch.isActive;

  const { data, error } = await getSupabaseServiceClient()
    .from("attendance_sites")
    .update(update)
    .eq("organization_id", organizationId)
    .eq("id", siteId)
    .select("*")
    .single();
  if (error) {
    throw new Error(`Failed to update attendance site: ${error.message}`);
  }
  return data as AttendanceSiteRow;
}

/** Activate / deactivate a site without touching its other fields. */
export async function setAttendanceSiteActive(
  organizationId: string,
  siteId: string,
  isActive: boolean,
): Promise<AttendanceSiteRow> {
  return updateAttendanceSite(organizationId, siteId, { isActive });
}

/**
 * Issue (or reissue) the active QR token for a site. Atomic via the `issue_attendance_qr` Postgres
 * function: the previous active token is deactivated and linked to the new one, preserving the
 * "one active token per site" guarantee and the audit chain.
 */
export async function issueAttendanceQr(params: {
  organizationId: string;
  siteId: string;
  createdByUserId: string;
}): Promise<AttendanceQrTokenRow> {
  const token = generateAttendanceQrToken();
  const service = getSupabaseServiceClient();
  const { data, error } = await (service as unknown as IssueQrRpcClient).rpc("issue_attendance_qr", {
    p_org: params.organizationId,
    p_site: params.siteId,
    p_created_by: params.createdByUserId,
    p_token: token,
  });
  if (error || !data) {
    throw new Error(`Failed to issue attendance QR: ${error?.message ?? "no row returned"}`);
  }
  return data;
}

/** Deactivate the active QR token for a site without issuing a replacement. */
export async function revokeAttendanceQr(organizationId: string, siteId: string): Promise<void> {
  const { error } = await getSupabaseServiceClient()
    .from("attendance_qr_tokens")
    .update({ is_active: false, revoked_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("site_id", siteId)
    .eq("is_active", true);
  if (error) {
    throw new Error(`Failed to revoke attendance QR: ${error.message}`);
  }
}

// ── QR deep link (2026-07-31) ──────────────────────────────────────────────
// 휴대폰 기본 카메라로 QR 을 찍으면 `/mobile/attendance/capture?token=…` 로 들어온다. 그 진입
// 화면이 "어느 건물의 QR 인지"를 먼저 보여주고 출근/퇴근을 고르게 하려면, 제출 전에 토큰 →
// 사이트 이름을 한 번 조회해야 한다.
//
// 여기서 통과했다고 인증이 되는 것은 아니다 — 실제 판정(활성 토큰 · 활성 사이트 · 동일 조직 ·
// GPS 필수 · 반경 이내)은 전부 `submitAttendanceScan` 이 다시 한다. 이건 화면 표시용 조회다.

type SiteWithProperty = AttendanceSiteRow & {
  properties: {
    display_name_ko: string | null;
    display_name_ja: string | null;
    display_name_en: string | null;
  } | null;
};

/** 활성 QR 토큰이 가리키는 사이트의 표시 이름. 토큰/사이트가 유효하지 않으면 null. */
export async function getSiteNameByActiveQrToken(
  organizationId: string,
  token: string,
  locale: string,
): Promise<string | null> {
  if (!token) return null;
  const service = getSupabaseServiceClient();

  const tokenRes = await service
    .from("attendance_qr_tokens")
    .select("*")
    .eq("token", token)
    .eq("is_active", true)
    .maybeSingle();
  const tokenRow = tokenRes.data as AttendanceQrTokenRow | null;
  // 조직 일치는 반드시 확인한다 — 서비스 클라이언트는 RLS 를 우회한다.
  if (tokenRes.error || !tokenRow || tokenRow.organization_id !== organizationId) return null;

  const siteRes = await service
    .from("attendance_sites")
    .select("*, properties(display_name_ko, display_name_ja, display_name_en)")
    .eq("organization_id", organizationId)
    .eq("id", tokenRow.site_id)
    .maybeSingle();
  const site = siteRes.data as SiteWithProperty | null;
  if (siteRes.error || !site || !site.is_active) return null;

  const p = site.properties;
  if (p) {
    if (locale === "ja" && p.display_name_ja) return p.display_name_ja;
    if (locale === "en" && p.display_name_en) return p.display_name_en;
    if (p.display_name_ko) return p.display_name_ko;
  }
  return site.name;
}

// ── 현장별 QR 개요 (2026-07-31, 설정 콘솔 마스터·디테일) ──────────────────
// 설정 인덱스와 출퇴근 QR 화면이 같은 값을 본다: 현장 목록 + 각 현장의 활성 토큰.
// 현장 수만큼 쿼리를 돌리지 않도록 활성 토큰을 한 번에 읽어 맵으로 붙인다.

export type AttendanceSiteQrRow = {
  site: AttendanceSiteRow;
  /** 활성 토큰이 없으면 null = 이 현장에서는 아직 출퇴근을 찍을 수 없다. */
  token: AttendanceQrTokenRow | null;
};

export async function getAttendanceSiteQrOverview(
  organizationId: string,
): Promise<AttendanceSiteQrRow[]> {
  const service = getSupabaseServiceClient();
  const [sitesRes, tokensRes] = await Promise.all([
    service
      .from("attendance_sites")
      .select("*")
      .eq("organization_id", organizationId)
      // 비활성 현장은 목록 맨 아래로 — 운영에서 뺀 현장이 위를 차지하지 않게.
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: true }),
    service
      .from("attendance_qr_tokens")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_active", true),
  ]);
  if (sitesRes.error) throw new Error(`Failed to load attendance sites: ${sitesRes.error.message}`);

  const bySite = new Map<string, AttendanceQrTokenRow>();
  for (const row of (tokensRes.data ?? []) as AttendanceQrTokenRow[]) {
    bySite.set(row.site_id, row);
  }
  return ((sitesRes.data ?? []) as AttendanceSiteRow[]).map((site) => ({
    site,
    token: bySite.get(site.id) ?? null,
  }));
}

// ── 현장 정리: 삭제 / 비활성화 (2026-07-31) ────────────────────────────────
//
// 스키마가 이미 경계를 정해 두었다:
//   · attendance_qr_tokens.site_id        → on delete cascade  (QR 은 현장과 함께 사라진다)
//   · attendance_sessions.clock_in/out_site_id → **on delete restrict**
//   · attendance_attempt_logs / correction_requests → set null
//
// 즉 **출퇴근 기록이 한 건이라도 있는 현장은 DB 가 삭제를 거부한다.** 급여 근거가 되는 기록을
// 지우지 않기 위한 설계이고, 그대로 유지한다. 그래서 UI 는 두 가지를 나눠 제공한다:
//   · 기록이 없는 현장 → 완전 삭제
//   · 기록이 있는 현장 → `is_active = false` 로 운영에서만 제외(기록은 보존)
// 비활성 현장의 출퇴근은 이미 `submitAttendanceScan` 이 거부한다.

/** 이 현장을 참조하는 출퇴근 세션이 하나라도 있는지. 삭제 가능 여부 판단용. */
export async function attendanceSiteHasHistory(
  organizationId: string,
  siteId: string,
): Promise<boolean> {
  const service = getSupabaseServiceClient();
  const { count, error } = await service
    .from("attendance_sessions")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .or(`clock_in_site_id.eq.${siteId},clock_out_site_id.eq.${siteId}`);
  // 확인에 실패하면 "기록이 있다"로 본다 — 모르는 상태에서 삭제 버튼을 열어주지 않는다.
  if (error) return true;
  return (count ?? 0) > 0;
}

export type DeleteAttendanceSiteResult =
  | { ok: true }
  | { ok: false; reason: "in_use" | "not_found" | "error" };

/** 현장 삭제. 출퇴근 기록이 있으면 DB(FK restrict)가 막고 `in_use` 를 돌려준다. */
export async function deleteAttendanceSite(
  organizationId: string,
  siteId: string,
): Promise<DeleteAttendanceSiteResult> {
  if (!siteId) return { ok: false, reason: "not_found" };
  const { error } = await getSupabaseServiceClient()
    .from("attendance_sites")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", siteId);
  if (!error) return { ok: true };
  // 23503 = foreign_key_violation → 이 현장을 참조하는 근태 세션이 있다.
  if (error.code === "23503") return { ok: false, reason: "in_use" };
  return { ok: false, reason: "error" };
}

// 활성/비활성 전환은 위쪽의 기존 `setAttendanceSiteActive()` 를 그대로 쓴다.
