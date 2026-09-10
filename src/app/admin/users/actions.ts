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
import type { CapabilityEffect } from "@/config/capabilities";
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
    .update({ role: role as OrganizationRole })
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
    .update({ status: status as MembershipStatus })
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
    .update({ team_id: teamId })
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
    .update({ can_generate_report: grant })
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
    .update({ attendance_payroll_admin: grant })
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
  /** 생략하면 부여. 차단은 명시해야 한다. */
  effect?: CapabilityEffect;
  /** 비우면 무기한 — 키가 기한을 요구하면 서버가 거부한다. */
  expiresAt?: string | null;
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
    effect: input.effect === "deny" ? "deny" : "grant",
    grantedByUserId: ctx.actorUserId,
    reason: input.reason,
    expiresAt: input.expiresAt ?? null,
    // 차단 면역 판정에 대상자의 역할이 필요하다(owner·전무는 잠글 수 없다).
    targetRole: ctx.membership.role as Role,
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
 * 이 화면에 대한 접근을 개인에게 위임/회수한다. 개발자 전용 — 위임받은 사람은 화면을 쓸 수는
 * 있어도 다시 위임하지는 못한다(2026-07-13 결정).
 *
 * **저장 위치가 바뀌었다(2026-09-10).** `memberships.manage_users` 불리언 → 권한 키 `user.manage`
 * 개인 부여. 불리언은 누가 언제 왜 줬는지가 남지 않았다 — 권한 부여는 부여자·사유·회수를 함께
 * 남기고, 사이드바·페이지 게이트가 같은 키를 본다.
 */
export async function setMemberManageUsers(membershipId: string, grant: boolean): Promise<ActionResult> {
  const ctx = await resolveActor(membershipId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  if (!isDeveloper(ctx.actorRole)) return { ok: false, error: "forbidden" };

  if (grant) {
    const result = await grantMemberOverride({
      organizationId: ctx.membership.organization_id,
      userId: ctx.membership.user_id,
      permissionKey: "user.manage",
      effect: "grant",
      grantedByUserId: ctx.actorUserId,
      // 이 경로는 사유 입력란이 없다(개발자 토글). 출처를 남겨 권한 카드에서 구분되게 한다.
      reason: "user management delegation",
      expiresAt: null,
      targetRole: ctx.membership.role as Role,
    });
    // 이미 위임돼 있으면 성공으로 본다 — 토글이 「켜짐」을 표현하는 것이 목적이다.
    if (!result.ok && result.error !== "already_assigned") {
      return { ok: false, error: result.error };
    }
  } else {
    const { error } = await getSupabaseServiceClient()
      .from("membership_permission_overrides")
      .update({ revoked_at: new Date().toISOString(), revoked_by_user_id: ctx.actorUserId })
      .eq("organization_id", ctx.membership.organization_id)
      .eq("user_id", ctx.membership.user_id)
      .eq("permission_key", "user.manage")
      .eq("effect", "grant")
      .is("revoked_at", null);
    if (error) return { ok: false, error: "save_failed" };
  }

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
      .update({ is_active: grant })
      .eq("user_id", ctx.membership.user_id);
    if (error) return { ok: false, error: "save_failed" };
  } else if (grant) {
    const { error } = await service
      .from("platform_admins")
      .insert({ user_id: ctx.membership.user_id, role: "developer_super_admin", is_active: true });
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
