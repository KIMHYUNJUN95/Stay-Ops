"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { UIEvent } from "react";
import { ArrowDown, Loader2, UserCircle, X } from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import {
  getNavigationLabel,
  mobileBottomNavigation,
  mobileSidebarNavigation,
} from "@/config/navigation";
import { getDictionary } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type MobileShellProps = {
  activeItem?: (typeof mobileSidebarNavigation)[number]["id"];
  appearance?: "default" | "announcement" | "cleaning";
  children: React.ReactNode;
  title: string;
};

const PULL_THRESHOLD = 72;
const MAX_PULL = 120;
const MAX_DISPLAY_H = 60;
const REFRESH_DISPLAY_H = 52;
const navAccentClass = {
  announcements: "from-sky-100 to-blue-50 text-sky-700 ring-sky-200/80",
  calendar: "from-sky-100 to-cyan-50 text-sky-700 ring-sky-200/80",
  cleaning: "from-slate-100 to-blue-50 text-[#315F91] ring-slate-200/80",
  home: "from-slate-100 to-blue-50 text-slate-700 ring-slate-200/80",
  requests: "from-rose-100 to-pink-50 text-rose-700 ring-rose-200/80",
} as const;

/** Rubber-band resistance: fast start, asymptotic ceiling at MAX_DISPLAY_H. */
function computeContentOffset(raw: number): number {
  if (raw <= 0) return 0;
  return MAX_DISPLAY_H * raw / (raw + MAX_PULL * 0.4);
}

function MenuTriggerIcon({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn("inline-flex flex-col items-start gap-[4px]", className)}>
      <span className="block h-[2px] w-4 rounded-full bg-current" />
      <span className="block h-[2px] w-2.5 rounded-full bg-current" />
    </span>
  );
}

export function MobileShell({
  activeItem,
  appearance = "default",
  children,
  title,
}: MobileShellProps) {
  const lastScrollYRef = useRef(0);
  const hideAccumRef = useRef(0);
  const showAccumRef = useRef(0);
  const tickingRef = useRef(false);
  const [headerVisible, setHeaderVisible] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
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

  if (!session) return null;

  void appearance;

  const locale = session.user.preferredLanguage;
  const dictionary = getDictionary(locale);

  return (
    <main
      aria-label={title}
      className="h-dvh overflow-hidden bg-background text-slate-950 dark:text-slate-50"
      onTouchEnd={handleSwipeEnd}
      onTouchStart={handleSwipeStart}
    >
      <div className="relative mx-auto flex h-dvh w-full max-w-[430px] flex-col overflow-hidden">
        <aside
          aria-label={dictionary.common.menu}
          className={cn(
            "fixed inset-y-0 left-0 z-[60] flex w-[78%] max-w-[318px] flex-col overflow-hidden border-r border-slate-200/90 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-5 pb-6 pt-5 text-slate-950",
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
            <span className="relative text-[20px] font-normal tracking-[-0.04em] text-black">𝓢𝓽𝓪𝔂 𝓞𝓹𝓼</span>
            <button
              aria-label={dictionary.common.menu}
              className="relative flex size-9 items-center justify-center rounded-full border border-slate-200/90 bg-white text-slate-500 shadow-[0_12px_24px_-20px_rgba(15,23,42,0.38)] transition-colors hover:bg-slate-50 hover:text-slate-900"
              onClick={() => setSidebarOpen(false)}
              type="button"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>

          <Link
            className="relative mt-6 flex items-center gap-3 rounded-[22px] border border-slate-200/90 bg-white/92 px-3 py-3 shadow-[0_18px_38px_-32px_rgba(15,23,42,0.46)] backdrop-blur-xl transition-colors hover:bg-white"
            href="/account?mode=mobile"
            onClick={() => setSidebarOpen(false)}
          >
            <div className="flex size-10 items-center justify-center rounded-xl bg-slate-50 text-slate-700 ring-1 ring-slate-200/85">
              <UserCircle className="size-6" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-950">{session.user.name}</p>
              <p className="truncate text-xs font-semibold text-slate-500">{dictionary.common.account}</p>
            </div>
          </Link>

          <nav className="relative mt-6 flex-1 space-y-1.5">
            {mobileSidebarNavigation.map((item) => {
              const Icon = item.icon;
              const isActive = item.id === activeItem;

              return (
                <Link
                  className={cn(
                    "group flex h-11 items-center gap-3 rounded-xl px-2.5 text-sm font-bold text-slate-600 transition-all duration-200 hover:bg-white hover:text-slate-950 hover:shadow-[0_12px_26px_-24px_rgba(15,23,42,0.34)]",
                    isActive && "bg-slate-950 text-white shadow-[0_18px_34px_-28px_rgba(15,23,42,0.72)]",
                  )}
                  href={item.href}
                  key={item.id}
                  onClick={() => setSidebarOpen(false)}
                >
                  <span
                    className={cn(
                      "flex size-8 items-center justify-center rounded-xl bg-white text-slate-500 ring-1 ring-slate-200/75 transition-colors group-hover:text-slate-700",
                      isActive && "bg-white/12 text-white ring-white/15",
                    )}
                  >
                    <Icon className="size-4.5" aria-hidden="true" />
                  </span>
                  <span>{getNavigationLabel(item, locale)}</span>
                </Link>
              );
            })}
          </nav>

          <Link
            className="relative flex h-11 items-center gap-3 rounded-xl border border-slate-200/90 bg-white/92 px-3 text-sm font-bold text-slate-700 shadow-[0_12px_24px_-22px_rgba(15,23,42,0.34)] transition-colors hover:bg-white"
            href="/account?mode=mobile"
            onClick={() => setSidebarOpen(false)}
          >
            <UserCircle className="size-5" aria-hidden="true" />
            <span>{dictionary.common.account}</span>
          </Link>
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
                  "relative flex h-12 w-full items-center rounded-[28px] border border-white/72 bg-white/78 px-1.5 shadow-[0_18px_42px_-32px_rgba(31,58,95,0.55),inset_0_1px_1px_rgba(255,255,255,0.88)] ring-1 ring-slate-200/55 backdrop-blur-2xl transition-[transform,opacity] duration-300 ease-out",
                  headerVisible ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0",
                )}
              >
                <button
                  aria-label={dictionary.common.menu}
                  className="relative z-10 flex size-9 items-center justify-center rounded-full bg-slate-50/80 text-slate-800 shadow-[0_10px_22px_-18px_rgba(31,58,95,0.42)] ring-1 ring-slate-200/70 transition-colors hover:bg-white dark:text-slate-100 dark:hover:bg-white/10"
                  onClick={() => setSidebarOpen(true)}
                  type="button"
                >
                  <MenuTriggerIcon />
                </button>

                <span className="pointer-events-none absolute inset-x-0 flex justify-center">
                  <span className="inline-flex items-center text-[21px] font-normal tracking-[-0.04em] text-black drop-shadow-[0_1px_0_rgba(255,255,255,0.9)] dark:text-black">
                    𝓢𝓽𝓪𝔂 𝓞𝓹𝓼
                  </span>
                </span>

                <Link
                  aria-label={dictionary.onboarding.profileTitle}
                  className="relative z-10 ml-auto flex size-9 items-center justify-center rounded-full bg-[#EEF7FF] text-[#315F91] shadow-[0_10px_22px_-18px_rgba(31,58,95,0.45)] ring-1 ring-[#D9EAF8] transition-colors hover:bg-white dark:text-slate-100 dark:hover:bg-white/10"
                  href="/account?mode=mobile"
                >
                  <UserCircle className="size-6" aria-hidden="true" />
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
                  className="flex size-10 items-center justify-center rounded-full bg-white ring-1 ring-slate-200/80"
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
                      className="size-[18px] text-slate-500"
                      style={{
                        transform: `rotate(${isReadyToRefresh ? 180 : 0}deg)`,
                        transition: "transform 280ms cubic-bezier(0.34,1.56,0.64,1)",
                      }}
                    />
                  )}
                </div>
                <p
                  className="text-[10px] font-semibold text-slate-400"
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
                "h-full overflow-y-auto overscroll-y-contain bg-background px-5 pb-[108px] text-slate-950 dark:text-slate-50",
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

          <nav className="absolute inset-x-4 bottom-3 z-20 overflow-hidden rounded-[30px] border border-white/75 bg-white/82 px-2 py-2.5 shadow-[0_26px_70px_-34px_rgba(31,58,95,0.62),0_12px_30px_-24px_rgba(31,58,95,0.42),inset_0_1px_1px_rgba(255,255,255,0.88)] ring-1 ring-slate-200/58 backdrop-blur-[34px] backdrop-saturate-[220%] dark:border-white/12 dark:bg-white/[0.07] dark:shadow-[0_24px_70px_-30px_rgba(0,0,0,0.82),inset_0_1px_1px_rgba(255,255,255,0.14),inset_0_-1px_1px_rgba(255,255,255,0.04)] dark:ring-white/6">
            <div className="pointer-events-none absolute inset-x-8 -top-8 h-16 rounded-full bg-[radial-gradient(55%_70%_at_50%_0%,rgba(222,242,255,0.95),transparent_80%)] blur-md" />
            <div className="pointer-events-none absolute inset-[1px] rounded-[29px] bg-[linear-gradient(125deg,rgba(255,255,255,0.86),rgba(255,255,255,0.18)_38%,rgba(238,247,255,0.32)_74%,rgba(255,255,255,0.68))] opacity-70" />
            <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-white/85 blur-[0.5px] dark:bg-white/14" />
            <ul className="relative grid grid-cols-5 gap-1">
              {mobileBottomNavigation.map((item) => {
                const Icon = item.icon;
                const isActive = item.id === activeItem;
                const accent = navAccentClass[item.id as keyof typeof navAccentClass];

                return (
                  <li key={item.id}>
                    <Link
                      className={cn(
                        "group relative flex h-[54px] flex-col items-center justify-center rounded-3xl text-[10px] font-bold text-slate-500 transition-all duration-200 active:scale-[0.98] dark:text-slate-300",
                        isActive &&
                          "text-slate-950",
                      )}
                      href={item.href}
                    >
                      <span
                        className={cn(
                          "mb-1 flex size-8 items-center justify-center rounded-2xl bg-slate-50 text-slate-500 ring-1 ring-slate-200/70 transition-all duration-200 group-hover:bg-white group-hover:text-slate-700",
                          isActive &&
                            `bg-gradient-to-br shadow-[0_12px_24px_-18px_rgba(31,58,95,0.55)] ${accent}`,
                        )}
                      >
                        <Icon className="size-4.5" aria-hidden="true" />
                      </span>
                      <span className="tracking-[-0.03em]">{getNavigationLabel(item, locale)}</span>
                      {isActive ? (
                        <span
                          aria-hidden="true"
                          className="absolute bottom-1.5 h-1 w-4 rounded-full bg-slate-900/16"
                        />
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

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
