# Order Request Workflow

## Purpose

The order request workflow lets staff and part-time staff request amenities, supplies, equipment, or any other items needed for operations.

This workflow should use free-text input rather than a fixed item catalog because requested items can vary widely.

Requester-side UX priority:

- The person submitting an order request should experience the flow as a quick field request, not an office/admin form.
- Keep the requester form simple and fast.
- Office/admin processing can contain more workflow detail, but it should not make the requester-side form feel complicated.
- Price/cost fields are not part of the MVP order request workflow.
- Payment and shipment tracking workflows are not part of MVP.
- The purpose is to tell the office which items are needed, for which property/building, and who requested them.
- One order request can contain up to 40 requested item rows.

## Core Flow

```txt
Staff/part-time staff creates order request
Office Admin reviews request
Office Admin approves or rejects
If rejected, requester receives notification with rejection reason
If approved, requester receives approval notification
Office Admin processes the order (주문 처리) — marks status as ordered
Requester receives order-processed notification
```

Not included:

- Payment processing
- Delivery/shipping tracking states
- Receiving/arrival tracking states
- Price/cost calculation
- Inventory deduction

## Required Fields

Actual DB schema (`order_requests` table, migrations `202606010001`, `202606010002`, `202606020001`):

```txt
id                    uuid primary key
organization_id       uuid not null references organizations(id)
reported_by_user_id   uuid not null references profiles(id)
building_name         text not null
room_label            text not null default '-'
title                 text not null
description           text
reason                text
urgency               order_request_urgency not null default 'normal'  -- 'normal' | 'high'
status                order_request_status not null default 'requested'
items                 jsonb not null default '[]'     -- per-item imageUrls stored inside JSONB
delivery_date         date    -- single delivery date; populated when status transitions to 'ordered'
delivery_start_date   date    -- range start (mutually exclusive with delivery_date point mode)
delivery_end_date     date    -- range end; constraint: start <= end, both null or both set
created_at            timestamptz not null default now()
updated_at            timestamptz not null default now()
```

Note: per-transition audit fields are not in the MVP schema. State history is tracked via the `status` enum value only.

Each item inside the `items` JSONB array:

```txt
id        string (client-generated UUID)
name      string (required)
quantity  string (required)
link      string (optional — absolute URL for product reference)
memo      string (optional — per-item note)
```

Item limit:

```txt
Maximum 40 items per order request
```

## Field Meaning

### Building / Room

`building_name` is required (free-text string, not a foreign key to `properties`).
`room_label` is optional (defaults to `'-'`).

Order requests are scoped to a building, not a room, in MVP.

### Title

Required. A short summary of the overall request (e.g. "Room 201 supplies").

### Items (JSONB)

Each item in the JSONB array contains:
- `name` (required): free-text item name
- `quantity` (required): numeric string
- `link` (optional): absolute product URL for the item — rendered per-item in the detail UI; only `https://` and `http://` URLs are rendered as clickable anchors
- `memo` (optional): per-item note

Multiple items:

- A single order request can include multiple item rows.
- Each row lets the requester enter item name and quantity quickly.
- Optional link/memo can be added without making the requester-side UI feel complex.
- The first item row is visible immediately.
- Adding more items is simple and fast.

### Quantity

Required. Free text or simple numeric string.

Price/cost:

- Do not ask the requester for price, estimated cost, unit cost, cost center, or budget information in MVP.
- Product link per item is enough when the requester knows where to buy.

### Photo

Per-item photo attachment implemented (2026-06-02).

- Up to 5 photos per item row.
- Photos are attached via a camera button next to the "쇼핑몰 검색 / Shop online / ショップ検索" toggle in the item form.
- Photos are uploaded to Supabase Storage (`request-images` bucket, `order-images/` path) on form submit.
- Image URLs are stored in `items[].imageUrls` inside the `items` JSONB column.
- The first photo of the first item with an image is shown as a thumbnail in the request list card.
- All photos are shown per-item in the request detail page.

### Urgency

`urgency` enum: `normal` (default) or `high`. Not yet surfaced as a UI filter in MVP.

### Reason

Optional.

Free-text reason for the request.

### Requested By

Required.

The app should automatically record the requester.

### Memo

Optional.

Used by requester or office/admin for additional notes.

### Delivery Date

**Required** when Office/Admin marks the request as `ordered` (주문 처리).

Meaning:

- Expected delivery date that requester and office should reference.
- Date-only (YYYY-MM-DD). Stored in `order_requests.delivery_date` (date column, nullable).
- Entered in the 주문 처리 confirmation modal at the time of status change.
- Displayed in the order detail page as "배송예정일 / 配送予定日 / Expected Delivery".
- Shown as a secondary metadata item in the requests list card when present.
- Calendar auto-registration for this date is **planned** (not yet implemented); see `docs/product/15-reservation-calendar.md`.

## Statuses

Current DB enum values (implemented):

- `requested`
- `approved`
- `ordered`
- `received`
- `closed`

Status meaning:

- `requested`: requester submitted request
- `approved`: office/admin approved request
- `ordered`: office/admin completed order processing (주문 처리 완료); this is the terminal active state in MVP
- `received`: item received — not shown as an active step in the current UI timeline; maps to the "ordered" progress position if encountered
- `closed`: request closed/rejected (terminal; timeline shown as neutral/inactive, not full-progress)

User-facing label policy:

- `ordered` is labeled **"주문 처리됨" (ko) / "注文済み" (ja) / "Ordered" (en)** — meaning order processing is complete.
- The action button that triggers the `ordered` transition is labeled **"주문 처리" (ko) / "注文処理" (ja) / "Process Order" (en)**.
- `received` is not an active operational step in MVP and is excluded from the timeline progress bar display; it renders identically to `ordered` in the progress bar.
- `closed` is shown with a neutral (muted) timeline bar — no steps highlighted. The status badge communicates the terminal state. This avoids a false "fully completed" impression for early-rejected requests.

Status transition rules (enforced server-side):

- `requested` → `approved` (approve action)
- `approved` → `ordered` (process order action; direct requested → ordered is not allowed)
- any non-`closed` → `closed` (reject action)

## Notifications

Required notifications:

### Approved

When Office Admin approves a request:

- Requester receives notification

### Rejected

When Office Admin rejects a request:

- Requester receives notification
- Rejection reason is included

### Order Processed (주문 처리)

When Office Admin marks the request as ordered (주문 처리):

- Requester receives in-app notification (implemented 2026-06-03)
- Content: order processing completed, delivery date included in payload
- Self-notification suppressed: no notification if processor = requester

## Calendar Integration (Planned, Not Implemented)

Current status:

- `delivery_date` is captured and stored when status transitions to `ordered` (implemented 2026-06-01).
- The detail page and requests list display `delivery_date` formatted in Asia/Tokyo timezone.
- Calendar auto-registration for order delivery is **not yet implemented**.

Planned behavior:

- When status changes to `ordered` and `delivery_date` is saved, StayOps will create an order-delivery schedule entry in the reservation calendar automatically.
- Entry type: order-delivery (distinct from guest reservation bars).

## Visibility

All users can create and view order requests.

The Requests tab should include:

- All order requests
- My registered order requests

## Status Change Permission

Can change status:

- Developer / Super Admin
- Owner
- Office Admin
- CS Staff

Cannot change status:

- Field Manager
- Staff
- Part-time Staff

Important:

- Part-time Staff can register and view order requests but cannot approve, reject, or mark as ordered.
- Order request approval, rejection, and ordered/completed processing are office-level actions.
- CS Staff is treated as office-level for order request processing in MVP.

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

- Delete button is accessible directly from the **request list view** (icon button per card).
- Delete is also accessible from the request detail page.

### Deletion behavior

- Hard delete — record is permanently removed.
- Show a confirmation modal before executing.
- Confirmation modal must include the order title to prevent accidental deletion.
- On success, remove the card from the list and refresh.

### Status constraint

- Orders in `ordered` or `received` status: only admin roles can delete (the order may already be placed externally).
- Orders in `requested`, `approved`, or `closed` status: owner can delete.

### Server-side enforcement

- RLS DELETE policy enforces ownership check for non-admin roles.
- Admin roles bypass ownership check but must still be authenticated org members.
- The server action validates role before executing the DELETE.

## Open Questions

- Should rejected requests be editable and resubmitted?
- Should quantity have unit input, such as boxes, pieces, sets?
- Should `delivery_date` allow time input in a post-MVP phase?
- Should photo attachment be added to order requests (deferred)?

## Resolved Design Decisions

- Approval IS required: `requested → approved → ordered` is the enforced path; direct `requested → ordered` is blocked server-side.
- Field Manager cannot process status; only office-level roles can (owner, office_admin, cs_staff, developer_super_admin).
- Items are stored as a single JSONB array, not individual rows, for MVP simplicity.
- `delivery_date` is required (not optional) when marking as ordered.
