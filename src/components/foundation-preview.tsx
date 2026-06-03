"use client";

import {
  Building2,
  CalendarDays,
  ClipboardList,
  Home,
  Megaphone,
  Sparkles,
  SprayCan,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { dictionaries, isLocale, locales, type Locale } from "@/lib/i18n";
import { isTheme, themes, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const languageStorageKey = "stayops.locale";
const themeStorageKey = "stayops.theme";

const navIcons = [Home, CalendarDays, SprayCan, ClipboardList, Megaphone];

function applyTheme(theme: Theme) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle(
    "dark",
    theme === "dark" || (theme === "system" && prefersDark),
  );
}

export function FoundationPreview() {
  const [locale, setLocale] = useState<Locale>(() => {
    if (typeof window === "undefined") {
      return "ko";
    }

    const storedLocale = window.localStorage.getItem(languageStorageKey);
    return storedLocale && isLocale(storedLocale) ? storedLocale : "ko";
  });
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") {
      return "system";
    }

    const storedTheme = window.localStorage.getItem(themeStorageKey);
    return storedTheme && isTheme(storedTheme) ? storedTheme : "system";
  });

  useEffect(() => {
    window.localStorage.setItem(languageStorageKey, locale);
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    window.localStorage.setItem(themeStorageKey, theme);
    applyTheme(theme);
  }, [theme]);

  const dictionary = dictionaries[locale];
  const navigationItems = useMemo(
    () => [
      dictionary.navigation.mobile.home,
      dictionary.navigation.mobile.calendar,
      dictionary.navigation.mobile.cleaning,
      dictionary.navigation.mobile.requests,
      dictionary.navigation.mobile.announcements,
    ],
    [dictionary],
  );

  const stats = [
    [dictionary.foundation.phase, dictionary.foundation.phaseValue],
    [dictionary.foundation.designSystem, dictionary.foundation.designSystemValue],
    [dictionary.foundation.pwa, dictionary.foundation.pwaValue],
    [dictionary.foundation.nextStep, dictionary.foundation.nextStepValue],
  ];

  return (
    <main className="min-h-dvh overflow-hidden bg-background text-foreground">
      <section className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-6 pt-8">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 bg-[radial-gradient(circle_at_50%_30%,hsl(var(--primary-hsl)/0.16),transparent_42%)]" />

        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-2xl border border-primary/15 bg-surface/80 shadow-glass backdrop-blur-xl">
              <Building2 className="size-6 text-primary" aria-hidden="true" />
            </div>
            <div>
              <p className="text-2xl font-black tracking-normal text-primary">
                {dictionary.app.name}
              </p>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                {dictionary.app.eyebrow}
              </p>
            </div>
          </div>
          <Badge>
            <Sparkles className="mr-1 size-3.5" aria-hidden="true" />
            v1
          </Badge>
        </header>

        <div className="mt-10 space-y-5">
          <Card className="p-5">
            <h1 className="text-3xl font-black leading-tight tracking-normal">
              {dictionary.app.title}
            </h1>
            <p className="mt-4 text-base leading-7 text-muted-foreground">
              {dictionary.app.subtitle}
            </p>
          </Card>

          <Card className="space-y-4 p-4">
            <ControlGroup label={dictionary.common.language}>
              {locales.map((option) => (
                <Button
                  className="flex-1"
                  key={option}
                  onClick={() => setLocale(option)}
                  variant={locale === option ? "primary" : "secondary"}
                >
                  {dictionary.languages[option]}
                </Button>
              ))}
            </ControlGroup>

            <ControlGroup label={dictionary.common.theme}>
              {themes.map((option) => (
                <Button
                  className="flex-1"
                  key={option}
                  onClick={() => setTheme(option)}
                  variant={theme === option ? "primary" : "secondary"}
                >
                  {dictionary.themes[option]}
                </Button>
              ))}
            </ControlGroup>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            {stats.map(([label, value]) => (
              <Card className="p-4" key={label}>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {label}
                </p>
                <p className="mt-2 text-lg font-bold text-foreground">{value}</p>
              </Card>
            ))}
          </div>
        </div>

        <nav className="mt-auto rounded-3xl border border-border bg-surface/90 px-2 py-3 shadow-glass backdrop-blur-xl">
          <ul className="grid grid-cols-5 gap-1">
            {navigationItems.map((item, index) => {
              const Icon = navIcons[index];

              return (
                <li key={item}>
                  <div
                    className={cn(
                      "flex h-14 flex-col items-center justify-center rounded-2xl text-[11px] font-semibold text-muted-foreground",
                      index === 0 && "bg-primary/10 text-primary",
                    )}
                  >
                    <Icon className="mb-1 size-5" aria-hidden="true" />
                    <span>{item}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </nav>
      </section>
    </main>
  );
}

function ControlGroup({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <div className="flex gap-2">{children}</div>
    </div>
  );
}
