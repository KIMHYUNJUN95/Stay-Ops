// User-management access — the gate for /admin/users and its server actions (2026-07-13 model rework,
// see docs/planning/01-decision-log.md). Access is DEVELOPER by default; a developer may delegate it
// per-member via `memberships.manage_users`. Delegates can use the screen but cannot re-delegate
// (the grant of `manage_users` itself is developer-only, enforced in the server action).

import type { Role } from "@/config/roles";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

export function isDeveloper(role: Role): boolean {
  return role === "developer_super_admin";
}

/** May the actor OPEN the user-management screen at all? Developer, or holds `manage_users` anywhere. */
export async function actorCanOpenUserManagement(actorUserId: string, actorRole: Role): Promise<boolean> {
  if (isDeveloper(actorRole)) return true;
  const service = getSupabaseServiceClient();
  const { data } = await service
    .from("memberships")
    .select("id")
    .eq("user_id", actorUserId)
    .eq("status", "active")
    .eq("manage_users", true)
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

/** May the actor manage users WITHIN a specific org? Developer, or holds `manage_users` in that org. */
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
  return Boolean(data);
}
