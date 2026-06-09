# Mobile Navigation

## Purpose

The mobile/PWA field interface should be optimized for fast daily work by on-site staff, field managers, regular staff, and part-time staff.

## Confirmed Bottom Tabs

The bottom bar uses a **center-action ("추가") button** design: four tabs split 2 / 2 around a raised central FAB.

```txt
Home   Calendar   [ ✎ 편집 (center FAB) ]   Requests   Announcements
```

- **The four side tabs are per-user customizable.** Each user picks which features sit in their bottom bar (all four slots are free to change). The chosen ids are persisted per user in `profiles.bottom_nav_tabs` (Supabase) and synced across devices. Defaults: Home, Calendar, Requests, Announcements.
- **The center FAB ("편집", pencil icon) opens the bottom-bar editor sheet**: a dark scrim + slide-up sheet with a 2-column colour-category tile grid listing every selectable feature (`customizableBottomNavItems` = the side-menu pool: Home, Calendar, Cleaning, Requests, Announcements, Notifications, Directory). Tapping a tile adds/removes it from the bottom bar (max 4; a counter `n/4` and a "full" hint are shown; at least one tab must remain). Each tile uses a unified palette (`oklch` with fixed lightness/chroma, hue-only variation per `LAUNCHER_META`) and shows a check when selected. The grid scrolls vertically when it overflows, with the scrollbar hidden (`.add-sheet__scroll`). Edits are saved (via the `updateBottomNavTabs` server action) when the sheet closes by any path (scrim tap / X / Escape).
- **Cleaning** is not a default bottom tab but can be pinned via the editor; it is also always reachable from the side menu (`/mobile/cleaning`).
- Profile and user directory remain accessible from the top-right profile button / side menu rather than the bottom bar (Directory may also be pinned).

Implementation note:

- The mobile navigation contract is implemented in `src/config/navigation.ts`.
- The initial mobile shell is implemented in `src/components/shell/mobile-shell.tsx`.
- Any future mobile screen should reuse this navigation contract instead of redefining tabs locally.
- Navigation labels are localized through `src/lib/i18n.ts` and `src/config/navigation.ts`.

Bottom-bar labels (left 2 / center FAB / right 2):

```txt
ko:  홈    캘린더    [ ✎ 편집 ]    요청    공지
ja:  ホーム カレンダー [ ✎ 編集 ]   リクエスト お知らせ
en:  Home  Calendar  [ ✎ Edit ]    Requests  Announcements
```

Cleaning (청소 / 清掃 / Cleaning) is reached from the side menu, not the bottom bar.
## Tab Responsibilities

## Home

Purpose:

- Show today's most important operational information and quick actions.

Home should include:

- Active cleaning timer if running
- Important announcements
- Today check-in/check-out summary
- Quick action buttons
- Today's my activity records
- Access to My Profile
- Access to User Directory

Quick actions:

- Start cleaning
- Register maintenance issue
- Register lost item
- Create order request

Recommended display order:

```txt
1. Active cleaning timer
2. Important/popup announcements
3. Today check-in/check-out summary
4. Quick action buttons
5. Today's my activity records
```

Today's my activity records:

- Automatically created from user actions.
- Cleaning start records are added automatically.
- Cleaning completion records are added automatically.
- Other user-created records, such as maintenance/lost item/order request, can also appear if useful.
- This is not a separate manual todo list in the MVP.

## Calendar

Purpose:

- Show reservation and availability information from Beds24.

Includes:

- Building picker entry screen before a property-specific calendar is opened
- Monthly reservation calendar
- Today check-in
- Today check-out
- Staying today
- Empty today
- Earliest empty availability list

Current entry behavior:

- Opening the Calendar tab without a `property` query shows a cute building picker grid first.
- Selecting a building navigates to `/mobile/calendar?month=YYYY-MM&property=<building>`.
- Okubo properties use a detached-house icon; all other properties use a hotel/building icon.
- The old horizontal building chip row is removed from the calendar screen. A compact selected-building card with `Change building` returns to the picker.

## Cleaning

Purpose:

- Manage cleaning execution.

Includes:

- Select room/property from today's check-out list
- Search room/property as secondary method
- Start cleaning
- Complete cleaning
- Active timer
- Cleaning history
- Report lost item from cleaning
- Report maintenance issue from cleaning

## Requests

Purpose:

- Central place for operational reports and requests.

Includes:

- Maintenance requests
- Lost and found
- Order/supply requests

List visibility:

- All users can create and view maintenance requests.
- All users can create and view lost item records.
- All users can create and view order requests.
- Users should also have a "My registrations" view for records they created.
- The Requests mobile list exposes a dedicated **"내 요청" (mine) toggle switch** in the filter row (`role="switch"`, `scope` query `mine`/`all`). This replaces the old scope option inside the filter sheet.
  - `All` (default): all visible records in the organization scope
  - `My registrations` (toggle on): records created by the current user only
- The mine toggle applies consistently across maintenance, lost and found, and order request list views.

List layout (`src/components/requests/requests-filter-view.tsx`):

- **Filter row**: `[필터 버튼] · [내 요청 토글] · [총 N건 카운트(ml-auto)]`.
- **Open count ("총 N건")**: counts only records in **active/open status** for the current tab + mine scope (lost-found active, maintenance `open`/`in_progress`, order `requested`/`approved`/`ordered`). Completed/closed records are excluded, so the number drops as work is closed. Completed records still appear as cards (e.g. under earlier date groups).
- **Date groups**: visible records are split into **Today / Yesterday / Earlier** (`오늘/어제/이전`) by the Tokyo operating date of each record (lost `found_at`, maintenance/order `created_at`). Empty groups are not rendered. Group labels: `dictionary.mobile.groupToday/groupYesterday/groupEarlier`.

Status change permission:

- Part-time Staff cannot change request statuses.
- Staff and above can change request statuses according to module rules.
- Order request approval/rejection/ordered status is limited to office-level roles.

Edit/delete permission:

- Users can edit/delete records they created.
- Part-time Staff can only edit/delete their own records.
- Delete is a hard delete in MVP.
- Show confirmation popup before deleting.

Requests can be created from:

- Requests tab directly
- Home quick actions
- Active cleaning timer shortcuts

If a lost item or maintenance request is created from an active cleaning timer, it should still appear in the Requests tab lists.

## Announcements

Purpose:

- Read company notices and participate in comments.

Includes:

- Announcement list
- Important announcements
- Pinned announcements
- Comments
- Read tracking

## Global Mobile Shell (current contract)

All mobile screens share one shell rendered by `MobileShell`:

```txt
[two-line hamburger]  Stay Ops wordmark  [Profile]
```

Implementation: `src/components/shell/mobile-shell.tsx`.

Current rules:

- **Base surface**: the mobile shell and page background use a pure-white `bg-background` base. The shell itself is not a full-screen glass surface.
- **Left**: a hamburger menu button (3-line SVG with a shorter middle line) opens the mobile side menu. `aria-label` uses `dictionary.common.menu`.
- **Layout**: the header is a 3-part `justify-between` row — left menu button / centered wordmark / right profile button.
- **Center**: the `Stay Ops` wordmark (20px, `text-foreground`, `white-space: nowrap`) uses the shared `.wordmark` class (serif italic — Noto Serif, defined in `src/app/globals.css` and loaded in `src/app/layout.tsx`).
- **Top chrome surface**: the header bar is flat/borderless — no capsule outline, ring, glass blur, or shadow. Only the two circular buttons (menu / profile) and the centered wordmark sit on the plain white background.
- **Buttons**: both the left menu and right profile buttons are 38px circles with `bg-muted text-muted-foreground` (hover darkens via `color-mix`). The menu icon is a 3-line SVG with a shorter middle line; the profile icon is a person SVG.
- **Right**: the profile button links to `/account?mode=mobile`. `aria-label` uses `dictionary.onboarding.profileTitle`.
- **Scroll behavior**: the top chrome hides when users scroll down and returns when users scroll up. The content area fills the freed space so no blank header gap remains.
- **Side menu**: tapping the menu button opens a left slide-out menu at roughly 78% of the mobile viewport width. The main screen moves right with a dark overlay (`bg-slate-950/42`) on the remaining visible area. Closing reverses the slide. Layout top→bottom:
  - **Account card** (links to `/account?mode=mobile`): rounded `border-border bg-surface` card with a `bg-primary/10 text-primary` avatar tile, the user's name, an `dictionary.common.account` label + a role chip (`bg-primary/10 text-primary` showing `dictionary.roles[role]`), and a trailing `ChevronRight`.
  - **Nav list** ("high-quality list" style) under a `dictionary.common.menu` section heading. Each item is a 48px row: a left **teal active bar** (`absolute left-0 h-5 w-[3px] bg-primary`) on the active row, a bare line icon (`size-[22px]`), the label, and an optional **count badge** on the right. Active → `bg-primary/[0.09]`, icon/label `text-primary` (label bold); inactive → `hover:bg-muted/55`, icon `text-muted-foreground`, label `text-foreground/80`. Active item also gets `aria-current="page"`.
  - **Count badge**: shown when `badges[item.id] > 0`. Pill (`h-[21px] min-w-[21px]`, `font-mono tabular-nums`), `bg-primary text-primary-foreground` on the active row, `bg-muted text-muted-foreground` otherwise; values over 99 render as `99+`.
  - **Footer**: a `border-border bg-surface` row with an account-settings link (left) and a **logout** button (right, `dictionary.common.logout`, posts to the `signOut` server action via `<form action={signOut}>`).
  - The side menu lists Cleaning (in addition to the bottom-bar tabs) since Cleaning is not a bottom tab.
- **Bottom navigation**: a bottom-attached `bg-surface` bar (`.tabbar` in `src/app/globals.css`) with rounded top corners (`border-radius: 22px 22px 0 0`) and a soft top shadow. Layout is four tabs split 2 / 2 around a raised central FAB. Active color `var(--primary)`, inactive `var(--muted-foreground)`. The bottom bar renders the user's customized tabs via `resolveBottomNavItems(session.user.bottomNavTabs)`, split left/right around the center FAB. The center FAB is a 50px `var(--primary)` circle raised above the bar (`margin-top: -34px`, 4px `var(--surface)` border + shadow) labelled `dictionary.common.editBottomBar` ("하단바 편집") with a pencil icon; tapping it opens the bottom-bar editor sheet (`createOpen` state) where the user toggles which features (max 4) appear. Edits persist to `profiles.bottom_nav_tabs` on close. `env(safe-area-inset-bottom)` padding handles the iOS home indicator.
- **Accessibility**: the `title` prop on `MobileShell` is used as `aria-label` on `<main>`. It is not rendered visually in the header. Page content provides its own visual hierarchy.
- **Appearance prop**: `appearance` remains accepted for compatibility but currently does not change shell visuals. Do not rely on it for page tinting.
- `ModeSwitcher` and `Bell` icon are not part of the shell header. (There is no theme switcher: the app is light-mode-only; dark mode is deferred until post-launch.)

### Side-menu operational badge counts

The side-menu nav rows can show an unprocessed-work count badge. Counts are computed server-side by `getMobileNavBadges()` (`src/lib/nav-badges.ts`) and passed into `MobileShell` via the `badges` prop (keyed by nav id). Each mobile page fetches them with `const navBadges = await getMobileNavBadges()` and renders `<MobileShell badges={navBadges} ...>`.

Current count definitions (org-scoped, RLS-enforced; each fails closed to 0 so a missing table/migration never breaks the shell):

| Nav id | Counts |
|---|---|
| `cleaning` | `cleaning_sessions` with `status = in_progress` |
| `requests` | `maintenance_reports` (`open`/`in_progress`) + `order_requests` (`requested`) + `lost_items` (`registered`) |
| `announcements` | published announcements the user has not read (`announcement_reads`) |
| `notifications` | unread notifications (`read_at is null`) — via `countUnreadNotifications` |

Counts refresh on navigation and on pull-to-refresh (`router.refresh()`); these are advisory UI hints only — access control stays in RLS + server queries. Real-time updates (Supabase Realtime) are out of scope for this slice.

## Design Notes

- Bottom tabs should use clear, premium line icons from `src/config/navigation.ts`.
- Labels must fit Korean, Japanese, and English.
- Home quick actions should be large enough for field use.
- Avoid hiding maintenance/lost item/order request too deeply because these are high-frequency actions.
- Do not add per-page controls, titles, breadcrumbs, or secondary icons to the shared top chrome unless explicitly decided.
- Liquid Glass is selective: floating bottom navigation, bottom sheets, cards, chips, and overlays may use it; the global mobile background should remain solid and readable.

## 2026-05-22 Header Consistency Note

- Header visual style is shared across all `MobileShell` pages.
- Announcement pages (`/mobile/announcements`, `/mobile/announcements/[id]`) and popup modal follow the same top-header and surface hierarchy rule with no page-level header overrides.

## 2026-05-28 Mobile Shell Interaction Update

- The top menu icon is now a custom two-line hamburger icon with a shorter bottom line.
- The menu opens a 78%-width left side menu with slide animation, main-screen push, and right-side dim overlay.
- The top header is scroll-aware: scroll down hides it, scroll up restores it.
- The bottom tab bar is a floating liquid-glass capsule overlay, not a full-width rectangular footer.
- The mobile base background is pure white. Liquid Glass is partial and should not be applied to every shell surface.

## 2026-05-22 Calendar Slice Update

- `/mobile/calendar` route is now implemented as the Phase 10 baseline mobile calendar surface.
- Current behavior:
  - Reads `public.reservations` by the signed-in organization.
  - Excludes `cancelled` reservations.
  - Shows today summary counters and a month-overlap reservation list.
- The 14-day room timeline (Overview), lists mode, map tab, building picker, and month navigation are all fully implemented. See subsequent calendar update notes below.

## 2026-05-23 Calendar Tab UX Update

- Calendar tab interaction on `/mobile/calendar` now keeps a consistent three-mode selector:
  - `Calendar`: overview timeline
  - `Lists`: operational list view
  - `Map`: operational building access hub
- `Map` is now active and provides building cards, map links, and access-info entry points.
- This update does not change the global `MobileShell` contract.

## 2026-05-27 Calendar Tab Status Refresh

- `/mobile/calendar` Map tab is no longer placeholder behavior.
- Property filter chips are hidden in Map mode and shown only in Calendar/Lists modes.
- The global shell contract remains fixed: `[two-line hamburger] StayOps [Profile]`, scroll-aware top chrome, slide-out side menu, and floating capsule bottom tabs.

## 2026-06-08 Side Menu Design Update — Teal Minimal

- Side menu nav items replaced from "dark slate pill + icon badge" to "teal tint + bare line icon + right teal dot":
  - Active: `bg-primary/10 text-primary`, right-side `size-1.5 rounded-full bg-primary` dot.
  - Inactive: `text-muted-foreground`, hover `bg-muted/60 text-foreground`.
  - Icons: bare `size-5` line icons; icon badge box removed.
  - Font: `font-semibold` (was `font-bold`).
  - `aria-current="page"` added to active item for accessibility.
- Account card, close button, footer link: border/background/text all converted to design tokens (`border-border`, `bg-surface`, `text-foreground`, `text-muted-foreground`).
- All remaining `text-slate-*` in the shell converted to tokens; `bg-slate-950/42` scrim overlay retained (intentional dark overlay).
- Wordmark color in all three locations (header, side-menu header, admin sidebar) unified to `text-foreground`.

## 2026-06-08 Side Menu — High-Quality List + Operational Counts

- Upgraded the teal-minimal side menu to a "high-quality list" layout:
  - **Account card**: avatar tile (`bg-primary/10`) + name + `account` label + **role chip** (`dictionary.roles[role]`) + trailing `ChevronRight`.
  - **Nav rows** (48px) under a `menu` section heading, with a **left teal active bar** (`absolute left-0 h-5 w-[3px] bg-primary`), `size-[22px]` line icon, label, and optional **count badge** (`bg-primary text-primary-foreground` active / `bg-muted text-muted-foreground` inactive, `99+` cap, `font-mono tabular-nums`).
  - **Footer row**: account-settings link + **logout** button (`<form action={signOut}>` → `dictionary.common.logout`).
- `MobileShell` gained a `badges?: Partial<Record<string, number>>` prop (nav id → unprocessed count).
- New server helper `getMobileNavBadges()` (`src/lib/nav-badges.ts`, `cache()`-wrapped) computes org-scoped counts: cleaning (`in_progress`), requests (maintenance open/in_progress + orders requested + lost registered), announcements (unread), notifications (unread). All counts fail closed to 0.
- All 14 mobile pages that render `MobileShell` now fetch and pass `badges={navBadges}`.
- Reuses existing i18n (`common.account`, `common.menu`, `common.logout`, `roles.*`) — no new strings.

## Post-MVP Feature Batch — Navigation (planned, not implemented)

The five approved batch features (2026-06-09) currently have **no mobile nav home**. Before each feature ships, its entry point must be added to `src/config/navigation.ts` and reflected here. Planned placement (to confirm per feature during build):

- **Linen Defect:** likely surfaced under the existing **Requests** tab group (alongside maintenance / lost / order) or as a side-menu entry — not a new bottom tab by default.
- **Personal Todo / Task Inbox:** new side-menu entry, and a candidate for the customizable bottom-tab pool (`customizableBottomNavItems`). Its task calendar must stay visually distinct from the reservation Calendar tab.
- **Staff Suggestions:** side-menu entry.
- **Internal Board:** side-menu entry; candidate for the customizable bottom-tab pool.
- **Attendance:** dedicated clock-in/out surface (likely Home quick-action + side-menu entry); QR/GPS flow is PWA-specific.

When any of these is added to the bottom-tab pool or side menu, also update the side-menu badge table and `getMobileNavBadges()` if the feature carries an unprocessed count. New nav labels require ko/ja/en i18n keys.
