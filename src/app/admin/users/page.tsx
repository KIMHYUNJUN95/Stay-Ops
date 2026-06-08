import Link from "next/link";
import { RotateCcw, Search, Users } from "lucide-react";
import { AdminShell } from "@/components/shell/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { organizationRoles } from "@/config/roles";
import { updateMemberRole, updateMemberStatus } from "@/app/admin/users/actions";
import { requireAdminSession } from "@/lib/admin-session";
import { getDictionary } from "@/lib/i18n";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/types/database";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type MembershipRow = Database["public"]["Tables"]["memberships"]["Row"];
type OrganizationRow = Database["public"]["Tables"]["organizations"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type MembershipStatus = Database["public"]["Enums"]["membership_status"];

type DirectoryMember = {
  email: string;
  joinedAt: string | null;
  membershipId: string;
  organizationId: string;
  organizationName: string;
  phoneNumber: string;
  profileName: string;
  role: MembershipRow["role"];
  status: MembershipStatus;
  userId: string;
};

function formatDate(value: string | null, locale: string) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function getStatusLabel(
  status: MembershipStatus,
  dictionary: ReturnType<typeof getDictionary>,
) {
  const statusLabels = {
    active: dictionary.common.active,
    invited: dictionary.common.invited,
    removed: dictionary.common.removed,
    suspended: dictionary.common.suspended,
  } satisfies Record<MembershipStatus, string>;

  return statusLabels[status];
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminUsersPage({ searchParams }: PageProps) {
  const session = await requireAdminSession();
  const params = (await searchParams) ?? {};
  const dictionary = getDictionary(session.user.preferredLanguage);
  const service = getSupabaseServiceClient();
  const query = firstParam(params.q)?.trim() ?? "";
  const roleFilter = firstParam(params.role) ?? "";
  const statusFilter = firstParam(params.status) ?? "";
  const organizationFilter = firstParam(params.organization) ?? "";

  const { data: organizationData } = await service
    .from("organizations")
    .select("id, name, slug, status, created_at, updated_at")
    .order("created_at", { ascending: false });
  const organizations = (organizationData ?? []) as OrganizationRow[];
  const organizationNames = new Map(
    organizations.map((organization) => [organization.id, organization.name]),
  );

  const membershipQuery = service
    .from("memberships")
    .select(
      "id, organization_id, user_id, role, status, joined_at, created_at, updated_at",
    )
    .order("created_at", { ascending: false });

  const { data: membershipData } =
    session.organization.id === "platform"
      ? await membershipQuery
      : await membershipQuery.eq("organization_id", session.organization.id);
  const memberships = (membershipData ?? []) as MembershipRow[];
  const userIds = [...new Set(memberships.map((membership) => membership.user_id))];

  // Fetch profiles and emails in parallel.
  // For emails: listUsers() is paginated (default page = 50). We iterate all pages
  // so no member's email is silently missing regardless of org size.
  async function fetchAllEmails(ids: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (ids.length === 0) return map;
    const PAGE_SIZE = 50;
    let page = 1;
    while (true) {
      const { data } = await service.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
      for (const user of data.users ?? []) {
        if (ids.includes(user.id)) {
          map.set(user.id, user.email ?? "");
        }
      }
      if ((data.users ?? []).length < PAGE_SIZE) break;
      page += 1;
    }
    return map;
  }

  const [{ data: profileData }, emailMap] = await Promise.all([
    userIds.length > 0
      ? service
          .from("profiles")
          .select(
            "id, name, phone_number, preferred_language, age, profile_photo_url, created_at, updated_at",
          )
          .in("id", userIds)
      : Promise.resolve({ data: [] }),
    fetchAllEmails(userIds),
  ]);

  const profiles = (profileData ?? []) as ProfileRow[];
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));

  const members: DirectoryMember[] = memberships.map((membership) => {
    const profile = profileMap.get(membership.user_id);

    return {
      email: emailMap.get(membership.user_id) ?? "",
      joinedAt: membership.joined_at,
      membershipId: membership.id,
      organizationId: membership.organization_id,
      organizationName: organizationNames.get(membership.organization_id) ?? "",
      phoneNumber: profile?.phone_number ?? "",
      profileName: profile?.name ?? "",
      role: membership.role,
      status: membership.status,
      userId: membership.user_id,
    };
  });
  const filteredMembers = members.filter((member) => {
    const matchesQuery =
      query.length === 0 ||
      [member.profileName, member.email, member.phoneNumber]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase());
    const matchesRole = !roleFilter || member.role === roleFilter;
    const matchesStatus = !statusFilter || member.status === statusFilter;
    const matchesOrganization =
      !organizationFilter || member.organizationId === organizationFilter;

    return (
      matchesQuery &&
      matchesRole &&
      matchesStatus &&
      matchesOrganization
    );
  });
  const hasFilters = Boolean(query || roleFilter || statusFilter || organizationFilter);
  const roleUpdated = firstParam(params.roleUpdated) === "1";
  const statusUpdated = firstParam(params.statusUpdated) === "1";
  const errorKey = firstParam(params.error);

  return (
    <AdminShell activeItem="users" title={dictionary.admin.users.title}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="max-w-2xl text-sm font-semibold leading-6 text-muted-foreground">
            {dictionary.admin.users.description}
          </p>
          <p className="mt-2 text-sm font-semibold text-muted-foreground">
            {dictionary.admin.users.currentOrganization}: {session.organization.name}
          </p>
        </div>
        <Badge>{filteredMembers.length}</Badge>
      </div>

      {(roleUpdated || statusUpdated || errorKey) && (
        <div className="mt-5 rounded-xl border border-border bg-surface/70 px-4 py-3 text-sm font-semibold">
          {roleUpdated && dictionary.admin.users.success.roleUpdated}
          {statusUpdated && dictionary.admin.users.success.statusUpdated}
          {errorKey &&
            (dictionary.admin.users.errors[errorKey] ??
              dictionary.admin.users.errors.save_failed)}
        </div>
      )}

      <Card className="mt-6 p-5">
        <form className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_220px_220px_220px_96px]">
          <Input
            defaultValue={query}
            name="q"
            placeholder={dictionary.admin.searchPlaceholder}
            type="search"
          />
          <select
            className="h-11 rounded-xl border border-border bg-surface/80 px-3 text-sm font-semibold text-foreground outline-none"
            defaultValue={roleFilter}
            name="role"
          >
            <option value="">{dictionary.admin.users.role}</option>
            {organizationRoles.map((role) => (
              <option key={role} value={role}>
                {dictionary.roles[role]}
              </option>
            ))}
          </select>
          <select
            className="h-11 rounded-xl border border-border bg-surface/80 px-3 text-sm font-semibold text-foreground outline-none"
            defaultValue={statusFilter}
            name="status"
          >
            <option value="">{dictionary.admin.users.status}</option>
            {(["active", "invited", "removed", "suspended"] as const).map((status) => (
              <option key={status} value={status}>
                {getStatusLabel(status, dictionary)}
              </option>
            ))}
          </select>
          {session.organization.id === "platform" ? (
            <select
              className="h-11 rounded-xl border border-border bg-surface/80 px-3 text-sm font-semibold text-foreground outline-none"
              defaultValue={organizationFilter}
              name="organization"
            >
              <option value="">{dictionary.admin.users.organization}</option>
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          ) : (
            <input name="organization" type="hidden" value="" />
          )}
          <Button className="gap-2" type="submit" variant="secondary">
            <Search className="size-4" aria-hidden="true" />
            <span className="sr-only">{dictionary.admin.searchPlaceholder}</span>
          </Button>
        </form>
        {hasFilters && (
          <div className="mt-3">
            <Link
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-surface/80 px-3 text-muted-foreground transition-colors hover:text-foreground"
              href="/admin/users"
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              <span className="sr-only">{dictionary.admin.searchPlaceholder}</span>
            </Link>
          </div>
        )}
      </Card>

      <Card className="mt-6 overflow-hidden">
        <div className="overflow-x-auto">
          <div className="grid min-w-[1240px] grid-cols-[1.2fr_1.3fr_1fr_1.1fr_0.9fr_0.9fr_1.8fr] border-b border-border bg-background/60 px-5 py-3 text-xs font-black uppercase text-muted-foreground">
            <span>{dictionary.admin.users.name}</span>
            <span>{dictionary.admin.users.email}</span>
            <span>{dictionary.admin.users.phone}</span>
            <span>{dictionary.admin.users.role}</span>
            <span>{dictionary.admin.users.status}</span>
            <span>{dictionary.admin.users.joinedAt}</span>
            <span>{dictionary.admin.users.actions}</span>
          </div>

          {filteredMembers.length === 0 && (
            <div className="flex min-h-64 min-w-[1240px] flex-col items-center justify-center gap-3 px-5 py-12 text-center">
              <Users className="size-8 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-semibold text-muted-foreground">
                {dictionary.admin.users.empty}
              </p>
            </div>
          )}

          {filteredMembers.map((member) => (
            <div
              className="grid min-w-[1240px] grid-cols-[1.2fr_1.3fr_1fr_1.1fr_0.9fr_0.9fr_1.8fr] items-center gap-3 border-b border-border px-5 py-4 text-sm last:border-b-0"
              key={member.membershipId}
            >
              <div>
                <Link
                  className="font-black hover:text-primary hover:underline underline-offset-2"
                  href={`/admin/users/${member.membershipId}`}
                >
                  {member.profileName}
                </Link>
                {session.organization.id === "platform" && (
                  <p className="mt-1 text-xs font-semibold text-muted-foreground">
                    {member.organizationName}
                  </p>
                )}
              </div>
              <p className="font-semibold text-muted-foreground">{member.email}</p>
              <p className="font-semibold text-muted-foreground">
                {member.phoneNumber}
              </p>
              <p className="font-semibold">{dictionary.roles[member.role]}</p>
              <Badge>{getStatusLabel(member.status, dictionary)}</Badge>
              <p className="font-semibold text-muted-foreground">
                {formatDate(member.joinedAt, session.user.preferredLanguage)}
              </p>
              <div className="grid gap-2">
                <form action={updateMemberRole} className="flex gap-2">
                  <input
                    name="membershipId"
                    type="hidden"
                    value={member.membershipId}
                  />
                  <select
                    className="h-10 min-w-36 rounded-xl border border-border bg-surface/80 px-3 text-xs font-semibold text-foreground outline-none"
                    defaultValue={member.role}
                    name="role"
                  >
                    {organizationRoles.map((role) => (
                      <option key={role} value={role}>
                        {dictionary.roles[role]}
                      </option>
                    ))}
                  </select>
                  <Button className="h-10 px-3 text-xs" type="submit" variant="secondary">
                    {dictionary.admin.users.saveRole}
                  </Button>
                </form>
                <form action={updateMemberStatus} className="flex gap-2">
                  <input
                    name="membershipId"
                    type="hidden"
                    value={member.membershipId}
                  />
                  <select
                    className="h-10 min-w-36 rounded-xl border border-border bg-surface/80 px-3 text-xs font-semibold text-foreground outline-none"
                    defaultValue={member.status}
                    name="status"
                  >
                    {(["active", "invited", "removed", "suspended"] as const).map(
                      (status) => (
                        <option key={status} value={status}>
                          {getStatusLabel(status, dictionary)}
                        </option>
                      ),
                    )}
                  </select>
                  <Button className="h-10 px-3 text-xs" type="submit" variant="secondary">
                    {dictionary.admin.users.saveStatus}
                  </Button>
                </form>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </AdminShell>
  );
}
