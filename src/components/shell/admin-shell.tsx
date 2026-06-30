"use client";

import Link from "next/link";
import { ChevronDown, Search, Settings, Smartphone } from "lucide-react";
import "@/components/admin/admin-console.css";
import { NotificationBell } from "@/components/admin/notification-bell";
import { useSession } from "@/components/providers/session-provider";
import {
  adminNavigation,
  adminNavGroupOf,
  adminNavGroupOrder,
  getNavigationLabel,
  type AdminNavGroupKey,
} from "@/config/navigation";
import { getDictionary } from "@/lib/i18n";

type AdminShellProps = {
  activeItem?: (typeof adminNavigation)[number]["id"];
  children: React.ReactNode;
  title: string;
};

export function AdminShell({ activeItem, children, title }: AdminShellProps) {
  const { session } = useSession();
  if (!session) {
    return null;
  }

  const role = session.user.role;
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
  };

  return (
    <main className="adm">
      <div className="app">
        {/* ── Sidebar (warm espresso rail) ── */}
        <aside className="side">
          <Link className="side__brand" href="/admin">
            <span className="side__mark" aria-hidden="true" />
            <span style={{ minWidth: 0 }}>
              <span className="side__wm">Stay Ops</span>
              <span className="side__role" style={{ display: "block" }}>{c.brandRole}</span>
            </span>
          </Link>

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
              const items = adminNavigation.filter(
                (item) => (adminNavGroupOf[item.id] ?? "operations") === groupKey,
              );
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
                        <span>{getNavigationLabel(item, locale)}</span>
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
              <Link className="top__mobbtn" href="/mobile">
                <span className="ic"><Smartphone /></span>
                {c.mobileView}
              </Link>
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
    </main>
  );
}
