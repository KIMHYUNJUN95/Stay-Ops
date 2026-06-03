import Link from "next/link";
import { redirect } from "next/navigation";
import { Ticket } from "lucide-react";
import {
  createInviteCode,
  deactivateInviteCode,
} from "@/app/admin/settings/actions";
import { AdminShell } from "@/components/shell/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { OrganizationRole } from "@/config/roles";
import { getDictionary } from "@/lib/i18n";
import { requireAdminSession } from "@/lib/admin-session";
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

const inviteDefaultRoles = [
  "staff",
  "part_time_staff",
] as const satisfies readonly OrganizationRole[];

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

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

  const { data: membershipData } = await service
    .from("memberships")
    .select("organization_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .in("role", ["owner", "office_admin"]);

  const memberships = (membershipData ?? []) as MembershipRow[];
  const organizationIds = memberships.map((membership) => membership.organization_id);

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

export default async function AdminInviteCodesPage({ searchParams }: PageProps) {
  const session = await requireAdminSession();

  if (!["developer_super_admin", "owner", "office_admin"].includes(session.user.role)) {
    redirect("/admin/settings?error=forbidden");
  }

  const params = (await searchParams) ?? {};
  const dictionary = getDictionary(session.user.preferredLanguage);
  const settings = dictionary.admin.settings;
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

  const created = firstParam(params.created) === "1";
  const deactivated = firstParam(params.deactivated) === "1";
  const errorKey = firstParam(params.error);

  return (
    <AdminShell activeItem="settings" title={settings.inviteCodesTitle}>
      <Link
        className="text-sm font-semibold text-muted-foreground hover:text-foreground"
        href="/admin/settings"
      >
        {settings.backToSettings}
      </Link>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,520px)_1fr]">
        <Card className="p-5">
          <Ticket className="size-6 text-primary" aria-hidden="true" />
          <h2 className="mt-8 text-xl font-black">{settings.createInvite}</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-muted-foreground">
            {settings.inviteCodesDescription}
          </p>

          {(created || deactivated || errorKey) && (
            <div className="mt-4 rounded-xl border border-border bg-background/70 px-3 py-2 text-sm font-semibold">
              {created && settings.success.inviteCreated}
              {deactivated && settings.success.inviteDeactivated}
              {errorKey &&
                (settings.errors[errorKey] ?? settings.errors.save_failed)}
            </div>
          )}

          <form action={createInviteCode} className="mt-5 space-y-3">
            <select
              className="h-11 w-full rounded-xl border border-border bg-surface/80 px-3 text-sm font-semibold text-foreground shadow-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15"
              name="organizationId"
              required
            >
              <option value="">{settings.organization}</option>
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
            <Input name="name" placeholder={settings.inviteCodeName} required />
            <Input
              name="code"
              placeholder={settings.inviteCode}
              required
              spellCheck={false}
            />
            <select
              className="h-11 w-full rounded-xl border border-border bg-surface/80 px-3 text-sm font-semibold text-foreground shadow-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15"
              name="defaultRole"
              required
            >
              {inviteDefaultRoles.map((role) => (
                <option key={role} value={role}>
                  {dictionary.roles[role]}
                </option>
              ))}
            </select>
            <Input name="expiresAt" required type="date" />
            <Input
              min={1}
              name="maxUses"
              placeholder={settings.maxUses}
              required
              type="number"
            />
            <Button className="w-full" disabled={organizations.length === 0} type="submit">
              {settings.create}
            </Button>
          </form>
        </Card>

        <Card className="p-5">
          <h2 className="text-xl font-black">{settings.inviteCodesTitle}</h2>
          <div className="mt-4 space-y-3">
            {inviteCodes.length === 0 && (
              <p className="text-sm font-semibold text-muted-foreground">
                {settings.emptyInvites}
              </p>
            )}

            {inviteCodes.map((inviteCode) => (
              <div
                className="rounded-xl border border-border bg-background/70 p-4"
                key={inviteCode.id}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-black">{inviteCode.code}</p>
                    <p className="mt-1 text-sm font-semibold text-muted-foreground">
                      {inviteCode.name} /{" "}
                      {organizationNames.get(inviteCode.organization_id) ?? ""}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-muted-foreground">
                      {dictionary.roles[inviteCode.default_role]} /{" "}
                      {inviteCode.used_count}/{inviteCode.max_uses}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge>
                      {inviteCode.is_active
                        ? dictionary.common.active
                        : dictionary.common.inactive}
                    </Badge>
                    {inviteCode.is_active && (
                      <form action={deactivateInviteCode}>
                        <input
                          name="inviteCodeId"
                          type="hidden"
                          value={inviteCode.id}
                        />
                        <input
                          name="organizationId"
                          type="hidden"
                          value={inviteCode.organization_id}
                        />
                        <Button type="submit" variant="secondary">
                          {settings.deactivate}
                        </Button>
                      </form>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AdminShell>
  );
}
