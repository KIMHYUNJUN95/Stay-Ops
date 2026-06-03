import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";
import { createOrganization } from "@/app/admin/settings/actions";
import { AdminShell } from "@/components/shell/admin-shell";
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

  const { data } = await getSupabaseServiceClient()
    .from("organizations")
    .select("id, name, slug, status, created_at, updated_at")
    .order("created_at", { ascending: false });
  const organizations = (data ?? []) as OrganizationRow[];

  const created = firstParam(params.created) === "1";
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

          {(created || errorKey) && (
            <div className="mt-4 rounded-xl border border-border bg-background/70 px-3 py-2 text-sm font-semibold">
              {created
                ? settings.success.organizationCreated
                : settings.errors[errorKey ?? "save_failed"] ?? settings.errors.save_failed}
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

            {organizations.map((organization) => (
              <div
                className="rounded-xl border border-border bg-background/70 p-4"
                key={organization.id}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-black">{organization.name}</p>
                    <p className="mt-1 text-sm font-semibold text-muted-foreground">
                      {organization.slug}
                    </p>
                  </div>
                  <Badge>{statusLabels[organization.status] ?? organization.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AdminShell>
  );
}
