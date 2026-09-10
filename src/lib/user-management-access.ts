// User-management access — the gate for /admin/users and its server actions (2026-07-13 model rework,
// see docs/planning/01-decision-log.md). Access is DEVELOPER by default; a developer may delegate it
// per-member via `memberships.manage_users`. Delegates can use the screen but cannot re-delegate
// (the grant of `manage_users` itself is developer-only, enforced in the server action).

import type { Role } from "@/config/roles";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { hasPermissionOverride } from "@/lib/permission-overrides-server";

export function isDeveloper(role: Role): boolean {
  return role === "developer_super_admin";
}

/**
 * May the actor OPEN the user-management screen at all?
 *
 * 개발자이거나, `user.manage` 권한을 개인 부여받았거나, (레거시) `manage_users` 플래그를 가졌다.
 *
 * **권한 키를 함께 보는 이유:** 사이드바가 `user.manage` 로 메뉴를 걸러낸다. 페이지가 그 키를
 * 보지 않으면 「권한을 줬는데 메뉴가 안 뜬다」 또는 「메뉴는 없는데 URL 로는 들어가진다」가 된다 —
 * 판정이 두 벌이 되는 바로 그 실패다.
 *
 * **레거시 플래그는 남겨 뒀다.** 2026-09-10 기준 보유자 0명이지만, 지우는 것은 위임 UI 를 권한
 * 부여로 옮기는 작업(5단계)과 함께 해야 한다. 그때까지 플래그로 위임하면 페이지는 열리는데
 * 메뉴는 안 뜬다 — 새 위임은 권한 부여로 할 것.
 */
export async function actorCanOpenUserManagement(actorUserId: string, actorRole: Role): Promise<boolean> {
  if (isDeveloper(actorRole)) return true;
  const service = getSupabaseServiceClient();
  const { data } = await service
    .from("memberships")
    .select("id, organization_id")
    .eq("user_id", actorUserId)
    .eq("status", "active")
    .eq("manage_users", true)
    .limit(1)
    .maybeSingle();
  if (data) return true;

  const { data: orgs } = await service
    .from("memberships")
    .select("organization_id")
    .eq("user_id", actorUserId)
    .eq("status", "active");
  for (const row of (orgs ?? []) as { organization_id: string }[]) {
    if (await hasPermissionOverride(row.organization_id, actorUserId, "user.manage")) return true;
  }
  return false;
}

/**
 * May the actor manage users WITHIN a specific org?
 *
 * 개발자이거나, 그 조직에서 `user.manage` 를 부여받았거나, (레거시) `manage_users` 플래그를 가졌다.
 */
export async function actorCanManageUsersInOrg(
  actorUserId: string,
  actorRole: Role,
  organizationId: string,
): Promise<boolean> {
  if (isDeveloper(actorRole)) return true;
  const service = getSupabaseServiceClient();
  const { data } = await service
    .from("memberships")
    .select("id")
    .eq("user_id", actorUserId)
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .eq("manage_users", true)
    .maybeSingle();
  if (data) return true;
  return hasPermissionOverride(organizationId, actorUserId, "user.manage");
}
