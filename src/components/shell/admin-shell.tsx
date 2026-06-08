"use client";

import Link from "next/link";
import { Bell, Search, UserCircle } from "lucide-react";
import { ModeSwitcher } from "@/components/mode-switcher";
import { useSession } from "@/components/providers/session-provider";
import { adminNavigation, getNavigationLabel } from "@/config/navigation";
import { Input } from "@/components/ui/input";
import { getDictionary } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type AdminShellProps = {
  activeItem?: (typeof adminNavigation)[number]["id"];
  children: React.ReactNode;
  title: string;
};

export function AdminShell({
  activeItem,
  children,
  title,
}: AdminShellProps) {
  const { session } = useSession();
  if (!session) {
    return null;
  }

  const role = session.user.role;
  const locale = session.user.preferredLanguage;
  const dictionary = getDictionary(locale);

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="grid min-h-dvh grid-cols-[280px_1fr]">
        <aside className="sticky top-0 flex h-dvh flex-col border-r border-border bg-surface/72 px-5 py-5 backdrop-blur-xl">
          <Link className="flex items-center gap-3" href="/admin">
            <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-glass">
              <span className="text-lg font-black">S</span>
            </div>
            <div>
              <p className="wordmark text-2xl text-primary">
                Stay Ops
              </p>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {session.organization.name}
              </p>
            </div>
          </Link>

          <nav className="mt-10 space-y-1">
            {adminNavigation.map((item) => {
              const Icon = item.icon;
              const isActive = item.id === activeItem;

              return (
                <Link
                  className={cn(
                    "flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-muted-foreground transition-colors",
                    isActive && "bg-primary/10 text-primary",
                  )}
                  href={item.href}
                  key={item.id}
                >
                  <Icon className="size-5" aria-hidden="true" />
                  {getNavigationLabel(item, locale)}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto rounded-2xl border border-border bg-background/70 p-3">
            <p className="font-semibold">{session.user.name}</p>
            <p className="text-sm text-muted-foreground">
              {dictionary.roles[role]}
            </p>
          </div>
        </aside>

        <section className="min-w-0">
          <header className="sticky top-0 z-20 border-b border-border bg-background/86 px-8 py-4 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-5">
              <h1 className="text-2xl font-black tracking-normal">{title}</h1>
              <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
                <div className="relative w-full max-w-md">
                  <Search
                    className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    className="pl-9"
                    placeholder={dictionary.admin.searchPlaceholder}
                    type="search"
                  />
                </div>
                <Link
                  className="flex size-11 items-center justify-center rounded-xl border border-border bg-surface/80 text-muted-foreground shadow-sm"
                  href="/notifications"
                >
                  <Bell className="size-5" aria-hidden="true" />
                  <span className="sr-only">
                    {dictionary.common.notifications}
                  </span>
                </Link>
                <ModeSwitcher />
                <Link
                  className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary"
                  href="/account?mode=admin"
                >
                  <UserCircle className="size-6" aria-hidden="true" />
                  <span className="sr-only">{dictionary.common.account}</span>
                </Link>
              </div>
            </div>
          </header>

          <div className="p-8">{children}</div>
        </section>
      </div>
    </main>
  );
}
