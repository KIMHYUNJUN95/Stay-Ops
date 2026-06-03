"use client";

import Link from "next/link";
import { useSession } from "@/components/providers/session-provider";
import { getDictionary } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function ModeSwitcher() {
  const { canAccessAdmin, canSwitchMode, mode, session, setMode } =
    useSession();

  if (!canAccessAdmin || !canSwitchMode) {
    return null;
  }

  const targetMode = mode === "admin" ? "mobile" : "admin";
  const href = targetMode === "admin" ? "/admin" : "/mobile";
  const dictionary = getDictionary(session?.user.preferredLanguage);

  return (
    <Link
      className={cn(
        "inline-flex h-9 items-center justify-center rounded-xl border border-border bg-surface/80 px-3 text-xs font-semibold text-foreground shadow-sm backdrop-blur-xl transition-colors hover:bg-surface",
      )}
      href={href}
      onClick={() => setMode(targetMode)}
    >
      {targetMode === "admin"
        ? dictionary.switcher.admin
        : dictionary.switcher.field}
    </Link>
  );
}
