"use server";

import { revalidatePath } from "next/cache";
import type { OrganizationRole, Role } from "@/config/roles";
import { isOrgTopAdmin, officeAdminAssignableRoles, organizationRoles } from "@/config/roles";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { setLeaveApprover } from "@/lib/annual-leave-admin-server";
import {
  grantMemberOverride,
  revokeMemberOverride,
  type MemberOverride,
} from "@/lib/permission-overrides-server";
import { actorCanManageUsersInOrg, isDeveloper } from "@/lib/user-management-access";
import type { Database } from "@/types/database";

type MembershipRow = Database["public"]["Tables"]["memberships"]["Row"];
type MembershipStatus = Database["public"]["Enums"]["membership_status"];

type ActionResult = { ok: boolean; error?: string };

const membershipStatuses = ["active", "invited", "removed", "suspended"] as const satisfies readonly MembershipStatus[];

async function getCurrentUserId(): Promise<string | null> {
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
  if (platformAdmin) return platformAdmin.role;

  const { data: membershipResult } = await service
    .from("memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  return (membershipResult as { role: Role } | null)?.role ?? null;
}

type TargetMembership = Pick<MembershipRow, "id" | "organization_id" | "user_id" | "role" | "status">;

async function getMembership(membershipId: string): Promise<TargetMembership | null> {
  const { data } = await getSupabaseServiceClient()
    .from("memberships")
    .select("id, organization_id, user_id, role, status")
    .eq("id", membershipId)
    .maybeSingle();
  return (data as TargetMembership | null) ?? null;
}

/** Top org admin (owner/전무, of the target org) or platform admin. Gates payroll / approver / overrides. */
async function canManagePermissions(actorUserId: string, actorRole: Role, membership: TargetMembership) {
  if (actorRole === "developer_super_admin") return true;
  if (!isOrgTopAdmin(actorRole)) return false;
  const { data } = await getSupabaseServiceClient()
    .from("memberships")
    .select("id")
    .eq("user_id", actorUserId)
    .eq("organization_id", membership.organization_id)
    .eq("status", "active")
    .in("role", ["owner", "senior_managing_director"])
    .maybeSingle();
  return Boolean(data);
}

function canAssignRole(actorRole: Role, nextRole: OrganizationRole) {
  if (actorRole === "developer_super_admin" || isOrgTopAdmin(actorRole)) return true;
  return (officeAdminAssignableRoles as readonly OrganizationRole[]).includes(nextRole);
}

const LIST_PATH = "/admin/users";

/** Resolves the acting user + target membership + revalidates, shared by every action. */
async function resolveActor(membershipId: string) {
  const actorUserId = await getCurrentUserId();
  if (!actorUserId) return { error: "unauthenticated" as const };
  const actorRole = await getCurrentRole(actorUserId);
  if (!actorRole) return { error: "forbidden" as const };
  const membership = await getMembership(membershipId);
  if (!membership) return { error: "invalid_member" as const };
  return { actorUserId, actorRole, membership };
}

function revalidateMember(membershipId: string) {
  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${membershipId}`);
}

export async function setMemberRole(membershipId: string, role: string): Promise<ActionResult> {
  const ctx = await resolveActor(membershipId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  if (!(organizationRoles as readonly string[]).includes(role)) return { ok: false, error: "invalid_member" };
  if (ctx.membership.user_id === ctx.actorUserId) return { ok: false, error: "self_update_blocked" };
  if (
    !(await actorCanManageUsersInOrg(ctx.actorUserId, ctx.actorRole, ctx.membership.organization_id)) ||
    !canAssignRole(ctx.actorRole, role as OrganizationRole)
  ) {
    return { ok: false, error: "forbidden" };
  }
  const { error } = await getSupabaseServiceClient()
    .from("memberships")
    .update({ role: role as OrganizationRole } as never)
    .eq("id", membershipId);
  if (error) return { ok: false, error: "save_failed" };
  revalidateMember(membershipId);
  return { ok: true };
}

export async function setMemberStatus(membershipId: string, status: string): Promise<ActionResult> {
  const ctx = await resolveActor(membershipId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  if (!(membershipStatuses as readonly string[]).includes(status)) return { ok: false, error: "invalid_member" };
  if (ctx.membership.user_id === ctx.actorUserId) return { ok: false, error: "self_update_blocked" };
  if (!(await actorCanManageUsersInOrg(ctx.actorUserId, ctx.actorRole, ctx.membership.organization_id))) {
    return { ok: false, error: "forbidden" };
  }
  const service = getSupabaseServiceClient();
  const { error } = await service
    .from("memberships")
    .update({ status: status as MembershipStatus } as never)
    .eq("id", membershipId);
  if (error) return { ok: false, error: "save_failed" };

  // Full deactivation: block login at the auth layer too, not just org-context loss. Active → unban,
  // any inactive status → ban. Self-status is already blocked above, so an actor can't ban themselves.
  const { error: banError } = await service.auth.admin.updateUserById(ctx.membership.user_id, {
    ban_duration: status === "active" ? "none" : "876000h",
  });
  if (banError) return { ok: false, error: "save_failed" };

  revalidateMember(membershipId);
  return { ok: true };
}

/**
 * Assign a member to a team (현장/사무실 소속, or a sub-team). `teamId` null clears it (미지정). Same
 * gate as role/status (`manage_users`/top admin). The team must belong to the member's org. Takes a
 * team id (not just a kind) so it already supports sub-teams once team CRUD lands.
 */
export async function setMemberTeam(membershipId: string, teamId: string | null): Promise<ActionResult> {
  const ctx = await resolveActor(membershipId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  if (!(await actorCanManageUsersInOrg(ctx.actorUserId, ctx.actorRole, ctx.membership.organization_id))) {
    return { ok: false, error: "forbidden" };
  }

  const service = getSupabaseServiceClient();
  if (teamId) {
    const { data: team } = await service
      .from("teams")
      .select("id, organization_id")
      .eq("id", teamId)
      .maybeSingle();
    if (!team || (team as { organization_id: string }).organization_id !== ctx.membership.organization_id) {
      return { ok: false, error: "invalid_team" };
    }
  }

  const { error } = await service
    .from("memberships")
    .update({ team_id: teamId } as never)
    .eq("id", membershipId);
  if (error) return { ok: false, error: "save_failed" };
  revalidateMember(membershipId);
  return { ok: true };
}

export async function setMemberReportAccess(membershipId: string, grant: boolean): Promise<ActionResult> {
  const ctx = await resolveActor(membershipId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  if (!(await actorCanManageUsersInOrg(ctx.actorUserId, ctx.actorRole, ctx.membership.organization_id))) {
    return { ok: false, error: "forbidden" };
  }
  const { error } = await getSupabaseServiceClient()
    .from("profiles")
    .update({ can_generate_report: grant } as never)
    .eq("id", ctx.membership.user_id);
  if (error) return { ok: false, error: "save_failed" };
  revalidateMember(membershipId);
  return { ok: true };
}

export async function setMemberPayrollAdmin(membershipId: string, grant: boolean): Promise<ActionResult> {
  const ctx = await resolveActor(membershipId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  if (!(await canManagePermissions(ctx.actorUserId, ctx.actorRole, ctx.membership))) {
    return { ok: false, error: "forbidden" };
  }
  const { error } = await getSupabaseServiceClient()
    .from("memberships")
    .update({ attendance_payroll_admin: grant } as never)
    .eq("id", membershipId);
  if (error) return { ok: false, error: "save_failed" };
  revalidateMember(membershipId);
  return { ok: true };
}

export async function setMemberLeaveApprover(membershipId: string, grant: boolean): Promise<ActionResult> {
  const ctx = await resolveActor(membershipId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  if (!(await canManagePermissions(ctx.actorUserId, ctx.actorRole, ctx.membership))) {
    return { ok: false, error: "forbidden" };
  }
  const result = await setLeaveApprover({
    organizationId: ctx.membership.organization_id,
    actorUserId: ctx.actorUserId,
    userId: ctx.membership.user_id,
    isApprover: grant,
  });
  if (!result.ok) return { ok: false, error: result.error };
  revalidateMember(membershipId);
  return { ok: true };
}

export async function grantPermissionOverrideAction(input: {
  membershipId: string;
  permissionKey: string;
  expiresAt: string;
  reason: string;
}): Promise<{ ok: boolean; error?: string; override?: MemberOverride }> {
  const ctx = await resolveActor(input.membershipId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  if (!(await canManagePermissions(ctx.actorUserId, ctx.actorRole, ctx.membership))) {
    return { ok: false, error: "forbidden" };
  }
  if (ctx.membership.user_id === ctx.actorUserId) return { ok: false, error: "self_grant_blocked" };
  const result = await grantMemberOverride({
    organizationId: ctx.membership.organization_id,
    userId: ctx.membership.user_id,
    permissionKey: input.permissionKey,
    grantedByUserId: ctx.actorUserId,
    reason: input.reason,
    expiresAt: input.expiresAt,
  });
  if (!result.ok) return { ok: false, error: result.error };
  revalidateMember(input.membershipId);
  return { ok: true, override: result.override };
}

export async function revokePermissionOverrideAction(input: {
  membershipId: string;
  overrideId: string;
}): Promise<ActionResult> {
  const ctx = await resolveActor(input.membershipId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  if (!(await canManagePermissions(ctx.actorUserId, ctx.actorRole, ctx.membership))) {
    return { ok: false, error: "forbidden" };
  }
  const result = await revokeMemberOverride({
    overrideId: input.overrideId,
    organizationId: ctx.membership.organization_id,
    revokedByUserId: ctx.actorUserId,
  });
  if (!result.ok) return { ok: false, error: result.error };
  revalidateMember(input.membershipId);
  return { ok: true };
}

/**
 * Delegate/revoke `manage_users` (access to this screen). Developer-only — a delegate can USE the
 * screen but cannot re-delegate. See the 2026-07-13 decision log entry.
 */
export async function setMemberManageUsers(membershipId: string, grant: boolean): Promise<ActionResult> {
  const ctx = await resolveActor(membershipId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  if (!isDeveloper(ctx.actorRole)) return { ok: false, error: "forbidden" };
  const { error } = await getSupabaseServiceClient()
    .from("memberships")
    .update({ manage_users: grant } as never)
    .eq("id", membershipId);
  if (error) return { ok: false, error: "save_failed" };
  revalidateMember(membershipId);
  return { ok: true };
}

/**
 * Grant/revoke platform developer (`developer_super_admin`) status for a member's user. Developer-only
 * — the highest privilege, never exposed as an org-role dropdown option. Can't revoke your own
 * developer status (lockout guard). Writes `platform_admins`.
 */
export async function assignDeveloper(membershipId: string, grant: boolean): Promise<ActionResult> {
  const ctx = await resolveActor(membershipId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  if (!isDeveloper(ctx.actorRole)) return { ok: false, error: "forbidden" };
  if (!grant && ctx.membership.user_id === ctx.actorUserId) {
    return { ok: false, error: "cannot_remove_self" };
  }

  const service = getSupabaseServiceClient();
  const { data: existing } = await service
    .from("platform_admins")
    .select("id")
    .eq("user_id", ctx.membership.user_id)
    .maybeSingle();

  if (existing) {
    const { error } = await service
      .from("platform_admins")
      .update({ is_active: grant } as never)
      .eq("user_id", ctx.membership.user_id);
    if (error) return { ok: false, error: "save_failed" };
  } else if (grant) {
    const { error } = await service
      .from("platform_admins")
      .insert({ user_id: ctx.membership.user_id, role: "developer_super_admin", is_active: true } as never);
    if (error) return { ok: false, error: "save_failed" };
  }
  revalidateMember(membershipId);
  return { ok: true };
}

/**
 * Guarded hard delete of a member (2026-07-13 model rework). Deactivation is the default; hard delete
 * is only for erroneous / never-active accounts. BLOCKS deletion when the user has any operational or
 * financial history (attendance / cleaning / annual-leave) — deleting would cascade-destroy those
 * records. When allowed, removes memberships + profile + the auth login (full account removal).
 * Developer / manage_users gated; can't delete yourself.
 */
export async function deleteMember(membershipId: string): Promise<ActionResult> {
  const ctx = await resolveActor(membershipId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  if (!(await actorCanManageUsersInOrg(ctx.actorUserId, ctx.actorRole, ctx.membership.organization_id))) {
    return { ok: false, error: "forbidden" };
  }
  if (ctx.membership.user_id === ctx.actorUserId) return { ok: false, error: "cannot_delete_self" };

  const service = getSupabaseServiceClient();
  const userId = ctx.membership.user_id;

  // Activity guard (broad): any attendance / cleaning / leave history → block hard delete, keep the
  // records intact. Deactivate such members instead.
  const [att, clean, leave] = await Promise.all([
    service.from("attendance_sessions").select("id", { count: "exact", head: true }).eq("user_id", userId),
    service.from("cleaning_sessions").select("id", { count: "exact", head: true }).eq("staff_user_id", userId),
    service.from("annual_leave_requests").select("id", { count: "exact", head: true }).eq("user_id", userId),
  ]);
  if ((att.count ?? 0) > 0 || (clean.count ?? 0) > 0 || (leave.count ?? 0) > 0) {
    return { ok: false, error: "has_activity" };
  }

  // No history → safe to fully remove. Delete explicitly (memberships → profile) then the auth login,
  // so cleanup doesn't depend on a particular FK cascade config.
  await service.from("memberships").delete().eq("user_id", userId);
  await service.from("profiles").delete().eq("id", userId);
  const { error } = await service.auth.admin.deleteUser(userId);
  if (error) return { ok: false, error: "delete_failed" };

  revalidatePath(LIST_PATH);
  return { ok: true };
}
