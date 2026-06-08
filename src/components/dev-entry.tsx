"use client";

import Link from "next/link";
import { ArrowRight, Building2, Smartphone, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useSession } from "@/components/providers/session-provider";
import { getDictionary } from "@/lib/i18n";

export function DevEntry() {
  const { canAccessAdmin, session } = useSession();
  const isSignedIn = Boolean(session);
  const dictionary = getDictionary(session?.user.preferredLanguage);
  // Local dev on PC: one-click seed login then /mobile (avoids /mobile → /admin redirect).
  const mobileHref =
    process.env.NODE_ENV === "development"
      ? "/api/dev/seed-login?as=admin&next=/mobile"
      : "/mobile";

  const entries = [
    {
      description: dictionary.devEntry.setupDescription,
      href: "/onboarding",
      icon: UserRound,
      label: dictionary.devEntry.setupTitle,
    },
    {
      description: dictionary.devEntry.mobileDescription,
      href: mobileHref,
      icon: Smartphone,
      label: dictionary.devEntry.mobileTitle,
    },
    {
      description: dictionary.devEntry.adminDescription,
      href: "/admin",
      icon: Building2,
      label: dictionary.devEntry.adminTitle,
    },
  ];

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <section className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col justify-center px-6 py-10">
        <div className="mb-8">
          <Badge>{dictionary.devEntry.eyebrow}</Badge>
          <h1 className="wordmark mt-4 text-5xl text-primary">
            Stay Ops
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-muted-foreground">
            {dictionary.devEntry.subtitle}
          </p>
        </div>

        <Card className="mb-4 p-5">
          <p className="text-sm font-semibold text-muted-foreground">
            {dictionary.devEntry.currentSession}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {session ? (
              <>
                <p className="text-xl font-black">{session.user.name}</p>
                <Badge>{dictionary.roles[session.user.role]}</Badge>
                <Badge>{session.organization.name}</Badge>
              </>
            ) : (
              <>
                <p className="text-xl font-black">
                  {dictionary.devEntry.notSignedIn}
                </p>
                <Badge>{dictionary.devEntry.supabaseRequired}</Badge>
              </>
            )}
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          {entries.map((entry) => {
            const Icon = entry.icon;
            const isDevSeedLink = entry.href.startsWith("/api/dev/seed-login");
            const disabled =
              entry.href !== "/onboarding" &&
              !isDevSeedLink &&
              (!isSignedIn || (entry.href === "/admin" && !canAccessAdmin));

            return (
              <Link
                aria-disabled={disabled}
                className="group rounded-3xl"
                href={disabled ? "/" : entry.href}
                key={entry.href}
              >
                <Card className="h-full p-5 transition-transform group-hover:-translate-y-0.5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <Icon className="size-6" aria-hidden="true" />
                    </div>
                    <ArrowRight className="size-5 text-muted-foreground" />
                  </div>
                  <h2 className="mt-5 text-2xl font-black">{entry.label}</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {entry.description}
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>

        {!isSignedIn && (
          <Link
            className="mt-5 inline-flex h-11 w-fit items-center justify-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground"
            href="/auth/login"
          >
            {dictionary.devEntry.signIn}
          </Link>
        )}
      </section>
    </main>
  );
}
