# Lost and Found Workflow

## Purpose

The lost and found workflow manages items found in rooms/properties from registration to storage, disposal scheduling, and final disposal.

The company generally stores lost items for 2 weeks. Expensive or important items may sometimes be stored longer.

## Required Fields

Lost item fields:

```txt
id
organization_id
property_id
room_id
item_name
photos
found_at
reported_by_user_id
guest_name
reservation_id
retrieval_status
retrieved_at
retrieved_by
memo
status
dispose_after
scheduled_for_disposal_at
disposed_at
created_at
updated_at
```

## Field Meaning

### Found Property / Room

Required.

The item must be connected to the property and, when applicable, the room/unit where it was found.

Entry behavior:

- If the lost item is registered from an active cleaning timer, property and room/unit should be auto-filled from the active cleaning room.
- If the lost item is registered from the Lost and Found tab directly, the user must select property and room/unit.
- When property/room is auto-filled from cleaning, show a final confirmation popup asking the user to confirm the room is correct.
- If the auto-filled room is wrong, provide a pencil/edit icon so the user can correct the property/room before submitting.

### Item Name

Required.

Short name of the found item.

### Photos

Optional but strongly recommended.

Photos help identify the item later when a guest contacts the team.

Limit:

- Maximum 5 photos per lost item.

Compression:

- Resize long edge to max 1600px.
- Use JPEG/WebP compression around 70-80% quality.

### Found Date / Time

Required, auto-filled.

The found date/time should be automatically filled based on the registration time.

Users should not need to manually enter found date/time during the normal quick flow.

### Reported By

Required, auto-filled.

The app should automatically store the staff member who registered the item.

### Guest / Reservation Link

Required when a likely reservation can be inferred, auto-suggested.

The app should automatically suggest the guest/reservation connected to the most relevant recent checkout for the selected room.

Rules:

- If registering from an active cleaning timer, use the guest/reservation from that room's checkout for the cleaning date when available.
- If registering from the Lost and Found tab directly, after the user selects property/room, show the most recent checkout guest for that room.
- The suggested guest/reservation should be visible to the user for confirmation.
- If the suggested guest/reservation is wrong or unavailable, the user should be able to edit or clear the link.

Implementation note (2026-07-09):
- The reservation-calendar linked entry is implemented via
  `/mobile/lost-found/new?reservationId=...`.
- In that path, the form opens with reservation-linked building / room / guest context already
  filled and stores optional `property_name`, `reservation_id`, and `guest_name` snapshots.
- The standalone direct lost-found form does **not yet** auto-suggest the latest checkout after
  room selection; that broader suggestion flow remains future work.

### Retrieval

The workflow needs retrieval tracking.

Retrieval means the customer/guest has picked up or received the item.

It does not mean internal staff collected the item from the room.

Possible fields:

```txt
retrieval_status
retrieved_at
retrieved_by
retrieval_memo
```

When retrieval is completed:

- The item should no longer be included in automatic disposal scheduling.
- The retrieval date/time should be saved.
- The staff member who processed retrieval should be saved.

No additional required retrieval form is needed for the first version.

Reason:

- The person who registered the lost item and the person who completes retrieval may be different.
- The staff member who physically gives the item to the guest or ships it should simply mark it as retrieved.
- Guest pickup and shipping are both common, but do not require separate mandatory fields in the MVP.
- Extra details can be written in memo if needed.

### Memo

Optional.

Used for internal notes, guest contact notes, or special handling instructions.

## Statuses

Confirmed statuses:

- registered
- stored
- disposal_scheduled
- disposed

Display labels:

```txt
registered: 등록됨 / 登録済み / Registered
stored: 보관중 / 保管中 / Stored
disposal_scheduled: 폐기예정 / 廃棄予定 / Disposal Scheduled
disposed: 폐기완료 / 廃棄済み / Disposed
```

## Storage Policy

Default company policy:

- Lost items are generally stored for 2 weeks.
- Expensive or important items may be stored longer by manager decision.
- If no retrieval or action happens, the system should automatically move old items toward disposal workflow.

## Automation Policy

Requested automation:

```txt
After registration, if customer retrieval does not happen:
  After 30 days -> move to disposal_scheduled
  After an additional period with no action -> automatically delete or finalize
```

Recommended safer implementation:

```txt
After 30 days -> disposal_scheduled
After additional TBD days -> disposed or archived
Do not hard-delete immediately unless legally/operationally required
```

Reason:

- Hard deletion can remove evidence needed for disputes or guest inquiries.
- A disposed/archived record keeps history while hiding it from normal daily lists.

## Creation Entry Points

Lost items can be created from:

- Lost and Found tab
- Quick action on mobile home
- Active cleaning timer
- Admin web

> **Implementation note (2026-05-21):** Linked-mode creation and list/status management implemented.
> - `/mobile/lost-found/new` accepts optional `?sessionId=`. Session validated server-side (same user, same org); invalid `sessionId` shows explicit error state (no form render); login redirect preserves `sessionId` in `next`.
> - Client-side required-field validation blocks confirmation sheet if `item_name` is empty; inline error shown below the field.
> - `/mobile/requests` shows current user's own lost items and maintenance reports in a combined view with color-coded status badges.
> - `/admin/lost-found` lists all org-scoped lost items with room, item name, status, reporter, and found-at columns; rows link to detail pages.
> - `/admin/lost-found/[id]` shows full item detail and a status-change form (select + submit). Status updates validated server-side (role + org ownership); success/error banners driven by `?statusUpdated` / `?error` search params.

## Visibility

All users can create and view lost item records.

The Requests tab should include:

- All lost item records
- My registered lost item records

Default mobile behavior:

- `All` scope should be the default list mode in `/mobile/requests`.
- `My registered lost item records` should be available via an explicit scope filter/toggle.

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

- Delete button is accessible directly from the **request list view** (icon button per card).
- Delete is also accessible from the request detail page.

### Deletion behavior

- Hard delete — record is permanently removed.
- Show a confirmation modal before executing.
- Confirmation modal must include the item name to prevent accidental deletion.
- On success, remove the card from the list and refresh.

### Server-side enforcement

- RLS DELETE policy enforces ownership check for non-admin roles.
- Admin roles bypass ownership check but must still be authenticated org members.
- The server action validates role before executing the DELETE.
- Show confirmation popup before deleting.

When created from an active cleaning timer, the record should automatically link to:

- Cleaning record
- Property
- Room/unit
- Reporter
- Found date/time
- Most relevant checkout guest/reservation for that room when available

The app should show a final confirmation popup before submitting a lost item created from the cleaning timer:

- Confirm property/room
- Confirm suggested guest/reservation if available
- Allow editing via pencil/edit action before final submit

## Alerts

Potential alerts:

- Item nearing disposal
- Item moved to disposal_scheduled
- High-value item registered
- Guest/reservation linked to item

## Admin Surface (`/admin/lost-found`)

### Filters and Export (2026-07-14)

- **Filter bar**: date range (formerly two native `<input type="date">` fields) now uses the shared
  `<DateRangeFormField>` (`src/components/admin/shared/date-range-form-field.tsx`, an
  `AdminDateRangePicker` popover + 2 hidden inputs). `startDate`/`endDate` search params are unchanged,
  so deep links still work. Status filter unchanged.
- **Export = Excel + PDF (was CSV).** The old `ExportCsvLink` download link was replaced with
  `LostFoundExportBar` (`src/components/admin/lost-found/lost-found-export-bar.tsx`) rendering the
  canonical `<AdminExportButtons>`. New server actions `exportLostFoundWorkbook(filters)` /
  `exportLostFoundReport(filters)` (`src/app/admin/lost-found/actions.ts`) — gated by
  `requireAdminSession()` + organization scope. The client sends only the current filter values, never
  row data; the server re-queries via `getOrgLostItems` so the file always matches the filtered screen.
- **Export columns** (carried over from the old CSV headers): building / room / item name / status /
  reporter / found-at.
- Output goes through the shared admin export builders (`src/lib/admin-table-workbook.ts` /
  `admin-table-report.ts` — the same green-ledger template used across the whole admin console).
  Language is resolved server-side from `session.user.preferredLanguage`; the client never passes a
  locale.
- **The old `/api/admin/export/lost-found` CSV route no longer exists.** All `/api/admin/export/*`
  endpoints were removed on 2026-07-14 as part of a console-wide export unification (see
  `docs/product/07-cleaning-workflow.md` and `docs/product/10-order-request-workflow.md` for the same
  change on cleaning records and order requests).

## Open Questions

- Should returned-to-guest be a separate status or a retrieval field?
- Should retrieval method be added later if operations need it?
- How many days after disposal_scheduled should the system archive/delete the record?
- Should high-value items be exempt from automatic disposal?
- Who can override disposal date?
- Who can mark an item as disposed?
