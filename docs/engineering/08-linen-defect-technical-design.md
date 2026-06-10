# Linen Defect Technical Design

Status: Draft — aligned to refined mobile-first product plan (2026-06-10)

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
