import { notFound, redirect } from "next/navigation";
import { AdminShell } from "@/components/shell/admin-shell";
import {
  UserDetailClient,
  type UserDetailVM,
} from "@/components/admin/users/user-detail-client";
import { requireAdminSession } from "@/lib/admin-session";
import { actorCanOpenUserManagement } from "@/lib/user-management-access";
import { isOrgTopAdmin } from "@/config/roles";
import { getDictionary } from "@/lib/i18n";
import { listMemberOverrides } from "@/lib/permission-overrides-server";
import { resolveCapabilities } from "@/lib/capabilities-server";
import { CAPABILITY_KEYS, capabilityPolicy, evaluateCapability } from "@/config/capabilities";
import { getOrgTeams } from "@/lib/teams";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/types/database";

type MembershipRow = Database["public"]["Tables"]["memberships"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminUserDetailPage({ params }: PageProps) {
  const [session, { id }] = await Promise.all([requireAdminSession(), params]);
  if (!(await actorCanOpenUserManagement(session.user.id, session.user.role))) {
    redirect("/admin");
  }
  const dictionary = getDictionary(session.user.preferredLanguage);
  const service = getSupabaseServiceClient();

  const { data: membershipData } = await service
    .from("memberships")
    .select(
      "id, organization_id, user_id, role, status, joined_at, attendance_payroll_admin, leave_approver_role, team_id",
    )
    .eq("id", id)
    .maybeSingle();
  if (!membershipData) notFound();
  const membership = membershipData as Pick<
    MembershipRow,
    | "id"
    | "organization_id"
    | "user_id"
    | "role"
    | "status"
    | "joined_at"
    | "attendance_payroll_admin"
    | "leave_approver_role"
    | "team_id"
  >;

  // Scope guard: non-super-admins may only view members of their own organization.
  const isSuperAdmin = session.user.role === "developer_super_admin";
  if (!isSuperAdmin && membership.organization_id !== session.organization.id) {
    notFound();
  }

  const [{ data: profileData }, authUserResult, { data: paData }] = await Promise.all([
    service
      .from("profiles")
      .select("id, name, phone_number, can_generate_report")
      .eq("id", membership.user_id)
      .maybeSingle(),
    service.auth.admin.getUserById(membership.user_id),
    service
      .from("platform_admins")
      .select("id")
      .eq("user_id", membership.user_id)
      .eq("is_active", true)
      .maybeSingle(),
  ]);
  const profile = profileData as Pick<
    ProfileRow,
    "id" | "name" | "phone_number" | "can_generate_report"
  > | null;
  const memberIsDeveloper = Boolean(paData);

  const canManagePermissions = isOrgTopAdmin(session.user.role) || isSuperAdmin;
  const isDeveloperViewer = isSuperAdmin;

  // Overrides only surface on the owner/developer-visible card, so only load them then.
  const overrides = canManagePermissions
    ? await listMemberOverrides(membership.organization_id, membership.user_id)
    : [];

  // 권한 카드는 세 가지를 함께 보여준다: 역할로 받은 것 · 개인 지정 · **최종 유효 권한**.
  // 부여와 차단이 겹치면 사람은 결과를 암산하지 못한다 — 화면이 판정식을 대신 계산해야 실수가 없다.
  //
  // 역할분은 개인 지정을 뺀 상태로 계산한다(그래야 「역할로 받은 것」이라는 말이 사실이 된다).
  // 최종분은 서버 리졸버가 실제 부여·차단을 읽어 계산한 것과 같은 값이다.
  const roleCapabilities = canManagePermissions
    ? CAPABILITY_KEYS.filter((capability) =>
        evaluateCapability({
          capability,
          role: membership.role,
          granted: false,
          denied: false,
        }),
      )
    : [];
  const effectiveCapabilities = canManagePermissions
    ? await resolveCapabilities({
        organizationId: membership.organization_id,
        userId: membership.user_id,
        role: membership.role,
      })
    : [];
  // 이 대상자에게 실제로 걸 수 있는 조작만 화면에 낸다(잠금 방지 규칙 포함).
  const assignable = CAPABILITY_KEYS.filter((key) => !capabilityPolicy(key).systemOnly).map(
    (key) => ({
      key,
      canGrant: capabilityPolicy(key).individualGrant,
      canDeny: capabilityPolicy(key).individualDeny,
      requiresExpiry: capabilityPolicy(key).requiresExpiry,
      developerOnly: capabilityPolicy(key).developerOnly,
    }),
  );

  const teams = await getOrgTeams(membership.organization_id);

  const member: UserDetailVM = {
    membershipId: membership.id,
    userId: membership.user_id,
    name: profile?.name ?? "",
    email: authUserResult.data.user?.email ?? "",
    phone: profile?.phone_number ?? "",
    role: membership.role,
    status: membership.status,
    joinedAt: membership.joined_at,
    isSelf: membership.user_id === session.user.id,
    reportAccess: profile?.can_generate_report ?? false,
    payrollAdmin: membership.attendance_payroll_admin ?? false,
    leaveApprover: membership.leave_approver_role != null,
    isDeveloper: memberIsDeveloper,
    teamId: membership.team_id ?? null,
  };

  return (
    <AdminShell activeItem="users" title={dictionary.admin.users.detailTitle}>
      <UserDetailClient
        member={member}
        locale={session.user.preferredLanguage}
        canManagePermissions={canManagePermissions}
        isDeveloperViewer={isDeveloperViewer}
        currentUserName={session.user.name ?? ""}
        initialOverrides={overrides}
        roleCapabilities={roleCapabilities}
        effectiveCapabilities={effectiveCapabilities}
        assignableCapabilities={assignable}
        teams={teams}
      />
    </AdminShell>
  );
}
