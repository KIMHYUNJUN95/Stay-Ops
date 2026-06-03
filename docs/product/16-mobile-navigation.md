# Mobile Navigation

## Purpose

The mobile/PWA field interface should be optimized for fast daily work by on-site staff, field managers, regular staff, and part-time staff.

## Confirmed Bottom Tabs

Use five bottom tabs:

```txt
Home
Calendar
Cleaning
Requests
Announcements
```

Profile and user directory should be accessible from Home or a top/right profile menu rather than as a main bottom tab.

Implementation note:

- The mobile navigation contract is implemented in `src/config/navigation.ts`.
- The initial mobile shell is implemented in `src/components/shell/mobile-shell.tsx`.
- Any future mobile screen should reuse this navigation contract instead of redefining tabs locally.
- Navigation labels are localized through `src/lib/i18n.ts` and `src/config/navigation.ts`.

Korean labels:

```txt
Home
Calendar
Cleaning
Requests
Announcements
```

Japanese labels:

```txt
Home
Calendar
Cleaning
Requests
Announcements
```

English labels:

```txt
Home
Calendar
Cleaning
Requests
Announcements
```
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
- The Requests mobile list should provide an explicit scope toggle:
  - `All` (default): all visible records in the organization scope
  - `My registrations`: records created by the current user only
- Scope toggle should apply consistently across maintenance, lost and found, and order request list views.

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
[3x3 dot menu]  StayOps wordmark  [Profile]
```

Implementation: `src/components/shell/mobile-shell.tsx`.

Current rules:

- **Base surface**: the mobile shell and page background use a pure-white `bg-background` base. The shell itself is not a full-screen glass surface.
- **Left**: a custom 3x3 dot menu button opens the mobile side menu. `aria-label` uses `dictionary.common.menu`.
- **Center**: the `StayOps` script wordmark is visually centered in the top chrome.
- **Right**: circular profile avatar (`UserCircle`) links to `/account?mode=mobile`. `aria-label` uses `dictionary.onboarding.profileTitle`.
- **Scroll behavior**: the top chrome hides when users scroll down and returns when users scroll up. The content area fills the freed space so no blank header gap remains.
- **Side menu**: tapping the dot menu opens a left slide-out menu at roughly 78% of the mobile viewport width. The main screen moves right with a dark overlay on the remaining visible area. Closing reverses the slide.
- **Bottom navigation**: the five bottom tabs render as a floating rounded capsule overlay with selective Liquid Glass treatment. It is intentionally partial glass; the surrounding page remains the normal white background.
- **Accessibility**: the `title` prop on `MobileShell` is used as `aria-label` on `<main>`. It is not rendered visually in the header. Page content provides its own visual hierarchy.
- **Appearance prop**: `appearance` remains accepted for compatibility but currently does not change shell visuals. Do not rely on it for page tinting.
- `ModeSwitcher` and `Bell` icon are not part of the shell header. Theme switching is accessible via the account page.

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

- The top menu icon is now a custom 3x3 dot icon rather than a standard hamburger.
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
- The global shell contract remains fixed: `[3x3 dot menu] StayOps [Profile]`, scroll-aware top chrome, slide-out side menu, and floating capsule bottom tabs.
