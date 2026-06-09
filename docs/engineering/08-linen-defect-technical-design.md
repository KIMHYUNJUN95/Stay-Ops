# Linen Defect Technical Design

Status: Draft

## Purpose

This document defines the recommended technical design for the Linen Defect workflow.

## First-Slice Goal

Deliver:

- property-scoped linen item master
- linen defect create flow
- shared list/detail history

Do not include:

- inventory deduction
- vendor billing
- analytics

## Recommended Tables

### `linen_items`

Purpose:

- property/building-scoped selectable linen item catalog

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

### `linen_defect_reports`

Purpose:

- actual reported defect records

Recommended fields:

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
property_id uuid not null references properties(id)
room_id uuid references rooms(id)
room_label text
linen_item_id uuid not null references linen_items(id)
quantity integer not null check (quantity > 0)
defect_type text not null
memo text
image_urls text[] not null default '{}'
reported_by_user_id uuid not null references profiles(id)
reported_at timestamptz not null default now()
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

## Type Suggestions

Recommended `defect_type` enum candidates:

```txt
torn
stained
unusable
missing_set
other
```

If the real workflow changes frequently, use text + app-side validation first.

## Query Rules

### Create Form

- load active properties/buildings user can access
- after property selection, load active `linen_items` for that property only

### List

Recommended filters:

- property
- item
- reporter
- date range
- defect type

## RLS Direction

### `linen_items`

- read: all active org members
- create/update/delete: admin-capable roles only

### `linen_defect_reports`

- read: all active org members in the organization
- insert: all active org members
- update/delete:
  - either author-only
  - or admin + author-only

Final correction policy should be confirmed before implementation.

## UI / Action Direction

Recommended routes/actions:

- mobile create
- mobile list
- mobile detail
- admin list
- admin item master

Recommended server actions:

- `createLinenDefectReport`
- `updateLinenDefectReport` if editing is approved
- `deleteLinenDefectReport` if deletion is approved
- `createLinenItem`
- `updateLinenItem`
- `toggleLinenItemActive`

## Images

If photos are included:

- reuse the existing `request-images` style upload pattern or create a `linen-images` bucket
- keep current image validation/compression rules unless the business needs something else

Recommended MVP choice:

- reuse current direct-upload pattern and keep file rules consistent

## Future Extensions

- visit batch table
- vendor follow-up status
- cost claim linkage
- monthly defect summary/reporting
