"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { ReactNode, UIEvent } from "react";
import { ArrowDown, ChevronRight, Loader2, LogOut, UserCircle, X } from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import { signOut } from "@/app/auth/actions";
import { updateBottomNavTabs } from "@/app/account/actions";
import {
  MAX_BOTTOM_NAV_TABS,
  customizableBottomNavItems,
  getNavigationLabel,
  mobileSidebarNavigation,
  resolveBottomNavItems,
} from "@/config/navigation";
import { getDictionary } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type MobileShellProps = {
  activeItem?: (typeof mobileSidebarNavigation)[number]["id"];
  appearance?: "default" | "announcement" | "cleaning";
  children: React.ReactNode;
  title: string;
  /** Operational unprocessed counts keyed by sidebar nav id (e.g. requests, notifications). */
  badges?: Partial<Record<string, number>>;
};

const PULL_THRESHOLD = 72;
const MAX_PULL = 120;
const MAX_DISPLAY_H = 60;
const REFRESH_DISPLAY_H = 52;

const EDIT_ICON = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M4 20l.8-3.6L15.4 5.8a2 2 0 0 1 2.8 2.8L7.6 19.2 4 20z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
    <path d="M13.6 7.6l2.8 2.8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
  </svg>
);

/**
 * "추가" launcher metadata, keyed by sidebar-navigation item id.
 * Each feature gets a distinct hue; the launcher grid is generated from
 * `mobileSidebarNavigation`, so adding a nav item automatically adds a tile.
 * Colours fix lightness/chroma and vary only hue → a unified palette.
 */
const LAUNCHER_META: Record<string, { hue: number; icon: ReactNode }> = {
  home: {
    hue: 185,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 11.5L12 5l8 6.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6 10.5V19h12v-8.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  calendar: {
    hue: 250,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="4" y="5.5" width="16" height="14" rx="3" stroke="currentColor" strokeWidth="1.9" />
        <path d="M4 9.5h16M8 4v3M16 4v3" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      </svg>
    ),
  },
  cleaning: {
    hue: 155,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 4l1.4 3.6L17 9l-3.6 1.4L12 14l-1.4-3.6L7 9l3.6-1.4L12 4z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M18 14l.7 1.8 1.8.7-1.8.7L18 19l-.7-1.8-1.8-.7 1.8-.7L18 14z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    ),
  },
  requests: {
    hue: 70,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="5.5" y="4.5" width="13" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.9" />
        <path d="M9 3.5h6v3H9z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
        <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  announcements: {
    hue: 30,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 10v4h3l6 4V6l-6 4H4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M17.5 9.2a3.6 3.6 0 010 5.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  notifications: {
    hue: 305,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M6 10a6 6 0 0112 0c0 5 2 6 2 6H4s2-1 2-6z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10 19.5a2 2 0 004 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  directory: {
    hue: 225,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="9" cy="8.5" r="3.1" stroke="currentColor" strokeWidth="1.8" />
        <path d="M3.6 19c.9-2.6 3-4 5.4-4s4.5 1.4 5.4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M16.3 6.3a2.8 2.8 0 010 5M18.2 18.8c-.3-1.3-.8-2.4-1.6-3.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
};

const FALLBACK_ICON = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="7.5" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);

/** Unified palette: fix L/C, vary only hue. */
const launcherTileBg = (hue: number) => `oklch(0.96 0.025 ${hue})`;
const launcherBadgeBg = (hue: number) => `oklch(0.92 0.055 ${hue})`;
const launcherIconFg = (hue: number) => `oklch(0.52 0.12 ${hue})`;

/** Rubber-band resistance: fast start, asymptotic ceiling at MAX_DISPLAY_H. */
function computeContentOffset(raw: number): number {
  if (raw <= 0) return 0;
  return MAX_DISPLAY_H * raw / (raw + MAX_PULL * 0.4);
}

export function MobileShell({
  activeItem,
  appearance = "default",
  children,
  title,
  badges = {},
}: MobileShellProps) {
  const lastScrollYRef = useRef(0);
  const hideAccumRef = useRef(0);
  const showAccumRef = useRef(0);
  const tickingRef = useRef(false);
  const [headerVisible, setHeaderVisible] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [pullDistanceState, setPullDistanceState] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [isRefreshPending, startRefreshTransition] = useTransition();
  const router = useRouter();
  const touchStartYRef = useRef(0);
  const touchStartXRef = useRef(0);
  const isPullingRef = useRef(false);
  const pullDistanceRef = useRef(0);
  // Swipe-to-navigate refs (separate from pull-to-refresh)
  const swipeNavStartXRef = useRef(0);
  const swipeNavStartYRef = useRef(0);
  const { session } = useSession();

  // Per-user bottom-bar tabs (customized via the center "추가" editor sheet).
  const initialNavIds = resolveBottomNavItems(session?.user.bottomNavTabs).map(
    (item) => item.id,
  );
  const [navTabIds, setNavTabIds] = useState<string[]>(initialNavIds);
  const savedNavRef = useRef<string[]>(initialNavIds);
  const sheetWasOpenRef = useRef(false);
  const [, startNavSave] = useTransition();

  function toggleNavTab(id: string) {
    setNavTabIds((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((x) => x !== id);
        return next.length > 0 ? next : prev; // keep at least one tab
      }
      if (prev.length >= MAX_BOTTOM_NAV_TABS) return prev; // bar is full
      return [...prev, id];
    });
  }

  const updateVisibility = useCallback((currentY: number) => {
    const delta = currentY - lastScrollYRef.current;

    if (currentY <= 8) {
      setHeaderVisible(true);
      hideAccumRef.current = 0;
      showAccumRef.current = 0;
    } else if (delta > 0) {
      hideAccumRef.current += delta;
      showAccumRef.current = 0;
      if (hideAccumRef.current > 28) {
        setHeaderVisible(false);
      }
    } else if (delta < -4) {
      showAccumRef.current += Math.abs(delta);
      hideAccumRef.current = 0;
      if (showAccumRef.current > 12) {
        setHeaderVisible(true);
      }
    } else {
      hideAccumRef.current = 0;
      showAccumRef.current = 0;
    }

    if (currentY <= 8) {
      setHeaderVisible(true);
    }

    lastScrollYRef.current = currentY;
    tickingRef.current = false;
  }, []);

  const requestVisibilityUpdate = useCallback(
    (currentY: number) => {
      if (tickingRef.current) return;
      tickingRef.current = true;
      window.requestAnimationFrame(() => updateVisibility(currentY));
    },
    [updateVisibility],
  );

  const handleContentScroll = (event: UIEvent<HTMLDivElement>) => {
    requestVisibilityUpdate(event.currentTarget.scrollTop);
  };

  function syncPullDistance(v: number) {
    pullDistanceRef.current = v;
    setPullDistanceState(v);
  }

  const contentOffset = isRefreshPending
    ? REFRESH_DISPLAY_H
    : computeContentOffset(pullDistanceState);
  const isReadyToRefresh = pullDistanceState >= PULL_THRESHOLD;

  function handleTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    if (sidebarOpen || isRefreshPending) return;
    if (e.currentTarget.scrollTop > 0) return;
    touchStartYRef.current = e.touches[0].clientY;
    touchStartXRef.current = e.touches[0].clientX;
    isPullingRef.current = false;
  }

  function handleTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    if (isRefreshPending || e.touches.length !== 1) return;
    if (e.currentTarget.scrollTop > 0) {
      if (isPullingRef.current) {
        isPullingRef.current = false;
        setIsPulling(false);
        syncPullDistance(0);
      }
      return;
    }
    const deltaY = e.touches[0].clientY - touchStartYRef.current;
    const deltaX = Math.abs(e.touches[0].clientX - touchStartXRef.current);
    if (deltaX > Math.abs(deltaY) || deltaY <= 0) {
      if (isPullingRef.current) {
        isPullingRef.current = false;
        setIsPulling(false);
        syncPullDistance(0);
      }
      return;
    }
    if (!isPullingRef.current) {
      isPullingRef.current = true;
      setIsPulling(true);
    }
    syncPullDistance(deltaY);
  }

  function handleTouchEnd() {
    if (!isPullingRef.current) return;
    const dist = pullDistanceRef.current;
    isPullingRef.current = false;
    setIsPulling(false);
    syncPullDistance(0);
    if (dist >= PULL_THRESHOLD) {
      startRefreshTransition(() => { router.refresh(); });
    }
  }

  // ── Swipe-to-navigate (on <main>) ────────────────────────────────────────
  // Left-edge swipe → browser back.  Right-edge swipe → browser forward.
  // Handled on the outermost <main> so it covers every mobile page without
  // needing to touch individual screens.
  function handleSwipeStart(e: React.TouchEvent<HTMLElement>) {
    if (sidebarOpen) return;
    const t = e.touches[0];
    swipeNavStartXRef.current = t.clientX;
    swipeNavStartYRef.current = t.clientY;
  }

  function handleSwipeEnd(e: React.TouchEvent<HTMLElement>) {
    if (sidebarOpen) return;
    const t = e.changedTouches[0];
    const startX = swipeNavStartXRef.current;
    const deltaX = t.clientX - startX;
    const deltaY = Math.abs(t.clientY - swipeNavStartYRef.current);
    const absX = Math.abs(deltaX);

    // Must be a clearly horizontal gesture — more horizontal than vertical
    if (absX < 55 || deltaY > absX * 0.75) return;

    const viewportWidth = window.innerWidth || 390;

    // Swipe right (←→) starting from left 28 px → go BACK
    if (deltaX > 0 && startX <= 28) {
      router.back();
      return;
    }

    // Swipe left (→←) starting from right 28 px → go FORWARD
    if (deltaX < 0 && startX >= viewportWidth - 28) {
      router.forward();
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    // This app uses h-dvh overflow-hidden layout: only the inner div scrolls,
    // not the window. Listening to window "scroll" or "resize" would pass
    // scrollY=0 every time, resetting headerVisible→true and undoing any
    // scroll-based hiding. Only the custom mobile-shell-scroll event (dispatched
    // by calendar view) and the onScroll handler on the content div are used.
    const onShellScroll = (event: Event) => {
      const detail = event as CustomEvent<{ scrollTop?: number }>;
      if (typeof detail.detail?.scrollTop !== "number") return;
      requestVisibilityUpdate(detail.detail.scrollTop);
    };

    lastScrollYRef.current = 0;
    window.addEventListener("mobile-shell-scroll", onShellScroll as EventListener);

    return () => {
      window.removeEventListener("mobile-shell-scroll", onShellScroll as EventListener);
    };
  }, [requestVisibilityUpdate]);

  useEffect(() => {
    if (!sidebarOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSidebarOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sidebarOpen]);

  useEffect(() => {
    if (!createOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCreateOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [createOpen]);

  // Persist bottom-bar edits when the sheet closes (any close path), if changed.
  useEffect(() => {
    if (createOpen) {
      sheetWasOpenRef.current = true;
      return;
    }
    if (!sheetWasOpenRef.current) return;
    sheetWasOpenRef.current = false;

    if (JSON.stringify(navTabIds) === JSON.stringify(savedNavRef.current)) {
      return;
    }
    const next = navTabIds;
    savedNavRef.current = next;
    startNavSave(async () => {
      const result = await updateBottomNavTabs(next);
      if (result.ok) {
        router.refresh();
      }
    });
  }, [createOpen, navTabIds, router, startNavSave]);

  if (!session) return null;

  void appearance;

  const locale = session.user.preferredLanguage;
  const dictionary = getDictionary(locale);

  // User-customized bottom tabs, split into left / right around the center FAB.
  const bottomItems = resolveBottomNavItems(navTabIds);
  const splitAt = Math.ceil(bottomItems.length / 2);
  const leftTabs = bottomItems.slice(0, splitAt);
  const rightTabs = bottomItems.slice(splitAt);
  const isBarFull = navTabIds.length >= MAX_BOTTOM_NAV_TABS;

  const renderTab = (item: (typeof bottomItems)[number]) => {
    const isActive = item.id === activeItem;
    return (
      <Link
        key={item.id}
        aria-current={isActive ? "page" : undefined}
        className={cn("tabbar__item", isActive && "is-active")}
        href={item.href}
      >
        <span className="ico">{LAUNCHER_META[item.id]?.icon ?? FALLBACK_ICON}</span>
        <span className="lbl">{getNavigationLabel(item, locale)}</span>
      </Link>
    );
  };

  return (
    <main
      aria-label={title}
      className="h-dvh overflow-hidden bg-background text-foreground"
      onTouchEnd={handleSwipeEnd}
      onTouchStart={handleSwipeStart}
    >
      <div className="relative mx-auto flex h-dvh w-full max-w-[430px] flex-col overflow-hidden">
        <aside
          aria-label={dictionary.common.menu}
          className={cn(
            "fixed inset-y-0 left-0 z-[60] flex w-[78%] max-w-[318px] flex-col overflow-hidden border-r border-border bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-5 pb-6 pt-5 text-foreground",
            sidebarOpen
              ? "shadow-[30px_0_82px_-46px_rgba(15,23,42,0.68)]"
              : "shadow-none",
          )}
          style={{
            transform: sidebarOpen ? "translate3d(0, 0, 0)" : "translate3d(-100%, 0, 0)",
            transition: "transform 540ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 540ms ease",
            willChange: "transform",
          }}
        >
          <div className="flex h-11 items-center justify-between">
            <span className="wordmark relative text-[21px] text-foreground">Stay Ops</span>
            <button
              aria-label={dictionary.common.menu}
              className="relative flex size-9 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground shadow-[0_12px_24px_-20px_rgba(15,23,42,0.38)] transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => setSidebarOpen(false)}
              type="button"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>

          <Link
            href="/account?mode=mobile"
            onClick={() => setSidebarOpen(false)}
            className="mt-[18px] flex items-center gap-3 rounded-[20px] border border-border bg-surface p-3.5 shadow-[0_16px_34px_-28px_rgba(15,23,42,0.5)] transition-shadow hover:shadow-[0_20px_40px_-26px_rgba(15,23,42,0.55)]"
          >
            <span className="flex size-[46px] shrink-0 items-center justify-center rounded-[14px] bg-primary/10 text-primary">
              <UserCircle className="size-6" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-bold tracking-[-0.01em] text-foreground">
                {session.user.name}
              </p>
              <div className="mt-0.5 flex items-center gap-1.5 whitespace-nowrap">
                <span className="text-[11.5px] font-semibold text-muted-foreground">
                  {dictionary.common.account}
                </span>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10.5px] font-bold text-primary">
                  {dictionary.roles[session.user.role]}
                </span>
              </div>
            </div>
            <ChevronRight className="size-[18px] shrink-0 text-border" aria-hidden="true" />
          </Link>

          <div className="relative mt-5 min-h-0 flex-1">
            <p className="mb-2 ml-3.5 text-[10.5px] font-bold uppercase tracking-[0.09em] text-muted-foreground">
              {dictionary.common.menu}
            </p>
            <nav className="flex flex-col gap-0.5">
              {mobileSidebarNavigation.map((item) => {
                const Icon = item.icon;
                const isActive = item.id === activeItem;
                const count = badges[item.id] ?? 0;

                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "group relative flex h-12 items-center gap-3 rounded-[14px] px-3 transition-colors",
                      isActive ? "bg-primary/[0.09]" : "hover:bg-muted/55",
                    )}
                  >
                    {isActive && (
                      <span
                        aria-hidden="true"
                        className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-primary"
                      />
                    )}
                    <Icon
                      aria-hidden="true"
                      className={cn(
                        "size-[22px] shrink-0 transition-colors",
                        isActive
                          ? "text-primary"
                          : "text-muted-foreground group-hover:text-foreground",
                      )}
                    />
                    <span
                      className={cn(
                        "flex-1 text-[14.5px] transition-colors",
                        isActive
                          ? "font-bold text-primary"
                          : "font-semibold text-foreground/80",
                      )}
                    >
                      {getNavigationLabel(item, locale)}
                    </span>
                    {count > 0 && (
                      <span
                        className={cn(
                          "flex h-[21px] min-w-[21px] items-center justify-center rounded-full px-1.5 font-mono text-[11px] font-semibold tabular-nums",
                          isActive
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {count > 99 ? "99+" : count}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="mt-3 flex items-center gap-3 rounded-[16px] border border-border bg-surface px-3.5 py-3">
            <Link
              href="/account?mode=mobile"
              onClick={() => setSidebarOpen(false)}
              className="flex flex-1 items-center gap-2.5 text-[13.5px] font-bold text-foreground"
            >
              <UserCircle className="size-5 text-muted-foreground" aria-hidden="true" />
              {dictionary.common.account}
            </Link>
            <form action={signOut}>
              <button
                type="submit"
                className="flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
              >
                <LogOut className="size-4" aria-hidden="true" />
                {dictionary.common.logout}
              </button>
            </form>
          </div>
        </aside>

        <div
          className="relative flex h-dvh w-full flex-col overflow-hidden bg-background"
        >
          <div
            className={cn(
              "overflow-hidden border-0 transition-[height,opacity] duration-300 ease-out",
              headerVisible ? "h-16 opacity-100" : "h-0 opacity-0",
            )}
          >
            <div
              className={cn(
                "relative h-16 bg-background px-4 pt-2 transition-transform duration-300 ease-out",
                headerVisible ? "translate-y-0" : "-translate-y-3",
              )}
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(255,255,255,0.82)_55%,rgba(255,255,255,0)_100%)]"
              />
              <div
                className={cn(
                  "relative flex h-12 w-full items-center justify-between px-2 transition-[transform,opacity] duration-300 ease-out",
                  headerVisible ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0",
                )}
              >
                <button
                  aria-label={dictionary.common.menu}
                  className="relative z-10 flex size-[38px] items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-[color-mix(in_oklab,var(--muted)_82%,var(--foreground))]"
                  onClick={() => setSidebarOpen(true)}
                  type="button"
                >
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M4 7h16M4 12h11M4 17h16"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>

                <span className="wordmark whitespace-nowrap text-[20px] text-foreground">
                  Stay Ops
                </span>

                <Link
                  aria-label={dictionary.onboarding.profileTitle}
                  className="relative z-10 flex size-[38px] items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-[color-mix(in_oklab,var(--muted)_82%,var(--foreground))]"
                  href="/account?mode=mobile"
                >
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="8.5" r="3.4" stroke="currentColor" strokeWidth="2" />
                    <path
                      d="M5.5 19c1.1-3 3.7-4.5 6.5-4.5S17.4 16 18.5 19"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </Link>
              </div>
            </div>
          </div>

          {/* Pull-to-refresh wrapper */}
          <div className="relative flex-1 overflow-hidden">

            {/* Floating indicator — revealed as content slides down */}
            <div
              aria-atomic="true"
              aria-live="polite"
              className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-center"
              style={{ height: `${REFRESH_DISPLAY_H}px` }}
            >
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className="flex size-10 items-center justify-center rounded-full bg-surface ring-1 ring-border"
                  style={{
                    boxShadow: `0 4px 20px -4px rgba(15,23,42,${0.10 + 0.12 * Math.min(contentOffset / REFRESH_DISPLAY_H, 1)}), 0 1px 4px rgba(15,23,42,0.06)`,
                    opacity: Math.min(1, contentOffset / 16),
                    transform: `scale(${0.7 + 0.3 * Math.min(contentOffset / 28, 1)})`,
                    transition: isPulling ? "none" : "opacity 200ms ease, transform 400ms cubic-bezier(0.34,1.56,0.64,1), box-shadow 200ms ease",
                  }}
                >
                  {isRefreshPending ? (
                    <Loader2 aria-hidden="true" className="size-[18px] animate-spin text-cyan-600" />
                  ) : (
                    <ArrowDown
                      aria-hidden="true"
                      className="size-[18px] text-muted-foreground"
                      style={{
                        transform: `rotate(${isReadyToRefresh ? 180 : 0}deg)`,
                        transition: "transform 280ms cubic-bezier(0.34,1.56,0.64,1)",
                      }}
                    />
                  )}
                </div>
                <p
                  className="text-[10px] font-semibold text-muted-foreground"
                  style={{
                    opacity: Math.min(1, Math.max(0, (contentOffset - 12) / 16)),
                    transition: isPulling ? "none" : "opacity 200ms ease",
                  }}
                >
                  {isRefreshPending
                    ? dictionary.mobile.homeRefreshing
                    : isReadyToRefresh
                      ? dictionary.mobile.homeReleaseToRefresh
                      : dictionary.mobile.homePullToRefresh}
                </p>
              </div>
            </div>

            {/* Gradient curtain — dissolves in as content pulls away */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 z-10"
              style={{
                height: `${Math.min(contentOffset * 2.4, 96)}px`,
                background: "linear-gradient(to bottom, rgba(255,255,255,0.94) 0%, rgba(255,255,255,0.60) 55%, transparent 100%)",
                opacity: contentOffset > 4 ? 1 : 0,
                transition: isPulling
                  ? "none"
                  : "opacity 200ms ease-out, height 420ms cubic-bezier(0.34,1.56,0.64,1)",
              }}
            />

            {/* Scrollable content — slides down on pull */}
            <div
              className={cn(
                "h-full overflow-y-auto overscroll-y-contain bg-background px-5 pb-[124px] text-foreground",
                headerVisible ? "pt-5" : "pt-0",
              )}
              onScroll={handleContentScroll}
              onTouchEnd={handleTouchEnd}
              onTouchMove={handleTouchMove}
              onTouchStart={handleTouchStart}
              style={{
                transform: `translateY(${contentOffset}px)`,
                transition: isPulling
                  ? "padding 300ms ease-out"
                  : "transform 420ms cubic-bezier(0.34,1.56,0.64,1), padding 300ms ease-out",
                willChange: isPulling || isRefreshPending || contentOffset > 0 ? "transform" : "auto",
              }}
            >
              {children}
            </div>
          </div>

          <nav className="tabbar absolute inset-x-0 bottom-0 z-20" aria-label={title}>
            {leftTabs.map(renderTab)}
            <button
              aria-label={dictionary.common.editBottomBar}
              className="tabbar__fab"
              onClick={() => setCreateOpen(true)}
              type="button"
            >
              <span className="circle">{EDIT_ICON}</span>
              <span className="lbl">{dictionary.common.editBottomBar}</span>
            </button>
            {rightTabs.map(renderTab)}
          </nav>

          {/* Center action ("추가") sheet — bottom-bar editor (pick up to 4 tabs). */}
          <button
            aria-label={dictionary.common.editBottomBar}
            className={cn(
              "fixed inset-0 z-[64] bg-[rgba(16,28,27,0.46)]",
              createOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
            )}
            onClick={() => setCreateOpen(false)}
            style={{ transition: "opacity 320ms ease" }}
            type="button"
          />
          <div
            aria-hidden={!createOpen}
            aria-label={dictionary.common.editBottomBar}
            className="fixed inset-x-0 bottom-0 z-[65] mx-auto w-full max-w-[430px] rounded-t-[26px] bg-white px-[18px] pb-[max(24px,env(safe-area-inset-bottom))] pt-[10px] shadow-[0_-16px_44px_-12px_rgba(16,28,27,0.3)]"
            role="dialog"
            style={{
              transform: createOpen ? "translateY(0)" : "translateY(110%)",
              transition: "transform 420ms cubic-bezier(0.32, 0.72, 0, 1)",
            }}
          >
            <div className="add-sheet__handle" />
            <div className="add-sheet__head">
              <div className="add-sheet__head-text">
                <p className="add-sheet__title">
                  {dictionary.common.editBottomBar}
                  <span className="ml-2 text-[12px] font-bold text-primary">
                    {navTabIds.length}/{MAX_BOTTOM_NAV_TABS}
                  </span>
                </p>
                <p className="add-sheet__sub">
                  {isBarFull ? dictionary.common.bottomBarFull : dictionary.common.editBottomBarHint}
                </p>
              </div>
              <button
                aria-label={dictionary.common.cancel}
                className="add-sheet__x"
                onClick={() => setCreateOpen(false)}
                type="button"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="add-sheet__scroll">
              <div className="add-grid">
                {customizableBottomNavItems.map((item) => {
                  const meta = LAUNCHER_META[item.id];
                  const hue = meta?.hue ?? 200;
                  const selected = navTabIds.includes(item.id);
                  const disabled = !selected && isBarFull;
                  return (
                    <button
                      key={item.id}
                      aria-pressed={selected}
                      className="add-tile"
                      disabled={disabled}
                      onClick={() => toggleNavTab(item.id)}
                      style={{
                        background: launcherTileBg(hue),
                        outline: selected ? `2px solid ${launcherIconFg(hue)}` : "none",
                        outlineOffset: "-2px",
                        opacity: disabled ? 0.45 : 1,
                      }}
                      type="button"
                    >
                      <span
                        className="add-tile__badge"
                        style={{ background: launcherBadgeBg(hue), color: launcherIconFg(hue) }}
                      >
                        {meta?.icon ?? FALLBACK_ICON}
                      </span>
                      <span className="add-tile__label">{getNavigationLabel(item, locale)}</span>
                      <span
                        aria-hidden="true"
                        className="ml-auto flex size-5 items-center justify-center rounded-full"
                        style={{
                          background: selected ? launcherIconFg(hue) : "transparent",
                          color: "#fff",
                          border: selected ? "none" : "1.5px solid rgba(16,28,27,0.18)",
                        }}
                      >
                        {selected ? (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                            <path d="M5 12l4 4 10-10" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <button
            aria-label={dictionary.common.menu}
          className={cn(
              "fixed inset-0 z-[50] bg-slate-950/42",
              sidebarOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
            )}
            onClick={() => setSidebarOpen(false)}
            style={{
              transition: "opacity 540ms ease",
            }}
            type="button"
          />
        </div>
      </div>
    </main>
  );
}
