# Mobile Navigation

## Purpose

The mobile/PWA field interface should be optimized for fast daily work by on-site staff, field managers, regular staff, and part-time staff.

## Entry Routing Contract

The product must not show a public root-level version chooser such as:

- "Go to dashboard"
- "Go to mobile version"

Confirmed routing direction:

- **Desktop / PC** access should go directly to the dashboard/web side
- **Mobile / tablet** access should go directly to the mobile side (`/mobile`)
- If the dashboard later offers a way to open the mobile version, that belongs **inside the dashboard**
  after login, not on the root landing page

This means any temporary/manual entry chooser screen is a development artifact and must not remain in
the real product flow.

## Confirmed Bottom Tabs

The bottom bar uses a **center-action ("추가") button** design: four tabs split 2 / 2 around a raised central FAB.

```txt
Home   Calendar   [ ✎ 편집 (center FAB) ]   Requests   Announcements
```

- **The four side tabs are per-user customizable.** Each user picks which features sit in their bottom bar (all four slots are free to change). The chosen ids are persisted per user in `profiles.bottom_nav_tabs` (Supabase) and synced across devices. Defaults: Home, Calendar, Requests, Announcements.
- **The center FAB ("편집", squircle button with an app-grid icon) opens the bottom-bar editor sheet**: a dark scrim + slide-up sheet with a 2-column colour-category tile grid listing every selectable feature (`customizableBottomNavItems` = the side-menu pool: Home, Calendar, Cleaning, Tasks, Suggestions, Attendance, Requests, Announcements, Directory, Linen Return). Tapping a tile adds/removes it from the bottom bar (max 4; a counter `n/4` and a "full" hint are shown; at least one tab must remain). Each tile uses a unified palette (`oklch` with fixed lightness/chroma, hue-only variation per `LAUNCHER_META`) and shows a check when selected. The grid scrolls vertically when it overflows, with the scrollbar hidden (`.add-sheet__scroll`). Edits are saved (via the `updateBottomNavTabs` server action) when the sheet closes by any path (drag-down / scrim tap / Escape).
- **Cleaning** is not a default bottom tab but can be pinned via the editor; it is also always reachable from the side menu (`/mobile/cleaning`).
- Profile and user directory remain accessible from the top-right profile button / side menu rather than the bottom bar (Directory may also be pinned).
- **Tasks** (`할 일` / `タスク` / `Tasks`, id `tasks`, `/mobile/tasks`) is a side-menu entry + pinnable bottom-bar candidate. Internal chip-tab views (Today default · Tomorrow · Inbox(관리함) · **프로젝트** · Sent(공유함) · Completed(완료/기록) · Calendar); quick add + detailed create (`/new`), task detail (`/[id]`), core edit (`/[id]/edit`). Personal-by-default with shared participant tasks; task calendar is separate from the reservation calendar. 프로젝트 탭은 기능 구현 완료(2026-06-15, 첫 슬라이스); 마이그레이션 `202606150002_projects.sql` 적용 필요. See `docs/product/18-todo-task-workflow.md` and `docs/product/23-project-workflow.md`.
- **Suggestions / Feedback Box** (`제안함` / `提案箱` / `Suggestions`, id `suggestions`, `/mobile/suggestions`, `Inbox` icon) is a side-menu entry + pinnable bottom-bar candidate. Screens: list (`보낸/받은/참조` segments + status filter pills), compose (`/new`), and a **role-aware** detail (`/[id]`) — recipient gets the bottom status-change sheet → hold-reason / completion-note sheets, every participant gets the comment composer; the old `/referenced` route now redirects to the list. **Fully wired and shippable as of 2026-06-16 (Steps 1–8):** schema + create + list + participant-only detail + comments + recipient-only status workflow + notifications, all localized ko/ja/en. Two migrations need applying (`202606160001` + `202606160003`). Suggestion notifications use the `suggestion_activity` type and deep-link to the suggestion; they surface once the (separately-deferred) `/mobile/notifications` mockup screen is re-wired. See `docs/product/22-staff-suggestions-workflow.md`.
- **Attendance / 근태** (`근태` / `勤怠` / `Attendance`, id `attendance`, `/mobile/attendance`, `Clock` icon) is a side-menu entry + pinnable bottom-bar candidate. Screens: home ring-hero clock (`/mobile/attendance`, states 출근 전/근무 중/휴게 중), GPS+QR capture (`/mobile/attendance/capture?mode=in|out`), correction request + status (`/mobile/attendance/correction`), **own history (`/mobile/attendance/history`, Step 5)**, and **own monthly pay (`/mobile/attendance/pay`, Step 10)**. **Now functional (Steps 3–10, 2026-06-17/18):** real GPS+QR clock-in/out, break start/end (clock-out blocked while on break), self-scoped history, correction/exception requests, and a self hourly **expected-pay** screen. Admin review + correction approval + manual session management are server-backed (their UI is in the deferred web dashboard). The home topline has small 이력 + 급여 links. Wi-Fi stays `준비중`. The design's own 5-tab bottom bar is intentionally dropped in favor of the app's global bottom nav. Owner-only site/QR admin + admin review/manage UI are deferred to the web dashboard; finalization/dashboard/export/notifications are later steps. See `docs/product/24-attendance-workflow.md` and `docs/product/21-attendance-payroll-workflow.md`.
- **Linen Return** (`린넨 반품` / `リネン返却` / `Linen Return`, id `linen-return`, `/mobile/linen-return`) is a side-menu entry, not a default bottom tab. It can be pinned via the bottom-bar editor (it is part of the customizable pool). Building-first flow: building picker → building list → create / detail / ledger. See `docs/product/19-linen-defect-workflow.md`.

Implementation note:

- The mobile navigation contract is implemented in `src/config/navigation.ts`.
- The initial mobile shell is implemented in `src/components/shell/mobile-shell.tsx`.
- Any future mobile screen should reuse this navigation contract instead of redefining tabs locally.
- Navigation labels are localized through `src/lib/i18n.ts` and `src/config/navigation.ts`.
- **Back navigation = edge swipe (2026-06-15).** Mobile screens no longer render a top-left back
  button. Going back is an **iOS-style left-edge swipe** handled once in `MobileShell` on `<main>`
  (`handleSwipeStart` / `handleSwipeMove` / `handleSwipeEnd` / `handleSwipeCancel`). **Drag feedback
  (simple):** a drag starting within ~30px of the left edge fades in a **soft left-edge gradient
  shadow + a small chevron hint** — the screen itself does NOT move. Intensity tracks the drag
  (near-full ~90px); releasing past ~64px commits `router.back()`, otherwise the gradient fades back
  out. Quick flicks still fire via a fallback fling detector; right-edge swipe → `router.forward()`. Removed the per-screen back arrows from detail/create/edit/list screens
  (linen-return, requests detail for maintenance / lost & found / orders, announcements detail, task
  detail / create / edit, project detail) and the order-create footer "back". New mobile screens should
  rely on the edge-swipe instead of adding a back button. Kept: workflow-return buttons that target a
  specific origin and double as the only escape in an error state (e.g. maintenance / lost & found
  "청소로 돌아가기" → `/mobile/cleaning`), and non-back chevrons (calendar month nav, photo carousel,
  date pickers). Admin web keeps its back buttons (no touch swipe on desktop).
- **`hideBottomNav` (2026-06-15):** `MobileShell` accepts an opt-in `hideBottomNav` prop (default
  `false`) that hides the bottom tab bar for focused **registration / create-edit** flows, so the
  screen reads as a dedicated form (and a sticky submit bar can't overlap the tab bar). Applied to the
  Requests-feature create pages — maintenance (`/mobile/maintenance/new`), lost & found
  (`/mobile/lost-found/new`), order request (`/mobile/orders/new`, also `/mobile/requests/orders/new`)
  — and linen-return create/edit. When set, the content's bottom padding shrinks since there is no tab
  bar to clear; every feature is still reachable from the side menu. Use sparingly — the default
  tabbed shell remains the norm.

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

### Design (Haru Ops home redesign, 2026-06-17)

The home screen was fully re-skinned to the "Haru Ops · 홈 (빠른 출근)" / v2 design.
All previous functionality is preserved; only the layout/visual style changed.

- Scoped styles live in `src/components/mobile/home-screen.css` (every selector is
  prefixed with `.hm` so it never leaks into other screens). The page markup is in
  `src/app/mobile/page.tsx` and still does all server-side data fetching.
- The warm ivory chrome contract is unchanged: cards/sheets stay cream/white, the
  brand accent stays deep ink navy.

3D hero image:

- The design's top **3D hero image** (a wireframe orb/sphere) is **intentionally not
  used** on the live home for now. The asset is preserved at
  `src/assets/home-hero-3d.svg` (do not delete) so the 3D hero can be re-enabled later.
- The previous Lottie top hero (`HomeHeroAnimation` + `src/assets/home-hero-top-v2.json`)
  is no longer rendered on the home but remains in the repo for possible reuse.

Home includes (top → bottom):

1. **Greeting** — Tokyo-dated line + "{name} 님, 안녕하세요" + avatar initial.
2. **Last updated** — auto-refreshing JST `HH:MM` clock.
3. **Quick clock-in hero** — static "출근 전 / 대기" card with a 출근 button and
   `GPS+QR` / `Wi-Fi 준비중` method chips. Tapping the card opens `/mobile/attendance`.
   (Clock-in/out backend is deferred; this is a navigation entry only for now.)
4. **Important announcement** — only the latest important announcement, links to its detail.
5. **오늘 현황** — today check-in / check-out counts. **Each count card is tappable**:
   it opens a bottom sheet listing that day's reservations (guest name · localized
   building·room · channel/source), drag-to-dismiss like the app's other sheets.
   Data: `getHomeCheckInOutReservations` (`src/lib/home.ts`) — today's reservations
   (Tokyo operating day, cancelled/no-show excluded); the sheet UI is
   `src/components/mobile/home-checkinout.tsx`. Empty state per direction.
   **Room-label mapping (2026-06-18):** the building·room label is resolved through the
   **same canonical + display path as the reservation calendar** (room catalog +
   `resolveReservationCanonicalRoomLabel` + `getDisplayRoomLabel`), so 2-account rooms
   (e.g. `501`/`501_2`, `803#`/`K803`) collapse to one display label and unmapped/inactive
   rooms drop (authoritative). The count = the resolved list length, so it tracks the
   calendar's active-room axis. See `docs/product/15-reservation-calendar.md` → 2026-06-18.
6. **진행 중 작업** — active cleaning task card (room/label + live elapsed timer), or a plain
   "진행 중인 작업 없음" empty card. (The empty-state "청소 시작하기" CTA was removed 2026-06-17 —
   the cleaning shortcut already lives in 빠른 실행, so the CTA was redundant.)
7. **빠른 실행** — quick-action grid. Four existing actions only: 청소, 정비, 분실물, 주문.
   (Clock-in is intentionally **not** duplicated here — it already lives in the hero above.)
8. **오늘 기록** — today's activity records, rendered as a log-style card. The empty state is a
   plain "오늘 기록이 없습니다" message (the cleaning-specific "첫 청소 시작하기" CTA was removed
   2026-06-17 — this feed is meant to log ANY user action, not just cleaning).
   **Currently recorded** (`getHomeTodayActivity`): cleaning completion (`cleaning_sessions`),
   maintenance report (`maintenance_reports`), lost-item report (`lost_items`), **비품 주문 / order
   request (`order_requests`)** and **린넨 반품 / linen return (`linen_return_records`)** — the last two
   added 2026-06-17.
   **Still not recorded** (by product choice for now): 제안함 (staff suggestions), 할일 (tasks),
   cleaning *start* (only completion logs today), attendance.

Quick actions (unchanged set):

- Start cleaning (`/mobile/cleaning`)
- Register maintenance issue (`/mobile/maintenance/new`)
- Register lost item (`/mobile/lost-found/new`)
- Create order request (`/mobile/orders/new`)

Today's activity records:

- Automatically created from user actions.
- Cleaning start records are added automatically.
- Cleaning completion records are added automatically.
- Other user-created records, such as maintenance/lost item/order request, can also appear if useful.
- This is not a separate manual todo list in the MVP.

Access to My Profile and the User Directory remains via the side menu (unchanged).

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
- **Toggle label per tab (2026-06-15)**: the scope toggle text is tab-dependent — 분실물
  (lost-found) keeps **"내 등록"** (`filterScopeMine`), while 수리요청 (maintenance) and 비품주문
  (order) show **"내 요청"** (`filterScopeMineRequest`, ko "내 요청" / ja "自分の依頼" / en "My
  requests"). Same `scope` behavior; label only.

List layout (`src/components/requests/requests-filter-view.tsx`):

- **Filter row**: `[필터 버튼] · [내 요청/내 등록 토글] · (비품주문 탭) [배송 캘린더 아이콘] · [총 N건 카운트(ml-auto)]`.
- **Delivery calendar icon (2026-06-15)**: a high-quality calendar icon button sits next to the scope
  toggle **on the 비품주문 (order) tab only — it does NOT appear on the 수리요청 or 분실물 tabs**
  (only order requests carry a delivery date). Tapping it opens a **popup (centered modal) with a large
  month calendar** (`OrderDeliveryCalendar`) of order deliveries, derived from
  `order_requests.delivery_date` (auto-shown when an admin sets it, auto-updated on edit; respects the
  전체/내 요청 scope). Day tap → that day's deliveries, each linking to the order detail. Full spec:
  Order Request Workflow doc → "Delivery Calendar (Implemented — 2026-06-15)".
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

- **Base surface**: the mobile shell, sidebar, bottom bar, and page background use a warm **ivory** `bg-background` base; cards/sheets stay white (`bg-surface`). The brand accent (`--primary`) is deep ink **navy/indigo** (teal/green retired). The shell itself is not a full-screen glass surface.
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
- **Bottom navigation**: a bottom-attached `bg-surface` bar (`.tabbar` in `src/app/globals.css`) with rounded top corners (`border-radius: 22px 22px 0 0`) and a soft top shadow. Layout is four tabs split 2 / 2 around a raised central FAB. Active color `var(--primary)`, inactive `var(--muted-foreground)`. The bottom bar renders the user's customized tabs via `resolveBottomNavItems(session.user.bottomNavTabs)`, split left/right around the center FAB. The center FAB is a 52px **squircle** (rounded square, `border-radius: 17px`) with a navy gradient (`linear-gradient(160deg, hsl(223 50% 42%), hsl(223 54% 22%))`), raised above the bar (`margin-top: -26px`, 4px ivory border + shadow) per the "Bottom Bar (Squircle Edit)" design, labelled `dictionary.common.editBottomBar` ("하단바 편집") with an **app-grid icon** (2×2 squares); tapping it opens the bottom-bar editor sheet (`createOpen` state) where the user toggles which features (max 4) appear. Each toggle tile (`.add-tile`, `border-radius: 16px`) draws its border with an **inset `box-shadow`** (selected → `inset 0 0 0 2px var(--primary)`, unselected → `inset 0 0 0 1px var(--border)`), not `outline` — `outline` does not follow the tile's rounded corners on mobile WebKit and left the borders looking broken. Edits persist to `profiles.bottom_nav_tabs` on close. `env(safe-area-inset-bottom)` padding handles the iOS home indicator.
- **Accessibility**: the `title` prop on `MobileShell` is used as `aria-label` on `<main>`. It is not rendered visually in the header. Page content provides its own visual hierarchy.
- **Appearance prop**: `appearance` remains accepted for compatibility but currently does not change shell visuals. Do not rely on it for page tinting.
- `ModeSwitcher` and `Bell` icon are not part of the shell header. (There is no theme switcher: the app is light-mode-only; dark mode is deferred until post-launch.)

### Side-menu operational badge counts

The side-menu nav rows can show an unprocessed-work count badge. Counts are computed server-side by `getMobileNavBadges()` (`src/lib/nav-badges.ts`) and passed into `MobileShell` via the `badges` prop (keyed by nav id). Each mobile page fetches them with `const navBadges = await getMobileNavBadges()` and renders `<MobileShell badges={navBadges} ...>`.

Current count definitions (org-scoped, RLS-enforced; each fails closed to 0 so a missing table/migration never breaks the shell):

| Nav id | Counts |
|---|---|
| `cleaning` | today's (Tokyo operating date) `cleaning_sessions` with `status = in_progress` — the remaining-to-finish count; drops as each is completed |
| `requests` | unapproved `order_requests` (`status = requested`) + unprocessed `maintenance_reports` (`open`/`in_progress`) + `lost_items` (`status = registered`) registered today (Tokyo) |
| `linen-return` | today's (Tokyo) `linen_return_records` registered by anyone in the org (organization-wide shared count) |
| `announcements` | published announcements the user has not read (`announcement_reads`); clears on read |
| `notifications` | unread notifications (`read_at is null`) — via `countUnreadNotifications` (placeholder, to be revisited) |

`home`, `calendar`, and `directory` intentionally show no badge.

Counts refresh on navigation and on pull-to-refresh (`router.refresh()`); these are advisory UI hints only — access control stays in RLS + server queries. Real-time updates (Supabase Realtime) are out of scope for this slice.

## Design Notes

- Bottom tabs should use clear, premium line icons from `src/config/navigation.ts`.
- Labels must fit Korean, Japanese, and English.
- Home quick actions should be large enough for field use.
- Avoid hiding maintenance/lost item/order request too deeply because these are high-frequency actions.
- Top bar, bottom tab bar, and bottom sheets are a single shared design contract. They must stay unified across features unless there is an explicit product/design decision to change them.
- The current top bar and bottom tab bar design are fixed shared surfaces and should be preserved as-is.
- Do not add per-page controls, titles, breadcrumbs, or secondary icons to the shared top chrome unless explicitly decided.
- Liquid Glass is selective: floating bottom navigation, bottom sheets, cards, chips, and overlays may use it; the global mobile background should remain solid and readable.

## 2026-06-15 Bottom Sheets — iOS-style Drag-to-Dismiss

All mobile **bottom sheets** (sheets that slide up from the bottom edge) share one drag-to-dismiss
contract so they behave like native iOS sheets.

- **Unified dismissal rule**: every bottom sheet closes either by dragging down from the sheet's upper touch area / grab-handle zone, or by tapping the empty scrim outside the sheet. Do not invent feature-specific close gestures for bottom sheets.
- **Drag zone**: the center grab handle (`mx-auto h-1 w-[38px] rounded-full`) and the sheet's top
  header area start the drag. A gesture that begins inside the sheet's scrollable body does **not**
  trigger drag-dismiss (so inner scrolling is never hijacked).
- **Touch target size**: the upper drag area must stay broad and easy to catch. Do not shrink it into a tiny, hard-to-grab strip.
- **Follow + dim**: while dragging, the sheet follows the finger downward (`translateY`, clamped at 0
  — no upward drag), and the scrim dims in proportion to the drag distance.
- **Release**: dismiss when pulled past **max(80px, 25% of sheet height)** OR flicked down fast
  (release velocity ≥ **0.5 px/ms**); otherwise the sheet snaps back to rest. Dismiss reuses the
  sheet's existing slide-out + `onClose`, so drag, scrim tap, and Esc all share one exit path.
- **No header close (X) button**: now that drag-down (plus scrim tap / Esc) dismisses, bottom sheets
  do **not** show a top-right X close button — the slide gesture replaces it. (X icons that serve
  other roles stay: remove-member, chip clear, search clear, the long-press/select cancel, the photo
  lightbox close, and center-aligned confirm/reject dialogs.) The order action sheet keeps an X only
  on its centered confirm/reject variant, not the draggable bottom-sheet variant.
- **Touch isolation**: sheets portal to `<body>`, but React synthetic touch events still bubble
  through the React tree into the shell's pull-to-refresh / swipe-nav handlers, which would otherwise
  drag the background screen with the sheet. The hook stops touch propagation on the grab handle /
  header so only the sheet moves.
- **Reduced motion**: the drag still works, but the slide/scrim transitions follow each sheet's
  existing `motion-reduce:transition-none` opt-out.

Shared implementation: `useSheetDragDismiss` in `src/components/shell/use-sheet-drag-dismiss.ts`
(one place owns the pointer mechanics; each sheet keeps its own open/close lifecycle and just spreads
`handleProps` on the grab handle/header, tags the sheet `data-sheet`, and applies `sheetStyle` /
`scrimStyle`). Thresholds are defined as constants in that file.

Sheets covered: bottom-bar editor (`mobile-shell`), Tasks quick-add / calendar day sheet /
long-press menu (`tasks-workspace`), share picker, context picker, report sheet, project create
(`projects-board`), project members (`project-detail-view`), photo gallery (`photo-gallery`),
calendar reservation detail (`mobile-calendar-view`), and the order "처리" bottom sheet variant
(`order-action-bar`). **Excluded** (not bottom sheets): fixed action bars, the left side menu, the
photo lightbox carousel, and small anchored dropdown/popover menus. (As of 2026-06-17 the former
center-aligned confirm / delete / action / picker dialogs are NO LONGER excluded — they were all
converted to bottom sheets; see the canonical-standard section below.)

## 2026-06-17 Bottom Sheet — Canonical Visual Standard + Shared `BottomSheet`

The drag-to-dismiss behavior above is now paired with **one canonical visual spec**, so every
bottom sheet looks identical. The reference design is the home check-in/out sheet; the spec is:

- **Scrim**: `bg-slate-950/45` (cool slate). It **fades toward transparent as you drag the sheet
  down** (the dim is proportional to drag distance — this is the look the team standardized on). No
  warm/tinted scrims.
- **Surface**: `bg-surface` (cream), `rounded-t-[24px]`, `max-w-[460px]`, centered, bottom-anchored.
- **Padding**: `px-5 pt-3 pb-[max(20px,env(safe-area-inset-bottom))]`.
- **Grab handle**: `mx-auto mb-3 h-1 w-[38px] rounded-full bg-slate-200` (slate-200, 38×4).
- **Animation**: slide-in/out `translate-y-full → translate-y-0`, 320ms `cubic-bezier(0.32,0.72,0,1)`.
- **Dismiss**: drag past threshold, scrim tap, or Esc. **No top-right X button.**
- **Lifecycle**: portals to `<body>`, locks body scroll, closes on Esc.

**Mandatory going forward:** build any NEW bottom sheet with the shared
**`BottomSheet`** component (`src/components/shell/bottom-sheet.tsx`) — do not hand-roll a sheet
shell. It encapsulates the entire spec above (portal + slate scrim + drag-to-dismiss via
`useSheetDragDismiss` + handle + body-lock + Esc). It is mount-driven (the parent conditionally
renders it and unmounts in `onClose`); close programmatically with the render-prop
`children={({ close }) => …}` or `useBottomSheetClose()`, and make extra drag zones with
`useBottomSheetDragHandle()`.

**Every popup that anchors to / slides up from the bottom now uses `BottomSheet` or the same drag
contract** — including what used to be center-aligned confirm/delete/action/picker dialogs. They were
all converted so they slide up from the bottom and dim-on-drag exactly like the home sheet (a final
sweep confirmed zero bottom overlays lack the effect).

On the shared `BottomSheet` component: home check-in/out, report sheet, share picker, cleaning record
detail + filter picker, project create (`projects-board`), project members + delete/leave confirm
(`project-detail-view`), cleaning linked-confirmation, Tasks bulk-delete (`tasks-workspace`), task
delete/leave/remove confirms (`task-detail-view`), maintenance/lost-found/order confirms, generic
delete confirm, announcement popup + delete + read-status, linen-return success + detail delete,
cleaning completion + cancel confirms, cleaning targets sheet, the date-range and order-delivery
calendars, the requests filter + delete sheets, and the **bottom-bar editor** (`mobile-shell` — the
center-FAB "편집" sheet; converted 2026-06-17 so it drag-dims like the rest).

Kept on their own markup but **normalized to the canonical values** (slate scrim, 24px radius,
slate-200 handle, drag-dim — visually/behaviorally identical, migrate to `BottomSheet`
opportunistically): the suggestions status/hold/complete/comment/like sheets + member picker
(`suggestions.css`), context picker, Tasks day/long-press/quick-add sheets, the calendar reservation
sheet, and the photo-gallery sheet. These were left on their own
shells because they use an always-mounted `.show`/transform toggle or a multi-step body with
body-level dismiss calls; a structural rewrite carries more regression risk than visual gain.

**Intentional exceptions** (NOT flattened): the order "처리" sheet (`order-action-bar`) keeps its
dual-mode **Liquid Glass** treatment (backdrop-blur, 28px, glass border) per the selective-glass
policy; center-aligned confirm/delete dialogs are modals, not bottom sheets; the photo lightbox is a
full-screen carousel. The attendance capture/correction sheets are owned by the in-progress
attendance track and will be normalized when that track settles.

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

- **Linen Defect:** dedicated **side-menu entry**. Mobile IA direction is `building picker -> building-specific return list -> create/detail -> ledger/statistics`. It is **not** a default bottom tab, but should be eligible for the user-customizable bottom-bar pool when implemented.
- **Personal Todo / Task Inbox:** dedicated side-menu entry and a candidate for the customizable bottom-tab pool (`customizableBottomNavItems`). Implemented (2026-06-10, hardened through 2026-06-13). Internal mobile IA: `Today / Tomorrow / Inbox(관리함) / Sent(공유함) / Completed(완료/기록) / Calendar` (six tabs). Completed tab groups finished tasks by Tokyo date and provides a daily report (업무일지) generator — free, template-based, no LLM. Task calendar stays visually distinct from the reservation Calendar tab.
- **Staff Suggestions:** side-menu entry.
- **Internal Board:** side-menu entry; candidate for the customizable bottom-tab pool.
- **Attendance:** dedicated clock-in/out surface (likely Home quick-action + side-menu entry); QR/GPS flow is PWA-specific.

When any of these is added to the bottom-tab pool or side menu, also update the side-menu badge table and `getMobileNavBadges()` if the feature carries an unprocessed count. New nav labels require ko/ja/en i18n keys.
