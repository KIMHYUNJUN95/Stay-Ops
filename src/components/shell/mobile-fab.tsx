"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

/**
 * MobileFab — the single canonical bottom-right floating action button for mobile
 * list screens (create / compose entry point). Shared so every feature's FAB is
 * visually identical.
 *
 *   - portals to <body> so the mobile shell's pull-to-refresh transform can't drag it
 *   - fixed bottom-right, sits above the bottom tab bar, respects the safe-area inset
 *   - 56px navy circle, Plus glyph, soft navy shadow, press-scale feedback
 *
 * Pass `href` to navigate, or `onClick` for custom behavior. `label` is the aria-label.
 */
export function MobileFab({
  href,
  onClick,
  label,
  icon,
}: {
  href?: string;
  onClick?: () => void;
  label: string;
  /** Optional glyph override (defaults to a plus). */
  icon?: React.ReactNode;
}) {
  const router = useRouter();
  // Client-only: render after hydration so the portal target (document.body) exists
  // and server/client markup match. useSyncExternalStore avoids set-state-in-effect.
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  if (!hydrated) return null;

  return createPortal(
    <button
      type="button"
      aria-label={label}
      className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] right-4 z-30 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_16px_30px_-10px_hsl(var(--primary-hsl)/0.5)] transition-transform active:scale-[0.93]"
      onClick={() => {
        if (onClick) onClick();
        else if (href) router.push(href);
      }}
    >
      {icon ?? <Plus className="size-6" strokeWidth={2.2} aria-hidden="true" />}
    </button>,
    document.body,
  );
}
