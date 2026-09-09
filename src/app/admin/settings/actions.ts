"use server";

import { redirect } from "next/navigation";
import type { OrganizationRole, Role } from "@/config/roles";
import { officeAdminAssignableRoles } from "@/config/roles";
import { getDictionary, isLocale, type Locale } from "@/lib/i18n";
import {
  DEFAULT_INVITE_MAX_USES,
  buildInviteName,
  defaultInviteExpiry,
  generateInviteCode,
} from "@/lib/invite-code-gen";
import { isYmd, tokyoToday } from "@/lib/tokyo-date";
import { actorCanManageUsersInOrg } from "@/lib/user-management-access";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/types/database";

// Owner and cs_staff are deliberately excluded from self-service invite-code creation (2026-07-09):
// owner needs a separate single-use flow not built yet, and cs_staff has no invite category at all
// (admin-assigned only, src/config/roles.ts). office_admin/field_manager were added here to close a
// gap — src/config/roles.ts already defined their invite categories, but this UI never exposed them.
const inviteDefaultRoles = [
  "staff",
  "part_time_staff",
  "office_admin",
  "field_manager",
] as const satisfies readonly OrganizationRole[];

type OrganizationRow = Database["public"]["Tables"]["organizations"]["Row"];
type MembershipInsert = Database["public"]["Tables"]["memberships"]["Insert"];
type InviteInsert = Database["public"]["Tables"]["invite_codes"]["Insert"];

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeInviteCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "-");
}

function dateToExpiry(value: string) {
  return new Date(`${value}T23:59:59.000Z`).toISOString();
}

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

/** 자동 생성되는 초대코드 이름을 만든 사람의 표시 언어로 쓰기 위한 조회. */
async function getActorLocale(userId: string): Promise<Locale> {
  const { data } = await getSupabaseServiceClient()
    .from("profiles")
    .select("preferred_language")
    .eq("id", userId)
    .maybeSingle();

  const preferred = (data as { preferred_language: string } | null)?.preferred_language;
  return isLocale(preferred) ? preferred : "ko";
}

// Invite-code management is gated the same way as /admin/users: developer, or the org-scoped
// `manage_users` delegate flag (see src/lib/user-management-access.ts). This also fixes a prior bug
// where senior_managing_director (전무) was locked out by a hardcoded owner/office_admin role check.
async function canManageInvites(userId: string, organizationId: string, role: Role) {
  return actorCanManageUsersInOrg(userId, role, organizationId);
}

export async function createOrganization(formData: FormData) {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/auth/login?next=/admin/settings/organization");
  }

  const role = await getCurrentRole(userId);
  if (role !== "developer_super_admin") {
    redirect("/admin/settings/organization?error=forbidden");
  }

  const name = String(formData.get("name") ?? "").trim();
  const rawSlug = String(formData.get("slug") ?? "");
  const slug = normalizeSlug(rawSlug || name);
  const addOwner = formData.get("addOwner") === "on";

  if (!name || !slug) {
    redirect("/admin/settings/organization?error=invalid_organization");
  }

  const service = getSupabaseServiceClient();
  const { data, error } = await service
    .from("organizations")
    .insert({ name, slug })
    .select("id, name, slug, status, created_at, updated_at")
    .single();

  if (error || !data) {
    redirect("/admin/settings/organization?error=save_failed");
  }

  const organization = data as OrganizationRow;

  if (addOwner) {
    const membership: MembershipInsert = {
      organization_id: organization.id,
      user_id: userId,
      role: "owner",
      status: "active",
      joined_at: new Date().toISOString(),
    };

    const { error: membershipError } = await service
      .from("memberships")
      .upsert(membership, { onConflict: "organization_id,user_id" });

    if (membershipError) {
      redirect("/admin/settings/organization?error=save_failed");
    }
  }

  redirect("/admin/settings/organization?created=1");
}

export async function updateOrganization(formData: FormData) {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/auth/login?next=/admin/settings/organization");
  }

  const role = await getCurrentRole(userId);
  if (role !== "developer_super_admin") {
    redirect("/admin/settings/organization?error=forbidden");
  }

  const organizationId = String(formData.get("organizationId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!organizationId || !name) {
    redirect("/admin/settings/organization?error=invalid_organization");
  }

  // Name only — slug is left fixed because it can be referenced by links/caches (see org settings UI).
  const { error } = await getSupabaseServiceClient()
    .from("organizations")
    .update({ name })
    .eq("id", organizationId);

  if (error) {
    redirect("/admin/settings/organization?error=save_failed");
  }

  redirect("/admin/settings/organization?updated=1");
}

export async function deleteOrganization(formData: FormData) {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/auth/login?next=/admin/settings/organization");
  }

  const role = await getCurrentRole(userId);
  if (role !== "developer_super_admin") {
    redirect("/admin/settings/organization?error=forbidden");
  }

  const organizationId = String(formData.get("organizationId") ?? "");
  if (!organizationId) {
    redirect("/admin/settings/organization?error=invalid_organization");
  }

  const service = getSupabaseServiceClient();

  // Guard: only an EMPTY org (zero members) may be deleted. Every org-scoped table FKs
  // organization_id with ON DELETE CASCADE, so deleting a populated org would silently wipe all of
  // its data (members, attendance, cleaning, reservations, …). Block that here.
  const { count, error: countError } = await service
    .from("memberships")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);

  if (countError) {
    redirect("/admin/settings/organization?error=save_failed");
  }
  if ((count ?? 0) > 0) {
    redirect("/admin/settings/organization?error=org_not_empty");
  }

  const { error } = await service
    .from("organizations")
    .delete()
    .eq("id", organizationId);

  if (error) {
    redirect("/admin/settings/organization?error=save_failed");
  }

  redirect("/admin/settings/organization?deleted=1");
}

export async function createInviteCode(formData: FormData) {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/auth/login?next=/admin/users/invites");
  }

  const role = await getCurrentRole(userId);
  if (!role) {
    redirect("/admin/users/invites?error=forbidden");
  }

  const organizationId = String(formData.get("organizationId") ?? "");
  const defaultRole = String(formData.get("defaultRole") ?? "") as OrganizationRole;
  // 이름 / 코드 / 만료일 / 최대 사용 횟수는 폼에서 비워 보낼 수 있다. 비면 여기서 자동으로 채운다
  // (2026-09-09) — 폼은 조직과 역할만 고르게 바뀌었고, "세부 설정"을 펼쳤을 때만 이 값들이 온다.
  const rawCode = String(formData.get("code") ?? "").trim();
  const rawName = String(formData.get("name") ?? "").trim();
  const rawExpiresAt = String(formData.get("expiresAt") ?? "").trim();
  const rawMaxUses = String(formData.get("maxUses") ?? "").trim();

  if (
    !organizationId ||
    !(inviteDefaultRoles as readonly OrganizationRole[]).includes(defaultRole)
  ) {
    redirect("/admin/users/invites?error=invalid_invite");
  }

  if (!(await canManageInvites(userId, organizationId, role))) {
    redirect("/admin/users/invites?error=forbidden");
  }

  // office_admin may not hand out office_admin-or-above access via invite code — mirrors the same
  // tiering already enforced for manual role changes (canAssignRole, src/app/admin/users/actions.ts).
  // Without this, an office_admin could self-service-promote anyone to office_admin by creating an
  // office_admin-default invite code, bypassing a restriction that manual role assignment enforces.
  const canGrantDefaultRole =
    role === "developer_super_admin" ||
    role === "owner" ||
    role === "senior_managing_director" ||
    (officeAdminAssignableRoles as readonly OrganizationRole[]).includes(defaultRole);
  if (!canGrantDefaultRole) {
    redirect("/admin/users/invites?error=invalid_invite");
  }

  const service = getSupabaseServiceClient();

  // 코드 앞자리(HARU-…)와 자동 이름의 역할 라벨을 만들려면 조직과 작성자 언어가 필요하다.
  const { data: organizationResult } = await service
    .from("organizations")
    .select("name, slug")
    .eq("id", organizationId)
    .maybeSingle();
  const organization = organizationResult as Pick<
    OrganizationRow,
    "name" | "slug"
  > | null;

  if (!organization) {
    redirect("/admin/users/invites?error=invalid_invite");
  }

  const today = tokyoToday();
  const expiresAt = isYmd(rawExpiresAt) ? rawExpiresAt : defaultInviteExpiry(today);
  const parsedMaxUses = Number(rawMaxUses);
  const maxUses =
    Number.isInteger(parsedMaxUses) && parsedMaxUses >= 1
      ? parsedMaxUses
      : DEFAULT_INVITE_MAX_USES;

  const dictionary = getDictionary(await getActorLocale(userId));
  const name =
    rawName ||
    buildInviteName(
      dictionary.admin.settings.inviteAutoName,
      dictionary.roles[defaultRole],
      today,
    );

  const codeSource = organization.slug || organization.name;
  const isAutoCode = !rawCode;

  // `invite_codes.code` 는 전역 unique 다. 자동 생성 코드가 부딪히면 조용히 다시 뽑고, 사용자가
  // 직접 넣은 코드가 부딪히면 그 사실을 알려준다 — 말없이 다른 코드로 바꿔치기하면 안 된다.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = isAutoCode
      ? generateInviteCode(codeSource)
      : normalizeInviteCode(rawCode);

    const invite: InviteInsert = {
      code,
      created_by_user_id: userId,
      default_role: defaultRole,
      expires_at: dateToExpiry(expiresAt),
      max_uses: maxUses,
      name,
      organization_id: organizationId,
    };

    const { error } = await service.from("invite_codes").insert(invite);

    if (!error) {
      redirect("/admin/users/invites?created=1");
    }

    if (error.code === "23505") {
      if (isAutoCode) continue;
      redirect("/admin/users/invites?error=duplicate_code");
    }

    redirect("/admin/users/invites?error=save_failed");
  }

  redirect("/admin/users/invites?error=save_failed");
}

export async function deactivateInviteCode(formData: FormData) {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/auth/login?next=/admin/users/invites");
  }

  const role = await getCurrentRole(userId);
  const inviteCodeId = String(formData.get("inviteCodeId") ?? "");
  const organizationId = String(formData.get("organizationId") ?? "");

  if (!role || !inviteCodeId || !organizationId) {
    redirect("/admin/users/invites?error=forbidden");
  }

  if (!(await canManageInvites(userId, organizationId, role))) {
    redirect("/admin/users/invites?error=forbidden");
  }

  const { error } = await getSupabaseServiceClient()
    .from("invite_codes")
    .update({ is_active: false })
    .eq("id", inviteCodeId)
    // Org-scope the write like activate/delete do — canManageInvites only proves the caller may
    // manage THIS org's invites, not that the given code belongs to it, so without this an invite
    // manager could deactivate another org's code by id.
    .eq("organization_id", organizationId);

  if (error) {
    redirect("/admin/users/invites?error=save_failed");
  }

  redirect("/admin/users/invites?deactivated=1");
}

export async function activateInviteCode(formData: FormData) {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/auth/login?next=/admin/users/invites");
  }

  const role = await getCurrentRole(userId);
  const inviteCodeId = String(formData.get("inviteCodeId") ?? "");
  const organizationId = String(formData.get("organizationId") ?? "");

  if (!role || !inviteCodeId || !organizationId) {
    redirect("/admin/users/invites?error=forbidden");
  }

  if (!(await canManageInvites(userId, organizationId, role))) {
    redirect("/admin/users/invites?error=forbidden");
  }

  const { error } = await getSupabaseServiceClient()
    .from("invite_codes")
    .update({ is_active: true })
    .eq("id", inviteCodeId)
    .eq("organization_id", organizationId);

  if (error) {
    redirect("/admin/users/invites?error=save_failed");
  }

  redirect("/admin/users/invites?activated=1");
}

export async function deleteInviteCode(formData: FormData) {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/auth/login?next=/admin/users/invites");
  }

  const role = await getCurrentRole(userId);
  const inviteCodeId = String(formData.get("inviteCodeId") ?? "");
  const organizationId = String(formData.get("organizationId") ?? "");

  if (!role || !inviteCodeId || !organizationId) {
    redirect("/admin/users/invites?error=forbidden");
  }

  if (!(await canManageInvites(userId, organizationId, role))) {
    redirect("/admin/users/invites?error=forbidden");
  }

  // Hard delete (MVP deletion policy). Org-scoped so a code can only be deleted from within its own
  // organization. Members who already joined with this code keep their memberships — only the code
  // record is removed.
  const { error } = await getSupabaseServiceClient()
    .from("invite_codes")
    .delete()
    .eq("id", inviteCodeId)
    .eq("organization_id", organizationId);

  if (error) {
    redirect("/admin/users/invites?error=save_failed");
  }

  redirect("/admin/users/invites?deleted=1");
}
