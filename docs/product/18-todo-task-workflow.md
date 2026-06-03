# Todo / Task Workflow

## Purpose

The Todo / Task workflow is a lightweight operational memory and follow-up system.

It is especially important for CS staff, but other staff can also use it.

Main purpose:

- Remember customer-related follow-ups.
- Record room/property-specific notes that need action.
- Track promises or special handling for guests.
- Prevent small operational details from being forgotten.
- Let staff create quick tasks similar to Todoist-style task capture.

This is not the same as the recurring work scheduler.

## Typical Use Cases

Examples:

- CS needs to remember a guest request.
- A guest asked for something to be provided in a room.
- A room has a special note that must be checked later.
- A problem is not urgent maintenance but needs follow-up.
- A staff member needs to confirm something with another staff member.
- A guest communication creates a future reminder.
- A property-specific note needs to be visible before check-in.

## Relationship To Other Modules

### Reservation Calendar

Tasks can optionally link to:

- Property/building
- Room/unit
- Guest/reservation
- Check-in date
- Check-out date

Example:

```txt
Guest asked for extra towels before check-in.
Linked reservation: Sarah Jenkins / Room 402 / Check-in May 12
```

### Maintenance

If an issue is actually a maintenance problem, it should become a maintenance request.

Todo should be used for lightweight follow-up, not full maintenance tracking.

### Lost and Found

If a task is about a specific lost item, it can link to the lost item record.

### Recurring Work Scheduler

Recurring work scheduler is for planned periodic work.

Todo/task is for ad hoc follow-up and daily operational memory.

## Core Fields

Task fields:

```txt
id
organization_id
title
description
property_id
room_id
reservation_id
guest_name
assigned_to_user_id
created_by_user_id
due_at
reminder_at
priority
status
tags
attachments
comments
completed_at
completed_by_user_id
created_at
updated_at
```

## Required Fields

Minimum quick-create fields:

- Title
- Created by

Recommended quick fields:

- Due date/time
- Property/building
- Room/unit
- Guest/reservation link
- Assignee
- Priority

## Todoist-Like Features

The workflow should feel fast and convenient like Todoist.

Recommended features:

- Quick add task
- Natural-language-like date shortcuts later if practical
- Today / Upcoming / Overdue views
- My tasks
- Assigned by me
- Property/room task filtering
- Guest/reservation-linked task filtering
- Priority
- Labels/tags
- Comments
- Attach up to 5 photos/images
- Reminder notification
- Completion checkbox
- Reopen completed task
- Duplicate task
- Search

Natural language parsing is optional and can be added later.

## Statuses

Initial statuses:

- open
- in_progress
- completed
- cancelled

## Priority

Initial priority:

- low
- normal
- high
- urgent

Default:

```txt
normal
```

## Views

### Today

Tasks due today or manually marked for today.

### Upcoming

Future tasks grouped by date.

### Overdue

Tasks past due and not completed.

### My Tasks

Tasks assigned to the current user.

### Assigned By Me

Tasks created by the current user and assigned to others.

### Property / Room

Tasks linked to a selected property/building or room/unit.

### Guest / Reservation

Tasks linked to a guest/reservation.

Useful for CS follow-up before check-in/check-out.

## Permissions

All users can create personal or operational tasks.

Recommended rules:

- All users can create tasks.
- Users can edit tasks they created.
- Assigned users can update status and comment.
- Office Admin, CS Staff, Field Manager, Owner, and Developer/Super Admin can view and manage broader operational tasks.
- Part-time Staff should see tasks assigned to them and tasks linked to rooms/properties they can access.

Final permission detail should be refined during implementation.

## Notifications

Notifications should be sent for:

- Task assigned to user
- Reminder time reached
- Task due soon
- Task overdue
- Comment added on task
- Task completed by assignee

Notification volume should be controlled to avoid noise.

## Creation Entry Points

Tasks can be created from:

- Todo/Tasks tab or menu
- Reservation detail
- Room/property detail
- Guest/reservation context
- CS workflow
- Maintenance/lost item/order request detail if follow-up is needed

## UX Principle

The task flow must be very fast.

The quick-create experience should not feel like a long form.

Recommended quick-create:

```txt
Task title
Optional chips: Today / Tomorrow / Due date / Assignee / Property / Room / Priority
Add details
Save
```

Extra details should be collapsible.

## Open Questions

- Should tasks have subtasks in MVP?
- Should recurring tasks be part of Todo or only recurring work scheduler?
- Should task labels be fixed or user-created?
- Should tasks be visible to all staff by default or private unless assigned/shared?
- Should CS tasks have a separate default view?
- Should guest/reservation-linked tasks appear in the reservation calendar?
