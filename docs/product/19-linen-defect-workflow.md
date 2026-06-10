# Linen Defect Workflow

Status: Draft — refined product plan (2026-06-10)

## Purpose

This module is not just a generic defect log.

Its first operational purpose is to leave a clear internal record that:

- a staff member handed defective linen back to the vendor
- it happened on a specific date
- it belonged to a specific building
- the returned items and quantities were recorded

The most important evidence point is:

```txt
Who registered the return, and when?
```

This is needed because:

- the linen vendor visits around four times per week
- defective items are sometimes mixed into incoming linen
- replacement may fail or be delayed on the vendor side
- the office later needs to compare StayOps records against delivery slips
- the team also wants to review monthly return volume by building and by item

## Working Definition

For the first mobile-first slice, treat this feature as a:

```txt
building-scoped linen return ledger
```

More specifically:

- the trigger is not simply "a defect exists"
- the trigger is "we registered this linen as returned / handed back"
- one saved record is one return event for one building

This keeps the product aligned to the real operations need:

- proof of return registration
- historical lookup
- date/building/person-based checking
- later comparison against vendor paperwork

## Scope Position

This module is related to linen defects, but the workflow is operationally closer to:

- a return record
- a site ledger
- a vendor comparison log

It is **not** the first slice of full inventory management.

## Relationship To Other Modules

### Property / Building Model

Each return record belongs to exactly one building.

Rules:

- a return record cannot mix multiple buildings
- the user must enter through a building-specific flow
- the building drives the linen item selection list

### Linen Item Master

Buildings may use different linen types.

Confirmed direction:

- the UI should be designed from the start as a building-specific item selector
- the real dropdown/item-master connection can be completed later during implementation
- do not design this as uncontrolled free-text item entry

### Inventory

This module should not:

- adjust stock automatically
- settle vendor claims
- calculate financial loss

Those are possible later extensions, not first-slice requirements.

### Notifications

No notification requirement in the first slice.

## Users

Primary users:

- Owner
- Office Admin
- CS Staff
- Field Manager
- Staff
- Part-time Staff

Rules:

- all active organization users can create and read linen return records
- all active organization users can view all buildings in their organization
- authors can edit/delete their own records
- admin-capable roles can edit/delete all records
- admin-capable roles manage the linen item master later

## Core Product Rules

### 1. One Return Record = One Building

One record can contain multiple linen items, but:

- it belongs to one building only
- items from different buildings cannot be mixed into one record

Reason:

- vendor paperwork checking is building-based

### 2. One Return Record = One Return Event

One saved record represents one registration event by one user at one time.

The system must automatically store:

- registered date/time
- registered user

These should not be manual input fields.

### 3. Multiple Items Are Allowed In One Record

Field staff often need to register several returned items at once.

So one record should support:

- item line 1
- item line 2
- item line 3
- etc.

### 4. Duplicate Items In The Same Record Are Not Allowed

Inside one return record:

- the same item can appear only once
- quantity should be summed in that single line

Example:

```txt
Allowed:
- Bath towel x3
- Pillow cover x2

Not allowed:
- Bath towel x1
- Bath towel x2
```

### 5. Quantity Is Integer Only

The first slice should use:

- integer quantity only

No decimal or half-unit input is needed.

### 6. No Status Workflow In MVP

This is a simple record workflow.

There is no first-slice status such as:

- registered
- reviewed
- confirmed

Once saved, the record exists as a ledger entry.

## Record Structure

### Record Header

One return record contains:

```txt
id
organization_id
building_id or canonical building key
registered_by_user_id
registered_at
note
image_urls
created_at
updated_at
```

### Record Line Items

Each return record also contains one or more line items:

```txt
id
return_record_id
linen_item_id
quantity
sort_order
created_at
```

Important:

- this is a header + line-item model
- not a flat one-row-per-item model

## Required Fields

### System-Auto Fields

Auto-filled by system:

- registered date/time
- registered user

### User Required Fields

Required:

- building
- at least one linen item line
- quantity for each line

### Optional Fields

Optional:

- note
- photos

## Note Field Policy

There is no separate structured "defect reason" field in the first slice.

Instead:

- reason and memo are merged into one free-text note field

Reason:

- field staff should not be forced through too many inputs
- the workflow should stay fast and lightweight

Examples:

```txt
오염 심함
찢어짐 있음
세트가 안 맞음
업체에 바로 전달함
```

## Photo Policy

Photos are optional.

They may be used for:

- evidence
- showing the problem clearly
- preserving unusual details

Rules:

- some users may attach photos often
- some may save without photos
- the UI should support photos, but should not force them

## Mobile Information Architecture

This feature is mobile-first.

Admin web is intentionally deferred until the broader mobile feature set is complete.

### Entry Placement

- dedicated side-menu entry
- not a default bottom-tab item
- can later be offered inside the user-customizable bottom-bar editor pool

### Mobile Flow

```txt
Open Linen Return
-> building picker
-> building-specific return list
-> create return record / open detail / open ledger
```

### Building Picker

Required direction:

- first entry screen should be a building card grid
- search should be available
- after entering a building, the screen should still offer a "change building" action

## Mobile Screens

### 1. Building Picker

Purpose:

- choose the building first

UI direction:

- card grid
- search
- fast building switching

### 2. Building Return List

Purpose:

- show return history only for the selected building

Rules:

- do not show an all-buildings mixed feed here
- sort by latest registered first
- keep the screen operationally simple
- search/filter is not the main responsibility of this screen

Recommended card content:

- registered date/time
- registered user
- item summary
- total quantity
- photo attachment indicator when applicable

Not needed on the card:

- building name
- status badge
- note preview

Primary CTA:

- fixed bottom FAB for new return registration

### 3. Return Create Screen

Purpose:

- register one building-scoped return event quickly

Form direction:

- building already fixed by previous screen
- item line 1 starts visible
- user can add more lines with `+ add item`
- each line = item selector + integer quantity
- each line can be deleted directly
- duplicate items inside the same record are not allowed
- note is one optional free-text field
- photos are optional

### 4. Return Detail Screen

Purpose:

- show the exact saved record

Recommended content:

- registered date/time
- registered user
- building
- all item lines with quantities
- total quantity
- full photo set when attached
- edit button
- delete button

Not required:

- note full text as a mandatory detail block in the first design

Permission display rule:

- show edit/delete only when the current user is allowed to use them

### 5. Ledger / Statistics Screen

Purpose:

- let staff and office users inspect records like a ledger

Why this is separate:

- the normal building list should stay simple
- heavier checking/search belongs in a dedicated ledger view

Required behavior:

- building-scoped
- default period = current month
- also support custom date range
- support searching/filtering by:
  - registered user
  - linen item
  - date / date range

This screen should support two modes:

#### Record View

Recommended row content:

- registered date/time
- registered user
- item summary
- total quantity
- detail entry
- optional photo indicator

#### Item Summary View

Recommended aggregated values:

- item name
- total returned quantity
- total return record count

Example:

```txt
Bath towel 12 units / 5 records
Pillow cover 8 units / 3 records
```

## Save And Completion UX

After a successful save:

- show a completion-focused success moment
- a richer 3D completion motion is explicitly acceptable in this workflow
- after the motion, return the user to the selected building's return list

Reason:

- the feature is repetitive field work
- after saving, users usually need to continue working in the same building context

Recommended post-save behavior:

- return to the building list
- place the new record at the top
- optionally highlight the newly created row briefly

## Search / Filter Policy

### Building Return List

Keep this screen simple.

Baseline direction:

- latest-first list
- no heavy search/filter responsibility

### Ledger / Statistics Screen

This is the main search surface.

Required searchable/filterable dimensions:

- registered user
- linen item
- date / date range

Not required in first slice:

- free-text note search

## Edit / Delete Policy

### Edit

- authors can edit their own records
- non-authors cannot edit other users' records
- admin-capable roles can edit all records

### Delete

- authors can delete their own records
- non-authors cannot delete other users' records
- admin-capable roles can delete all records
- deletion is hard delete in MVP

## Out Of Scope

Deferred:

- admin web surface
- vendor settlement / reimbursement workflow
- replacement tracking
- stock deduction
- approval/status workflow
- per-item structured reason enums
- all-buildings mixed operational feed
- free-text item entry as the primary design pattern

## Open Implementation Notes

These are intentionally acknowledged now, but do not block the product/design phase:

- the building-specific linen item dropdown/master will be implemented later
- final table names and exact schema can be confirmed in technical design
- the customizable bottom-tab pool update should happen when navigation implementation begins

## Suggested Design-First Slice

Design in this order:

1. building picker
2. building return list
3. return create form
4. return detail
5. ledger / statistics (record view + item summary view)

## Verification Focus For Future Implementation

- building-first entry flow is preserved
- one record cannot mix buildings
- one record can include multiple item lines
- duplicate item lines are blocked
- quantity is integer-only
- author/admin edit-delete rules hold
- latest-first building list is correct
- ledger filters work by user / item / date
- ko/ja/en strings exist
