"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { ReactNode, UIEvent } from "react";
import { Bell, ChevronLeft, ChevronRight, LogOut, UserCircle, X } from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import { BottomSheet } from "@/components/shell/bottom-sheet";
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
import { setNavDirection } from "@/lib/nav-direction";
import { cn } from "@/lib/utils";

type MobileShellProps = {
  activeItem?: (typeof mobileSidebarNavigation)[number]["id"];
  appearance?: "default" | "announcement" | "cleaning";
  children: React.ReactNode;
  title: string;
  /** Operational unprocessed counts keyed by sidebar nav id (e.g. requests, notifications). */
  badges?: Partial<Record<string, number>>;
  /**
   * Hide the bottom tab bar for focused full-screen flows (e.g. a create form with its own sticky
   * submit bar, which would otherwise overlap the tab bar). Defaults to false — the side menu still
   * reaches every feature. When true the content's bottom padding shrinks (no tab bar to clear).
   */
  hideBottomNav?: boolean;
};

const PULL_THRESHOLD = 72;
const MAX_PULL = 120;
const MAX_DISPLAY_H = 60;
const REFRESH_DISPLAY_H = 52;
const SIDEBAR_TRANSITION_MS = 360;

// Center FAB icon — app-grid squircle ("Bottom Bar (Squircle Edit)" design); opens the editor sheet.
const EDIT_ICON = (
  <svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="4" y="4" width="6.5" height="6.5" rx="1.6" stroke="currentColor" strokeWidth="1.9" />
    <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6" stroke="currentColor" strokeWidth="1.9" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6" stroke="currentColor" strokeWidth="1.9" />
    <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6" stroke="currentColor" strokeWidth="1.9" />
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
  suggestions: {
    hue: 345,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 13l2.2-7.2A2 2 0 018.1 4.4h7.8a2 2 0 011.9 1.4L20 13v4.5a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 17.5V13z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M4 13h4l1.2 2.2h5.6L16 13h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  attendance: {
    hue: 200,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.9" />
        <path d="M12 7.5v5l3.2 2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
};

const FALLBACK_ICON = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="7.5" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);


/** Rubber-band resistance: fast start, asymptotic ceiling at MAX_DISPLAY_H. */
function computeContentOffset(raw: number): number {
  if (raw <= 0) return 0;
  return MAX_DISPLAY_H * raw / (raw + MAX_PULL * 0.4);
}

// Per-route scroll restoration. The app scrolls an INNER div (not the window), which Next's
// built-in scroll restoration can't track, so navigating back always lost your place in long
// lists. Keyed by pathname, module-scoped so it survives the shell's per-route remount within a
// session (the shell is rendered per page, so this Map is the only thing that persists).
const SCROLL_POSITIONS = new Map<string, number>();

export function MobileShell({
  activeItem,
  appearance = "default",
  children,
  title,
  badges = {},
  hideBottomNav = false,
}: MobileShellProps) {
  const lastScrollYRef = useRef(0);
  const hideAccumRef = useRef(0);
  const showAccumRef = useRef(0);
  const tickingRef = useRef(false);
  const [headerVisible, setHeaderVisible] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarChromeLocked, setSidebarChromeLocked] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const closeCreate = useCallback(() => setCreateOpen(false), []);
  const [pullDistanceState, setPullDistanceState] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [isRefreshPending, startRefreshTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const scrollElRef = useRef<HTMLDivElement | null>(null);
  const touchStartYRef = useRef(0);
  const touchStartXRef = useRef(0);
  const isPullingRef = useRef(false);
  const pullDistanceRef = useRef(0);
  // PTR may only arm on a gesture that STARTED at the top. Cleared the moment scrollTop goes >0 so a
  // momentum/rubber-band coast back to 0 under a held finger can't activate PTR against a stale anchor.
  const ptrEligibleRef = useRef(false);
  // Swipe-to-navigate refs (separate from pull-to-refresh)
  const swipeNavStartXRef = useRef(0);
  const swipeNavStartYRef = useRef(0);
  // Live left-edge "back" drag: a side reveal + chevron hint fades in as you drag (the screen stays put).
  // The hint's intensity is written straight to the DOM via a `--edge-progress` CSS custom property, so
  // the drag never re-renders the shell mid-gesture (only the start/end `edgeDragging` flip does).
  const [edgeDragging, setEdgeDragging] = useState(false);
  const edgeHintRef = useRef<HTMLDivElement | null>(null);
  const edgeCandidateRef = useRef(false); // gesture started within the left edge band
  const edgeLockedRef = useRef(false); // locked into a horizontal edge-back drag
  const edgeRawDxRef = useRef(0); // raw (un-damped) horizontal distance, for the commit threshold
  // Set to true the moment goBack() fires; cleared on the next touchstart. Prevents a stale
  // edgeLocked state from processing touchmove events after a fast-fling navigation.
  const navigatingRef = useRef(false);
  const sidebarChromeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // rAF-coalesce touchmove → setState: refs update synchronously every sample, but the visible React
  // state setter fires at most once per animation frame (avoids a full subtree re-render at ~120Hz).
  const pullRafRef = useRef(0);
  const { session } = useSession();

  // Per-user bottom-bar tabs (customized via the center "추가" editor sheet).
  const initialNavIds = resolveBottomNavItems(session?.user.bottomNavTabs).map(
    (item) => item.id,
  );
  const [navTabIds, setNavTabIds] = useState<string[]>(initialNavIds);
  const savedNavRef = useRef<string[]>(initialNavIds);
  const sheetWasOpenRef = useRef(false);
  const [, startNavSave] = useTransition();

  const clearSidebarChromeTimer = useCallback(() => {
    if (sidebarChromeTimerRef.current) {
      clearTimeout(sidebarChromeTimerRef.current);
      sidebarChromeTimerRef.current = null;
    }
  }, []);

  const openSidebar = useCallback(() => {
    clearSidebarChromeTimer();
    setSidebarChromeLocked(true);
    setSidebarOpen(true);
  }, [clearSidebarChromeTimer]);

  const closeSidebar = useCallback(() => {
    clearSidebarChromeTimer();
    setSidebarOpen(false);
    sidebarChromeTimerRef.current = setTimeout(() => {
      setSidebarChromeLocked(false);
      sidebarChromeTimerRef.current = null;
    }, SIDEBAR_TRANSITION_MS);
  }, [clearSidebarChromeTimer]);

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
    } else if (delta > 4) {
      hideAccumRef.current += delta;
      showAccumRef.current = 0;
      if (hideAccumRef.current > 64) {
        setHeaderVisible(false);
      }
    } else if (delta < -4) {
      showAccumRef.current += Math.abs(delta);
      hideAccumRef.current = 0;
      if (showAccumRef.current > 36) {
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

  // Key restore by the FULL url (path + query), not just pathname — list screens vary their content
  // by query (?view=, ?month=, ?date=) on a single pathname, so a path-only key restored a position
  // saved from a different (taller/shorter) variant.
  const routeKey = useCallback(
    () =>
      typeof window !== "undefined"
        ? window.location.pathname + window.location.search
        : pathname,
    [pathname],
  );

  const handleContentScroll = (event: UIEvent<HTMLDivElement>) => {
    const top = event.currentTarget.scrollTop;
    const key = routeKey();
    // Remember where we are for back-nav restore. Re-set after delete to keep this key the most
    // recent (Map preserves insertion order) and cap the Map so it can't grow unbounded.
    SCROLL_POSITIONS.delete(key);
    SCROLL_POSITIONS.set(key, top);
    if (SCROLL_POSITIONS.size > 30) {
      SCROLL_POSITIONS.delete(SCROLL_POSITIONS.keys().next().value as string);
    }
    requestVisibilityUpdate(top);
  };

  // Restore the saved scroll position for this route on mount (native back-nav behavior). Runs once
  // per shell mount (the shell remounts per route navigation).
  useEffect(() => {
    const el = scrollElRef.current;
    if (!el) return;
    const saved = SCROLL_POSITIONS.get(routeKey());
    if (saved && saved > 0) {
      el.scrollTop = saved;
      lastScrollYRef.current = saved; // avoid a spurious large delta on the first scroll event
    }
  }, [pathname, routeKey]);

  function syncPullDistance(v: number) {
    pullDistanceRef.current = v;
    if (pullRafRef.current) return;
    pullRafRef.current = window.requestAnimationFrame(() => {
      pullRafRef.current = 0;
      setPullDistanceState(pullDistanceRef.current);
    });
  }

  // Numeric offset — used for indicator opacity/scale animations (0..REFRESH_DISPLAY_H range).
  const contentOffset = isRefreshPending
    ? REFRESH_DISPLAY_H
    : computeContentOffset(pullDistanceState);
  // CSS value for the shell translateY. When refreshing we add env(safe-area-inset-top) so the
  // indicator content is positioned fully BELOW the notch/status-bar, not hidden behind it.
  const shellY = isRefreshPending
    ? `calc(env(safe-area-inset-top, 0px) + ${REFRESH_DISPLAY_H}px)`
    : `${computeContentOffset(pullDistanceState)}px`;
  const isReadyToRefresh = pullDistanceState >= PULL_THRESHOLD;

  function handleTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    if (sidebarOpen || isRefreshPending) return;
    ptrEligibleRef.current = e.currentTarget.scrollTop <= 0;
    if (!ptrEligibleRef.current) return;
    touchStartYRef.current = e.touches[0].clientY;
    touchStartXRef.current = e.touches[0].clientX;
    isPullingRef.current = false;
  }

  function handleTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    if (isRefreshPending || e.touches.length !== 1) return;
    // If the edge-back drag is locked, the outer <main> handler owns this gesture — don't let PTR fire.
    if (edgeLockedRef.current) return;
    if (e.currentTarget.scrollTop > 0) {
      // Mark ineligible and re-anchor, so a later coast back to 0 doesn't compare against ancient Y.
      ptrEligibleRef.current = false;
      touchStartYRef.current = e.touches[0].clientY;
      touchStartXRef.current = e.touches[0].clientX;
      if (isPullingRef.current) {
        isPullingRef.current = false;
        setIsPulling(false);
        syncPullDistance(0);
      }
      return;
    }
    if (!ptrEligibleRef.current) {
      // At the top, but this gesture started/passed through scrollTop>0 — don't arm PTR. Keep anchor fresh.
      touchStartYRef.current = e.touches[0].clientY;
      touchStartXRef.current = e.touches[0].clientX;
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
    // Haptic pulse at the commit threshold — fires once per gesture as the user crosses 72px.
    const wasBelowThreshold = pullDistanceRef.current < PULL_THRESHOLD;
    syncPullDistance(deltaY);
    if (wasBelowThreshold && deltaY >= PULL_THRESHOLD) {
      if (typeof navigator !== "undefined") navigator.vibrate?.(10);
    }
  }

  function handleTouchEnd() {
    const wasPulling = isPullingRef.current;
    ptrEligibleRef.current = false;
    if (!wasPulling) return;
    const dist = pullDistanceRef.current;
    isPullingRef.current = false;
    setIsPulling(false);
    syncPullDistance(0);
    // Cancel any pending frame and commit the resting 0 now, so spring-back animates without delay.
    if (pullRafRef.current) {
      cancelAnimationFrame(pullRafRef.current);
      pullRafRef.current = 0;
    }
    setPullDistanceState(0);
    if (dist >= PULL_THRESHOLD) {
      startRefreshTransition(() => { router.refresh(); });
    }
  }

  // ── Swipe-to-navigate (on <main>) ────────────────────────────────────────
  // iOS-style **interactive** left-edge back: the screen follows the finger (damped) with a side
  // reveal + a chevron hint, and commits to `router.back()` when pulled far enough (otherwise springs
  // back). Right-edge swipe → forward (fling only). Handled once on the outermost <main> so it covers
  // every mobile page without touching individual screens.
  const EDGE_BAND = 30; // px from the left edge the gesture must start within

  // Write the hint intensity (0..1 ratio) straight to the DOM. `90` matches the old
  // `edgeProgress = Math.min(edgeDx / 90, 1)` math; the browser coalesces these to the next paint.
  const writeEdgeProgress = useCallback((dx: number) => {
    const node = edgeHintRef.current;
    if (!node) return;
    const progress = dx <= 0 ? 0 : Math.min(dx / 90, 1);
    node.style.setProperty("--edge-progress", progress.toFixed(3));
  }, []);

  function handleSwipeStart(e: React.TouchEvent<HTMLElement>) {
    navigatingRef.current = false; // new gesture — clear any stale post-navigation lock
    if (sidebarChromeLocked) return;
    const t = e.touches[0];
    swipeNavStartXRef.current = t.clientX;
    swipeNavStartYRef.current = t.clientY;
    // Don't arm edge candidate if PTR is already pulling — PTR wins.
    edgeCandidateRef.current = !isPullingRef.current && t.clientX <= EDGE_BAND;
    edgeLockedRef.current = false;
    edgeRawDxRef.current = 0;
  }

  function handleSwipeMove(e: React.TouchEvent<HTMLElement>) {
    // PTR is active or navigation already fired — this gesture is no longer ours.
    if (isPullingRef.current || navigatingRef.current) return;
    if (sidebarChromeLocked || isRefreshPending || !edgeCandidateRef.current) return;
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - swipeNavStartXRef.current;
    const dy = Math.abs(t.clientY - swipeNavStartYRef.current);
    if (!edgeLockedRef.current) {
      // Decide intent: clearly rightward → start the edge drag; clearly vertical → hand off to scroll.
      if (dx > 10 && dx > dy * 1.2) {
        edgeLockedRef.current = true;
        setEdgeDragging(true);
      } else if (dy > 12 && dy >= dx) {
        edgeCandidateRef.current = false;
        return;
      } else {
        return;
      }
    }
    edgeRawDxRef.current = dx; // keep synchronous — endEdgeDrag reads edgeRawDxRef.current > 64
    // Drives the gradient/chevron intensity (the screen does not move) — direct DOM write, no re-render.
    writeEdgeProgress(dx);
  }

  // Back that never strands the user. In an installed standalone PWA there is no browser back
  // button, so a `router.back()` at the first history entry (e.g. cold-launched straight onto a
  // deep screen via a notification / share / deep link) would be a dead gesture with no escape.
  // When there's nothing to go back to, fall back to the mobile home instead.
  const goBack = useCallback(() => {
    navigatingRef.current = true; // block any stale touchmove after this fires
    setNavDirection("back"); // play the pop (left-slide) transition for this navigation
    if (typeof window !== "undefined" && window.history.length <= 1) {
      router.push("/mobile");
    } else {
      router.back();
    }
  }, [router]);

  function endEdgeDrag(commit: boolean) {
    edgeLockedRef.current = false;
    edgeCandidateRef.current = false;
    setEdgeDragging(false); // re-enable the CSS transition (transition: none → opacity 380ms ease)
    if (commit) {
      writeEdgeProgress(0);
      goBack();
    } else {
      // Defer the DOM write by one frame so React can first paint the transition:none→380ms change.
      // Without this, writeEdgeProgress(0) fires before the new transition is applied and the hint
      // disappears instantly instead of fading out.
      requestAnimationFrame(() => writeEdgeProgress(0));
    }
  }

  function handleSwipeEnd(e: React.TouchEvent<HTMLElement>) {
    if (edgeLockedRef.current) {
      // Live edge-back drag: commit past ~64px of real travel, else spring back.
      endEdgeDrag(edgeRawDxRef.current > 64);
      return;
    }
    edgeCandidateRef.current = false;
    if (sidebarChromeLocked) return;
    const t = e.changedTouches[0];
    const startX = swipeNavStartXRef.current;
    const deltaX = t.clientX - startX;
    const deltaY = Math.abs(t.clientY - swipeNavStartYRef.current);
    const absX = Math.abs(deltaX);

    // Fallback fling (quick flicks not caught by the live drag) + right-edge forward.
    if (absX < 55 || deltaY > absX * 0.75) return;
    const viewportWidth = window.innerWidth || 390;
    if (deltaX > 0 && startX <= EDGE_BAND) {
      goBack();
      return;
    }
    if (deltaX < 0 && startX >= viewportWidth - 28) {
      router.forward();
    }
  }

  function handleSwipeCancel() {
    if (edgeLockedRef.current) endEdgeDrag(false);
    else edgeCandidateRef.current = false;
  }

  // ─────────────────────────────────────────────────────────────────────────

  // Suppress the iOS standalone-PWA native swipe-back gesture so it doesn't fire alongside
  // our own handler. iOS fires its system gesture in response to a left-edge rightward drag,
  // then shows the PWA launch screen (splash) before our router.back() even runs. Calling
  // e.preventDefault() in a non-passive touchmove listener — once we confirm rightward
  // horizontal intent from the edge band — tells UIKit we are handling the gesture ourselves.
  useEffect(() => {
    let startX = 0;
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 1) startX = e.touches[0].clientX;
    };
    const onMove = (e: TouchEvent) => {
      if (
        e.cancelable &&
        e.touches.length === 1 &&
        startX <= EDGE_BAND &&
        e.touches[0].clientX - startX > 5
      ) {
        e.preventDefault();
      }
    };
    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
    };
  }, []);

  useEffect(() => {
    // This app uses an overflow-hidden shell with an INNER scroll container,
    // not window scrolling. Listening to window "scroll" or "resize" would pass
    // scrollY=0 every time, resetting headerVisible→true and undoing any
    // scroll-back hiding. Only the custom mobile-shell-scroll event (dispatched
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
        closeSidebar();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeSidebar, sidebarOpen]);

  useEffect(() => () => clearSidebarChromeTimer(), [clearSidebarChromeTimer]);

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
  const topChromeVisible = headerVisible && !sidebarChromeLocked;

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
      onTouchCancel={handleSwipeCancel}
      onTouchEnd={handleSwipeEnd}
      onTouchMove={handleSwipeMove}
      onTouchStart={handleSwipeStart}
    >
      {/* Left-edge back hint — a soft gradient shadow + chevron that fade in as you drag from the
          edge. The screen itself stays put (simple, not a slide). */}
      <div
        ref={edgeHintRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-y-0 left-0 z-[55] flex w-24 items-center"
        style={{
          ["--edge-progress" as string]: "0",
          opacity: "var(--edge-progress)",
          background:
            "linear-gradient(90deg, rgba(15,23,42,0.16) 0%, rgba(15,23,42,0.06) 45%, rgba(15,23,42,0) 100%)",
          transition: edgeDragging ? "none" : "opacity 380ms ease",
        }}
      >
        <span
          className="ml-2 flex size-9 items-center justify-center rounded-full bg-white/90 text-foreground shadow-[0_10px_28px_-8px_rgba(15,23,42,0.5)] backdrop-blur"
          style={{
            transform: "translateX(calc((var(--edge-progress) - 1) * 12px))",
            transition: edgeDragging ? "none" : "transform 380ms cubic-bezier(0.22,1,0.36,1)",
          }}
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
        </span>
      </div>

      {/* ── Option-B PTR indicator — fixed at the top, revealed as the whole shell slides down ── */}
      {/* The shell (header + content + bottom nav) all translate together; this fixed layer fills
          the gap that opens above them. Background matches the canvas so the reveal looks seamless. */}
      <div
        aria-atomic="true"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-0 z-[1] flex flex-col items-center justify-center bg-background"
        style={{
          height: `calc(env(safe-area-inset-top, 0px) + ${REFRESH_DISPLAY_H}px)`,
          // Push content below the notch/status-bar so it's visible when the shell slides down.
          paddingTop: "env(safe-area-inset-top, 0px)",
        }}
      >
        <p
          className="text-[11px] font-semibold tracking-wide text-muted-foreground"
          style={{
            opacity: (isReadyToRefresh || isRefreshPending) ? 1 : 0,
            transition: isPulling ? "none" : "opacity 180ms ease",
          }}
        >
          {isRefreshPending
            ? dictionary.mobile.homeRefreshing
            : dictionary.mobile.homeReleaseToRefresh}
        </p>
      </div>

      <div className="relative mx-auto flex h-full w-full max-w-[430px] flex-col overflow-hidden">
        <aside
          aria-label={dictionary.common.menu}
          className={cn(
            "absolute inset-y-0 left-0 z-[60] flex w-full flex-col overflow-hidden px-[22px] pb-[18px] pt-[max(24px,env(safe-area-inset-top))] text-foreground",
          )}
          style={{
            background: "var(--background)",
            transform: sidebarOpen ? "translate3d(0, 0, 0)" : "translate3d(-100%, 0, 0)",
            transition: `transform ${SIDEBAR_TRANSITION_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`,
            willChange: "transform",
          }}
        >
          {/* Header */}
          <div className="flex h-10 items-center justify-between px-0.5">
            <Link
              href="/mobile"
              onClick={closeSidebar}
              className="wordmark text-[24px] text-foreground"
            >
              Stay Ops
            </Link>
            <button
              aria-label={dictionary.common.menu}
              className="flex size-[38px] items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-border hover:text-foreground"
              onClick={closeSidebar}
              type="button"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>

          {/* User row — flat, hairline bottom */}
          <Link
            href="/account?mode=mobile"
            onClick={closeSidebar}
            className="mt-5 flex items-center gap-[13px] border-b border-border px-1 pb-4"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
              <UserCircle className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-bold tracking-[-0.01em]">
                {session.user.name}
              </p>
              <p className="mt-0.5 text-[12px] font-medium text-muted-foreground">
                {dictionary.roles[session.user.role]}
              </p>
            </div>
            <ChevronRight className="size-[17px] shrink-0 text-muted-foreground opacity-55" aria-hidden="true" />
          </Link>

          {/* Nav */}
          <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <p className="mb-1.5 ml-1 mt-[22px] text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
              {dictionary.common.menu}
            </p>
            <nav className="flex flex-col">
              {mobileSidebarNavigation.map((item) => {
                const Icon = item.icon;
                const isActive = item.id === activeItem;
                const count = badges[item.id] ?? 0;

                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={closeSidebar}
                    aria-current={isActive ? "page" : undefined}
                    className="group relative flex h-[50px] items-center gap-[14px] px-2"
                  >
                    {isActive && (
                      <span
                        aria-hidden="true"
                        className="absolute -left-[22px] bottom-[13px] top-[13px] w-[3px] rounded-r-[3px] bg-primary"
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
                        "flex-1 text-[15px] transition-colors",
                        isActive ? "font-bold text-primary" : "font-medium text-foreground",
                      )}
                    >
                      {getNavigationLabel(item, locale)}
                    </span>
                    {count > 0 && (
                      <span
                        className={cn(
                          "font-mono text-[12.5px] font-semibold tabular-nums",
                          isActive ? "text-primary" : "text-muted-foreground",
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

          {/* Footer — hairline top, transparent buttons */}
          <div className="mt-[14px] flex items-center gap-2 border-t border-border pt-[14px]">
            <Link
              href="/account?mode=mobile"
              onClick={closeSidebar}
              className="flex flex-1 items-center gap-[10px] rounded-[12px] px-2 py-[10px] text-foreground transition-colors hover:bg-muted"
            >
              <UserCircle className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="text-[13.5px] font-semibold">{dictionary.common.account}</span>
            </Link>
            <form action={signOut}>
              <button
                type="submit"
                className="flex items-center gap-[7px] rounded-[12px] px-[14px] py-[10px] text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <LogOut className="size-4" aria-hidden="true" />
                {dictionary.common.logout}
              </button>
            </form>
          </div>
        </aside>

        <div
          className="relative flex h-full w-full flex-col overflow-hidden bg-background pt-[env(safe-area-inset-top)]"
          style={{
            // z-index: 2 makes this stacking context sit ABOVE the fixed PTR indicator (z-1),
            // so the header is not covered when contentOffset = 0. When pulling, the shell slides
            // down revealing the indicator through the gap at the top.
            zIndex: 2,
            transform: `translateY(${shellY})`,
            transition: isPulling
              ? "none"
              : "transform 420ms cubic-bezier(0.34,1.56,0.64,1)",
            willChange: isPulling || isRefreshPending || contentOffset > 0 ? "transform" : "auto",
          }}
        >
          {/* Top bar — OVERLAY (mirrors the bottom tab bar). It used to be an in-flow h-16
              block whose inner content merely faded on scroll, leaving the 64px slot occupied.
              Now it is absolutely positioned and slides fully up on scroll-down (and back on
              scroll-up), so the content reclaims that space — exactly like the bottom bar. The
              scroll container carries a CONSTANT top padding to clear it, so there is no reflow
              jump (the height never changes; only the overlay translates). */}
          <div
            className={cn(
              "absolute inset-x-0 top-[env(safe-area-inset-top)] z-30 h-16 overflow-hidden border-0 motion-reduce:transition-none",
              !topChromeVisible && "pointer-events-none",
            )}
            style={{
              transform: topChromeVisible
                ? "translateY(0)"
                : "translateY(calc(-100% - env(safe-area-inset-top)))",
              // Hide (scroll-down): fast ease-in — bar follows the finger quickly.
              // Show (scroll-up):  spring ease — bar settles into place naturally.
              transition: topChromeVisible
                ? "transform 400ms cubic-bezier(0.22, 1, 0.36, 1)"
                : "transform 200ms cubic-bezier(0.4, 0, 1, 1)",
            }}
          >
            <div className="relative h-16 bg-background px-4 pt-2">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[linear-gradient(180deg,var(--background)_0%,color-mix(in_oklab,var(--background)_82%,transparent)_55%,transparent_100%)]"
              />
              <div className="relative flex h-12 w-full items-center justify-between px-2">
                <button
                  aria-label={dictionary.common.menu}
                  className="relative z-10 flex size-[38px] items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-[color-mix(in_oklab,var(--muted)_82%,var(--foreground))]"
                  onClick={openSidebar}
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

                <Link
                  href="/mobile"
                  className="wordmark absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[20px] text-foreground"
                >
                  Stay Ops
                </Link>

                {/* Notification bell — top-bar shortcut, left of profile */}
                <div className="relative z-10 flex items-center gap-1.5">
                  <Link
                    aria-label={dictionary.navigation.utility.notifications}
                    className="relative flex size-[38px] items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                    href="/mobile/notifications"
                  >
                    <Bell className="size-[21px]" aria-hidden="true" />
                    {(badges.notifications ?? 0) > 0 ? (
                      <span
                        aria-label={String(badges.notifications)}
                        className="absolute right-[6px] top-[6px] flex min-w-[14px] items-center justify-center rounded-full bg-rose-500 px-[3px] text-[9px] font-extrabold leading-[14px] text-white"
                      >
                        {(badges.notifications ?? 0) > 99 ? "99+" : badges.notifications}
                      </span>
                    ) : null}
                  </Link>
                  <Link
                    aria-label={dictionary.onboarding.profileTitle}
                    className="flex size-[38px] items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                    href="/account?mode=mobile"
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
          </div>

          {/* Pull-to-refresh wrapper — content scrolls normally; the outer shell div above
              carries the translateY so the entire chrome (header + content + bottom nav) slides
              together (Option-B full-screen pull). The fixed indicator at the top is revealed as
              the shell moves down. No translateY here; no gradient curtain needed. */}
          <div className="relative flex-1 overflow-hidden">
            <div
              className={cn(
                "h-full overflow-y-auto overscroll-y-contain bg-background px-5 pt-[84px] text-foreground",
                hideBottomNav ? "pb-8" : "pb-[124px]",
              )}
              onScroll={handleContentScroll}
              onTouchEnd={handleTouchEnd}
              onTouchMove={handleTouchMove}
              onTouchStart={handleTouchStart}
              ref={scrollElRef}
            >
              {children}
            </div>
          </div>

          {hideBottomNav ? null : (
            <nav
              aria-label={title}
              className={cn(
                "tabbar absolute inset-x-0 bottom-0 z-20 motion-reduce:transition-none",
                !topChromeVisible && "pointer-events-none",
              )}
              style={{
                transform: topChromeVisible
                  ? "translateY(0)"
                  : "translateY(calc(100% + 40px))",
                transition: topChromeVisible
                  ? "transform 400ms cubic-bezier(0.22, 1, 0.36, 1)"
                  : "transform 200ms cubic-bezier(0.4, 0, 1, 1)",
              }}
            >
              {leftTabs.map(renderTab)}
              <button
                aria-label={dictionary.common.editBottomBar}
                className="tabbar__fab"
                onClick={() => setCreateOpen(true)}
                type="button"
              >
                <span className="circle">{EDIT_ICON}</span>
                <span className="lbl">{dictionary.common.edit}</span>
              </button>
              {rightTabs.map(renderTab)}
            </nav>
          )}

          {/* Center action ("추가") sheet — bottom-bar editor (pick up to 4 tabs). */}
          {createOpen ? (
            <BottomSheet
              ariaLabel={dictionary.common.editBottomBar}
              header={
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
                </div>
              }
              onClose={closeCreate}
            >
              <div className="add-sheet__scroll">
                <div className="add-grid">
                  {customizableBottomNavItems.map((item) => {
                    const meta = LAUNCHER_META[item.id];
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
                          background: selected
                            ? "color-mix(in oklab, var(--primary) 7%, var(--surface))"
                            : "var(--surface)",
                          boxShadow: selected
                            ? "inset 0 0 0 2px var(--primary)"
                            : "inset 0 0 0 1px var(--border)",
                          opacity: disabled ? 0.45 : 1,
                        }}
                        type="button"
                      >
                        <span
                          className="add-tile__badge"
                          style={{
                            background: selected ? "var(--primary)" : "var(--muted)",
                            color: selected ? "var(--primary-foreground)" : "var(--muted-foreground)",
                          }}
                        >
                          {meta?.icon ?? FALLBACK_ICON}
                        </span>
                        <span className="add-tile__label">{getNavigationLabel(item, locale)}</span>
                        <span
                          aria-hidden="true"
                          className="ml-auto flex size-5 items-center justify-center rounded-full"
                          style={{
                            background: selected ? "var(--primary)" : "transparent",
                            color: "#fff",
                            border: selected ? "none" : "1.5px solid var(--border)",
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
            </BottomSheet>
          ) : null}

        </div>
      </div>
    </main>
  );
}
