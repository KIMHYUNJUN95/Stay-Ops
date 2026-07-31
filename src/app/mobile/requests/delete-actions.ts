"use server";

import { isOrgTopAdmin, type Role } from "@/config/roles";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type DeleteResult = { ok: true } | { ok: false; error: "unauthorized" | "not_found" | "delete_failed" };

/**
 * 요청 3종(분실물 · 수리·점검 · 주문·비품)의 DELETE 권한 — DB의 DELETE RLS 정책과 같은 기준을
 * 서버 액션에서도 먼저 강제한다.
 *
 * RLS(202605210006 / 202605210007 / 202606010001):
 *   reported_by_user_id = auth.uid()
 *   OR is_platform_admin()
 *   OR has_org_role(org, ['owner','office_admin','cs_staff','field_manager'])
 * `has_org_role`은 senior_managing_director를 owner-equivalent로 처리하므로(202607130003)
 * `isOrgTopAdmin`으로 함께 커버한다.
 *
 * 앱 게이트가 없으면 RLS가 유일한 방어선이 되고, 감사 흔적이 남는 "무효 처리/상태 정정"은 막히는
 * 역할(staff · part_time_staff)이 흔적이 남지 않는 하드 삭제만 성공하는 역전이 생긴다.
 * 참고: field_manager가 남의 기록을 지울 수 있는지는 docs/engineering/05-rls-permissions.md의
 * Open Question으로 남아 있다 — 여기서는 현재 RLS와 동일하게(허용) 맞춰 두고 변경하지 않는다.
 */
const DELETE_ANY_ROLES: readonly Role[] = [
  "developer_super_admin",
  "owner",
  "senior_managing_director",
  "office_admin",
  "cs_staff",
  "field_manager",
];

function canDeleteAnyRequestRecord(role: Role): boolean {
  return isOrgTopAdmin(role) || DELETE_ANY_ROLES.includes(role);
}

function isValidUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** 작성자 본인이거나 관리 역할이어야 삭제할 수 있다. */
function canDelete(role: Role, reportedByUserId: string, currentUserId: string): boolean {
  return reportedByUserId === currentUserId || canDeleteAnyRequestRecord(role);
}

export async function deleteLostItem(id: string): Promise<DeleteResult> {
  const session = await getCurrentAppSession();
  if (!session || !hasOrganizationContext(session)) {
    return { ok: false, error: "unauthorized" };
  }
  if (!isValidUuid(id)) {
    return { ok: false, error: "not_found" };
  }
  const supabase = await getSupabaseServerClient();
  const { data: existing } = await supabase
    .from("lost_items")
    .select("id, reported_by_user_id")
    .eq("id", id)
    .eq("organization_id", session.organization.id)
    .maybeSingle();
  if (!existing) {
    return { ok: false, error: "not_found" };
  }
  const owner = (existing as { reported_by_user_id: string }).reported_by_user_id;
  if (!canDelete(session.user.role, owner, session.user.id)) {
    return { ok: false, error: "unauthorized" };
  }

  const { error } = await supabase
    .from("lost_items")
    .delete()
    .eq("id", id)
    .eq("organization_id", session.organization.id);
  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("permission") || msg.includes("policy") || msg.includes("denied")) {
      return { ok: false, error: "unauthorized" };
    }
    return { ok: false, error: "delete_failed" };
  }
  return { ok: true };
}

export async function deleteMaintenanceReport(id: string): Promise<DeleteResult> {
  const session = await getCurrentAppSession();
  if (!session || !hasOrganizationContext(session)) {
    return { ok: false, error: "unauthorized" };
  }
  if (!isValidUuid(id)) {
    return { ok: false, error: "not_found" };
  }
  const supabase = await getSupabaseServerClient();
  const { data: existing } = await supabase
    .from("maintenance_reports")
    .select("id, reported_by_user_id")
    .eq("id", id)
    .eq("organization_id", session.organization.id)
    .maybeSingle();
  if (!existing) {
    return { ok: false, error: "not_found" };
  }
  const owner = (existing as { reported_by_user_id: string }).reported_by_user_id;
  if (!canDelete(session.user.role, owner, session.user.id)) {
    return { ok: false, error: "unauthorized" };
  }

  const { error } = await supabase
    .from("maintenance_reports")
    .delete()
    .eq("id", id)
    .eq("organization_id", session.organization.id);
  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("permission") || msg.includes("policy") || msg.includes("denied")) {
      return { ok: false, error: "unauthorized" };
    }
    return { ok: false, error: "delete_failed" };
  }
  return { ok: true };
}

export async function deleteOrderRequest(id: string): Promise<DeleteResult> {
  const session = await getCurrentAppSession();
  if (!session || !hasOrganizationContext(session)) {
    return { ok: false, error: "unauthorized" };
  }
  if (!isValidUuid(id)) {
    return { ok: false, error: "not_found" };
  }
  const supabase = await getSupabaseServerClient();
  const { data: existing } = await supabase
    .from("order_requests")
    .select("id, reported_by_user_id, status")
    .eq("id", id)
    .eq("organization_id", session.organization.id)
    .maybeSingle();
  if (!existing) {
    return { ok: false, error: "not_found" };
  }
  const row = existing as { reported_by_user_id: string; status: string };
  if (!canDelete(session.user.role, row.reported_by_user_id, session.user.id)) {
    return { ok: false, error: "unauthorized" };
  }
  // 상태 제약(docs/product/10-order-request-workflow.md → Status constraint):
  // 이미 외부에 발주가 나간 `ordered`/`received` 건은 관리 역할만 삭제할 수 있다 — 작성자 본인이라도 불가.
  if (
    (row.status === "ordered" || row.status === "received") &&
    !canDeleteAnyRequestRecord(session.user.role)
  ) {
    return { ok: false, error: "unauthorized" };
  }

  const { error } = await supabase
    .from("order_requests")
    .delete()
    .eq("id", id)
    .eq("organization_id", session.organization.id);
  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("permission") || msg.includes("policy") || msg.includes("denied")) {
      return { ok: false, error: "unauthorized" };
    }
    return { ok: false, error: "delete_failed" };
  }
  return { ok: true };
}
