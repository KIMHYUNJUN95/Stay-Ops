# Stitch Screen List

## Purpose

This document defines the first StayOps screens to create in Google Stitch.

Use these as design prompts and screen requirements.

## Design Progress Status

Last updated: 2026-05-09

This section is the live design progress tracker for Stitch review. Update it whenever a new screen is reviewed, accepted, deferred, or moved back to remaining work.

### Completed / v1 Accepted

- Login / Signup basic direction
- Mobile Home basic direction
- Active Cleaning Timer basic direction
- Mobile Requests Tab basic direction
- Mobile Announcements list / detail / popup
- Mobile User Profile / Directory / Edit Profile / User Detail
- Mobile Settings
- Todo / Task screens
- Notification Center / notification list
- Mobile Reservation Calendar final review
- App Splash / Launch Screen
- Admin Settings
- Admin Dashboard
- Admin Cleaning Status
- Admin Maintenance
- Admin Lost & Found
- Admin Order Requests
- Admin Announcements
- Admin Recurring Work
- Admin Users
- Admin Check-In / Check-Out

### Deferred / Implementation Required

- Admin Reservation Calendar is not accepted as a final Stitch v1.
- The direction is confirmed: a dense channel-manager-style room/date timeline.
- Stitch repeatedly produced layouts that were too sparse, detail-panel-heavy, or structurally wrong for the required calendar density.
- Final implementation should use a custom grid/timeline component if needed.
- Reservation Calendar must not include price, revenue, inventory, rate management, payment, sales, or channel-manager finance functions.

### Remaining Design Work

- Role-based screen and button visibility review
- Final Stitch progress documentation cleanup

### Current Task

- Todo / Task screens v1 accepted as the working direction.
- Notification Center / notification list v1 accepted as the working direction.
- Mobile Reservation Calendar v1 accepted as the working direction.
- App Splash / Launch Screen v1 accepted as the working direction.
- Current task: role-based screen/button visibility review.
- Remaining design closeout: role-based screen/button visibility review and final Stitch progress documentation cleanup.
- Review policy for remaining items: fix only blockers; move implementation-polish issues to development.
- No coding should happen during this planning/design/documentation stage.

### Review Rules

- Check each Stitch image coldly for missing functions, broken layout, weak information density, incorrect permissions or workflow, and insufficient selective Liquid Glass polish.
- Give correction prompts only for issues that must be fixed now.
- Minor polish that can be corrected during implementation should be marked as "development-time fix".
- Correction prompts must be provided as one copyable block, not split into multiple prompts.
- StayOps is the required brand name. Do not use LUMINA or any other brand name.
- The visual direction is readable Apple-inspired design: pure-white mobile base, selective translucent cards/overlays, thin lines, soft shadows, teal accent color, and strong operational readability.

### App Splash / Launch Screen Requirement

- StayOps should show a simple splash/launch screen when the mobile app/PWA first opens.
- The splash screen should use a clean white or bright gray-white background.
- The app logo should appear centered on the screen, similar to common app launch experiences such as Instagram or Facebook.
- The splash should be brief and should not feel like a marketing page.
- The final StayOps logo is not designed yet, so the launch screen is required but final visual design depends on later logo work.
- Until the logo is finalized, designs may use a temporary StayOps wordmark or placeholder mark.
- This requirement applies to the mobile PWA/native-style app start experience. Admin web does not need a full-screen splash by default.

## Design Direction

Style:

- Apple-inspired Liquid Glass
- Strong business-app readability
- Light and dark mode friendly
- Mobile PWA first
- Admin web dense and clear

Avoid:

- Marketing landing page feeling
- Decorative dashboards
- Low contrast glass panels
- Overly playful UI

## Screen 1: Login / Signup

Device:

- Mobile first

Roles:

- All users

Required elements:

- StayOps name
- Email login
- Google login
- Language selection
- Invite code / invite link entry
- Phone number field during signup
- Light/dark friendly glass surface

Prompt draft:

```txt
Create a mobile PWA login and signup screen for StayOps, a multilingual hotel operations app. Use an Apple-inspired Liquid Glass style with strong readability. Include email login, Google login, language selection for Korean/Japanese/English, invite code entry, and phone number field for signup. Keep the layout calm, professional, and optimized for hotel staff.
```

## Screen 2: Mobile Home

Device:

- Mobile

Role:

- Part-time Staff / Staff

Required elements:

- Active cleaning timer section at top
- Important announcement area
- Today check-in/check-out summary
- Quick actions: Start Cleaning, Maintenance, Lost Item, Order Request
- Today's my activity records
- Bottom tabs: Home, Calendar, Cleaning, Requests, Announcements

Prompt draft:

```txt
Create a mobile home screen for StayOps field staff. Use readable Apple-inspired Liquid Glass UI. The top area shows an active cleaning timer if running, followed by important announcements, today's check-in/check-out summary, large quick action buttons for Start Cleaning, Maintenance, Lost Item, and Order Request, and a timeline of today's activity records. Include bottom navigation with Home, Calendar, Cleaning, Requests, Announcements.
```

Current design status:

- Mobile Home v1 accepted as the working direction.
- Detailed Liquid Glass polish can be refined during implementation.

## Screen 3: Active Cleaning Timer

Device:

- Mobile

Role:

- Staff / Part-time Staff

Required elements:

- Property/room name
- Cleaning start time
- Large elapsed timer
- Buttons: Lost Item, Maintenance, Special Note, Complete Cleaning
- Completion confirmation popup state

Prompt draft:

```txt
Create an active cleaning timer screen for a hotel operations PWA. Use Apple Liquid Glass style with high readability. Show property and room, cleaning start time, a large elapsed timer, and action buttons for Lost Item, Maintenance Issue, Special Note, and Complete Cleaning. Include a confirmation popup state showing room, start time, approximate elapsed time, optional note, confirm and cancel buttons.
```

Current design status:

- Active Cleaning Timer v1 accepted as the working direction.
- Layout direction: focused timer, clear Complete Cleaning button, secondary action pills.
- Detailed Liquid Glass polish can be refined during implementation.

## Screen 4: Requests Tab

Device:

- Mobile

Role:

- All users

Required elements:

- Tabs or segmented control: All / My registrations
- Request type filters: Maintenance, Lost & Found, Orders
- Status chips
- Create buttons
- List cards with property, title, reporter, status, date

Prompt draft:

```txt
Create a mobile Requests tab for StayOps. It should show all requests and my registrations, with filters for Maintenance, Lost & Found, and Orders. Use compact readable cards with property, request title, reporter, status chip, and date. Include create actions. Use Liquid Glass style but keep the list easy to scan.
```

Current design status:

- Requests Tab v1 accepted as the working direction.
- New Request Menu v1 accepted structurally, but needs more Liquid Glass polish later.
- Future refinement: make New Request menu feel like a frosted glass bottom sheet/modal instead of a flat page.

## Screen 5: Reservation Calendar

Device:

- Mobile

Role:

- All users

Current scope:

- Mobile reservation calendar still needs a separate final pass.
- Admin reservation calendar was explored in Stitch, but the final high-density version was not accepted.

Required elements:

- Property/building selector
- View switcher for large buildings: Month / Rooms / Lists
- Month calendar
- Reservation bars inside date cells
- Reservation bar text: guest name + number of guests
- Date numbers always visible above/away from reservation bars
- Channel-based reservation colors: Booking.com blue/blue-teal, Airbnb soft light pink
- Tap reservation popup
- Tabs/actions: Check-in Today, Check-out Today, Staying Today, Empty, Earliest Empty
- Minimal unused bottom whitespace; the month grid should use available vertical space efficiently above the bottom navigation
- Large-building handling: do not attempt to show all 26-28 rooms inside one normal month grid

Prompt draft:

```txt
Create only mobile screens for the StayOps reservation calendar. Do not create desktop, admin web, sidebar, or PC timeline screens in this design pass. This app must support buildings with up to 26-28 rooms, so do not try to show every room reservation inside one normal monthly date grid.

Create a mobile calendar with a compact property/building selector and a view switcher: Month / Rooms / Lists. Month view shows a property-level monthly overview with real multi-day reservation bars inside date cells and optional room filtering. Rooms view shows a mobile-friendly room-by-date timeline for the selected building, optimized for many rooms with vertical room rows and horizontal dates. Lists view gives operational lists: Check-in Today, Check-out Today, Staying Today, Empty Today, and Earliest Empty.

For Rooms view, increase the useful date density. The selected range should show more dates than 3-4 days. Use 7 days as the readable default and include a 14-day compact option. If the full 7-day or 14-day range cannot fit at once, make the date area horizontally scrollable with a sticky room column and clear scroll affordance. Use compact date columns and shortened reservation labels in 14-day mode so staff can scan more dates.

If Stitch keeps producing the same low-density timeline, redesign Rooms view as two modes:

- Detail: readable reservation labels across fewer days.
- Overview: compact 14-day or month occupancy grid with room rows and colored bars/cells, prioritizing occupancy visibility over guest names.

The overview mode should intentionally reduce or hide guest names so more dates fit on mobile.

Accepted direction for Rooms Overview:

- Room numbers listed vertically on the left.
- Dates listed horizontally across the top.
- Colored horizontal reservation bars across dates.
- Guest names hidden in the overview.
- Tap a bar to open reservation details.
- Booking.com blue/teal, Airbnb soft pink, Direct/other gray.
- Designed for scanning occupancy across many rooms and many dates.

In Month view, date numbers must always remain visible and must never disappear behind reservation bars. Each reservation bar shows guest name and guest count only. Use source/channel colors: Booking.com or Booking reservations in a blue/blue-teal family, Airbnb reservations in a soft light pink family, and other/direct reservations in a neutral fallback color. The calendar grid should use the available vertical space efficiently and should not leave a large empty area between the calendar and bottom navigation.

Tapping a reservation bar opens a reservation detail bottom sheet with property, room, guest name, guest count, phone number with copy and call buttons, check-in date, and check-out date. Keep the interface Apple-inspired Liquid Glass with strong readability.
```

Current design status:

- Reservation Calendar is not accepted yet.
- Issues to fix: date numbers disappearing when reservations exist, reservation bars feeling like simple tags instead of true multi-day bars, missing channel-based color mapping, and weak Liquid Glass depth.
- Additional issue: current mobile calendar leaves too much unused bottom whitespace.
- Admin web Reservation Calendar direction is structurally decided but not accepted as a Stitch v1.
- Admin web should use a dense channel-manager-style room/date grid and can be finalized during implementation.
- The company internal calendar reference should inform reservation bar behavior, especially room/date grid density and multi-day bars.

## Screen 6: Announcement List and Detail

Device:

- Mobile

Role:

- All users

Required elements:

- Important/pinned announcements
- Read/unread state
- Announcement cards
- Detail screen with content, up to 5 images, comments, read confirmation
- Popup announcement state

Prompt draft:

```txt
Create a mobile announcements screen for StayOps. Show pinned and important announcements, read/unread states, announcement cards, and a detail view with content, up to five images, comments, and read confirmation. Include a popup announcement state shown on app open. Use readable Liquid Glass design.
```

## Screen 7: User Directory / My Profile

Device:

- Mobile

Role:

- All users

Required elements:

- My profile card
- Edit name, age, phone, language, theme
- User directory list
- Role label
- Phone call button

Prompt draft:

```txt
Create a mobile user profile and directory screen for StayOps. Include a My Profile card with editable name, age, phone number, language, and theme preference. Below, show a user directory with profile photo, name, role, phone number, and a call button. Use Apple-inspired Liquid Glass with strong readability.
```

## Screen 8: Admin Dashboard

## Screen 8: Order Request Management

Device:

- Mobile

Role:

- Requester / Office Admin / CS Staff / Owner

Required elements:

- Requester detail view with simple status tracking
- Office review view with Approve / Reject / Ordered actions
- Reject reason bottom sheet
- Order completed confirmation
- No price, estimated cost, unit cost, cost center, or budget fields in MVP
- No payment, shipping, delivery tracking, arrival, receiving, courier, or tracking-number workflow
- Support up to 40 requested item rows in one order request
- Requester-side UI must stay simple and fast

Prompt draft:

```txt
Create mobile-only StayOps Order Request management screens for a hotel operations PWA. Keep only the documented StayOps order request workflow. This is not a payment, shipping, delivery, receiving, or purchasing-tracking system. The purpose is for field staff to tell the office which supplies/items are needed, for which property/building, and who requested them.

Do not include price, estimated cost, unit cost, cost center, budget, payment, shipping, delivery tracking, arrival tracking, courier, tracking number, or receiving status.

Support order requests with up to 40 item rows. The requester-side UI must still feel simple and fast, not like a spreadsheet.

Create requester and office states:

1. Requester Order Request Detail
Show property/building, requested item list, quantity per item, product/reference URL if present, optional photos, request reason/memo if present, requester, created time, and current status. Keep the layout simple and easy to understand. Show status clearly: Requested, Approved, Rejected, Ordered/Completed.

2. Office Review Detail
For office-level users, show the same request details plus action buttons: Approve, Reject, Mark as Ordered/Completed. Keep actions clear and fast. Do not make it feel like a finance or purchasing dashboard.

3. Reject Reason Bottom Sheet
Show request summary, required rejection reason input, Cancel, and Send Rejection button. Clearly state that the requester will be notified.

4. Order Completed Confirmation
Show a compact Liquid Glass confirmation that the order has been marked completed and the requester has been notified.

Requirements:
- Mobile only.
- No desktop screens.
- No price/cost fields.
- Requester view should be simpler than office review view.
- Use Apple-inspired Liquid Glass with strong readability.
- Bottom navigation or sticky actions must not overlap content.
```

Current design status:

- Order request create form direction is accepted as quick-field-form v1 candidate.
- Order management screens need refinement to remove price/cost-related fields and keep requester-side complexity low.

## Screen 9: Admin Dashboard

Device:

- Desktop web

Role:

- Owner / Office Admin / CS Staff

Required elements:

- Sidebar navigation
- Today's check-ins/check-outs
- Cleaning in progress/completed
- Maintenance open
- Lost items
- Order requests
- Important announcements
- Dense but readable layout

Prompt draft:

```txt
Create a desktop admin dashboard for StayOps, a hotel operations system. Use a readable Apple-inspired Liquid Glass style for a professional operations console. Include a left sidebar with Dashboard, Calendar, Check-In/Out, Cleaning, Maintenance, Lost & Found, Orders, Announcements, Recurring Work, Users, Settings. The main dashboard shows today's check-ins/check-outs, cleaning status, open maintenance, lost items, order requests, and important announcements.
```

## Screen 10: Admin Cleaning Status

Device:

- Desktop web

Role:

- Office Admin / Field Manager

Required elements:

- Cleaning records table
- Filters by date/property/staff/status
- Start/completed time
- Total duration
- Export Excel/PDF buttons

Prompt draft:

```txt
Create an admin web cleaning status screen for StayOps. Use a dense readable operations console layout with Liquid Glass accents. Include filters for date, property, staff, and status. Show a table with property, room, staff, start time, completed time, total duration, and notes. Include Korean Excel and PDF export buttons.
```

## Screen 11: Admin Reservation Calendar

Device:

- Desktop web

Role:

- Owner / Office Admin / CS Staff

Required elements:

- Property filter
- Dense channel-manager-style room/date grid
- Sticky-looking room column and date header
- Many rooms and many dates visible
- Multi-day reservation bars spanning check-in to check-out
- Optional Status / Min Stay / Reservation sub-rows per room
- Occupancy/empty visibility
- Selected reservation detail inspector or collapsible drawer
- Earliest available list
- No price, revenue, rate, payment, sales, or inventory data

Prompt draft:

```txt
Create an admin web Reservation Calendar for StayOps. Use a dense channel-manager-style room/date grid for hotel and Airbnb operations. Show many rooms and many dates with horizontal reservation bars spanning check-in to check-out. The grid should support buildings with 26 to 28 rooms. Include property filter, search, date range, status/channel filters, selected reservation detail inspector or collapsible drawer, and earliest available list. Do not show price, revenue, rates, payment, sales, or inventory data. Use Apple-inspired Liquid Glass with strong business-app readability.
```

Current design status:

- Stitch exploration is not accepted as a final v1.
- Accepted structural direction: dense channel-manager room/date grid, channel-colored reservation bars, no financial/rate/inventory data, optional detail inspector.
- Final UI should be completed during implementation with a custom grid/timeline component if Stitch cannot reliably generate the required density.

## Handoff Checklist

For each Stitch output, save:

- Screen name
- Device
- Role
- State
- Screenshot
- Notes about what should change
