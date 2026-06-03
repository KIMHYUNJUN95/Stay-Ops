# Recurring Work Scheduler

## Purpose

The work scheduler is for recurring operational and facility work that must be done periodically across properties or rooms.

It is separate from the Beds24 reservation calendar.

## Not the Same as Beds24 Calendar

Beds24 reservation calendar:

- Guest stays
- Occupancy
- Availability
- Check-in/check-out

Recurring work scheduler:

- Periodic operational work
- Facility maintenance routines
- Property/room care tasks
- Annual or seasonal work

## Example Work Types

Examples:

- Weed removal
- Air conditioner filter cleaning/replacement
- Waxing
- Seasonal inspection
- Facility check
- Room-wide maintenance routine

## Core Requirements

The scheduler should support:

- Work title
- Description
- Target property/building
- Target rooms/units if needed
- Frequency
- Due date
- Assigned role/person if needed
- Status
- Notes
- Photos if needed
- Completion date

## Creation Permission

Initial recurring work items will be entered by the Developer/Super Admin.

Field Manager must also be able to create recurring work schedules from the field or admin interface.

Recommended creation/edit permission:

- Developer / Super Admin
- Owner
- Office Admin
- Field Manager

Part-time Staff should not create recurring work schedules in the first version.

## Recurrence

Recurring schedule options may include:

- Once
- Weekly
- Monthly
- Every N months
- Yearly
- Custom schedule

Examples:

```txt
Air conditioner filter work: every 3 months
Waxing: yearly
Weed removal: seasonal or every N months
```

## Statuses

Status candidates:

- scheduled
- due_soon
- overdue
- in_progress
- completed
- skipped
- cancelled

## Relationship to Tasks

The scheduler may generate work tasks.

Recommended model:

```txt
Recurring Work Template
  -> Generated Work Occurrence
      -> Completion Record
```

This allows the app to keep the long-term schedule while also tracking each actual work instance.

## Open Questions

- Should recurring work be property-level or room-level by default?
- Should the system automatically generate future occurrences?
- How far ahead should work appear?
- Should overdue work trigger notifications?
- Should completion require photos?
