// User-management access — the gate for /admin/users and its server actions.
//
// 접근은 **개발자가 기본**이고, 개인에게 위임할 수 있다(2026-07-13 모델). 위임 수단이
// 2026-09-10 에 바뀌었다: `memberships.manage_users` 불리언 → 권한 키 `user.manage` 개인 부여.
//
// 불리언은 감사 기록이 없었다 — 누가 언제 왜 줬는지 남지 않고, 회수 이력도 없다. 권한 카드는
// 부여자·사유·회수를 함께 남긴다. 이전 시점에 플래그 보유자가 0명이라 옮길 데이터가 없었다.
//
// 사이드바도 같은 키로 메뉴를 거른다 — 판정이 한 곳이라 「권한을 줬는데 메뉴가 안 뜬다」가
// 생기지 않는다. 설계: docs/engineering/14-permission-architecture.md

import type { Role } from "@/config/roles";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { hasPermissionOverride } from "@/lib/permission-overrides-server";

export function isDeveloper(role: Role): boolean {
  return role === "developer_super_admin";
}

/** May the actor OPEN the user-management screen at all? 개발자이거나 `user.manage` 를 부여받았다. */
export async function actorCanOpenUserManagement(actorUserId: string, actorRole: Role): Promise<boolean> {
  if (isDeveloper(actorRole)) return true;
  const service = getSupabaseServiceClient();
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

/** May the actor manage users WITHIN a specific org? 개발자이거나 그 조직에서 `user.manage` 를 받았다. */
export async function actorCanManageUsersInOrg(
  actorUserId: string,
  actorRole: Role,
  organizationId: string,
): Promise<boolean> {
  if (isDeveloper(actorRole)) return true;
  return hasPermissionOverride(organizationId, actorUserId, "user.manage");
}
