# Linen Defect Workflow

Status: Draft

## Purpose

The Linen Defect workflow is used to record damaged, unusable, or vendor-returned linen items during normal field operations.

Main goal:

- Let staff register linen defects whenever the linen vendor visit reveals damaged items.
- Keep records consistent even when each property/building uses a different linen set.
- Make the workflow simple enough for repeated weekly use.

## Why This Module Exists

Operational reality:

- The linen vendor visits about four times per week.
- Defects may be discovered repeatedly and in batches.
- A simple free-text memo is not enough because the company needs item-level tracking by property/building.

This workflow is closer to an operational defect log than to normal inventory management.

## Relationship To Other Modules

### Property / Room Model

Linen items differ by property/building.

Required relationship:

- Each linen item should belong to a property/building or item group usable by that property/building.
- The create form should show only active linen items relevant to the selected property/building.

Room/unit linkage is optional in the first slice.

### Inventory

This is not the same as full inventory management.

First version should:

- record what was defective
- record how many
- record where

First version should not:

- adjust stock counts automatically
- handle vendor settlement or billing

### Notifications

Notifications are not required for the baseline slice.

They can be added later if the company wants alerts for:

- high defect volume
- repeated defects for the same item
- unresolved vendor follow-up

## Users

Primary users:

- Owner
- Office Admin
- CS Staff
- Field Manager
- Staff
- Part-time Staff

Rule:

- All active organization users can create and read linen defect records.
- Admin-capable roles manage the linen item master.

## Core Concepts

### Linen Item Master

The workflow should not rely on uncontrolled free-text names.

Recommended baseline:

- Define active linen items per property/building.
- Allow admin-capable roles to activate/deactivate items.
- Keep display names editable because real-world linen naming changes over time.

### Defect Record

A defect record captures:

- where the problem happened
- which linen item was affected
- how many were affected
- what kind of defect it was
- who reported it

### Visit Batch

The first slice does not require a visit-batch model.

However, the product should leave room for a later batch concept such as:

```txt
Vendor visit on 2026-06-09
  - Bath towel x3 damaged
  - Pillow cover x2 stained
  - Bed sheet x1 unusable
```

## Required Fields

Recommended first version fields:

```txt
id
organization_id
property_id or property_name
room_id or room_label (optional in MVP)
linen_item_id
quantity
defect_type
memo
image_urls
reported_by_user_id
reported_at
created_at
updated_at
```

## Field Meaning

### Property / Building

Required.

This is the main scope for item selection and reporting.

### Room / Unit

Optional in MVP.

Useful when:

- a defect is tied to one room
- the team wants more precise follow-up later

Do not require it unless the field workflow truly depends on it.

### Linen Item

Required.

Must come from the active linen item master for the selected property/building.

### Quantity

Required.

Simple integer input is enough for the first slice.

### Defect Type

Recommended initial values:

- torn
- stained
- unusable
- missing_set
- other

The company can switch to free-text detail later if needed.

### Memo

Optional.

Use for:

- vendor explanation
- special handling notes
- location details

### Photos

Optional in the first slice, but recommended if the field team actually needs evidence.

If included:

- reuse the existing image-upload pattern used in requests/announcements
- keep the same compression and count rules unless the real workflow needs different limits

## Workflow

Baseline flow:

```txt
User opens Linen Defect
Select property/building
Select linen item
Enter quantity
Choose defect type
Optional memo / photos
Save
Record appears in list/history
```

## Mobile Views

Recommended mobile baseline:

- defect list
- create form
- detail page

Important mobile UX rules:

- property first
- short form
- no spreadsheet-style item table in the first slice

## Admin Views

Recommended admin baseline:

- linen defect list
- detail page
- linen item master management

Admin list should support:

- property filter
- date filter
- linen item filter
- reporter filter

## Permissions

Recommended rules:

- All active organization users can create defect records.
- All active organization users can read defect records in their organization.
- Authors can edit/delete their own records only if the company wants correction ability.
- Admin-capable roles can manage the linen item master.

Open implementation question:

- Should non-admin users be allowed to edit/delete old defect records after save?

## Suggested First MVP Slice

Build in this order:

1. Linen item master by property/building
2. Mobile create form
3. Shared list/detail history
4. Admin master management

Do not start with:

- vendor settlement
- analytics
- stock automation

## Open Questions

- Should one vendor visit group multiple defect rows under one visit record later?
- Is room/unit linkage actually needed in the first live version?
- Are photos required or only optional evidence?
- Should quantity allow decimal or only integer?
