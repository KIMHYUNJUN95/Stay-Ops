# Todo / Task Technical Design

Status: Draft — aligned to refined mobile-first product plan (2026-06-10)

## Purpose

This document defines the recommended technical design for the Todo / Task workflow.

Important clarification:

- the older "sender/recipient copy" recommendation is no longer the product direction
- the confirmed direction is:

```txt
one task
+ one participant set
+ one common shared status
+ one unified update-log
```

## First-Slice Goal

Deliver:

- private personal tasks by default
- conversion from private to shared
- common shared status/completion for participants
- Today / Inbox / My Tasks / Sent By Me / Completed / Calendar views
- quick add + detailed create
- unified update-log with optional images

Do not include:

- admin web surface
- full recurring-work-scheduler overlap
- complex subtasks
- advanced natural-language date parsing
- complex recurrence exceptions

## Data Model Direction

The system should not use:

- independent sender/recipient task copies
- separate completion states per participant

Use:

```txt
tasks
+ task_participants
+ task_updates
```

## Recommended Tables

### `tasks`

Purpose:

- one canonical task record

Recommended fields:

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
created_by_user_id uuid not null references profiles(id)
title text not null
description text
property_id uuid references properties(id)
room_id uuid references rooms(id)
reservation_id uuid references reservations(id)
guest_name text
scheduled_date date
due_at timestamptz
all_day boolean not null default true
time_label text
priority text not null default 'normal'    -- normal | important | urgent
status text not null default 'open'        -- open | in_progress | completed | cancelled
is_inbox boolean not null default true
is_shared boolean not null default false
recurrence_rule text
tags text[] not null default '{}'
image_urls text[] not null default '{}'
completed_at timestamptz
completed_by_user_id uuid references profiles(id)
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Notes:

- `created_by_user_id` is the original author
- original author remains the only core-content editor after sharing
- `is_inbox` is an explicit workflow flag
- `is_shared` is derived by participant count in logic, but a stored flag can simplify queries/UI

### `task_participants`

Purpose:

- who currently participates in the task

Recommended fields:

```txt
id uuid primary key
task_id uuid not null references tasks(id) on delete cascade
user_id uuid not null references profiles(id)
role text not null                  -- author | participant
is_first_recipient boolean not null default false
added_by_user_id uuid references profiles(id)
created_at timestamptz not null default now()
```

Rules:

- one unique row per `(task_id, user_id)`
- exactly one `author` row
- author row corresponds to `tasks.created_by_user_id`
- first recipient is optional for private tasks, and at most one participant row should hold `is_first_recipient = true`

### `task_updates`

Purpose:

- one unified update-log stream

Recommended fields:

```txt
id uuid primary key
task_id uuid not null references tasks(id) on delete cascade
created_by_user_id uuid references profiles(id)
update_type text not null           -- note | system_edited | system_shared | status_changed | completed | reopened
body text
image_urls text[] not null default '{}'
created_at timestamptz not null default now()
```

Notes:

- use this for both participant notes and lightweight system log entries
- `created_by_user_id` may be null only for system-generated events if implementation prefers that style

## Core Editing Rules

### Core Content

Only the original author can edit:

- title
- description
- tags
- scheduled_date
- due_at
- all_day
- time_label
- recurrence_rule
- task-level `image_urls`

### Shared Workflow State

Any current participant can update:

- status
- completed / reopened state
- update-log entries

## Inbox Rules

Inbox is an explicit task state, not only an inferred lack of dates.

Recommended behavior:

- quick-add creates `is_inbox = true`
- detailed create may create either Inbox or organized task
- shared tasks may remain in Inbox
- shared Inbox membership is common to all participants

Recommended first-slice permission:

- private task: author controls Inbox membership
- shared task: any participant may move it in/out of Inbox because this is workflow state, not protected core content

## Sharing Rules

### Private -> Shared

- add one or more participant rows
- set `is_shared = true`
- create a `task_updates` system entry

### Shared -> Private

- if all non-author participant rows are removed, set `is_shared = false`

### Participant Self-Remove

- delete that participant row
- after removal, the task disappears completely from that user's task scope

### Author Self-Remove

- treat as full task deletion
- delete task row, cascading participants/updates

## Query Rules

### Today

Include current-user visible tasks where:

- overdue
- due today
- or explicitly marked as today in the chosen app logic

Recommended sorting:

1. overdue
2. today items
3. then importance inside group

### Inbox

- visible tasks where `is_inbox = true`
- newest first

### My Tasks

- tasks visible to the user through participant membership

### Sent By Me

- `created_by_user_id = current user`
- especially useful when `is_shared = true`
- sort by latest share/update signal

### Completed

- visible tasks where `status = completed`
- support filtering by:
  - created by me
  - shared with me
  - all related to me

### Calendar

- visible tasks where `scheduled_date` or `due_at` is present
- support month view and agenda/list range view

## Search / Filter Rules

Required first-slice search/filter:

- title
- author name
- date / date range

Not required as core first-slice search:

- description/body search
- participant name search
- priority search
- tag search

## RLS Direction

### `tasks`

Read:

- current user must be an active participant in `task_participants`

Insert:

- allowed only when the acting user creates a task whose author is themselves

Update:

- original author can edit all fields
- non-author participants may update only workflow-state fields through controlled server actions

Delete:

- original author can delete the task
- no participant direct delete of the canonical task row
- participant self-remove should use a controlled action that deletes only the participant row

### `task_participants`

Read:

- current user is a participant on the parent task

Insert:

- via server action only, so author/share constraints stay consistent

Delete:

- author may remove any non-author participant
- participant may remove self

### `task_updates`

Read:

- current user is a participant on the parent task

Insert:

- current user is a participant on the parent task

Update / delete:

- keep simple in first slice: no edit/delete after posting, unless product later asks for it

## Server Actions / Routes

Recommended actions:

- `quickCreateTask`
- `createTask`
- `updateTaskCore`
- `setTaskStatus`
- `completeTask`
- `reopenTask`
- `moveTaskToInbox`
- `moveTaskOutOfInbox`
- `shareTaskWithUsers`
- `removeTaskParticipant`
- `deleteTask`
- `addTaskUpdate`
- `listTodayTasks`
- `listInboxTasks`
- `listMyTasks`
- `listSentTasks`
- `listCompletedTasks`
- `listTaskCalendarRange`

## Dates / Recurrence Direction

### Quick Date Helpers

Support later in UI/server handling:

- today
- tomorrow
- weekday
- weekend
- direct date pick

### Recurrence

Recommended first-slice recurrence values:

- daily
- weekly
- monthly
- weekdays
- weekends
- custom rule string

Not required in first slice:

- exception dates
- advanced recurrence-end modeling

## Images

Task-level images:

- optional
- max 5

Update-log images:

- optional
- max 5 per update entry

Recommended MVP choice:

- reuse current direct-upload pattern and file rules

## Notifications

The refined product plan expects all of these:

- shared with me
- shared task edited
- new update-log entry on a task I participate in
- due soon
- overdue
- completed

Implementation timing may still phase these, but the product direction is confirmed.

## UI / Route Direction

Recommended mobile routes/views:

- Today
- Inbox
- My Tasks
- Sent By Me
- Completed
- Calendar
- Quick add
- Task detail
- Detailed create/edit
- Participant picker

Admin web routes are intentionally deferred.

## Future Extensions

- richer notification controls
- tag management helpers
- drag/drop calendar rescheduling
- subtasks
- advanced search
- admin/manager oversight view if explicitly approved later
