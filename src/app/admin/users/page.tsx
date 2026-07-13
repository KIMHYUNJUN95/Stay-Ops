import { redirect } from "next/navigation";
import { AdminShell } from "@/components/shell/admin-shell";
import {
  UsersDirectoryClient,
  type DirectoryMemberVM,
} from "@/components/admin/users/users-directory-client";
import { UsersSectionTabs } from "@/components/admin/users/users-section-tabs";
import { requireAdminSession } from "@/lib/admin-session";
import { actorCanOpenUserManagement } from "@/lib/user-management-access";
import { getDictionary } from "@/lib/i18n";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/types/database";

type MembershipRow = Database["public"]["Tables"]["memberships"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export default async function AdminUsersPage() {
  const session = await requireAdminSession();
  // User management is developer-only by default; a developer may delegate via `manage_users`.
  if (!(await actorCanOpenUserManagement(session.user.id, session.user.role))) {
    redirect("/admin");
  }
  const dictionary = getDictionary(session.user.preferredLanguage);
  const service = getSupabaseServiceClient();

  const membershipQuery = service
    .from("memberships")
    .select("id, organization_id, user_id, role, status, joined_at, created_at, updated_at")
    .order("created_at", { ascending: false });

  const { data: membershipData } =
    session.organization.id === "platform"
      ? await membershipQuery
      : await membershipQuery.eq("organization_id", session.organization.id);
  const memberships = (membershipData ?? []) as MembershipRow[];
  const userIds = [...new Set(memberships.map((membership) => membership.user_id))];

  // Emails come from auth.admin.listUsers (paginated — iterate all pages so no email is missing).
  async function fetchAllEmails(ids: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (ids.length === 0) return map;
    const PAGE_SIZE = 50;
    let page = 1;
    while (true) {
      const { data } = await service.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
      for (const user of data.users ?? []) {
        if (ids.includes(user.id)) map.set(user.id, user.email ?? "");
      }
      if ((data.users ?? []).length < PAGE_SIZE) break;
      page += 1;
    }
    return map;
  }

  const [{ data: profileData }, emailMap] = await Promise.all([
    userIds.length > 0
      ? service.from("profiles").select("id, name, phone_number").in("id", userIds)
      : Promise.resolve({ data: [] }),
    fetchAllEmails(userIds),
  ]);
  const profileMap = new Map(
    ((profileData ?? []) as Pick<ProfileRow, "id" | "name" | "phone_number">[]).map((profile) => [
      profile.id,
      profile,
    ]),
  );

  // Platform developers are shown as "개발자" regardless of their org role.
  const { data: paData } =
    userIds.length > 0
      ? await service.from("platform_admins").select("user_id").in("user_id", userIds).eq("is_active", true)
      : { data: [] as { user_id: string }[] };
  const devIds = new Set(((paData ?? []) as { user_id: string }[]).map((row) => row.user_id));

  const members: DirectoryMemberVM[] = memberships.map((membership) => {
    const profile = profileMap.get(membership.user_id);
    return {
      membershipId: membership.id,
      userId: membership.user_id,
      name: profile?.name ?? "",
      email: emailMap.get(membership.user_id) ?? "",
      phone: profile?.phone_number ?? "",
      role: membership.role,
      status: membership.status,
      joinedAt: membership.joined_at,
      isSelf: membership.user_id === session.user.id,
      isDeveloper: devIds.has(membership.user_id),
    };
  });

  const tabs = dictionary.admin.users.console;

  return (
    <AdminShell activeItem="users" title={dictionary.admin.users.title}>
      <UsersSectionTabs
        active="members"
        labels={{ members: tabs.tabMembers, invites: tabs.tabInvites }}
      />
      <UsersDirectoryClient
        members={members}
        orgName={session.organization.name}
        locale={session.user.preferredLanguage}
      />
    </AdminShell>
  );
}
