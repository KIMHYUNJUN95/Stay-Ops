# Linen Defect Technical Design

Status: First slice implemented (2026-06-10). Sections below the "As-Built" block are the
original design direction kept for context; where they disagree with "As-Built", the
"As-Built" section is authoritative.

## As-Built (First Slice)

The first slice ships as a building-scoped **linen return ledger** under
`/mobile/linen-return/*`. Side-menu entry only (id `linen-return`); not a default bottom tab.

### Building model

Building is the **canonical property name (text)**, identical to `order_requests.building_name`
and the app's operational building key (from `getActiveRoomCatalogServer` → `propertyName`).
We did **not** introduce a `properties` FK for linen, to stay consistent with every other
operational feature and the same building picker. The workflow doc explicitly permitted a
"canonical building key".

### Tables (migration `202606100002_linen_returns.sql`)

- `linen_items` — selectable catalog. `organization_id` + nullable `building_name`
  (`NULL` = available for all buildings). Current global default set per org is 7 items:
  `duvet_single, duvet_double, mattress_single, mattress_double, pillow, towel, mat`.
  Earlier generic defaults (`bath, hand, sheet, duvet, robe`) are retired via a follow-up migration
  and remain only for historical records. Building-specific lists are added later. Fields: `code, name, category, is_active,
  display_order, created_by_user_id, timestamps`. **Display names are localized by `code`** via
  i18n (`linenReturn.items`, ko/ja/en) in the lib layer (`localizeItemName`); the DB `name` is the
  fallback for custom items that have no `code`. The seed stores Korean in `name`, but the UI shows
  the locale-correct label.
- `linen_return_records` — header. `organization_id, building_name (text, required), note,
  image_urls text[], registered_by_user_id, registered_at, timestamps`. No status column.
- `linen_return_record_items` — lines. `return_record_id (cascade), linen_item_id, quantity
  (>0), sort_order`, `unique (return_record_id, linen_item_id)` blocks duplicate items.

### Routes / actions

- `GET /mobile/linen-return` — building picker (card grid only; no search box — building lists are short)
- `GET /mobile/linen-return/list?building=` — building-scoped latest-first list + FAB + ledger link
- `GET /mobile/linen-return/new?building=` — create form (`createLinenReturnRecord`); save path first checks for an existing
  record by the same user for the same building inside the current Tokyo day and merges into it when found
- `GET /mobile/linen-return/record/[id]` — detail (edit/delete shown only when permitted)
- `GET /mobile/linen-return/record/[id]/edit` — edit (`updateLinenReturnRecord`, `deleteLinenReturnRecord`)
- `GET /mobile/linen-return/ledger?building=&year=&month=` (month mode) or `&startDate=&endDate=` (custom range) — ledger (records / item-summary, registrant + item filters, and a "my entries" toggle that
shows only records registered by the current user — client-side filter on `registeredByUserId`).
Period control: prev/next month arrows + a clickable period label that opens a date-range calendar card modal (`DateRangeCalendar`) for touch start/end selection; the chosen range drives the actual query (Tokyo-day boundaries).

Building is passed as a query param (not a path segment) and validated server-side against
the org room catalog (`isKnownBuilding`).

### Images

Reuses the existing `request-images` bucket with a new `linen-returns/<recordId>/...` subfolder;
the upload/delete storage policies were extended to allow that segment. Direct client upload +
compression via `AnnouncementImageUploader` + `uploadRequestImages`, ≤5 photos. Photo editing in
the edit flow is deferred (existing photos preserved; create flow uploads them). When a same-day
follow-up save merges into an existing record, newly uploaded photos are appended to that target
record's `image_urls`.

### Save UX

After save, redirect to the building list with `?created=<id>`, show a completion overlay,
and highlight the affected row. If no same-day record existed, the id is the new header row; if
the save merged into an existing same-user same-building Tokyo-day record, the id is that existing
record.

**Overlay/submit stacking (fixed 2026-06-15).** The mobile shell's scroll container is `transform`ed,
so a plain `position: fixed` child is trapped inside it (not the viewport) and is hidden behind the
`z-20` bottom tab bar. Two changes:
- The **create/edit pages** render `MobileShell` with `hideBottomNav` (focused full-screen flow), so
  the global tab bar is not shown and cannot overlap the sticky submit bar.
- The create-form **submit bar** (`linen-return-create-form.tsx`) and the **success overlay**
  (`linen-return-success.tsx`) `createPortal` to `document.body` (hydration-gated) so they cover the
  real viewport. The submit bar is fixed at `bottom-0` (`z-40`, `max-w-[460px]` centered; its button
  stays wired to the form via the `form="linen-return-form"` attribute) and the success modal dims the
  whole screen (`z-90`). Mirrors the tasks-workspace portal pattern.

### Permissions

Read/insert: all active org members. Update/delete: the record author or admin-capable roles
(`owner, office_admin, cs_staff, field_manager`) — enforced in RLS and re-checked in actions via
`canManageLinenRecord`. Deletion is hard delete. Line-item RLS follows the parent record.

---

## Purpose

This document defines the recommended technical design for the Linen Defect workflow.

Important clarification:

- although the feature name remains "Linen Defect"
- the first slice behaves as a **linen return ledger**
- the main record proves that a staff member registered returned defective linen for one building at one moment

## First-Slice Goal

Deliver:

- building-specific linen item selector direction
- mobile building picker
- mobile building-scoped latest-first list
- mobile create flow using header + line items
- mobile detail
- mobile ledger/statistics screen

Do not include:

- admin web surface
- stock deduction
- vendor billing
- approval/status workflow
- replacement tracking

## Data Model Direction

The first slice should not use one DB row per linen item return.

Use:

```txt
return record header
+ child line items
```

Reason:

- one user action may register multiple items at once
- one saved record is one building-scoped return event
- later ledger checks need to preserve the event as one record

## Recommended Tables

### `linen_items`

Purpose:

- building-scoped selectable linen item catalog

Recommended fields:

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
property_id uuid not null references properties(id)
code text
name text not null
category text
is_active boolean not null default true
display_order integer not null default 0
created_by_user_id uuid references profiles(id)
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Notes:

- product planning assumes a building-specific item dropdown UI from day one
- the master data can still be finalized during implementation

### `linen_return_records`

Purpose:

- one saved return event for one building

Recommended fields:

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
property_id uuid not null references properties(id)
note text
image_urls text[] not null default '{}'
registered_by_user_id uuid not null references profiles(id)
registered_at timestamptz not null default now()
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Rules:

- `property_id` is required
- one record cannot mix buildings
- `registered_by_user_id` and `registered_at` are system-managed
- no status column in the first slice

### `linen_return_record_items`

Purpose:

- item lines belonging to one return record

Recommended fields:

```txt
id uuid primary key
return_record_id uuid not null references linen_return_records(id) on delete cascade
linen_item_id uuid not null references linen_items(id)
quantity integer not null check (quantity > 0)
sort_order integer not null default 0
created_at timestamptz not null default now()
```

Rules:

- quantity is integer only
- the same `linen_item_id` must not appear twice inside one `return_record_id`
- add a unique constraint on `(return_record_id, linen_item_id)`

## Removed From First Slice

Do not model these as first-slice required fields:

- `room_id`
- `room_label`
- `defect_type`
- vendor name
- scheduled pickup date
- next visit date
- workflow status

Reason:

- they are not part of the confirmed mobile-first product plan

## Query Rules

### Building Picker

- load buildings the user can access in the organization
- support search over localized/canonical building labels

### Building List

- require one selected building
- show only records for that building
- sort by `registered_at desc`
- no all-buildings mixed feed

### Create Form

- building is fixed from the current building context
- load active `linen_items` for that building only
- require at least one line item
- block duplicate items inside the same form

### Detail

- load header + child line items together
- verify organization scope

### Ledger / Statistics

- require one selected building
- default range = current month in Tokyo time
- allow custom date range
- support search/filter by:
  - registered user
  - linen item
  - date / date range

Provide two data shapes:

1. record view
2. item summary view

### Item Summary Aggregation

For the item summary mode, aggregate by item within one building and date range:

```txt
item name
sum(quantity) as total_quantity
count(distinct return_record_id) as total_records
```

## Timezone Rule

Use Tokyo operating time for:

- default month boundaries
- date-range filtering semantics shown to users

Do not rely on naive UTC date slicing for ledger periods.

## RLS Direction

### `linen_items`

- read: all active org members
- create/update/delete: admin-capable roles only

### `linen_return_records`

- read: all active org members in the organization
- insert: all active org members
- update/delete:
  - author of the record
  - or admin-capable roles in the organization

### `linen_return_record_items`

- read: follows parent record visibility
- insert/update/delete: same rule as parent record mutation

## UI / Action Direction

Recommended mobile routes/actions:

- mobile building picker
- mobile building list
- mobile create
- mobile detail
- mobile ledger/statistics

Recommended server actions:

- `createLinenReturnRecord`
- `updateLinenReturnRecord`
- `deleteLinenReturnRecord`
- `createLinenItem`
- `updateLinenItem`
- `toggleLinenItemActive`

Admin-web-specific routes/actions are intentionally deferred.

## Save UX Direction

After save:

- show a completion-focused success moment
- return user to the same building list
- the new record should appear at the top because of latest-first ordering

## Images

Photos are optional.

Recommended MVP choice:

- reuse current direct-upload pattern
- keep current image validation/compression rules unless implementation finds a strong business reason to diverge

## Future Extensions

- admin web surface
- replacement confirmation tracking
- vendor follow-up status
- cost claim linkage
- monthly cross-building analytics dashboard
- richer item master administration
