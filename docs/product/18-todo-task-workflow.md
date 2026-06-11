# Todo / Task Workflow

Status: First slice implemented (2026-06-10). Mobile Todo/Shared Task is live under
`/mobile/tasks/*` (side-menu entry `tasks`). All six views (Today/Inbox/My/Sent/Completed/Calendar),
quick add + detailed create/edit, task detail with unified update log, multi-select sharing, common
shared status, and author/participant rules are implemented. Recurrence stores a rule + indicator
only (no auto instance generation yet); notifications cover the full first slice — shared, update-log
activity, completed, plus time-based **due-soon** and **overdue** reminders (daily cron). See
`docs/engineering/09-todo-task-technical-design.md` for the as-built schema/RLS and `docs/product/
14-notification-design.md` for the notification matrix.

Hardening pass (2026-06-11): task creation is now fail-safe (the task row is rolled back if the
participant insert fails, so no invisible orphan rows); the original author can edit task-level photos
in edit mode; update-log entries support optional photo upload (max 5, `task-update-images` path); the
misleading Sent "new update" dot was removed (see Sent By Me); calendar weekday headers are localized
via the shared `Intl` weekday pattern used elsewhere in the app; participant management (author removes
any participant, anyone removes self) is exposed in task detail with destructive confirmations. Second
hardening cut (same day): re-sharing (`shareTaskWithUsers`) is fail-safe (a failed participant insert
no longer produces false shared state or notifications); update-log photo-upload failures show an
inline localized error instead of failing silently; and removed task-level photos are hard-deleted
from Storage, not just detached from the DB.

## Purpose

The Todo / Task workflow is a mobile-first operational task system for:

- personal reminders
- CS follow-up
- shared team tasks
- date-based planning
- fast capture before later organization

This feature is closer to:

```txt
Todoist-style personal + shared operational task management
```

than to a simple memo list.

Important product direction:

- the center of gravity is still **personal task / personal memo first**
- sharing is a powerful extension, not the default starting point

## Product Position

This module should cover:

- personal task capture
- operational follow-up
- shared work with synchronized status
- task calendar
- lightweight recurring task behavior

This module should **not** be treated as the same thing as the recurring work scheduler.

## Separation From Recurring Work Scheduler

Todo/Task and Recurring Work Scheduler must remain separate features.

### Todo / Task

Use for:

- personal reminders
- ad hoc follow-up
- shared coordination
- CS promise tracking
- guest/request exception handling
- flexible repeated reminders

### Recurring Work Scheduler

Use for:

- formal operational recurring work
- facility/process routines
- official scheduled work programs

Do not collapse these two into one workflow.

## Core Product Direction

### 1. Personal First

New tasks start as personal by default.

That means:

- a user can create a fully private task
- it is visible only to the creator at first
- later, the creator can turn it into a shared task by adding people

### 2. Shared Tasks Are Common Tasks

Once a task is shared:

- all participants see the same core task information
- status is common
- completion is common
- reopen is common

This is important because the product should not show different truth to different participants.

### 3. The Original Author Owns Core Content

For a shared task, the original creator remains the only person who can edit the core task content.

Core content includes:

- title
- description
- tags
- scheduled date
- due date
- time
- recurrence
- task-level photos

Participants cannot edit the core content of a shared task.

### 4. Participants Can Operate The Shared Workflow

Once shared, participants can still:

- change the shared status
- complete the task
- reopen the task
- add update-log entries
- re-share to more people
- remove themselves

### 5. Shared Tasks Can Go Back To Personal

If all non-author participants are removed:

- the task returns to personal/private state

### 6. If The Original Author Leaves, The Task Is Deleted

Special deletion rule:

- if a normal participant removes themselves, the task disappears only for that person
- if the original author removes themselves, the task is deleted for everyone

## Users

Primary users:

- Owner
- Office Admin
- CS Staff
- Field Manager
- Staff
- Part-time Staff

All active organization users can:

- create personal tasks
- share tasks with any active organization user
- receive shared tasks
- use the calendar/task views

## Relationship To Other Modules

### Reservation Calendar

Task calendar is separate from the Beds24 reservation calendar.

Tasks can optionally link to:

- property/building
- room/unit
- reservation
- guest name

But:

- task items must not become reservation bars
- reservation calendar and task calendar must remain distinct surfaces

### Maintenance / Lost and Found / Orders

Todo can be used for follow-up around these modules.

Examples:

- reminder to check a guest reply
- follow-up after a maintenance request
- room-preparation note before check-in

Todo is not a substitute for the original record in those modules.

### Recurring Work Scheduler

Again:

- recurring task support here is lightweight and personal/team-task oriented
- official recurring operations stay in the Work Scheduler

## Core Task Model

One task can move across these modes:

```txt
private personal task
-> shared task
-> private again (if participants removed)
```

So this should be modeled as:

- one task record
- one participant set
- one common status if shared
- one update-log stream

Not as sender/recipient independent copies.

## Main Views

The feature should feel like a structured task workspace, not one flat list.

Required major views:

- Today
- Inbox
- My Tasks
- Sent By Me
- Completed
- Calendar

### Default First View

First view on entry:

- `Today`

### Internal View Order

Recommended order:

```txt
Today
Inbox
My Tasks
Sent By Me
Completed
Calendar
```

### Navigation Pattern

- side-menu entry for the feature
- also available as a bottom-bar customization candidate
- once inside the feature, switch between the main views using internal segmented/tab navigation

## View Definitions

### Today

Purpose:

- show what really needs attention today

Include:

- overdue tasks
- tasks due today
- tasks manually placed into today

Recommended sort:

1. overdue
2. today's scheduled items
3. then importance inside the group

### Inbox

Purpose:

- temporary holding area for tasks captured quickly but not fully organized yet

Meaning:

- fast capture
- staging area
- later organization point

Rules:

- quick-add defaults to Inbox
- detailed create produces an organized task, not an Inbox task — opening the full create form is the deliberate "organize" act
- shared tasks may also remain in Inbox
- a shared Inbox task appears in every participant's Inbox

Recommended behavior:

- Inbox is an explicit workflow state
- a task should not unexpectedly leave Inbox just because some fields were filled
- moving in/out of Inbox should be deliberate

Recommended sort:

- newest first

### My Tasks

Purpose:

- show tasks that the current user needs to care about

Includes:

- user's personal tasks
- tasks shared with the user

### Sent By Me

Purpose:

- track tasks the current user shared with others
- manage the original task from the sender perspective

Should show:

- the task itself
- whether it is shared
- who it is currently shared with
- whether the task was updated — **deferred (2026-06-11)**: there is no per-user read/seen state yet, so a truthful "new update" indicator is not possible in this slice. The earlier dot was derived only from share presence (not real activity) and has been removed rather than left as a misleading cue. Revisit when a read-state model exists.

Recommended sort:

- latest shared / latest updated first

### Completed

Purpose:

- review completed task history without cluttering active work views

This should be a separate screen, not just a folded section at the bottom of Today/My Tasks.

Required filtering scope:

- completed tasks created by me
- completed tasks shared with me
- all completed tasks related to me

Rules:

- personal completed tasks remain visible only to the owner
- shared completed tasks remain visible to participants

### Calendar

Purpose:

- view dated tasks across month and agenda-style views

Required modes:

- month view
- agenda / list by date

Rules:

- show all dated tasks relevant to the current user
- include tasks created by the user
- include shared tasks visible to the user
- visually distinguish shared tasks from personal tasks

Date tap behavior:

- open a bottom sheet / modal for that date's tasks

As-built (2026-06-11):

- **Month navigation** — a compact header with prev/next chevrons moves month-to-month; the month grid
  and agenda both update. On any non-current month a small **Today** button resets to the current month
  and re-selects today; the personal/shared legend shows only on the current month (keeps the header
  light). Tasks load once for the whole workspace, so month navigation is instant and client-side.
- **Month grid** — each day cell shows up to three dots (shared = brand accent, personal = grey).
  `Today` is ringed; the selected day is filled with the brand accent (its dots invert for contrast).
- **Month agenda** — below the grid, the shown month's dated tasks are grouped by day in date order,
  each group with a localized weekday/day header, a count, and a `Today` chip on today's group. Tapping
  a group header opens that day's sheet. This replaces the previous flat "next 8 upcoming" list so the
  agenda reads as an intentional month surface, not leftover output.
- **Selected date** — tapping a grid cell selects it (persistent emphasis) and opens the bottom sheet;
  the screen also shows a small selected-date summary strip above the agenda with the localized date,
  task count, a `Today` chip when relevant, a re-open action, and a clear-selection action. The sheet
  shows the date, a task count, the day's tasks, and the unchanged "add a task on this date" action.
  Closing the sheet keeps the day highlighted; tapping it again or using the summary strip re-opens it.
- **Anchor date** — the calendar uses the same anchor as the rest of the feature (due date wins over
  scheduled date, Tokyo). No second calendar interpretation is introduced.
- **Separation** — the list-view search/filter bar still does not appear on Calendar; Calendar's date
  controls are native to it. The task calendar remains entirely separate from the Beds24 reservation
  calendar.
- **Empty/sparse** — a month with no dated tasks shows a clear "no dated tasks this month" agenda
  message; a selected date with no tasks shows the day-sheet empty message.

Production-polish pass (2026-06-11): the month nav + weekday row + grid sit inside a single white
`bg-surface` card lifted off the ivory canvas (matching the rest of the StayOps card system); the
legend moved to a quiet divider row directly under the grid it explains. Grid cells share a
fixed-height marker row for even vertical rhythm, with distinct calm states for today (soft tint +
inset ring) vs the selected day (filled accent + lifted shadow). The day sheet's task list scrolls
within a capped height for busy days, the empty states are intentional icon blocks rather than bare
text, and the "add a task on this date" CTA is a soft accent-tinted button. No behavior, permission,
or anchor-date change — visual/interaction polish only.

## Dates And Time

The task system needs stronger scheduling than a simple due-date field.

### Required Date Model

Each task should support:

- scheduled date
- due date

### Quick Date Actions Needed

- today
- tomorrow
- weekday
- weekend
- direct date selection

### Time Policy

Default:

- all-day

Optional:

- specific time

So users should be able to choose:

- all-day task
- time-specific task

As-built (2026-06-11): the detailed create/edit form's Time section offers an **All day** toggle, a
direct **time picker** (`HH:MM`), three quick-time chips, and a clear control that returns the task to
all-day. The saved time-of-day lives in `time_label` (with `all_day` = "no time-of-day"); the picker
is pre-filled from `time_label` when editing, so a saved time round-trips correctly. Toggling back to
all-day in edit clears the time cleanly (no stale `time_label`). See
`docs/engineering/09-todo-task-technical-design.md` "Time handling" for the exact persistence rule.

A specific time **requires at least one date anchor** (scheduled or due). Entering a time with no
date is **not accepted** — the form blocks submission with a clear localized error (it no longer
silently drops the time), and both server actions reject it as a guard (create returns to the form,
edit returns to the edit form, both with the error). This applies identically to create and edit.

An **all-day due task is shown as date-only** in task detail, never as a midnight time. Because an
all-day due date is stored at `00:00` Tokyo internally, the detail view renders it as a plain date
when `all_day` is true (and date + time only for genuinely timed tasks), so the screen never shows a
contradictory "Due: … 00:00" alongside "Time: All day".

## Recurring Tasks

Recurring tasks are needed here, but in a lighter form than the Work Scheduler.

Required support:

- daily
- weekly
- monthly
- weekdays only
- weekends only
- custom repeat pattern

Not required in first slice:

- exception dates
- recurrence count limits
- complex recurrence-end rules

As-built (2026-06-11):

- Recurrence in Todo is a **lightweight display-only reminder label**. It does NOT generate repeated
  instances — a recurring task still appears only on its own stored anchor date. The create/edit form
  shows an inline hint stating this, keeping the boundary with the formal Recurring Work Scheduler
  explicit.
- User-selectable rules: **None, daily, weekly, monthly, weekdays, weekends** (six chips, None clears
  it). Recurrence can be set in create, changed in edit, and cleared back to None at any time.
- **`custom` is recognized but not user-configurable in this slice.** There is no rule builder, so the
  form does not offer `custom` as a new choice. If a task already stores `custom` (legacy/external),
  the edit form surfaces it as a read-only highlighted chip so the selection is unambiguous and the
  value is not silently lost; the user can keep it, switch to a standard rule, or clear it — but cannot
  newly assign `custom`. It renders with the "Custom" label wherever recurrence is shown.
- This `custom` rule is **enforced on the server, not just in the UI.** Persistence is identical in
  create and edit and runs through one shared resolver: a standard rule is stored, empty/None or any
  unrecognized value fails closed to `null`, and `custom` is kept **only when the task already had
  `custom`**. So a new task can never be created with `custom`, and a non-custom task can never be
  turned into `custom`, even by a manipulated request — only an existing `custom` task round-trips.

## Priority

Priority is needed, but must stay simple.

Use 3 levels:

- normal
- important
- urgent

## Tags

Tags are needed.

Rules:

- user-created only
- not fixed system-only tags
- max about 10 tags per task

## Photos

Photos are optional.

Max:

- 5 images

Photos may be attached to:

- the main task itself
- update-log entries

Removal behavior (as-built 2026-06-11): when the original author removes a task-level photo during a
core edit, the file is hard-deleted from Storage (not just detached from the DB) — only files under
the task's own org/`task-images` path are eligible, and removal happens server-side after the DB
reference is dropped. Update-log photos are immutable once posted (the update-log has no edit/delete in
this slice), so they are not storage-cleaned.

## Update Log

Comments and progress notes should not be separate concepts in the first slice.

Use one unified update-log stream.

This stream should support:

- participant progress notes
- completion notes
- follow-up notes
- optional update images

It should also support system-style small entries such as:

- task edited
- task shared
- task completed
- task reopened

So the user can see small signals like:

```txt
edited
```

without a separate audit UI.

## Sharing Model

### Default

- task starts private

### Sharing

- any active organization user can be selected
- multi-select sharing is required
- one share action can add multiple recipients

### Re-sharing

- participants may re-share to more people

### First Recipient

The first recipient should be shown in the UI, even if only in a subtle way.

### Participant Display

Show:

- original author
- first recipient
- current participant list

Recommended display style:

- list cards: summary like `shared with 3`
- detail: full participant names
- first recipient subtly distinguished

### Shared Task Visual Distinction

Do not overdesign this.

Recommended direction:

- small shared indicator
- participant hint
- subtle distinction only

## Permissions

### Private Task

- creator can view/edit/delete
- no one else can see it

### Shared Task — Core Content

Only the original author can edit:

- title
- description
- tags
- scheduled date
- due date
- time
- recurrence
- task-level photos

### Shared Task — Common Workflow State

Any participant can:

- change status
- complete
- reopen
- add update-log entries

### Participant Management

- original author can remove any participant
- any participant can remove themselves

If a non-author participant removes themselves:

- the task disappears completely from that person's views

If the original author removes themselves:

- the task is deleted for everyone

### Deletion

Deletion is hard delete.

## Status

Shared tasks should use one common status visible to all participants.

Recommended base statuses:

- open
- in_progress
- completed
- cancelled

Rules:

- once shared, participants all see the same status
- one participant completing the task completes it for all
- one participant reopening the task reopens it for all participants

## Quick Add

The system needs both:

- quick add
- detailed create

### Quick Add

Required input:

- title only

Default destination:

- Inbox

### Detailed Create

Should allow full task setup.

Recommended first-visible fields:

- title
- description
- scheduled date
- due date
- share recipients

Recommended collapsed / "more" fields:

- time
- priority
- tags
- photos
- recurrence

### As-built flow (2026-06-11)

The Quick Add ↔ Detailed Create distinction is made explicit in the interaction:

- The floating **Quick add** button (on every task view) opens a bottom sheet for **fast capture**:
  a title-only field, a primary **Save to Inbox** action (creates `is_inbox = true`), and a secondary
  **Full create** action. The sheet's helper copy states the two outcomes plainly.
- **Full create** is the deliberate organize path. It routes to `/mobile/tasks/new` (an organized task,
  `is_inbox = false`) where dates, share recipients, time, priority, tags, photos, and recurrence are
  configured. A short subtitle on that screen restates this. Any title already typed in Quick Add is
  **carried over** (`?title=`) so escalating from capture to full create never loses the input.
- The same `/mobile/tasks/new` is reused for date-prefilled creation from the **Calendar** day sheet
  (`?date=`); there is no separate full-create entry path.
- Wording is unambiguous about destination: Quick Add → Inbox, Full create → organized task. Detailed
  create never lands in Inbox (see Inbox Rules).

## Task Cards

For readability, default list cards should prioritize:

Required:

- title
- priority
- scheduled date or due date
- time if set
- shared indicator
- participant summary
- recurrence indicator

Optional:

- 1-line description preview
- 1-2 tag preview
- photo indicator

Avoid by default:

- long body previews
- full participant lists
- excessive metadata

## Swipe Actions

Recommended first-slice swipe actions:

- complete
- move to Today
- move to Inbox

Possible later additions:

- date change
- share

Do not prioritize destructive swipe-delete in the first slice.

## Search / Filters

First-slice required search/filter axes:

- title
- author name
- date

As-built (2026-06-11): a single lightweight search/filter bar sits below the view chips on the list
views (Today / Inbox / My Tasks / Sent / Completed). One shared filter state is reused across those
views and persists across tab switches.

- **Text search** — one field matching task **title** and **author name** (case-insensitive partial).
- **Date filter** — a toggle button opens a compact block with a **Single / Range** mode. Single
  matches tasks whose anchor date equals the chosen date; Range matches anchor date within
  start/end (either side may be left open). The anchor date is the existing one (due date wins over
  scheduled date, Tokyo operating date) — the same value used for grouping, listing, and the
  calendar. Dateless tasks never match an active date filter.
- **Active state** — when any filter is active, a "Filters" row shows the search term and/or date
  chip plus a one-tap **Clear**. The date button also carries a small dot when a date filter is set.
- **Empty vs no-result** — a view that is genuinely empty keeps its own empty state; a view that has
  tasks but matches none shows a distinct "no matching tasks" state with a Clear action.
- **Scope** — the **Calendar** view does not show the bar (it already navigates by date). The
  Completed view keeps its own Created-by-me / Shared-with-me chips and applies text/date on top.
- Filtering is **client-side** over the already-loaded, org-scoped task set; it changes nothing about
  permissions, visibility, ownership, or shared state.

Not required in first slice (still deferred):

- body search
- status filter as a primary search surface
- priority filter as a core search surface
- tag search as a first-slice requirement
- participant-name search as a first-slice requirement

## Entry Points

Tasks can be created from:

- Todo/Task feature entry itself
- quick add
- calendar date
- reservation/guest/property context where practical

And new-task entry should be available from:

- Today
- Inbox
- My Tasks
- Sent By Me
- Completed
- Calendar

## Empty-State Tone

Use a clear but slightly supportive operational tone.

Not too dry, not chatty.

Example direction:

- no tasks today
- inbox is clear
- add a task or organize existing items

## Mobile-Only First Slice

This task system should be designed for mobile first.

Admin web is intentionally deferred until the wider mobile feature set is complete.

## Suggested First Design Slice

Design in this order:

1. Today
2. Inbox
3. My Tasks
4. Sent By Me
5. Completed
6. Calendar
7. quick add
8. detailed create / edit
9. task detail
10. participant picker / share flow

## Verification Focus For Future Implementation

- private task visibility is preserved
- shared task status stays common
- only original author edits core fields
- participants can update workflow state and update-log
- original-author leave = full delete
- participant self-remove = disappear only for self
- shared Inbox behavior is consistent for all participants
- calendar stays separate from reservation calendar
- ko/ja/en strings exist
