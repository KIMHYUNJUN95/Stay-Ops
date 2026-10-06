"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { Bell, LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { signOut } from "@/app/auth/actions";
import { getNavigationLabel, getNavigationTabLabel, mobileNavBugs, type NavigationItem } from "@/config/navigation";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * 넓은 화면 메뉴 — 태블릿 · 펼친 폴드(2026-10-05, Claude Design 시안 `6a 태블릿 · 폴드 적응형 v1` 의 6b · 6c).
 *
 * 도메인 계약: docs/product/16-mobile-navigation.md 「넓은 화면 — 레일 · 사이드바」
 *
 * - **레일**(`fold:` ≥ 600px): 78px 세로 줄. 햄버거(전체 메뉴 서랍) · 편집 버튼(하단 탭 편집 시트 — 하단 바 가운데 버튼과
 *   같다) · **하단 탭에서 고른 탭** · 알림 · 내 정보. 하단 탭 바와 같은 항목이라 폰 ↔ 태블릿을 오가도 손에 익은 그대로다.
 * - **사이드바**(`tablet:` ≥ 1000px 이면서 높이 ≥ 600px — 2026-10-06 840 에서 올림): 248px. 전체 메뉴 + 운영 관리자 구역 + 갯수 + 계정 · 버그 · 로그아웃.
 *   (전체 메뉴가 다 보이므로 하단 탭 편집 버튼은 두지 않는다 — 레일로 접으면 다시 보인다.)
 *   위쪽 버튼으로 레일로 접는다 — 접은 상태는 기기에 기억한다(`localStorage`). 키 낮은 가로 폰은 사이드바가 아니라 레일.
 *
 * 둘 다 **CSS 로만** 보이고 숨는다(처음 그릴 때 화면 폭을 몰라도 깜빡이지 않게). 폰 폭에서는 둘 다 숨고 하단 탭 바가 그대로다.
 */

type NavItem = NavigationItem;

const COLLAPSED_KEY = "stayops.navCollapsed";
const listeners = new Set<() => void>();

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function setCollapsed(next: boolean) {
  try {
    window.localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
  } catch {
    // 기억 못 해도 이번 화면은 바뀐다.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 사이드바를 레일로 접었는가. 서버 렌더에서는 펼침(기본). */
export function useNavCollapsed(): [boolean, (next: boolean) => void] {
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => false);
  return [collapsed, setCollapsed];
}

const badgeText = (count: number) => (count > 99 ? "99+" : String(count));

export function MobileSideNav({
  activeItem,
  badges,
  editIcon,
  labels,
  locale,
  menuItems,
  onEdit,
  onMenu,
  opsItems,
  opsTitle,
  tabItems,
  userName,
  userRole,
}: {
  activeItem?: string;
  badges: Partial<Record<string, number>>;
  editIcon: ReactNode;
  labels: {
    menu: string;
    edit: string;
    editBottomBar: string;
    notifications: string;
    account: string;
    logout: string;
    collapse: string;
    expand: string;
  };
  locale: Locale;
  /** 사이드바의 전체 메뉴(권한으로 거른 것). */
  menuItems: NavItem[];
  onEdit: () => void;
  onMenu: () => void;
  /** 운영 관리자 구역(권한 없으면 빈 목록). */
  opsItems: NavItem[];
  opsTitle: string;
  /** 레일 — 하단 탭에서 고른 탭(권한으로 거른 것). */
  tabItems: NavItem[];
  userName: string;
  userRole: string;
}) {
  const [collapsed, setNavCollapsed] = useNavCollapsed();
  const notifications = badges.notifications ?? 0;

  const railLink = (item: NavItem) => {
    const Icon = item.icon;
    const active = item.id === activeItem;
    const count = badges[item.id] ?? 0;
    return (
      <Link
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex w-[70px] shrink-0 flex-col items-center gap-1 pb-1.5 pt-1 text-[11px] tracking-[-0.01em]",
          active ? "font-extrabold text-foreground" : "font-semibold text-muted-foreground",
        )}
        href={item.href}
        key={item.id}
      >
        <span
          className={cn(
            "flex h-8 w-[52px] items-center justify-center rounded-full transition-colors",
            active ? "bg-primary/10 text-primary" : "text-muted-foreground",
          )}
        >
          <Icon aria-hidden="true" className="size-[21px]" />
        </span>
        <span className="max-w-full truncate px-0.5">{getNavigationTabLabel(item, locale)}</span>
        {count > 0 && (
          <span className="absolute left-[41px] top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9.5px] font-extrabold text-white ring-2 ring-background">
            {badgeText(count)}
          </span>
        )}
      </Link>
    );
  };

  const sideLink = (item: NavItem) => {
    const Icon = item.icon;
    const active = item.id === activeItem;
    const count = badges[item.id] ?? 0;
    return (
      <Link
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-[38px] shrink-0 items-center gap-[11px] rounded-[11px] px-2.5 text-[13.5px] transition-colors",
          active
            ? "bg-surface font-extrabold text-foreground shadow-[0_1px_2px_rgba(20,32,43,0.08),inset_0_0_0_1px_var(--border)]"
            : "font-semibold text-foreground/80 hover:bg-muted",
        )}
        href={item.href}
        key={item.id}
      >
        <Icon aria-hidden="true" className={cn("size-[18px] shrink-0", active ? "text-primary" : "text-muted-foreground")} />
        <span className="min-w-0 flex-1 truncate">{getNavigationLabel(item, locale)}</span>
        {count > 0 && (
          <span
            className={cn(
              "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 font-mono text-[10.5px] font-extrabold tabular-nums",
              item.id === "notifications" || item.id === "requests"
                ? "bg-rose-500 text-white"
                : "bg-muted text-muted-foreground",
            )}
          >
            {badgeText(count)}
          </span>
        )}
      </Link>
    );
  };

  return (
    <>
      {/* ── 레일: 펼친 폴드 · 태블릿 세로 · 가로 폰. 사이드바를 접었으면 태블릿 가로에서도 레일. ── */}
      <nav
        aria-label={labels.menu}
        data-shell-sidenav=""
        className={cn(
          "relative z-[2] hidden w-[78px] shrink-0 flex-col items-center gap-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0 border-r border-border bg-background pb-[max(14px,env(safe-area-inset-bottom))] pl-[env(safe-area-inset-left)] pt-[max(10px,env(safe-area-inset-top))] fold:flex",
          collapsed ? "tablet:flex" : "tablet:hidden",
        )}
        style={{ boxSizing: "content-box" }}
      >
        <button
          aria-label={labels.menu}
          className="flex size-10 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted"
          onClick={onMenu}
          type="button"
        >
          <svg aria-hidden="true" fill="none" height="19" viewBox="0 0 24 24" width="19">
            <path d="M4 7h16M4 12h11M4 17h16" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
          </svg>
        </button>
        <button
          aria-label={labels.editBottomBar}
          className="mb-3 mt-1 flex size-[50px] items-center justify-center rounded-[17px] bg-primary text-primary-foreground shadow-[0_8px_16px_-8px_color-mix(in_oklab,var(--primary)_75%,transparent)]"
          onClick={onEdit}
          type="button"
        >
          {editIcon}
        </button>
        {tabItems.map(railLink)}
        <span className="min-h-2 flex-1" />
        <Link
          aria-current={activeItem === "notifications" ? "page" : undefined}
          aria-label={labels.notifications}
          className="relative flex w-[70px] flex-col items-center gap-1 pb-1.5 pt-1 text-[11px] font-semibold text-muted-foreground"
          href="/mobile/notifications"
        >
          <span className="flex h-8 w-[52px] items-center justify-center rounded-full">
            <Bell aria-hidden="true" className="size-[21px]" />
          </span>
          {notifications > 0 && (
            <span className="absolute left-[41px] top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9.5px] font-extrabold text-white ring-2 ring-background">
              {badgeText(notifications)}
            </span>
          )}
        </Link>
        <Link
          aria-label={labels.account}
          className="mt-1 flex size-[34px] items-center justify-center rounded-full bg-primary text-[13px] font-extrabold text-primary-foreground"
          href="/account?mode=mobile"
        >
          {userName.slice(0, 1)}
        </Link>
        {collapsed && (
          <button
            aria-label={labels.expand}
            className="mt-2 hidden size-9 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-muted tablet:flex"
            onClick={() => setNavCollapsed(false)}
            type="button"
          >
            <PanelLeftOpen aria-hidden="true" className="size-[18px]" />
          </button>
        )}
      </nav>

      {/* ── 사이드바: 태블릿 가로. 접으면 위 레일로. ── */}
      <nav
        aria-label={labels.menu}
        data-shell-sidenav=""
        className={cn(
          "relative z-[2] hidden w-[248px] shrink-0 flex-col gap-0.5 border-r border-border bg-background px-3 pb-[max(14px,env(safe-area-inset-bottom))] pt-[max(12px,env(safe-area-inset-top))]",
          collapsed ? "tablet:hidden" : "tablet:flex",
        )}
      >
        <div className="flex items-center gap-2.5 px-2 pb-3 pt-1">
          <Link className="wordmark text-[21px] text-foreground" href="/mobile">
            Stay Ops
          </Link>
          <Link
            aria-label={labels.notifications}
            className="relative ml-auto flex size-[30px] items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-muted"
            href="/mobile/notifications"
          >
            <Bell aria-hidden="true" className="size-[18px]" />
            {notifications > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9.5px] font-extrabold text-white ring-2 ring-background">
                {badgeText(notifications)}
              </span>
            )}
          </Link>
          <button
            aria-label={labels.collapse}
            className="flex size-[30px] items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-muted"
            onClick={() => setNavCollapsed(true)}
            type="button"
          >
            <PanelLeftClose aria-hidden="true" className="size-[17px]" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {menuItems.map(sideLink)}
          {opsItems.length > 0 && (
            <>
              <p className="px-2.5 pb-1 pt-3 text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-muted-foreground/80">
                {opsTitle}
              </p>
              {opsItems.map(sideLink)}
            </>
          )}
        </div>
        <div className="mt-2 flex items-center gap-1 border-t border-border pt-2.5">
          <Link
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[11px] px-2 py-1.5 transition-colors hover:bg-muted"
            href="/account?mode=mobile"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-[12.5px] font-extrabold text-primary-foreground">
              {userName.slice(0, 1)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-extrabold">{userName}</span>
              <span className="block truncate text-[11px] font-semibold text-muted-foreground">{userRole}</span>
            </span>
          </Link>
          <Link
            aria-current={activeItem === mobileNavBugs.id ? "page" : undefined}
            aria-label={getNavigationLabel(mobileNavBugs, locale)}
            className="flex size-9 shrink-0 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-muted"
            href={mobileNavBugs.href}
            title={getNavigationLabel(mobileNavBugs, locale)}
          >
            <mobileNavBugs.icon aria-hidden="true" className="size-4" />
          </Link>
          <form action={signOut} className="shrink-0">
            <button
              aria-label={labels.logout}
              className="flex size-9 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-muted"
              title={labels.logout}
              type="submit"
            >
              <LogOut aria-hidden="true" className="size-4" />
            </button>
          </form>
        </div>
      </nav>
    </>
  );
}
