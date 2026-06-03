"use server";

import { redirect } from "next/navigation";
import type { OrganizationRole, Role } from "@/config/roles";
import { organizationRoles } from "@/config/roles";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/types/database";

type MembershipRow = Database["public"]["Tables"]["memberships"]["Row"];
type MembershipStatus = Database["public"]["Enums"]["membership_status"];

const memberManagerRoles = [
  "developer_super_admin",
  "owner",
  "office_admin",
] as const satisfies readonly Role[];
const membershipStatuses = [
  "active",
  "invited",
  "removed",
  "suspended",
] as const satisfies readonly MembershipStatus[];
const officeAdminAssignableRoles = [
  "cs_staff",
  "field_manager",
  "staff",
  "part_time_staff",
] as const satisfies readonly OrganizationRole[];

async function getCurrentUserId() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.id ?? null;
}

async function getCurrentRole(userId: string): Promise<Role | null> {
  const service = getSupabaseServiceClient();

  const { data: platformAdminResult } = await service
    .from("platform_admins")
    .select("role")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  const platformAdmin = platformAdminResult as { role: Role } | null;

  if (platformAdmin) {
    return platformAdmin.role;
  }

  const { data: membershipResult } = await service
    .from("memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  const membership = membershipResult as { role: Role } | null;

  return membership?.role ?? null;
}

async function getMembership(membershipId: string) {
  const { data } = await getSupabaseServiceClient()
    .from("memberships")
    .select("id, organization_id, user_id, role, status, joined_at, created_at, updated_at")
    .eq("id", membershipId)
    .maybeSingle();

  return data as MembershipRow | null;
}

async function canManageMembership(
  actorUserId: string,
  actorRole: Role,
  membership: MembershipRow,
) {
  if (!(memberManagerRoles as readonly Role[]).includes(actorRole)) {
    return false;
  }

  if (actorRole === "developer_super_admin") {
    return true;
  }

  const { data } = await getSupabaseServiceClient()
    .from("memberships")
    .select("id")
    .eq("user_id", actorUserId)
    .eq("organization_id", membership.organization_id)
    .eq("status", "active")
    .in("role", ["owner", "office_admin"])
    .maybeSingle();

  return Boolean(data);
}

function canAssignRole(actorRole: Role, nextRole: OrganizationRole) {
  if (actorRole === "developer_super_admin" || actorRole === "owner") {
    return true;
  }

  return (officeAdminAssignableRoles as readonly OrganizationRole[]).includes(nextRole);
}

/**
 * Resolves the redirect target after a membership update.
 * If the form includes `redirectTo=detail` and a valid membershipId, redirects to
 * the detail page so the user stays in context. Otherwise falls back to the list.
 */
function resolveRedirect(formData: FormData, membershipId: string, query: string): never {
  if (formData.get("redirectTo") === "detail" && membershipId) {
    redirect(`/admin/users/${membershipId}?${query}`);
  }
  redirect(`/admin/users?${query}`);
}

export async function updateMemberRole(formData: FormData) {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/auth/login?next=/admin/users");
  }

  const actorRole = await getCurrentRole(userId);
  const membershipId = String(formData.get("membershipId") ?? "");
  const nextRole = String(formData.get("role") ?? "") as OrganizationRole;

  if (
    !actorRole ||
    !membershipId ||
    !(organizationRoles as readonly OrganizationRole[]).includes(nextRole)
  ) {
    resolveRedirect(formData, membershipId, "error=invalid_member");
  }

  const membership = await getMembership(membershipId);
  if (!membership) {
    resolveRedirect(formData, membershipId, "error=invalid_member");
  }

  if (membership.user_id === userId) {
    resolveRedirect(formData, membershipId, "error=self_update_blocked");
  }

  if (
    !(await canManageMembership(userId, actorRole, membership)) ||
    !canAssignRole(actorRole, nextRole)
  ) {
    resolveRedirect(formData, membershipId, "error=forbidden");
  }

  const { error } = await getSupabaseServiceClient()
    .from("memberships")
    .update({ role: nextRole } as never)
    .eq("id", membershipId);

  if (error) {
    resolveRedirect(formData, membershipId, "error=save_failed");
  }

  resolveRedirect(formData, membershipId, "roleUpdated=1");
}

export async function updateMemberStatus(formData: FormData) {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/auth/login?next=/admin/users");
  }

  const actorRole = await getCurrentRole(userId);
  const membershipId = String(formData.get("membershipId") ?? "");
  const nextStatus = String(formData.get("status") ?? "") as MembershipStatus;

  if (
    !actorRole ||
    !membershipId ||
    !(membershipStatuses as readonly MembershipStatus[]).includes(nextStatus)
  ) {
    resolveRedirect(formData, membershipId, "error=invalid_member");
  }

  const membership = await getMembership(membershipId);
  if (!membership) {
    resolveRedirect(formData, membershipId, "error=invalid_member");
  }

  if (membership.user_id === userId) {
    resolveRedirect(formData, membershipId, "error=self_update_blocked");
  }

  if (!(await canManageMembership(userId, actorRole, membership))) {
    resolveRedirect(formData, membershipId, "error=forbidden");
  }

  const { error } = await getSupabaseServiceClient()
    .from("memberships")
    .update({ status: nextStatus } as never)
    .eq("id", membershipId);

  if (error) {
    resolveRedirect(formData, membershipId, "error=save_failed");
  }

  resolveRedirect(formData, membershipId, "statusUpdated=1");
}
