# Product Requirements

## Overview

StayOps is a native hotel operations app for multilingual teams.

The app should help teams register, assign, track, and complete operational tasks that happen inside hotels and accommodation properties.

StayOps must support two primary clients:

- Mobile app for field/on-site work
- Admin web app for office/admin work

The admin web app must support daily operational management, especially calendar/occupancy, check-in/check-out, cleaning status, maintenance requests, lost and found, order/supply requests, and announcements.

## Target Users

Initial users:

- Internal company office staff
- Internal on-site staff
- Part-time staff

Initial operating model:

- Hotel operations
- Airbnb-style property operations

Property structure:

- Multi-room buildings
- Standalone house-style properties

Current known properties:

- Arakicho A
- Arakicho B
- Kabukicho
- Takadanobaba
- Okubo A
- Okubo B
- Okubo C

Future known requirement:

- A larger hotel-style building with about 26 rooms is expected around July, but details are TBD.

Future external users:

- Small and medium hotels
- Business hotels
- Ryokan
- Motels
- Pensions
- Guesthouses
- Serviced residences

## Primary Use Cases

### Cleaning Workflow

Staff can manage cleaning work with:

- Assigned room/property
- Cleaning start action
- Cleaning completion action
- Cleaning timer
- Completion photo if needed
- Notes
- Status
- Total duration history
- Linked lost item reporting
- Linked maintenance issue reporting

Attendance and clock-in/out are an approved post-MVP feature batch item as of 2026-06-09 (the earlier "handled by another app" exclusion was reversed). Attendance capture (PWA QR + GPS clock-in/out) is buildable; hourly payroll calculation stays deferred until wage rules are defined. See `docs/planning/01-decision-log.md` (2026-06-09 scope change) and `docs/product/21-attendance-payroll-workflow.md`.

Cleaning staff assignment is not included in the first scope because another system already handles cleaning personnel assignment.

### Todo and Task Management

Staff can create and track operational todos with:

- Title
- Description
- Assignee
- Due date
- Priority
- Status
- Comments

### Announcements

Managers and office staff can publish internal notices with:

- Title
- Content
- Target audience
- Important flag
- Read tracking
- Pinned setting
- Comments
- Up to 5 images
- Optional app-open popup

All roles except Part-time Staff can create announcements. Part-time Staff can read targeted announcements and comment if permitted.

### Internal Board

Teams can share operational posts, updates, and internal records. Lighter than announcements (no required read tracking or popup in MVP). **All active roles including Part-Time Staff can create posts** (confirmed 2026-06-09). See `docs/product/20-internal-board-workflow.md`.

### Linen Defect Registration

Field/office staff can log damaged, stained, or unusable linen items per property/building during vendor visits, selected from a controlled linen item master. This is an operational defect log, not full inventory management (no automatic stock deduction or vendor settlement in MVP). Approved post-MVP batch item (2026-06-09). See `docs/product/19-linen-defect-workflow.md`.

### Staff Suggestions / Feedback

Staff and part-time staff can send structured feedback to one required recipient, optionally sharing visibility with referenced users in the same organization. The feature includes a recipient-owned status lifecycle and participant comment thread, and remains separate from the Internal Board (structured feedback vs. broad internal posting). Approved post-MVP batch item (2026-06-09; refined 2026-06-16). See `docs/product/22-staff-suggestions-workflow.md`.

### Bug Reports / Problem Reports

Staff can report problems found while using StayOps itself, such as broken flows, incorrect data,
permission errors, or notification issues. This module is separate from Maintenance (real-world
property issues) and separate from Staff Suggestions (person-directed feedback). The first planned
slice is a **very simple** private reporter-to-reviewer workflow: title, description, optional
screenshots, and status tracking only. See `docs/product/25-bug-report-workflow.md`.

### Attendance / Clock-In-Out + Payroll

PWA QR + device-GPS clock-in/out replacing paper timecards, with a later path to hourly payroll. **Attendance capture is approved (2026-06-09); payroll calculation is deferred until wage rules are defined.** See `docs/product/21-attendance-payroll-workflow.md`.

### Work Scheduler

The app may include schedules for:

- Staff work
- Cleaning
- Maintenance
- Property visits
- Recurring operational tasks
- Guest stays
- Room/property occupancy
- Room/property availability

Important distinction:

- Beds24 calendar handles reservation, occupancy, and guest stay schedules.
- Work scheduler handles recurring operational/facility work such as weed removal, air conditioner filter work, and waxing.

Calendar view should help staff understand:

- Which guest is staying on a selected date
- Which room or property is occupied
- Which room or property is empty
- Which cleaning or maintenance work is tied to that stay
- Today's check-ins
- Today's check-outs
- Guests staying today
- Empty rooms/properties today

### Beds24 Reservation Data

StayOps should integrate with Beds24 to sync reservation and availability data.

The first integration goal is read-focused:

- Import properties
- Import rooms
- Import bookings
- Import check-in/check-out dates
- Import occupancy and availability status

Reservation calendar display range:

- Current month
- Next 2 months

Reservation updates should use Beds24 webhooks where possible rather than frequent polling.

Writing data back to Beds24 should be considered later and designed carefully.

### Inventory Management

Teams can track supplies and stock levels for hotel and Airbnb operations.

Possible inventory categories:

- Amenities
- Linens
- Cleaning supplies
- Consumables
- Office supplies
- Repair supplies

### Lost and Found

Staff can register lost items with:

- Item name
- Found location
- Found date/time
- Photo
- Storage location
- Guest information when available
- Reservation link when available
- Retrieval tracking
- Status
- Memo
- Disposal policy automation

### Maintenance Requests

Staff can report room or facility issues with:

- Room or area
- Property
- Issue type
- Description
- Priority
- Photo
- Reporter
- Status
- Memo
- Completion note if needed

### Order Requests

Staff can request supplies or operational items with:

- Item name
- Quantity
- Property/building
- Optional photo
- Optional product/reference URL
- Reason
- Requester
- Approval status
- Rejection reason if rejected
- Ordered/completed status
- Memo

### Notifications

Users should receive alerts for:

- New assigned task
- Status changes
- Comments
- Urgent requests
- Overdue tasks
- Returned lost items
- Order request rejection
- Order completed
- Important announcements
- Lost item disposal scheduled
- Cleaning still in progress after 16:00

## MVP Requirements

The first usable version should include:

- Authentication
- Email login
- Google login
- Apple login if feasible
- Hotel/workspace creation
- Staff invitation
- Role-based access
- Mobile field app
- Admin web app
- Lost and found module
- Maintenance request module
- Order request module
- Cleaning start/completion with timer
- Cleaning-linked lost item and maintenance reporting
- Announcements
- Basic notification system
- Photo upload
- Comments
- Search and filters

## Out of Scope for First MVP

These are useful but should not block the first version:

- Payroll calculation math (deferred — attendance capture is approved post-MVP, but hourly pay calculation is blocked until wage rules are defined; see `docs/product/21-attendance-payroll-workflow.md`)
- Shift scheduling
- Full PMS integration
- Accounting
- Customer-facing guest app
- AI automation
- Advanced analytics
- Multi-property enterprise controls
- Cleaning staff assignment
