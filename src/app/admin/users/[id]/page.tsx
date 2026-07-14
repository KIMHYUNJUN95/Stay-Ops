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
      "id, organization_id, user_id, role, status, joined_at, attendance_payroll_admin, leave_approver_role, manage_users, team_id",
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
    | "manage_users"
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
    manageUsers: membership.manage_users ?? false,
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
        teams={teams}
      />
    </AdminShell>
  );
}
