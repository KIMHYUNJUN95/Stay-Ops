import { redirect } from "next/navigation";
import { hasPermissionOverride } from "@/lib/permission-overrides-server";
import { Ticket } from "lucide-react";
import {
  activateInviteCode,
  createInviteCode,
  deactivateInviteCode,
} from "@/app/admin/settings/actions";
import { InviteCopyButton } from "@/components/admin/users/invite-copy-button";
import { InviteDeleteButton } from "@/components/admin/users/invite-delete-button";
import { AdminShell } from "@/components/shell/admin-shell";
import { InviteCreateForm } from "@/components/admin/users/invite-create-form";
import { UsersSectionTabs } from "@/components/admin/users/users-section-tabs";
import "@/components/admin/users-console.css";
import type { OrganizationRole } from "@/config/roles";
import { officeAdminAssignableRoles } from "@/config/roles";
import { getDictionary } from "@/lib/i18n";
import {
  DEFAULT_INVITE_MAX_USES,
  defaultInviteExpiry,
  generateInviteCode,
} from "@/lib/invite-code-gen";
import { tokyoToday } from "@/lib/tokyo-date";
import { requireAdminSession } from "@/lib/admin-session";
import { actorCanOpenUserManagement } from "@/lib/user-management-access";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/types/database";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type OrganizationRow = Database["public"]["Tables"]["organizations"]["Row"];
type InviteCodeRow = Database["public"]["Tables"]["invite_codes"]["Row"];
type MembershipRow = Pick<
  Database["public"]["Tables"]["memberships"]["Row"],
  "organization_id"
>;

// Keep in sync with the identically-named allow-list in actions.ts (owner/cs_staff excluded — see
// comment there).
const inviteDefaultRoles = [
  "staff",
  "part_time_staff",
  "office_admin",
  "field_manager",
] as const satisfies readonly OrganizationRole[];

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

// Ported from the old settings/invite-codes page — the org list shown for picking an invite's
// organization. Kept as-is; the actual create/deactivate permission gate now lives in
// canManageInvites (actions.ts), which checks developer/manage_users independently of this list.
async function getManageableOrganizations(
  userId: string,
  role: string,
): Promise<OrganizationRow[]> {
  const service = getSupabaseServiceClient();

  if (role === "developer_super_admin") {
    const { data } = await service
      .from("organizations")
      .select("id, name, slug, status, created_at, updated_at")
      .order("created_at", { ascending: false });

    return (data ?? []) as OrganizationRow[];
  }

  // 초대를 만들 수 있는 조직 = `user.manage` 를 위임받은 조직(개발자는 위에서 처리되어 전부 본다).
  // 액션 게이트 `actorCanManageUsersInOrg` 와 같은 판정을 써야 조직 선택기·페이지 접근·서버 액션이
  // 서로 어긋나지 않는다. 2026-09-10 에 위임 수단이 `manage_users` 불리언에서 권한 키로 바뀌었다.
  const { data: membershipData } = await service
    .from("memberships")
    .select("organization_id")
    .eq("user_id", userId)
    .eq("status", "active");

  const memberships = (membershipData ?? []) as MembershipRow[];
  const organizationIds: string[] = [];
  for (const membership of memberships) {
    if (await hasPermissionOverride(membership.organization_id, userId, "user.manage")) {
      organizationIds.push(membership.organization_id);
    }
  }

  if (organizationIds.length === 0) {
    return [];
  }

  const { data } = await service
    .from("organizations")
    .select("id, name, slug, status, created_at, updated_at")
    .in("id", organizationIds)
    .order("created_at", { ascending: false });

  return (data ?? []) as OrganizationRow[];
}

export default async function AdminUsersInvitesPage({ searchParams }: PageProps) {
  const session = await requireAdminSession();
  // Same gate as /admin/users: developer, or an org holding delegated manage_users.
  if (!(await actorCanOpenUserManagement(session.user.id, session.user.role))) {
    redirect("/admin");
  }

  const params = (await searchParams) ?? {};
  const dictionary = getDictionary(session.user.preferredLanguage);
  const settings = dictionary.admin.settings;
  const tabs = dictionary.admin.users.console;

  // office_admin can't grant office_admin-or-above via invite code (matches canAssignRole's manual
  // role-change tiering) — hide the option instead of letting them pick it and get rejected server-side.
  const selectableDefaultRoles =
    session.user.role === "developer_super_admin" ||
    session.user.role === "owner" ||
    session.user.role === "senior_managing_director"
      ? inviteDefaultRoles
      : inviteDefaultRoles.filter((role) =>
          (officeAdminAssignableRoles as readonly OrganizationRole[]).includes(role),
        );

  const organizations = await getManageableOrganizations(
    session.user.id,
    session.user.role,
  );
  const organizationIds = organizations.map((organization) => organization.id);
  const organizationNames = new Map(
    organizations.map((organization) => [organization.id, organization.name]),
  );

  const inviteQuery = getSupabaseServiceClient()
    .from("invite_codes")
    .select(
      "id, code, name, organization_id, default_role, expires_at, max_uses, used_count, is_active, created_by_user_id, created_at, updated_at",
    )
    .order("created_at", { ascending: false });

  const { data: inviteData } =
    organizationIds.length > 0
      ? await inviteQuery.in("organization_id", organizationIds)
      : { data: [] };
  const inviteCodes = (inviteData ?? []) as InviteCodeRow[];

  // 초대코드의 첫 랜덤값은 서버가 정한다 — 클라이언트가 첫 렌더에서 새로 뽑으면 SSR 결과와
  // 어긋나 하이드레이션이 깨진다. 이후 재생성은 사용자가 조직을 바꾸거나 ↻ 를 누를 때만 일어난다.
  const today = tokyoToday();
  const defaultCode = generateInviteCode(
    organizations[0]?.slug || organizations[0]?.name || "",
  );

  const created = firstParam(params.created) === "1";
  const deactivated = firstParam(params.deactivated) === "1";
  const activated = firstParam(params.activated) === "1";
  const deleted = firstParam(params.deleted) === "1";
  const errorKey = firstParam(params.error);

  return (
    <AdminShell activeItem="users" title={settings.inviteCodesTitle}>
      <UsersSectionTabs
        active="invites"
        labels={{ members: tabs.tabMembers, invites: tabs.tabInvites }}
      />

      <div className="mt-2 grid gap-6 xl:grid-cols-[minmax(0,520px)_1fr]">
        <section className="ui-card p5">
          <Ticket className="size-6 text-primary" aria-hidden="true" />
          <h2 className="ctitle" style={{ marginTop: 18, fontSize: 18 }}>
            {settings.createInvite}
          </h2>
          <p className="chint" style={{ marginTop: 6 }}>
            {settings.inviteCodesDescription}
          </p>

          {(created || deactivated || activated || deleted || errorKey) && (
            <div className="ui-banner" style={{ marginTop: 16 }}>
              {created && settings.success.inviteCreated}
              {deactivated && settings.success.inviteDeactivated}
              {activated && settings.success.inviteActivated}
              {deleted && settings.success.inviteDeleted}
              {errorKey &&
                (settings.errors[errorKey] ?? settings.errors.save_failed)}
            </div>
          )}

          <InviteCreateForm
            action={createInviteCode}
            organizations={organizations.map((organization) => ({
              id: organization.id,
              name: organization.name,
              codeSource: organization.slug || organization.name,
            }))}
            roles={selectableDefaultRoles.map((role) => ({
              value: role,
              label: dictionary.roles[role],
            }))}
            today={today}
            defaultExpiresAt={defaultInviteExpiry(today)}
            defaultCode={defaultCode}
            defaultMaxUses={DEFAULT_INVITE_MAX_USES}
            localeTag={session.user.preferredLanguage}
            copy={{
              organization: settings.organization,
              role: settings.inviteRole,
              autoHint: settings.inviteAutoHint,
              advanced: settings.inviteAdvanced,
              regenerate: settings.inviteRegenerate,
              autoName: settings.inviteAutoName,
              nameLabel: settings.inviteCodeName,
              codeLabel: settings.inviteCode,
              expiresLabel: settings.expiresAt,
              maxUsesLabel: settings.maxUses,
              submit: settings.create,
              datePlaceholder: tabs.datePlaceholder,
              datePrev: tabs.datePrev,
              dateNext: tabs.dateNext,
              dateToday: tabs.dateToday,
            }}
          />
        </section>

        <section className="ui-card p5">
          <h3 className="ctitle" style={{ fontSize: 18 }}>
            {settings.inviteCodesTitle}
          </h3>
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            {inviteCodes.length === 0 && <p className="chint">{settings.emptyInvites}</p>}

            {inviteCodes.map((inviteCode) => (
              <div
                key={inviteCode.id}
                style={{
                  borderRadius: 14,
                  border: "1px solid var(--ui-border)",
                  padding: 16,
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                  <div>
                    <p style={{ fontWeight: 900, color: "var(--ui-fg)" }}>{inviteCode.code}</p>
                    <p className="chint" style={{ marginTop: 4 }}>
                      {inviteCode.name} /{" "}
                      {organizationNames.get(inviteCode.organization_id) ?? ""}
                    </p>
                    <p className="chint" style={{ marginTop: 4 }}>
                      {dictionary.roles[inviteCode.default_role]} /{" "}
                      {inviteCode.used_count}/{inviteCode.max_uses}
                    </p>
                  </div>
                  <span
                    className={`ui-badge ui-badge--${inviteCode.is_active ? "green" : "muted"}`}
                    style={{ flexShrink: 0 }}
                  >
                    {inviteCode.is_active
                      ? dictionary.common.active
                      : dictionary.common.inactive}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: 8,
                    marginTop: 12,
                  }}
                >
                  <InviteCopyButton
                    code={inviteCode.code}
                    labels={{
                      copy: settings.copyCode,
                      copied: settings.copiedCode,
                      failed: settings.copyFailed,
                    }}
                  />
                  <form action={inviteCode.is_active ? deactivateInviteCode : activateInviteCode}>
                    <input name="inviteCodeId" type="hidden" value={inviteCode.id} />
                    <input
                      name="organizationId"
                      type="hidden"
                      value={inviteCode.organization_id}
                    />
                    <button type="submit" className="ui-btn ui-btn--secondary ui-btn--sm">
                      {inviteCode.is_active ? settings.deactivate : settings.activate}
                    </button>
                  </form>
                  <InviteDeleteButton
                    inviteCodeId={inviteCode.id}
                    organizationId={inviteCode.organization_id}
                    labels={{
                      delete: tabs.deleteBtn,
                      cancel: tabs.cancel,
                      confirm: settings.inviteDeleteConfirm,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
