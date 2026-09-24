"use client";

import { useState } from "react";

import Link from "next/link";
import { ChevronDown, PanelLeft, Search, Settings, Smartphone } from "lucide-react";
import { MobilePreview } from "@/components/shell/mobile-preview";
import "@/components/admin/admin-console.css";
import { NotificationBell } from "@/components/admin/notification-bell";
import { useSession } from "@/components/providers/session-provider";
import {
  adminNavigation,
  adminNavGroupOf,
  adminNavGroupOrder,
  getNavigationLabel,
  navigationCapability,
  type AdminNavGroupKey,
} from "@/config/navigation";
import { getDictionary } from "@/lib/i18n";

type AdminShellProps = {
  activeItem?: (typeof adminNavigation)[number]["id"];
  children: React.ReactNode;
  mobileHref?: string;
  title: string;
};

export function AdminShell({ activeItem, children, mobileHref = "/mobile", title }: AdminShellProps) {
  const { session } = useSession();
  // 훅은 조기 반환보다 앞에 와야 한다(세션이 없으면 아래에서 null 을 돌려준다).
  const [previewOpen, setPreviewOpen] = useState(false);
  if (!session) {
    return null;
  }

  const role = session.user.role;
  const capabilities = session.capabilities ?? [];
  const locale = session.user.preferredLanguage;
  const dictionary = getDictionary(locale);
  const c = dictionary.admin.console;
  const orgName = session.organization.name;
  const userName = session.user.name ?? "";
  const settingsItem = adminNavigation.find((item) => item.id === "settings");
  const settingsLabel = settingsItem ? getNavigationLabel(settingsItem, locale) : c.account;

  const groupLabel: Record<AdminNavGroupKey, string> = {
    operations: c.navGroupOps,
    people: c.navGroupPeople,
    info: c.navGroupInfo,
    ops: c.navGroupOpsAdmin,
  };

  return (
    <main className="adm">
      <div className="app">
        {/*
         * 사이드바 접힘 상태를 **그리기 전에** 적용한다.
         *
         * React 상태로 들고 `useEffect` 에서 localStorage 를 읽으면, 서버가 그린 펼친
         * 사이드바가 먼저 칠해지고 그다음 줄어든다 — admin 은 페이지 이동마다 서버 렌더라
         * **화면을 옮길 때마다 레이아웃이 한 번씩 튄다.**
         *
         * 이 스크립트는 사이드바 마크업보다 앞서 파싱되므로 튀는 순간이 없다. 상태는 뿌리
         * 속성 하나(`data-adm-side`)에만 두고 **보이는 것은 전부 CSS 가 판단한다** —
         * 그래서 hydration 불일치가 생길 여지 자체가 없다(React 는 이 값을 모른다).
         */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('stayops.adm.side')==='rail')" +
              "document.documentElement.setAttribute('data-adm-side','rail')}catch(e){}",
          }}
        />

        {/* ── Sidebar (warm espresso rail) ── */}
        <aside className="side">
          <Link className="side__brand" href="/admin">
            <span className="side__mark" aria-hidden="true" />
            <span style={{ minWidth: 0 }}>
              <span className="side__wm">Stay Ops</span>
              <span className="side__role" style={{ display: "block" }}>{c.brandRole}</span>
            </span>
          </Link>

          {/* 접기/펴기. 기기에 기억된다.
              접어 두면 아이콘만 남고 **마우스를 올릴 때만** 이름이 펼쳐진다 — 자주 이동하는
              사람은 펴 두고, 판매 캘린더처럼 가로로 빽빽한 화면을 오래 보는 사람은 접어 둔다. */}
          <button
            aria-label={c.sideToggle}
            className="side__fold"
            onClick={() => {
              const root = document.documentElement;
              const rail = root.getAttribute("data-adm-side") === "rail";
              if (rail) root.removeAttribute("data-adm-side");
              else root.setAttribute("data-adm-side", "rail");
              try {
                localStorage.setItem("stayops.adm.side", rail ? "wide" : "rail");
              } catch {
                // 저장이 막힌 브라우저(사생활 보호 모드 등)에서도 접는 것 자체는 된다.
              }
            }}
            title={c.sideToggle}
            type="button"
          >
            <span className="ic"><PanelLeft /></span>
          </button>

          <div className="orgsw">
            <Link className="orgsw__btn" href="/admin/settings/organization" aria-label={c.orgSwitch}>
              <span className="orgsw__logo">{orgName.slice(0, 1)}</span>
              <span style={{ minWidth: 0 }}>
                <span className="orgsw__nm">{orgName}</span>
                <span className="orgsw__mt">{dictionary.roles[role]}</span>
              </span>
              <span className="ic orgsw__chev"><ChevronDown /></span>
            </Link>
          </div>

          <div className="side__scroll">
            {adminNavGroupOrder.map((groupKey) => {
              const items = adminNavigation.filter((item) => {
                if ((adminNavGroupOf[item.id] ?? "operations") !== groupKey) return false;
                // 권한 키가 붙은 메뉴는 그 권한을 가진 사람에게만 보인다. 판정은 서버가 이미
                // 끝냈고(`session.capabilities`) 여기서는 목록을 볼 뿐이다 — 클라이언트가 다시
                // 계산하면 그 순간 규칙이 두 벌이 된다.
                //
                // 이건 UX 다. 실제 차단은 페이지·서버 액션·RLS 가 한다.
                const capability = navigationCapability(item);
                return !capability || capabilities.includes(capability);
              });
              if (items.length === 0) return null;
              return (
                <div className="navgrp" key={groupKey}>
                  <div className="navgrp__t">{groupLabel[groupKey]}</div>
                  {items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        className={`navi${item.id === activeItem ? " on" : ""}`}
                        href={item.href}
                        key={item.id}
                      >
                        <span className="ic"><Icon /></span>
                        <span className="navi__t">{getNavigationLabel(item, locale)}</span>
                      </Link>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </aside>

        {/* ── Main ── */}
        <section className="main">
          <header className="top">
            <div className="top__title">
              <div className="top__crumb">{orgName} · {c.crumbOps}</div>
              <div className="top__h">{title}</div>
            </div>
            <div className="search">
              <span className="ic"><Search /></span>
              <input placeholder={c.searchPlaceholder} type="search" />
              <kbd>⌘K</kbd>
            </div>
            <div className="top__actions">
              {/* 전체 화면으로 넘어가는 대신 아이폰 모양 프레임으로 띄운다 — 어드민에서 일하는
                  중에 보는 것이라 화면을 떠나지 않는 편이 낫다. 전체 화면으로 가는 길은
                  미리보기 안의 「새 탭에서 열기」로 남겨 뒀다. */}
              <button
                type="button"
                className="top__mobbtn"
                onClick={() => setPreviewOpen(true)}
              >
                <span className="ic"><Smartphone /></span>
                {c.mobileView}
              </button>
              <NotificationBell
                labels={{
                  title: c.notifications,
                  markAll: c.notifMarkAll,
                  viewAll: c.notifViewAll,
                  empty: c.notifEmpty,
                }}
              />
              <Link className="tbtn" href="/admin/settings" aria-label={settingsLabel}>
                <span className="ic"><Settings /></span>
              </Link>
              <Link className="top__av" href="/account?mode=admin" aria-label={c.account}>
                {userName.slice(0, 1) || "·"}
              </Link>
            </div>
          </header>

          <div className="content">
            <div className="cwrap">{children}</div>
          </div>
        </section>
      </div>

      {previewOpen && (
        <MobilePreview
          href={mobileHref}
          labels={{
            title: c.mobilePreviewTitle,
            close: c.mobilePreviewClose,
          }}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </main>
  );
}
