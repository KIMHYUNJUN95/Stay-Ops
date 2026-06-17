# Reservation Calendar

## Overview grid UI (2026-06-10 readability redesign)

Visual/UX-only refinement of the mobile **overview (timeline) grid** in
`src/components/calendar/mobile-calendar-view.tsx`. Data, routing, lists/map modes, the
reservation detail sheet, and the common shell are unchanged. Ivory/navy app theme applies.

- **Date header** is two lines: localized weekday (Sat `text-blue-600`, Sun `text-rose-600`,
  weekday `text-slate-500`) over the day number (`text-[15px] font-extrabold`). Weekend columns
  get a faint tint; the today column keeps `bg-amber-100/60`, amber text, and a small "오늘"
  (`copy.today`) chip.
- **Reservation bars**: `rounded-[9px]`, 3px horizontal inset, soft shadow + `border-white/25`.
  A check-in dot shows when the stay starts within the visible month; stays continuing past the
  month edge flatten that corner (`rounded-l/r-[3px]`) and show a `›` overflow hint. Channel
  colors (Booking/Airbnb/other) and bar position math are unchanged.
- **Grid**: alternating room rows get a subtle stripe; vertical grid lines lightened; the today
  column has an amber vertical marker. Sticky room-label column unchanged.
- **Channel legend** above the grid: Airbnb / Booking / Direct (`copy.legendDirect`, new i18n key
  `mobile.calendarLegendDirect`, ko/ja/en) with channel-colored swatches.

## Purpose

The reservation calendar shows Beds24 reservation, occupancy, and availability information inside StayOps.

It is separate from the recurring work scheduler.

## Required Data

The calendar must show:

- Date
- Property/building
- Room/unit
- Guest name
- Check-in date
- Check-out date
- Number of guests
- Reservation source/channel
- Whether there is an empty room/property for the selected day

Price/revenue information should not be shown in StayOps MVP.

## Date Range

StayOps does not need to show all historical reservation data.

Required calendar range for MVP:

```txt
Current month + next month (2 months total)
```

Historical data from previous years is not needed in StayOps MVP.

### Operational Fetch Window (implemented 2026-05-26)

The reservation data fetch window is fixed relative to **today**, not the selected month in the UI:

```
operationalMonthStart = first day of today's month   (e.g., 2026-05-01)
operationalWindowEnd  = first day of the month after next (exclusive, e.g., 2026-07-01)

Query:
  check_in_date  < operationalWindowEnd     → includes May and June arrivals
  check_out_date >= operationalMonthStart   → includes currently-staying guests
```

Key behaviors:
- Guests currently staying (checked in before today) are always included.
- Next month's upcoming reservations are always included.
- The UI's selected month (prev/next navigation) controls which month the Overview grid renders — it does not change what data is fetched.
- The Lists mode (Check-in Today / Check-out Today / Staying Today) always shows today's operational snapshot, regardless of which month the user is browsing, as long as `selectedMonth` is within the operational window.
- **Out-of-Window Policy (Implemented 2026-05-26 - Option A)**: If the user navigates to a month beyond the operational window (e.g., July or later, or prior months), the server skips the reservations DB query entirely (no unnecessary read), passes `reservations = []`, and the client shows a clear, localized usability warning banner: *"Out of operational window" / "현재 운영 조회 범위 밖"* under both Overview and Lists mode. This avoids fragmented/misleading crossover bookings (e.g. end-of-June check-in persisting into July). Month navigation is kept operational so users can easily tap back. The `isOutOfWindow` boolean is computed server-side and passed as a prop — the client does not recompute it independently.

This is the authoritative implementation note. **Current confirmed policy: current month + next month (2 months total).** This is the MVP scope and is not aspirational.

### Future / Post-MVP: Extending the Window

Extending the fetch window beyond 2 months is a **separate backlog item** and is not planned for the current MVP. It requires:

1. An explicit product decision and documented requirement change.
2. UI changes to clarify the extended browsing scope to users.
3. Performance review of the larger query range.

Do not implement a wider window without fulfilling these prerequisites. The current 2-month policy is intentional and stable.

## Reservation Status Display

MVP calendar should display only confirmed/valid reservations.

Cancelled reservations:

- Should be removed from the visible calendar.
- May remain in internal sync logs if needed for debugging/history.
- Should not appear as active occupancy.

Reservation status labels must always be shown in the user's preferred language (ko/ja/en).

- Raw DB enum values (`confirmed`, `checked_in`, `checked_out`, `cancelled`, `no_show`) must never be shown directly as UI text.
- All reservation status labels are defined in `dictionary.admin.reservationStatusLabels` in `src/lib/i18n.ts`.
- Any new status values added to the DB enum must be added to all three locales before use in UI.

## Mobile Requirement

The mobile screen must show a one-month reservation calendar by property/building at a glance.

Design reference:

- TimeTree-like calendar feeling

Important mobile goal:

```txt
Staff can choose a property/building and quickly understand the whole month of reservations.
```

Current design priority:

- Mobile and admin web calendar requirements are both documented.
- Mobile focuses on a readable month / rooms / lists structure.
- Admin web focuses on a dense channel-manager-style room/date grid for office users.

## Mobile Views

Required mobile views:

### Monthly Property Calendar

Purpose:

- Show one month of reservations for a selected property/building.

Must show:

- Dates
- Reservation bars inside date cells
- Guest name and number of guests inside reservation bars
- Reservation source/channel color on reservation bars
- Occupied/empty state
- Room/unit if property has multiple rooms

Confirmed mobile layout:

- Use a date-based monthly calendar.
- Put real reservation bars inside each date cell, including multi-day bars that visually span from check-in date to check-out date.
- Tapping a reservation bar opens guest/reservation details.
- This should feel similar to TimeTree, but adapted for hotel/property reservations.
- The month grid should use vertical space efficiently and should not leave a large unused blank area above the bottom navigation.

Date number rule:

- The date number must always remain visible, even when a reservation exists on that date.
- Reservation bars must not cover or replace the date number.
- Date numbers should stay on a higher visual layer or fixed top-left area of the date cell.

Reservation bar source color rule:

- Booking.com / Booking channel: blue or blue-teal family.
- Airbnb channel: soft light pink family.
- Direct/other channels: neutral gray family.
- Color should support quick scanning while staying readable in light mode (the app is light-mode-only; dark mode deferred post-launch).

Reservation bar display priority:

```txt
Guest name + Number of guests
```

When the user taps a reservation bar, open a popup/detail panel with full guest and reservation information.

Reservation popup/detail should show:

- Property/building
- Room/unit
- Guest name
- Number of guests
- Phone number
- Reservation ID
- Check-in date
- Check-out date

Reservation notes/memos are not required in the MVP.

Phone number actions:

- Copy phone number
- Call phone number

### Reservation Detail Modal Policy (updated 2026-06-02)

- Mobile reservation detail uses an information-first bottom sheet (slides up from the bottom edge) with selective Liquid Glass surface styling.
- The modal opens above a dimmed backdrop and stays visually detached from the underlying page scroll.
- Bottom actions `Message Guest` and `Manage Booking` are removed from the modal.
- The detail sheet keeps operational contact actions only:
  - Copy phone number
  - Call phone number (enabled only when a dialable number exists)
- Guest-count display is hidden when guest-count data is unavailable.
- Check-in/check-out time display uses operating defaults for this phase:
  - Check-in: `10:00`
  - Check-out: `16:00`
- **Dismissal (2026-06-15)**: the mobile reservation detail bottom sheet is dismissed by **dragging
  it down** (iOS-style — grab handle / header), tapping the scrim, or Esc; its top-right **X close
  button was removed** now that the slide replaces it. This uses the shared `useSheetDragDismiss`
  primitive — see Mobile Navigation doc → "2026-06-15 Bottom Sheets — iOS-style Drag-to-Dismiss".

### Current Row-Label Policy (updated 2026-06-02)

- The calendar uses separate concepts for:
  - internal room identity, used for authoritative room-master matching
  - display row label, used for the visible room row shown to staff
- This is especially important for Arakicho buildings where Beds24 can expose sub-unit labels such as `402_2` or `A301_2`.
- Current display policy:
  - `402` and `402_2` share one calendar row labeled `402`
  - `A301` and `A301_2` share one calendar row labeled `A301`
  - `A301` and `301` remain separate rows because they represent different real unit identities
- Goal:
  - prevent incorrect reservation merging across distinct units
  - prevent over-splitting the visible room axis into `_2`-style sub-rows

Future optional view:

- Room/unit timeline view is required as an alternate mobile view for large multi-room buildings.
- The company internal calendar reference uses a room-by-date grid with reservation bars spanning dates. This is a strong reference for large buildings where one property can have about 26 to 28 rooms.
- The monthly date-cell calendar should remain useful for small properties or selected room/unit views, but it should not try to show all reservations for a 28-room building inside one month grid.

### Mobile Large-Building Calendar Strategy

Problem:

- A single building may have 26 to 28 rooms.
- Showing every room's reservations inside a normal monthly date-cell calendar will become unreadable on mobile.

Recommended mobile solution:

- Keep the month calendar as the default overview.
- Add a view switcher: Month / Rooms / Lists.
- In Month view, show a compact property-level overview and allow room filtering.
- In Rooms view, show a room-by-date horizontal timeline for the selected building.
- In Lists view, show Check-in Today, Check-out Today, Staying Today, Empty Today, and Earliest Empty.

Large-building rules:

- For buildings with many rooms, the user should select a building first, then view either all rooms in a room timeline or one selected room in the month calendar.
- The app should not force all 28 rooms into one normal mobile month grid.
- Empty-room discovery should rely on list/timeline views rather than trying to visually infer everything from a dense month grid.

Rooms view date density rule:

- The default Rooms view should show a useful 7-day range.
- On mobile, users should be able to visually understand the full selected range, not only 3 to 4 days.
- If 7 days cannot fit with readable text, use compact date columns, abbreviated labels, and horizontal scrolling with clear scroll affordance.
- Provide view density options: 7 days, 14 days, and compact mode.
- 14-day view may reduce reservation text to guest last name/short name plus guest count.
- The room column should remain sticky while date columns scroll horizontally.

Rooms view should support two different density modes:

1. Detail mode
   - Shows fewer days with readable reservation labels.
   - Good for checking guest names and tapping a reservation.

2. Overview mode
   - Shows more dates, such as 14 days or month-level occupancy.
   - Prioritizes room occupancy shape over full guest names.
   - Reservation bars can omit names or show very short labels.
   - Tapping a reservation opens the reservation detail bottom sheet.
   - Preferred visual direction: compact room rows on the left, date columns on top, and horizontal colored reservation bars without visible guest names.
   - This mode should feel like a mobile occupancy heat/timeline board for quick scanning.

For large buildings, a mobile overview cannot show 28 rooms, many dates, and full guest names all at once. StayOps should intentionally separate overview scanning from detail reading.

Implementation note (2026-05-22):

- Mobile calendar currently ships with two interaction modes in the same screen:
  - `Overview`: dense 14-day room timeline with reservation bars
  - `Lists`: Check-in Today / Check-out Today / Staying Today operational lists
- Tapping a reservation in either mode opens a bottom-sheet reservation detail modal.
- Overview header supports month navigation (prev/next). The selected month is represented by `month=YYYY-MM` in the route query.

### Today Check-In

Purpose:

- Show guests checking in today.

Must show:

- Property/building
- Room/unit
- Guest name
- Number of guests
- Phone number
- Check-in date/time

### Today Check-Out

Purpose:

- Show guests checking out today.

Must show:

- Property/building
- Room/unit
- Guest name
- Number of guests
- Phone number
- Check-out date/time
- Manual early check-out time if set

### Staying Today

Purpose:

- Show guests currently staying today.

Must show:

- Property/building
- Room/unit
- Guest name
- Number of guests
- Phone number
- Stay date range

### Empty Today

Purpose:

- Show empty rooms/properties for today.

Must show:

- Property/building
- Room/unit
- Empty status

Empty rule:

- A room/property is considered empty on a date if there is no reservation bar on that date.
- Cleaning status is not part of empty-room calculation in the MVP.

Beds24 room-source rule:

- For buildings where the company rotates between two Beds24 room ID groups, the calendar must use only the currently active room ID group.
- Active/inactive is determined by the company internal rule, not by Beds24 itself.
- If a Beds24 room/group has minimum stay `50 nights or more`, it is treated as inactive for that period and must be excluded from:
  - room master import
  - room axis display
  - `Empty today` calculation
  - occupancy/availability summaries
- Normal operational minimum stay values such as `1`, `2`, or `3` nights indicate the active room ID group for that period.

### Earliest Empty Availability

Purpose:

- Quickly show the earliest available empty room/property date from today onward.

Required behavior:

- User can view earliest empty availability for the currently selected property/building.
- User can also select all properties/buildings.
- The search starts from today, including today.
- For all properties/buildings, show the earliest empty availability per property/building.

Example:

```txt
Selected: All properties
Date basis: Today included

Arakicho A -> Empty today
Arakicho B -> Next empty: May 7
Kabukicho -> Next empty: May 9
Okubo A -> Empty today
```

This is separate from the visual empty state in the monthly calendar.

## Admin Web Views

Recommended admin web views:

- Month calendar
- Day check-in/check-out list
- Room/property timeline
- Occupancy and empty room filter

### Admin Channel-Manager Timeline

Purpose:

- Let office/admin users scan many rooms and many dates quickly.
- Support hotel-style buildings with about 26 to 28 rooms.
- Provide a dense operational view similar to a channel manager, but without price, revenue, rate, payment, or inventory data.

Design direction:

- Use a room-by-date grid as the primary admin calendar view.
- The left room column and top date header should feel sticky.
- Date columns should support horizontal scrolling when the selected range is wider than the viewport.
- Empty rooms must remain visible as blank reservation rows.
- Reservation bars must span check-in to check-out dates.
- Reservation bars display guest name and number of guests only.
- Tapping/selecting a reservation opens the mobile reservation detail bottom sheet.

Recommended dense row structure:

```txt
Room 201
  Status
  Min Stay
  Reservation
```

Notes:

- `Status` is operational status such as Empty, Occupied, Checkout, Cleaning, or Blocked.
- `Min Stay` may show a small value such as 1, 2, 3, or dash when useful.
- `Reservation` contains the multi-day reservation bars.
- These sub-rows are optional implementation details, but the admin calendar must preserve channel-manager-level density.
- Price/rate rows are not allowed in StayOps MVP.

Right-side reservation detail:

- A selected reservation inspector is useful for admin web.
- It should show property/building, room/unit, guest name, number of guests, phone number, check-in, check-out, channel, copy phone, and call actions.
- The inspector is secondary to the dense grid. If it reduces grid density too much, it can be collapsible.

Admin Stitch status:

- Admin Reservation Calendar Stitch exploration did not produce an accepted final v1.
- The accepted direction is structural only: dense channel-manager room/date grid, no financial data, optional detail inspector.
- Final visual/layout details should be completed during implementation with a custom data-grid/timeline component.

## Calendar Interaction Ideas

Mobile:

- Select property/building
- Swipe month
- Tap date
- Tap reservation bar
- View reservations for date
- Open guest/reservation detail
- Switch tabs: Month / Check-in / Check-out / Staying / Empty
- Open earliest empty availability list

Admin web:

- Filter by property/building
- Filter by room/unit
- Search guest name
- View day detail
- Export later if needed
- Select reservation to view detail bottom sheet on mobile; admin web may use an inspector/drawer if needed.

## Map Tab — Building Access Hub (updated 2026-05-26)

The mobile calendar's **Map** tab is now an operational building-access hub.

### UI
- Liquid Glass card list (one card per building): `rounded-2xl border-white/60 bg-white/50 shadow-sm backdrop-blur-xl`.
- Each card includes:
  - building name
  - address
  - Google Maps deep link
  - access-info action that opens a bottom sheet
- Icon policy:
  - `Home` icon for detached houses (`오쿠보A`, `오쿠보B`, `오쿠보C`)
  - `Building2` icon for all other buildings
- Property filter chips are hidden in Map mode; chips still render in Calendar/Lists modes.

### Password UX policy
- Sensitive codes are not fully expanded on every card by default.
- Card-level summary shows only count-level metadata.
- Full details open in a dedicated bottom sheet:
  - shared/common access codes
  - room-level access codes (when available)
  - copy actions per code
  - address copy action
  - Google Maps open action

### Data source
- `src/lib/property-map-links.ts` stores canonical building metadata in one place:
  - building kind (`hotel | house`)
  - localized address
  - `googleMapsUrl`
  - `sharedAccess[]`
  - optional `roomAccess[]`
- Current file is populated with production operation values for all 7 buildings.

### i18n keys (map access UX)
- `calendarMapAccessSheetTitle`
- `calendarMapAddressLabel`
- `calendarMapAddressCopy`
- `calendarMapCopiedAddress`
- `calendarMapCopiedCode`
- `calendarMapOpenAccess`
- `calendarMapOpenInMaps`
- `calendarMapRoomAccessLabel`
- `calendarMapSharedAccessLabel`
- `calendarMapNoAccessData`

## 2026-05-27 Mobile Calendar selective Liquid Glass update

- `/mobile/calendar` now follows the shared mobile visual family: pure-white shell/background with selective Apple-style Liquid Glass accents.
- Shell-level behavior is provided by `MobileShell`: scroll-aware top chrome, 78% slide-out side menu, and floating liquid-glass capsule bottom navigation. The `appearance` prop should not be used as a shell tint contract.
- Scope is visual-only (no data/query/permission logic changes):
  - top segmented mode switch and selected-building card
  - overview month frame + date rail surfaces
  - list cards and operational summary cards
  - reservation detail / empty-room / map-access bottom sheets
- Shared surface rules applied:
  - pure-white base with selective translucent white layers
  - thin bright border
  - soft depth shadow + subtle inset highlight
  - readable blur level with preserved text contrast
- Calendar bar readability policy remains:
  - channel colors preserved
  - stronger contrast and stable capsule shape for guest labels
  - date numbers and bars keep non-overlapping visual hierarchy.

## Open Questions

- For multi-room buildings, should mobile month view group by room or by date?
- ~~How should webhook failures be retried and monitored?~~ Resolved 2026-06-10 — see "Webhook Reliability" below (observability log + daily reconciliation).
- Should cancelled reservations remain visible in an admin-only sync log?

## Webhook Reliability (Implemented 2026-06-10)

### Background

Reservation ingestion is webhook-first (`docs/planning/01-decision-log.md` → "Beds24 Webhook Strategy"). Webhooks are not guaranteed delivery: a booking created/modified during downtime, a transient delivery failure, a secret mismatch, or a payload missing required fields can cause a booking to never reach the DB. Before this change a dropped webhook left **zero trace** — the only symptom was an operator noticing a gap in the calendar (this is exactly how reservation `5843903602` / Kabukicho 302, check-in 2026-06-08, was discovered missing).

### Two-part fix

1. **Observability — `beds24_webhook_events` table** (`supabase/migrations/202606100001_beds24_webhook_events.sql`):
   - Every inbound webhook batch and every reconciliation run is logged with processing result: `trigger_source` (`webhook` | `reconciliation`), `http_status`, processed/succeeded/failed counts, per-result `modes`, and a compact `booking_summary`.
   - Written by `src/lib/beds24/webhook-events.ts` from the webhook route and the reconcile route. Logging failures are swallowed and never block the ingestion response.
   - Platform-admin read only; service-role write (see `docs/engineering/05-rls-permissions.md`).
   - Makes a dropped/failed booking detectable instead of invisible.

2. **Prevention — daily reconciliation safety net** (`src/app/api/beds24/reconcile/route.ts`):
   - Production-safe, idempotent endpoint that re-pulls the operational window (current month + next month) from the Beds24 `/bookings` API and upserts anything missing — the production counterpart to the dev-only `backfill-reservations` route.
   - Driven daily by **Vercel Cron** (`vercel.json`, `0 19 * * *` UTC = 04:00 Asia/Tokyo), within the free Hobby plan's once-per-day cron limit.
   - Authorized by `CRON_SECRET` (Vercel Cron Bearer header) or `BEDS24_WEBHOOK_SECRET` (manual trigger).
   - A webhook dropped today is healed by the next morning's reconciliation run.

### Policy note

This does **not** regress the webhook-first decision. Webhooks remain the primary, real-time update path. Reconciliation is a low-frequency (daily) catch-up safety net, not polling — consistent with Beds24's guidance to avoid high-frequency GET calls and with CLAUDE.md's "no frequent polling without approval" rule. The daily cadence was confirmed by the user on 2026-06-10.

### Known limitations / future work

- The reconciliation window is the same 2-month operational window as the calendar. A dropped webhook for a booking **outside** current month + next month (e.g. 8+ months out) is not healed by reconciliation. This matches the confirmed MVP calendar scope.
- No active alerting yet (e.g. "0 webhook events received in 24h" → Slack/push). The data to detect this now exists in `beds24_webhook_events`; wiring an alert channel is deferred.
- Reconciliation upserts the full window each run (~hundreds of rows). The upserts are **batched** (in-memory dedup → 500-row chunked bulk upsert in `reservations-backfill.ts`); `maxDuration` is set to 60s on the route as a guard. This fixed an initial production timeout — per-row upserts from a US-East (`iad1`) function to the Tokyo (`ap-northeast-1`) Supabase exceeded 60s.
- Function region is pinned to **Tokyo (`hnd1`)** in `vercel.json` (`regions`), co-located with the Tokyo Supabase DB and the Tokyo-based operations users. This minimizes DB round-trip latency for the reconcile cron, the webhook handler, and all other DB-bound routes. (Default was `iad1` / US-East.)

## Order Delivery Calendar — moved out of the reservation calendar (2026-06-15)

**Decision update (2026-06-15):** the order **delivery calendar will NOT live in this reservation
calendar.** This room-axis timeline is keyed to guest reservations per room; building-scoped order
deliveries do not fit that axis and would clutter the primary reservation use case. The delivery
calendar instead lives in the **mobile Requests area, on the 비품주문 (order) tab only** — opened from
a calendar icon next to the "내 요청" toggle as a large popup, derived directly from
`order_requests.delivery_date` (no separate calendar entry / no schema change). Full spec:
`docs/product/10-order-request-workflow.md` → "Delivery Calendar (Planned / Design — 2026-06-15)".

Retained rules (still apply, just on the Requests-side calendar):

- Only `delivery_date` (point) / `delivery_start_date`..`delivery_end_date` (range) drives an entry.
- No other order workflow date creates a calendar entry.
- If `delivery_date` is missing, no entry is created.
- For delivery scheduling only — not generic purchasing / approval / receiving timeline visualization.

Current data status (as of 2026-06-01): `delivery_date` (+ range columns) exists on `order_requests`
(migrations `202606010002` / `202606020001`), is **required** at the `approved → ordered` transition,
and is displayed on the order detail page + request list cards in Asia/Tokyo. The Requests-side
delivery calendar view is **implemented (2026-06-15)** — `OrderDeliveryCalendar`, opened from the
order tab; the delivery date is editable from the order detail by office roles.

## 2026-05-23 Mobile Calendar Policy Update

- Calendar tab entry now starts with a building picker when no `property` query is selected.
- The picker hero may use a Lottie animation asset for the building/assistant scene; do not recreate it as CSS-only illustration when an approved animation file exists.
- Building picker cards use property-specific icons: Okubo detached-house properties use a house icon, all other properties use a hotel/building icon.
- Selecting a building opens the property-specific calendar via `?property=<building>`.
- The previous horizontal building filter chip row is removed from the calendar view; selected-property changes happen through the building picker.
- Mobile tab interaction now uses three consistent selectable tabs:
  - `Calendar` (overview timeline)
  - `Lists` (check-in/check-out/staying + empty summary)
  - `Map` (operational building access hub)
- `Map` is active and provides building cards, map links, and access-info entry points.
- Reservation detail bottom-sheet action policy is now explicit:
  - `Message Guest`: disabled fallback until messaging integration is ready.
  - `Manage Booking`: disabled fallback until external channel/booking integration is ready.
  - Both actions must show a clear reason in UI copy.
- Phone action policy in reservation detail:
  - Copy phone number action must be provided.
  - Call action (`tel:`) must be provided only when a dialable number is present.
  - Missing phone numbers must show explicit fallback copy, not silent `-`.
- `Empty today` on mobile is still provisional in this phase:
  - current formula = rooms observed in reservation data - occupied rooms today.
  - this is not authoritative without room master data.
  - implementation must keep TODO markers for room-master-based replacement.

## 2026-05-24 Empty Today - Provisional vs Authoritative

- `Empty today` calculation state: **provisional**.
- Provisional formula: `(unique room_label values in current month's reservations) - (rooms occupied today)`.
- Limitation: rooms with no reservations in the current month are invisible to this formula and are not counted as empty.
- UI: Lists mode shows an amber warning card with locale-specific `emptyAccuracyHint` text when the calculation is provisional. The amber card and hint are hidden automatically once authoritative data is supplied.

### Component readiness (current state)

Both the Overview room axis and `computeEmptyToday()` in `src/components/calendar/mobile-calendar-view.tsx` use the same `roomMasterRooms` prop. The authoritative/provisional branch is determined by whether the prop is `undefined` (not connected / unpopulated) or a non-empty array (authoritative room list):

| `roomMasterRooms` value | Source | Overview room axis | Empty today | Amber warning |
|---|---|---|---|---|
| `undefined` | rooms table absent or empty | Reservation-observed rooms | Provisional | Shown |
| `[]` | room master connected, but all current rows inactive/non-operational | No active room rows | Authoritative zero-room state | Hidden |
| `["A", "B", ...]` | `getActiveRoomLabels()` returned active room rows | All master rooms | Authoritative | Hidden |

**Current wiring (as of 2026-05-24):**

- `src/app/mobile/calendar/page.tsx` now calls `getActiveRoomLabels(session.organization.id, supabase)` in parallel with the reservations query and passes the result as `roomMasterRooms`.
- `getActiveRoomLabels()` in `src/lib/rooms.ts` returns `undefined` while the org has no **classified** room-master rows yet.
- "Classified" means:
  - non-Beds24 room row, or
  - Beds24 room row with `external_minimum_stay` present
- Once classified room-master rows exist, `getActiveRoomLabels()` returns `string[]`:
  - `[]` when every classified row is inactive / filtered out
  - `["A", "B", ...]` when active room rows exist
- The `rooms` table (`supabase/migrations/202605240001_properties_rooms.sql`) exists in schema but contains no data yet, so the calendar remains in provisional mode until rows are inserted.
- Beds24 active room filter rule is encoded in `BEDS24_INACTIVE_MIN_STAY_THRESHOLD = 50` in `src/lib/rooms.ts`. Safety guard: Beds24 rooms are treated as active only when `external_minimum_stay` is explicitly present and `< 50`. Rows with `external_minimum_stay >= 50` or `NULL` are excluded from the active room list.
- property sync prefers `(organization_id, external_provider, external_property_id)` when Beds24 property ID is present, and falls back to `(organization_id, name)` only when the payload omits the external property ID.
- inventory sync now uses Beds24 property data as the primary authoritative classification source:
  - primary: `GET /properties?includeAllRooms=true` -> `roomTypes[].id`, `roomTypes[].minStay`
  - fallback: current-date `GET /inventory/rooms/calendar?propId=...`
  - tested same-day calendar responses returned `calendar: []`, so the calendar endpoint is currently fallback-only

**To activate authoritative mode:** the Beds24 webhook (`/api/beds24/webhook`) now performs two sync steps:
1. booking payload -> `properties` / `rooms` / `reservations`
2. property/room minimum-stay lookup -> `external_minimum_stay` / room status refresh

If the inventory call succeeds and yields `minimumStay`, `getActiveRoomLabels()` can immediately return classified active rooms and the calendar leaves provisional mode automatically. If the inventory call is unavailable or returns no usable room rows, the calendar remains provisional until classification data exists.

## 2026-05-26 Building Filter Update

- `/mobile/calendar` now supports building-level filtering using `property` query:
  - example: `/mobile/calendar?month=2026-05&property=아라키초A`
- Filter chips are shown above the calendar/list body:
  - detected building list only (no `All`)
  - month navigation preserves selected building
- Active room axis follows room master + building filter together:
  - room source = active rows from `rooms` table
  - only rooms belonging to the selected building are rendered
- Current operational building order for UI:
  - 아라키초A, 아라키초B, 가부키초, 다카다노바바, 오쿠보A, 오쿠보B, 오쿠보C

## 2026-05-26 Active room loading policy clarification

- Confirmed company rule: Beds24 `minimumStay >= 50` (including 50, up to 99+) is inactive.
- Calendar reservation loading now follows room-master authoritative filtering:
  - if room master is available, only reservations whose `room_label` belongs to active room-master rows are rendered.
  - inactive room-id account reservations are excluded from UI rendering.
  - legacy/manual rows without raw Beds24 room identity are not trusted in authoritative mode because they cannot be verified against the active external room-id catalog.

## 2026-05-26 Physical-room display normalization

- Active room selection rule remains authoritative: only `minimumStay < 50` is active (`>= 50` inactive).
- UI room labels now normalize by property-level operational rules:
  - �ƶ�Ű��A: suffix room labels like `201_2` still normalize to base room label `201`, but reservations carrying inactive external room IDs are filtered before rendering so inactive aliases do not reappear.
  - ����Ű��: `K202`, `202#` -> `202`
  - ������A/B/C: all Beds24 room IDs in each property collapse to one detached-house room label (`������A`, `������B`, `������C`)
- Reservation bars and room axis use the same canonical label mapping to avoid split rows for one physical room.

## 2026-05-26 Canonical property naming update

- Property labels are now normalized to the fixed operational names in UI:
  - �ƶ�Ű��A, �ƶ�Ű��B, ����Ű��, ��ī�ٳ�ٹ�, ������A, ������B, ������C
- This normalization is applied before calendar filters and room-label canonicalization.

## 2026-05-26 Operational exclusion updates

- Excluded from mobile calendar operations:
  - Property: `���` (currently not operated)
  - Room: `��ī�ٳ�ٹ� 401_2` (inactive room-id alias)
- Okubo property display is unified to `������A`, `������B`, `������C` (no raw Beds24 suffix labels in UI).
- Property chips and reservation property labels now render locale-specific names (ko/ja/en) while keeping canonical internal mapping.

## 2026-05-26 Property label format adjustment

- Locale display labels use compact building format for English (`ArakichoA`, `ArakichoB`, `OkuboA`, `OkuboB`, `OkuboC`).
- Property normalization now absorbs Beds24 raw variants with underscores/parentheses so `Okubo_A (B棟)` style names always map to canonical Okubo labels.

## 2026-05-26 Today column alignment fix + auto-scroll to today on first entry

### Alignment fix

Root cause: the room-row body container had `p-1` (4px horizontal padding), shifting all absolute-positioned elements (bars, today stripe) 4px to the right of the header date cells.

Fix: changed `p-1` → `py-1` (top/bottom padding only). Now `left: N * DAY_WIDTH` in a room row maps to the same x as the N-th header date cell.

Follow-up hardening (same day):

- Header day-cell width now also uses `DAY_WIDTH` directly (inline style) instead of an independent Tailwind width class.
- Header and body share one coordinate system:
  - header today emphasis: `date === today`
  - body today stripe x: `todayIndex * DAY_WIDTH`
  - date lookup: `dates.findIndex((date) => date === today)`
- This removes drift risk when design tokens or Tailwind width classes change.

### Auto-scroll to today

On first entry into the overview panel for a given month/property:
- `scrollLeft` is set to `max(0, todayIndex - 1) * DAY_WIDTH` so the day before today is visible at the left edge, placing today clearly in view
- Implemented with `useEffect` (deps: `mode`, `isTodayInView`, `todayIndex`, `selectedMonth`, `selectedProperty`)
- A `Set<string>` ref tracks scrolled `selectedMonth:selectedProperty` keys — each combo is auto-scrolled at most once per client session
- When `selectedMonth` is not today's month (`isTodayInView === false`): auto-scroll is skipped
- When mode switches back to "overview" after having been auto-scrolled: no repeat scroll (key already in Set)

## 2026-05-26 Mobile calendar overview readability improvements + today column highlight

### Readability changes

- Row height: `h-8` (32px) → `h-10` (40px) across header, room label column, and all room rows
- Max visible area: `max-h-[460px]` → `max-h-[560px]` to preserve the number of visible rooms
- Date header font: `10px` → `11px`; still `font-semibold`
- Room label font: `11px` → `12px` (`text-xs`); color `text-muted-foreground` → `text-foreground/70`
- Reservation bar: `h-6 top-1` → `h-7 top-1.5` — slightly taller bars with centered vertical position

### Today column highlight (Asia/Tokyo)

- Source of truth: `today` prop passed from server (computed `Asia/Tokyo` — never recomputed on client)
- Header today cell: amber/orange background + bold orange text
  - `bg-orange-200/50 font-bold text-orange-600` (light-mode-only; dark variants removed 2026-06-08)
- Body today column: per-row `pointer-events-none` absolute stripe at `left: todayIndex * DAY_WIDTH`
  - `bg-orange-200/30` (light-mode-only; dark variants removed 2026-06-08)
  - Inserted as first child of each room row so reservation bars (DOM order: later) render on top
- When `today` is outside the selected month (`todayIndex === -1`), no highlight is rendered

## 2026-05-26 Reservation bar off-by-one fix (last day of month)

### Problem

The last day column of the selected month (e.g., May 31) appeared empty even when reservations were staying through that night.

Root cause: the bar rendering code used `rangeEnd = dates.at(-1)` (e.g., `"2026-05-31"`) as an **inclusive** clamp and computed width as `endDate - startDate`. A stay of `check_in=2026-05-29, check_out=2026-06-01` clamped to `end="2026-05-31"`, giving `widthDays = May31 - May29 = 2` — missing the 31st column.

### Fix

`rangeEndExclusive = "${nextMonth}-01"` (e.g., `"2026-06-01"`) is now used as the exclusive upper bound for all bar calculations in `src/components/calendar/mobile-calendar-view.tsx`:

- **`activeInRange` filter**: `checkInDate < rangeEndExclusive` (was `<= rangeEnd`)
- **Bar clamp**: `endExclusive = min(checkOutDate, rangeEndExclusive)`
- **Width**: `widthDays = (endExclusive − start) / 1 day`

Verified regression cases:

| Reservation | May view expected | Result |
|---|---|---|
| `05-31 → 06-01` | 31st column, 1 day wide | ✓ |
| `05-29 → 06-01` | 29, 30, 31 — 3 days wide | ✓ |
| `04-29 → 05-01` | not shown (checkout = range start) | ✓ |
| `04-29 → 05-02` | 1st column, 1 day wide | ✓ |
| `06-01 → 06-05` | not shown (pure June) | ✓ |

The visible date header columns (01–31) are unchanged.

## 2026-05-26 Room label resolution — Japanese property name and global externalRoomId fallback

### Background

`resolveReservationCanonicalRoomLabel` uses a 4-step fallback chain to map a raw reservation record to a canonical room label that the active room-master catalog recognizes. In authoritative mode, reservations that fail all steps are filtered out.

### Root cause of 아라키초A reservation bars not appearing

When Beds24 sends a Japanese property name (e.g. `"荒木町A"`) in the reservation payload, the previous `getCanonicalPropertyName()` implementation did not recognize it and returned `"荒木町A"` unchanged. The lookup table `canonicalRoomLabelsByProperty["荒木町A"]` was undefined, so `allowed = new Set()`. All `allowed.has()` checks failed, including the property-specific `externalRoomId` lookup, so every step returned false and reservations were filtered out.

### Fixes applied (2026-05-26)

1. **Japanese kanji aliases in `src/lib/room-label-normalization.ts`:** Each property recognizer now includes the Japanese kanji form:
   - `isArakichoA`: `"荒木町a"` (after `.toLowerCase()`)
   - `isArakichoB`: `"荒木町b"`
   - `isKabukicho`: `"歌舞伎町"`
   - `isTakadanobaba`: `"高田馬場"`
   - `isSano`: `"佐野"` (exclusion rule preserved)
   - `isOkuboA`: `"大久保a"`, `isOkuboB`: `"大久保b"`, `isOkuboC`: `"大久保c"`

2. **Global `externalRoomId` fallback in `src/app/mobile/calendar/page.tsx`:** A `globalExternalRoomToCanonical: Map<string, string>` is built from the full room catalog (all properties, all active rooms) before `resolveReservationCanonicalRoomLabel` runs. If the property-specific `externalRoomId` lookup fails (due to property-name mismatch), the resolver now tries the global map. Since `externalRoomId` is unique across the rooms table, no `allowed.has()` guard is needed — the catalog is authoritative.

3. **Missing payload aliases:** `"unitLabel"`, `"unit_label"`, `"room_label"` added to the unit-name lookup key list.

### Resolution order (updated)

| Step | Source | Guard |
|---|---|---|
| 1 | `getCanonicalRoomLabel(property, room_label)` | `allowed.has()` |
| 2 | payload unit name (`unitName`/`unit_name`/`roomName`/`room_name`/`roomLabel`/`unitLabel`/`unit_label`/`room_label`) → normalize | `allowed.has()` |
| 3 | payload unit name → raw label map lookup | `allowed.has()` |
| 4 | payload unit ID (`unitId`/`unit_id`/`roomId`/`room_id`) → property-specific externalRoomId map | `allowed.has()` |
| 5 | payload unit ID → global externalRoomId map | none (catalog-authoritative) |
| 6 | single-room property fallback (`allowed.size === 1`) | — |
| 7 | fallback: `fromReservation` (may not match → filtered out) | filtered by `activeCanonicalRoomSet` |

### Recurrence prevention

- **New properties or locales:** if a new property is added to Beds24 with a name in a new script/language, add the corresponding alias to the recognizer function in `src/lib/room-label-normalization.ts`. The global externalRoomId fallback (step 5) provides a safe net even before the alias is added.
- **New Beds24 payload field names:** add to the `payloadUnitName` or `payloadUnitId` alias arrays in `resolveReservationCanonicalRoomLabel`. The global fallback ensures that known room IDs always resolve even if field names vary.

## 2026-05-26 Building chips only policy

- Mobile calendar property filter no longer includes `All`.
- Only explicit building chips are shown.
- When no `property` query is provided, the first available building is auto-selected by server logic.

## 2026-05-26 Arakicho B label normalization

- Arakicho B room labels now strip alphabetic prefixes as well as suffix variants.
- Example: `Ab101` -> `101`.

## 2026-05-26 Overview grid refinement — lighter grid lines, horizontal room separators, pill bars

### Grid line changes

- **Vertical column lines**: opacity reduced from `rgba(0,0,0,0.10)` → `rgba(0,0,0,0.06)` — subtler feel without disappearing.
- **Horizontal room row separators (new)**: `border-b border-border/20` added to each room row (right body) and each room label (left column). Previously only vertical lines existed; horizontal lines now separate rooms clearly for scannability.
- `space-y-1` gaps and `py-1` container padding removed from both the left label column and right body container — rows stack directly and borders provide the visual separation.

### Reservation bar pill style

- Shape: `rounded-md` → `rounded-full` — full capsule/pill shape.
- Size: `top-1.5 h-7` → `top-2 h-6` — slightly shorter pill with more breathing room above and below.
- Padding: `px-1` → `px-1.5` — slightly wider internal text padding matching the rounder shape.
- Rationale: pill shape visually separates adjacent reservations better than square-corner bars, reducing crowding sensation even when bars are close.

## 2026-05-26 Webhook-only freshness behavior

- Operational expectation: new/modified/cancelled Beds24 reservations should appear from webhook writes, not from periodic calendar polling.
- Mobile calendar now listens to Supabase Realtime changes on `public.reservations` for the active organization and refreshes the screen automatically when reservation rows change.
- Backfill is retained only for dev/manual recovery, not as the normal user-visible freshness mechanism.
- Realtime prerequisite: `public.reservations` must be present in the `supabase_realtime` publication.

### Cancellation visibility policy (verified)

- When Beds24 sends a cancelled webhook event, the reservation row is updated in DB to `status = cancelled`.
- The calendar server query excludes cancelled rows (`status != cancelled`), so cancelled reservations disappear from:
  - overview bars
  - list sections (check-in / check-out / staying)
- This is an intentional display policy:
  - cancelled data can remain in DB for audit/recovery,
  - operational calendar surfaces must not show cancelled reservations as active occupancy.
- `no_show` keeps its own status and is not treated as cancelled by default in this phase.

## 2026-06-01 Planned Integration - Order Delivery Date Sync

Scope:

- This is a planned integration between Order Requests and Calendar.
- Not implemented in the current step.

Planned trigger:

- When an order request status changes to `ordered` and `delivery_date` is saved.

Planned result:

- Create a calendar schedule entry for the delivery date.
- Show this schedule to both requester and office/admin in calendar surfaces.
- Only the delivery date is used for this integration.

Current interim behavior:

- Keep `delivery_date` on the order request detail/list and notifications until calendar wiring is implemented.
