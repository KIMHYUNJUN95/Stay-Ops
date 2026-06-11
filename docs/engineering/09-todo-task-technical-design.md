# Todo / Task Technical Design

Status: First slice implemented (2026-06-10) — migration `202606100003_todo_tasks.sql`. As-built notes:
`priority`/`status` are text columns with CHECK constraints (not enums); RLS uses a `security definer`
`is_task_participant(task_id)` helper to avoid recursion; reads are RLS-scoped while **all writes go
through service-role server actions** with explicit permission checks; notification_type gained
`task_shared`/`task_updated`/`task_completed` and notifications fan out to participants; task photos
reuse the `request-images` bucket (`task-images`/`task-update-images`). Recurrence is stored + shown
only (no auto instance generation in this slice).

Hardening pass (2026-06-11): `quickCreateTask`/`createTask` roll back the inserted `tasks` row when
the `task_participants` insert fails (no DB transaction in this path, so the rollback is an explicit
delete) — this prevents author-invisible orphan rows, since visibility depends on participant
membership. `updateTaskCore` now also writes `image_urls`, so task-level photos are author-editable
after creation. Update-log photo upload is wired end-to-end (client upload → `addTaskUpdate` →
`task_updates.image_urls`). Detailed create always sets `is_inbox = false` (see Inbox Rules).

Hardening pass 2 (2026-06-11): `shareTaskWithUsers` is now fail-safe — it checks the
`task_participants` insert result and short-circuits on failure, so a failed share never marks
`tasks.is_shared = true`, never writes a `system_shared` log row, and never emits notifications (no
false shared state). Update-log photo-upload failures are no longer swallowed: the compose area shows
an inline localized error (`tasks.errors.upload_failed`), keeps the typed text/selected photos, and
submits nothing so the user can retry. Removed task-level photos are now hard-deleted from Storage
(Option A): on core edit, `updateTaskCore` computes the detached set as `previous − new` from the
**server-truth** `task.image_urls` (never arbitrary client URLs), validates each resolves to a path
under `${organizationId}/task-images/` in the `request-images` bucket (host + bucket + org-prefix
checks, mirroring the announcements `extractStoragePath` pattern), and removes only those objects
after the DB row no longer references them. A failed Storage remove is non-fatal (logged) — the DB
reference is already detached, so the worst case is a stray file, not a broken task.

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

As-built behavior (2026-06-11):

- quick-add creates `is_inbox = true` (the staging entry point) via `quickCreateTask`
- detailed create produces an organized task (`is_inbox = false`) via `createTask` — using the full create form is itself the deliberate "organize" act, so it does not land in Inbox
- entry flow: the Quick Add sheet's **Save to Inbox** calls `quickCreateTask`; its **Full create** action links to `/mobile/tasks/new`, carrying any typed title via `?title=` (read into the form's `defaultTitle`, kept separate from `defaultDate` so Calendar's `?date=` prefill is unaffected). `/mobile/tasks/new` is the single full-create route, also used by the Calendar day sheet for date-prefilled creation.
- a task enters/leaves Inbox only through deliberate actions afterward (swipe-to-Inbox, move in/out from detail), never implicitly from field edits
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

As-built (2026-06-11): fully client-side in `TasksWorkspace` over the already-loaded task set — no
month-scoped server query. A `calMonth: { y, m }` state drives a navigable grid (`shiftMonth(±1)` with
12-month rollover; `goToday()` resets to the current month and selects today). Day placement and the
agenda both key off the shared `anchor(task)` (`dueDateOf ?? scheduledDate`, Tokyo) — the same value
used for list grouping and the date filter, so there is one calendar interpretation. The agenda groups
the shown month's dated tasks by `anchor` day (`anchor.slice(0,7) === monthPrefix`), sorted ascending.
Selected-date emphasis is decoupled from the sheet: `calDay` holds the selection (persists for grid
highlight) while `sheetOpen` controls the bottom sheet, so closing the sheet keeps the day highlighted
and re-tapping re-opens it. When `calDay` is present, a compact selected-date summary strip renders
above the agenda (date label, count, reopen CTA, clear-selection action) so the whole Calendar body
keeps the same context, not only the sheet. The personal/shared legend stays on the current month only.
Recurring-instance expansion is still out of scope — a recurring task appears only on its own stored
`anchor` date.

## Search / Filter Rules

Required first-slice search/filter:

- title
- author name
- date / date range

As-built (2026-06-11): implemented **client-side** inside `TasksWorkspace` over the already-loaded,
org-scoped task list — no new server query or backend full-text index. One shared filter state
(`search`, `dateMode: single | range`, `dateFrom`, `dateTo`) is applied uniformly to the list views
via a local `matchesFilter(task)` / `applyFilter(list)` pair:

- text: case-insensitive `includes` over `` `${title} ${authorName}` ``.
- date: uses the same `anchor(task)` as grouping (`dueDateOf(task) ?? scheduledDate`, Tokyo); single
  mode is exact-equality, range mode is `from <= anchor <= to` with either bound optional; a `null`
  anchor never matches an active date filter.
- the bar renders on Today/Inbox/My/Sent/Completed only (not Calendar); Completed composes it on top
  of its existing `doneFilter` chips.
- empty vs no-result is distinguished per view by comparing the pre-filter base list against the
  filtered list (genuine empty state vs a `noMatchState()` with a clear action).

If the dataset ever grows past what is reasonable to load client-side, move this predicate to a
server query — the `matchesFilter` semantics above are the contract to preserve.

Not required as core first-slice search (still deferred):

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

### Time handling (as-built 2026-06-11)

`createTask` and `updateTaskCore` apply one shared rule via `normalizeTaskDateTime()` in
`src/lib/tasks.ts`, so create and edit can never drift:

- `time_label` is the authoritative optional time-of-day (`"HH:MM"`); `all_day = !time_label`.
  Display everywhere keys off `time_label` (cards show a time chip only when set; the detail Time row
  shows the time or "All day"). `due_at`'s clock component is **not** used as the time source — an
  all-day task with a due date stores `due_at` at `00:00` Tokyo, so reading a time from it would be
  wrong.
- a time requires a date anchor (scheduled or due). A time entered with **no date at all** is
  **rejected, not silently dropped**: `taskTimeWithoutDate()` (also in `src/lib/tasks.ts`) gates the
  flow — the form blocks submission with `tasks.errors.time_needs_date`, and both server actions
  re-check and redirect back with the same error (create → `/mobile/tasks/new`, edit →
  `/mobile/tasks/[id]/edit`). `normalizeTaskDateTime` still drops a stray time defensively, but the
  validation makes that path unreachable for a normal save, so no time is ever lost without feedback.
- `due_at` is built from the due date + kept time at `+09:00` (Tokyo) when a due date exists, else
  `null`. An all-day due date persists at `00:00` local — the existing intentional pattern, since
  `anchor()` / `tokyoDateOf()` read only the Tokyo calendar date. **Detail rendering** honors
  `all_day`: an all-day due date is shown date-only (`longDateOnlyIso`), never `00:00`, so it cannot
  contradict the "All day" time row; only genuinely timed tasks render date + time.
- inputs are validated: a date must match `YYYY-MM-DD` and a time `HH:MM`, otherwise it is treated as
  unset (handles partial/invalid time states). Toggling all-day back on clears `time_label` and
  normalizes `all_day`/`due_at` with no stale leftovers.

This narrows the previously underspecified time behavior; no broader scheduling semantics changed.

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

As-built (2026-06-11):

- Recurrence is **stored + displayed only — no instance generation.** `recurrence_rule` is a plain
  label on the single task row; a recurring task appears only on its own anchor date. This keeps the
  feature strictly inside the lightweight Todo boundary and out of the formal Recurring Work Scheduler.
- `createTask` and `updateTaskCore` persist identically through one shared helper,
  `resolveRecurrenceRule(submitted, previousRule)` in `src/lib/tasks.ts`. A standard rule
  (`daily | weekly | monthly | weekdays | weekends`) passes through; empty/None or any unrecognized
  value fails closed to `null`. No stale rule survives a clear in edit.
- **`custom` is round-trip only, enforced server-side (not UI-only).** `resolveRecurrenceRule` keeps
  `custom` solely when `previousRule === "custom"`:
  - create passes `previousRule = null`, so a new task can **never** be created with `custom`
    (submitted `custom` → `null`);
  - edit passes `previousRule = task.recurrence_rule`, so a task that already has `custom` may keep it,
    switch to a standard rule, or clear it — but a **non-custom task can never be turned into `custom`**
    (submitted `custom` on a non-custom task → `null`).
  This closes the gap where a crafted request could assign `custom` despite the UI omitting it. The
  form still omits `custom` from new choices and only renders a read-only `custom` chip when the loaded
  task already has that value; there is no custom rule builder (out of scope this slice).
- Display helpers (`repeatLabel` in `task-card.tsx` and `task-detail-view.tsx`) map all six values to
  the shared `tasks.repeat*` i18n keys, so labels stay consistent across cards, detail, list, and
  calendar surfaces.

Not required in first slice:

- exception dates
- advanced recurrence-end modeling
- a custom rule builder / parser

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

As-built (2026-06-11) — all six are implemented. `notification_type` gained `task_due_soon` and
`task_overdue` (migration `202606110001_task_reminder_notifications.sql`) alongside the existing
`task_shared` / `task_updated` / `task_completed`. All fan out through `notifyTaskParticipants`
(service-role, org-scoped, recipient = current participants, deduped per recipient via
`unique (recipient_user_id, dedupe_key)`); each carries the task id + title + event in its payload and
deep-links to `/mobile/tasks/{id}`.

Event-driven (emitted from server actions, actor excluded from recipients):

- `task_shared` — `createTask` (with recipients) and `shareTaskWithUsers`.
- `task_completed` — `completeTask`.
- `task_updated` — one type, distinguished by `payload.event`: `edited` (author core edit via
  `updateTaskCore`), `note` (**update-log activity** via `addTaskUpdate` — this is the update-log
  notification, kept distinct by event rather than a new type), and `reopened` (`reopenTask`).

Time-based (system reminders, no actor → every participant incl. the author is notified):

- `task_due_soon` / `task_overdue` — produced only by `runTaskReminders` (`src/lib/notifications/
  task-reminders.ts`), driven once daily by Vercel Cron `/api/tasks/reminders` (08:00 JST; CRON_SECRET
  guarded). **Due soon** = active task whose `due_at` Tokyo date is today; **overdue** = active task
  whose `due_at` Tokyo date is before today. One reminder per task per recipient ever (dedupe key
  `task_due_soon|task_overdue:<taskId>`), so the daily run never re-spams an already-notified task and
  overdue is a single first-cross notification, not an escalating series. No instance generation and no
  general scheduler — this is a narrow once-daily evaluation only.

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
