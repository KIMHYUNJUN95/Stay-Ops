import Link from "next/link";
import { Building2, Ticket } from "lucide-react";
import { AdminShell } from "@/components/shell/admin-shell";
import { Card } from "@/components/ui/card";
import { getDictionary } from "@/lib/i18n";
import { requireAdminSession } from "@/lib/admin-session";

export default async function AdminSettingsPage() {
  const session = await requireAdminSession();
  const dictionary = getDictionary(session.user.preferredLanguage);
  const settings = dictionary.admin.settings;

  const cards = [
    {
      description: settings.organizationDescription,
      href: "/admin/settings/organization",
      icon: Building2,
      title: settings.organizationTitle,
    },
    {
      description: settings.inviteCodesDescription,
      href: "/admin/settings/invite-codes",
      icon: Ticket,
      title: settings.inviteCodesTitle,
    },
  ];

  return (
    <AdminShell activeItem="settings" title={settings.settingsTitle}>
      <p className="max-w-2xl text-sm font-semibold text-muted-foreground">
        {settings.settingsDescription}
      </p>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {cards.map((item) => {
          const Icon = item.icon;

          return (
            <Link href={item.href} key={item.href}>
              <Card className="h-full p-5 transition-colors hover:bg-surface">
                <Icon className="size-6 text-primary" aria-hidden="true" />
                <h2 className="mt-8 text-xl font-black">{item.title}</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-muted-foreground">
                  {item.description}
                </p>
              </Card>
            </Link>
          );
        })}
      </div>
    </AdminShell>
  );
}
