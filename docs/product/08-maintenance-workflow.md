# Maintenance Workflow

## Purpose

The maintenance workflow is used to report problems or field issues that regular staff or part-time staff cannot resolve themselves.

This includes broken items, missing items, facility issues, cleaning condition issues, and other operational problems that need follow-up.

## Required Fields

Maintenance request fields:

```txt
id
organization_id
property_id
room_id
category
description
photos
priority
reported_by_user_id
status
memo
created_at
updated_at
completed_at
```

## Field Meaning

### Room / Property

Required.

The request must be connected to a property and, when applicable, a room/unit.

### Description

Required.

Free text explanation of the issue.

### Photos

Optional but strongly recommended when the issue is visual.

Implementation: photos are stored as `image_urls text[]` on the `maintenance_reports` table, uploaded to the `request-images` Supabase Storage bucket. Client-side compression is applied before upload.

Limit:

- Maximum 5 photos per maintenance report.

Compression:

- Resize long edge to max 1600px.
- Use JPEG/WebP compression around 70-80% quality.

### Priority

Required.

Priority candidates:

- low
- normal
- high
- urgent

### Reported By

Required.

The app should automatically store the user who reported the issue.

### Status

Required.

Implemented DB enum values (maintenance_status):

- open
- in_progress
- resolved
- closed

Note: the originally planned values (reported, confirmed, waiting, completed, cancelled) were not used in the final implementation. The current enum reflects the simpler 4-state model.

### Memo

Optional.

Used for internal notes, follow-up details, manager comments, or resolution notes.

## Categories

Confirmed categories:

- electric
- water
- air_conditioning_heating
- wifi
- furniture
- appliance
- cleaning_condition
- supplies
- damage
- other

Display labels:

```txt
electric: 전기 / 電気 / Electric
water: 수도 / 水道 / Water
air_conditioning_heating: 에어컨/난방 / エアコン・暖房 / AC & Heating
wifi: 와이파이 / Wi-Fi / Wi-Fi
furniture: 가구 / 家具 / Furniture
appliance: 가전 / 家電 / Appliance
cleaning_condition: 청소상태 / 清掃状態 / Cleaning Condition
supplies: 소모품 / 消耗品 / Supplies
damage: 파손 / 破損 / Damage
other: 기타 / その他 / Other
```

## Important Product Note

This module is not only for repair work.

It should also support cases where:

- Something is broken
- Something is missing
- Something looks wrong
- A guest-facing issue needs follow-up
- Part-time staff cannot resolve the issue themselves
- The issue needs manager or office attention

## Creation Entry Points

Maintenance requests can be created from:

- Maintenance tab
- Quick action on mobile home
- Active cleaning timer
- Admin web
- Reservation calendar linked action (`/mobile/maintenance/new?reservationId=...`)

Implementation note (2026-07-09):
- The reservation-calendar linked action is now implemented.
- When entered from `/admin/calendar`, the mobile form pre-fills the building / room / guest
  context from the linked reservation and stores `reservation_id` when the submitted room context
  still matches that reservation server-side.
- Standalone manual creation still works without any reservation context.

## Visibility

All users can create and view maintenance requests.

The Requests tab should include:

- All maintenance requests
- My registered maintenance requests

Default mobile behavior:

- `All` scope should be the default list mode in `/mobile/requests`.
- `My registered maintenance requests` should be available via an explicit scope filter/toggle.

## Status Change Permission

Can change status:

- Developer / Super Admin
- Owner
- Office Admin
- CS Staff if permitted
- Field Manager
- Staff

Cannot change status:

- Part-time Staff

## Edit and Delete Permission

### Who can delete

| Role | Own records | Others' records |
|---|---|---|
| developer_super_admin | ✅ | ✅ |
| owner | ✅ | ✅ |
| office_admin | ✅ | ✅ |
| cs_staff | ✅ | ✅ |
| field_manager | ✅ | ❌ |
| staff | ✅ | ❌ |
| part_time_staff | ✅ | ❌ |

### Entry point

- Delete button is accessible directly from the **request list view** (swipe action or icon button per card).
- Delete is also accessible from the request detail page.

### Deletion behavior

- Hard delete — record is permanently removed.
- Show a confirmation modal before executing.
- Confirmation modal must include the record title/name to prevent accidental deletion.
- On success, navigate back to the list and refresh.

### Server-side enforcement

- RLS DELETE policy enforces ownership check for non-admin roles.
- Admin roles bypass ownership check but must still be authenticated org members.
- The server action validates role before executing the DELETE.

When created from an active cleaning timer, the request should automatically link to:

- Cleaning record
- Property
- Room/unit
- Reporter
- Reported time

## Open Questions

- Should urgent maintenance trigger push notifications to Field Manager and Office Admin?
- Should completed maintenance require a completion photo?
- Should cost be tracked in this module later?
- Should requests support assigning a responsible person?
- Should staff be able to edit after submitting?
