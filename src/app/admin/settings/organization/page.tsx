import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";
import {
  createOrganization,
  updateOrganization,
} from "@/app/admin/settings/actions";
import { AdminShell } from "@/components/shell/admin-shell";
import { OrgDeleteButton } from "@/components/admin/settings/org-delete-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getDictionary } from "@/lib/i18n";
import { requireAdminSession } from "@/lib/admin-session";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/types/database";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type OrganizationRow = Database["public"]["Tables"]["organizations"]["Row"];
type OrganizationStatus = Database["public"]["Enums"]["organization_status"];

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminOrganizationSettingsPage({
  searchParams,
}: PageProps) {
  const session = await requireAdminSession();
  if (session.user.role !== "developer_super_admin") {
    redirect("/admin/settings?error=forbidden");
  }

  const params = (await searchParams) ?? {};
  const dictionary = getDictionary(session.user.preferredLanguage);
  const settings = dictionary.admin.settings;
  const statusLabels = settings.organizationStatusLabels as Record<OrganizationStatus, string>;

  const service = getSupabaseServiceClient();
  const [{ data }, { data: memberRows }] = await Promise.all([
    service
      .from("organizations")
      .select("id, name, slug, status, created_at, updated_at")
      .order("created_at", { ascending: false }),
    service.from("memberships").select("organization_id"),
  ]);
  const organizations = (data ?? []) as OrganizationRow[];

  const memberCounts = new Map<string, number>();
  for (const row of (memberRows ?? []) as { organization_id: string }[]) {
    memberCounts.set(
      row.organization_id,
      (memberCounts.get(row.organization_id) ?? 0) + 1,
    );
  }

  const created = firstParam(params.created) === "1";
  const updated = firstParam(params.updated) === "1";
  const deleted = firstParam(params.deleted) === "1";
  const errorKey = firstParam(params.error);

  return (
    <AdminShell activeItem="settings" title={settings.organizationTitle}>
      <Link
        className="text-sm font-semibold text-muted-foreground hover:text-foreground"
        href="/admin/settings"
      >
        {settings.backToSettings}
      </Link>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,520px)_1fr]">
        <Card className="p-5">
          <Building2 className="size-6 text-primary" aria-hidden="true" />
          <h2 className="mt-8 text-xl font-black">{settings.createOrganization}</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-muted-foreground">
            {settings.organizationDescription}
          </p>

          {(created || updated || deleted || errorKey) && (
            <div className="mt-4 rounded-xl border border-border bg-background/70 px-3 py-2 text-sm font-semibold">
              {created
                ? settings.success.organizationCreated
                : updated
                  ? settings.success.organizationUpdated
                  : deleted
                    ? settings.success.organizationDeleted
                    : settings.errors[errorKey ?? "save_failed"] ??
                      settings.errors.save_failed}
            </div>
          )}

          <form action={createOrganization} className="mt-5 space-y-3">
            <Input name="name" placeholder={settings.organizationName} required />
            <Input name="slug" placeholder={settings.organizationSlug} />
            <label className="flex items-center gap-3 rounded-xl border border-border bg-background/70 px-3 py-3 text-sm font-semibold">
              <input
                className="size-4 accent-primary"
                defaultChecked
                name="addOwner"
                type="checkbox"
              />
              {settings.ownerMembership}
            </label>
            <Button className="w-full" type="submit">
              {settings.create}
            </Button>
          </form>
        </Card>

        <Card className="p-5">
          <h2 className="text-xl font-black">{settings.currentOrganizations}</h2>
          <div className="mt-4 space-y-3">
            {organizations.length === 0 && (
              <p className="text-sm font-semibold text-muted-foreground">
                {settings.emptyOrganizations}
              </p>
            )}

            {organizations.map((organization) => {
              const memberCount = memberCounts.get(organization.id) ?? 0;
              return (
                <div
                  className="rounded-xl border border-border bg-background/70 p-4"
                  key={organization.id}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-black">{organization.name}</p>
                      <p className="mt-1 text-sm font-semibold text-muted-foreground">
                        {organization.slug} · {settings.membersLabel} {memberCount}
                      </p>
                    </div>
                    <Badge>{statusLabels[organization.status] ?? organization.status}</Badge>
                  </div>

                  <form
                    action={updateOrganization}
                    className="mt-3 flex flex-wrap items-center gap-2"
                  >
                    <input name="organizationId" type="hidden" value={organization.id} />
                    <Input
                      className="h-9 min-w-[180px] flex-1"
                      defaultValue={organization.name}
                      name="name"
                      required
                    />
                    <Button className="h-9 px-3 text-sm" type="submit" variant="secondary">
                      {settings.saveName}
                    </Button>
                  </form>

                  <div className="mt-3">
                    {memberCount === 0 ? (
                      <OrgDeleteButton
                        organizationId={organization.id}
                        labels={{
                          delete: settings.deleteOrganization,
                          cancel: dictionary.common.cancel,
                          confirm: settings.orgDeleteConfirm,
                        }}
                      />
                    ) : (
                      <p className="text-xs font-semibold text-muted-foreground">
                        {settings.errors.org_not_empty}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </AdminShell>
  );
}
