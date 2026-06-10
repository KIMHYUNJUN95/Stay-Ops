# Feature Map

## Core Modules

### 1. Dashboard

Purpose:

- Show today's operational status at a glance.

Possible widgets:

- New tasks
- Urgent tasks
- Overdue tasks
- Lost items pending return
- Maintenance in progress
- Order requests waiting approval
- Inventory alerts
- Today's schedules
- Unread announcements

### 2. Todo and Tasks

Purpose:

- Manage daily internal work and CS follow-up memory across office staff, on-site staff, and part-time staff.
- Especially help CS remember guest-related promises, room-specific notes, special handling, and follow-up tasks.

Key features:

- Quick add to Inbox
- Detailed task create/edit
- Private-by-default task
- Share with multiple participants
- One common status/completion for shared tasks
- Today / Inbox / My Tasks / Sent / Completed / Calendar views
- Scheduled date + due date
- Simple recurrence
- Unified update-log
- Attach up to 5 photos on task + up to 5 on updates
- Link to property/room
- Link to guest/reservation
- Reminder and task activity notifications

### 3. Announcements

Purpose:

- Share important company notices and operational updates.

Key features:

- Create announcement
- Target by role or property
- Target everyone
- Mark as important
- Pin announcement
- Track who has read it
- Comments
- Up to 5 images
- Optional app-open popup

### 4. Internal Board

Purpose:

- Provide a shared space for internal operational posts that are not formal tasks.

Examples:

- Policy updates
- Incident notes
- Property notes
- Team communication

Permissions: **all active roles including Part-Time Staff can create posts** (confirmed 2026-06-09) — unlike Announcements, where part-time staff cannot create. See `docs/product/20-internal-board-workflow.md`.

### 5. Work Scheduler

Purpose:

- Coordinate recurring operational/facility work such as weed removal, air conditioner filter work, waxing, and seasonal property tasks.
- This is separate from the Beds24 reservation calendar.

Calendar use cases:

- Yearly recurring work overview
- Due soon work
- Overdue work
- Completed periodic work history
- Property/room maintenance routines

Default stay time rules:

- Check-in: 16:00 fixed
- Check-out: 10:00 default
- Early check-out: manually entered by CS staff when guest communication changes the expected check-out time

### Cleaning Workflow

Purpose:

- Let staff start, track, and complete cleaning work for rooms/properties.

Key features:

- Start cleaning
- Complete cleaning
- Cleaning timer
- Room/property assignment
- Status update
- Optional completion photo
- Notes and comments
- Total duration history
- Create linked lost item during cleaning
- Create linked maintenance issue during cleaning

### 6. Inventory

Purpose:

- Track supplies and stock needed for hotel and Airbnb operations.

Key features:

- Item list
- Current quantity
- Minimum stock level
- Location/property
- Stock adjustment history
- Reorder request

### 7. Lost and Found

Purpose:

- Track found items from discovery to storage to return.

Status candidates:

- Registered
- Stored
- Disposal scheduled
- Disposed

Automation:

- Default storage policy is generally 2 weeks.
- If no retrieval/action happens, move to disposal_scheduled after 30 days.
- After an additional TBD period, finalize as disposed/archived or delete depending on final policy.

Delete:

- Available from the request list view.
- Admin roles (owner, office_admin, cs_staff, developer_super_admin) can delete any record.
- Other roles (field_manager, staff, part_time_staff) can delete only their own records.
- Requires a confirmation modal before executing.
- Hard delete.

### 8. Maintenance

Purpose:

- Report and resolve room/property/facility issues, including things part-time staff cannot resolve themselves.

Status candidates:

- Reported
- Assigned
- In progress
- Waiting
- Completed
- Cancelled

Delete:

- Available from the request list view.
- Admin roles (owner, office_admin, cs_staff, developer_super_admin) can delete any record.
- Other roles (field_manager, staff, part_time_staff) can delete only their own records.
- Requires a confirmation modal before executing.
- Hard delete.

### 9. Order Requests

Purpose:

- Request, approve, and track hotel supplies.

Delete:

- Available from the request list view.
- Admin roles (owner, office_admin, cs_staff, developer_super_admin) can delete any record.
- Other roles (field_manager, staff, part_time_staff) can delete only their own records.
- Requires a confirmation modal before executing.
- Hard delete.

Status values (implemented DB enum `order_request_status`):

- `requested` — submitted by staff
- `approved` — approved by office-level role
- `ordered` — order placed; delivery date recorded
- `received` — item arrived (not shown as active timeline step in MVP UI)
- `closed` — rejected or cancelled

Status transition rules (server-enforced):

- `requested → approved` (approve)
- `approved → ordered` (requires delivery_date)
- any non-closed → `closed` (reject)
- direct `requested → ordered` is blocked

Notification rules:

- Approval: requester notified (planned -- not yet implemented).
- Rejection: requester notified with reason (planned -- not yet implemented).
- Ordered: requester notified with delivery date (implemented 2026-06-03; in-app only).

### 10. Notifications

Purpose:

- Make sure important operational events reach the right staff.

Notification channels:

- Push notification
- In-app notification center
- Email later if needed

### 11. Staff and Permissions

Purpose:

- Manage team access safely.

Key features:

- Invite staff
- Assign role
- Deactivate user
- Change language

### 12. Search and Filters

Purpose:

- Let staff quickly find operational records.

Search examples:

- Room number
- Item name
- Date
- Status
- Staff member
- Category

## Post-MVP Approved Batch (confirmed 2026-06-09)

These five features are the approved next build scope after the Phase 6–13 MVP. Build order: Linen Defect → Personal Todo / Shared Task Inbox → Staff Suggestions → Internal Board → Attendance/Payroll. The Todo and Internal Board entries above (#2, #4) are part of this batch. See `docs/planning/15-feature-batch-plan.md` and `docs/planning/01-decision-log.md` (2026-06-09).

### 13. Linen Defect Registration

Purpose:

- Keep a building-specific ledger proving that staff registered returned defective linen to the vendor, with later date/building/person lookup for delivery-slip comparison.

Key features:

- Building-first mobile flow: building picker -> building return list -> create/detail/ledger
- One return record = one building + multiple item lines
- Auto-filled registered user + registered date/time
- Optional note + optional photos
- Latest-first building list + separate ledger/statistics screen
- Linen item master per building (connected during implementation)
- Operational return ledger only — no automatic stock deduction, status workflow, or vendor settlement in MVP

See `docs/product/19-linen-defect-workflow.md`.

### 14. Staff Suggestions / Feedback

Purpose:

- Structured channel for staff/part-time improvement ideas, pain points, and feedback.

Key features:

- Submit suggestion (title, body, category)
- Visibility: `public_team` / `employee_only` (employee_only excludes other part-time staff)
- Review lifecycle: submitted → reviewing → planned → resolved → closed
- Admin response note
- Separate from Internal Board (structured feedback vs. casual posting)

See `docs/product/22-staff-suggestions-workflow.md`.

### 15. Attendance / Clock-In-Out + Payroll

Purpose:

- PWA-first attendance replacing paper timecards, with a later path to hourly payroll.

Key features:

- On-site QR + device GPS clock-in/out
- Attendance logs per worker/site
- Employment type (hourly / salaried) + hourly rate history
- Hourly payroll calculation + export (**deferred** until wage rules defined)

Status: attendance capture approved (2026-06-09); payroll calculation blocked on wage-policy definition. See `docs/product/21-attendance-payroll-workflow.md`.

## External Integrations

### Beds24

Purpose:

- Sync reservation, property, room, occupancy, and availability data from the existing Beds24 channel manager.

Primary usage:

- Calendar schedule
- Guest stay visibility
- Empty room/property visibility
- Cleaning and maintenance planning

## Future Modules

- Housekeeping checklist
- Shift handover notes
- Inspection checklist
- Inventory count
- Vendor management
- Multi-property management
- Reports and analytics
- PMS integration
