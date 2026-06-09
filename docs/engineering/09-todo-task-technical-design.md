# Todo / Task Technical Design

Status: Draft

## Purpose

This document defines the recommended technical design for the Todo / Task workflow, including private-by-default personal tasks, teammate send/share, and the task calendar.

## Design Principle

The system should optimize for privacy first.

Baseline rule:

- a user's personal task should belong to that user only
- teammate send/share should not expose the sender's whole task list

## Recommended Data Model

### `tasks`

Recommended baseline:

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
owner_user_id uuid not null references profiles(id)
created_by_user_id uuid not null references profiles(id)
source_task_id uuid references tasks(id)
source_type text not null default 'personal'
title text not null
description text
property_id uuid references properties(id)
room_id uuid references rooms(id)
reservation_id uuid references reservations(id)
guest_name text
due_at timestamptz
scheduled_date date
reminder_at timestamptz
priority text not null default 'normal'
status text not null default 'open'
is_private boolean not null default true
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
completed_at timestamptz
completed_by_user_id uuid references profiles(id)
```

### Recommended source types

```txt
personal
shared_copy
system_linked
```

### `task_transfers`

Purpose:

- record when a task is sent to a teammate

Recommended fields:

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
source_task_id uuid not null references tasks(id)
sender_user_id uuid not null references profiles(id)
recipient_user_id uuid not null references profiles(id)
recipient_task_id uuid not null references tasks(id)
created_at timestamptz not null default now()
```

## Why Use Recipient Copies

Recommended baseline implementation:

- when A sends a task to B, create a recipient-owned task copy for B
- store the relation in `task_transfers`

Reason:

- clearer privacy boundaries
- clearer ownership
- easier independent completion state
- easier RLS than one shared multi-owner row

This is the recommended default over a single shared task row.

## Calendar Design

The task calendar should query from `tasks` owned by the current user plus explicitly received tasks if the product decides those belong in the user's main calendar.

Recommended baseline:

- month view
- agenda view
- date-range query over `due_at` and/or `scheduled_date`

## Query Rules

### My Tasks

- `owner_user_id = current user`

### Assigned By Me

- `created_by_user_id = current user`
- optionally exclude fully private non-shared tasks if UX needs that split

### Calendar

- same user task scope as My Tasks
- filter by date range
- include only tasks with `due_at` or `scheduled_date`

## RLS Direction

### `tasks`

Recommended baseline:

- select/update/delete only when `owner_user_id = auth.uid()`
- insert allowed only for the acting user or approved server-side copy creation flow

If office-level oversight is required later, add a separate explicit policy.

### `task_transfers`

- sender and recipient can read their transfer rows
- direct insert should go through server action to guarantee source/recipient consistency

## Server Actions / Routes

Recommended actions:

- `createTask`
- `updateTask`
- `deleteTask`
- `completeTask`
- `sendTaskToTeammate`
- `listMyTasks`
- `listAssignedByMe`
- `listTaskCalendarRange`

## Context Linking

Task context fields should remain optional:

- property
- room
- reservation
- guest name

This is important for CS-heavy usage without forcing every task to be reservation-bound.

## Deferred Areas

- comments table
- attachments table or `image_urls`
- recurrence
- drag-and-drop calendar rescheduling
- natural language parsing
