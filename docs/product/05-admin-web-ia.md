# Admin Web Information Architecture

## Purpose

The admin web app is the daily operations console for office/admin users.

It should not be treated as a secondary or optional tool. The mobile app serves field execution, while the admin web app serves oversight, management, and coordination.

## High-Priority Admin Screens

All of the following screens are frequently used and should be considered core admin web areas.

## 1. Dashboard

Purpose:

- Show today's operational situation quickly.

Widgets:

- Today's check-ins
- Today's check-outs
- Occupied rooms/properties
- Empty rooms/properties
- Cleaning in progress
- Cleaning completed
- Open maintenance requests
- New lost items
- Pending order/supply requests
- Important announcements

## 2. Calendar / Occupancy

Purpose:

- See room/property occupancy and schedules by date.

Important views:

- Month view
- Week view
- Day view
- Room/property timeline
- Check-in/check-out schedule
- Empty room/property visibility

## 3. Check-In / Check-Out

Purpose:

- Review guest movement for the day.

Important information:

- Guest name
- Room/property
- Check-in date/time
- Check-out date/time
- Manual early check-out time
- Reservation source
- Guest notes
- Cleaning status

## 4. Cleaning Status

Purpose:

- Track cleaning execution.

Important information:

- Room/property
- Status
- Started at
- Completed at
- Total cleaning time
- Staff
- Notes/photos

Export:

- Excel download in Korean
- PDF download in Korean
- Available to Office Admin and Field Manager or higher roles

## 5. Maintenance Requests

Purpose:

- Manage reported room/property/facility problems.

Important information:

- Location
- Issue type
- Priority
- Status
- Assigned role/person if used
- Photos
- Comments
- Created at
- Completed at

## 6. Lost and Found

Purpose:

- Track found items, storage, and return status.

Important information:

- Item name
- Photo
- Found location
- Found date/time
- Storage location
- Related guest/reservation if known
- Status
- Return record

## 7. Order and Supply Requests

Purpose:

- Review and process item/supply requests.

Important information:

- Requested item
- Quantity
- Requester
- Property/location
- Priority
- Status
- Approval/fulfillment status

## 8. Announcements

Purpose:

- Create and manage internal notices.

Important features:

- Create announcement
- Mark important
- Target by role/property
- Read tracking
- Pin notice if needed

## 9. Staff Management

Purpose:

- Manage users, roles, invitations, and active status.

Important features:

- Invite by email
- Create invite code
- Assign role
- Deactivate user
- View active users

## 10. Inventory

Purpose:

- Track stock and supplies.

This is important, but detailed inventory design needs separate planning.

## Navigation Direction

Recommended admin web navigation:

```txt
Dashboard
Calendar
Check-In/Out
Cleaning
Maintenance
Lost & Found
Orders
Announcements
Recurring Work
Users
Settings
```

Inventory is intentionally excluded from the first MVP navigation because it is a future module.

Implementation note:

- The admin sidebar contract is implemented in `src/config/navigation.ts`.
- The initial admin shell is implemented in `src/components/shell/admin-shell.tsx`.
- `/admin/settings` is the first implemented settings hub.
- `/admin/settings/organization` supports Developer / Super Admin organization creation.
- `/admin/settings/invite-codes` supports invite-code creation, listing, and deactivation.
- `/admin/settings/attendance` supports **owner-only** attendance site setup and QR issue/reissue.
- Future admin screens should use the shared admin navigation contract instead of creating local sidebar definitions.

## Design Note

The admin web app should feel like a dense but clear operations console, not a marketing-style dashboard.
