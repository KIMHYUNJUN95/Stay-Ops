# Todo / Task Workflow

Status: First slice implemented (2026-06-10), hardened through 2026-06-15. Mobile Todo/Shared Task is live under
`/mobile/tasks/*` (side-menu entry `tasks`). Seven tabs now present: Today / Tomorrow / Inbox(관리함) / **프로젝트** / Sent(공유함) / Completed(완료/기록) / Calendar. The 프로젝트 tab is **functional (first slice, 2026-06-15)**: project create/delete, sections (add/rename/delete with their tasks), an Unsectioned area, project-task create + complete/reopen, member invite/remove/leave, a Completed-tab filter (전체/일반/프로젝트), and a `project_shared` notification. Project tasks appear only in the Projects tab (never in Today/Tomorrow/Inbox/Sent/Calendar). Requires migration `202606150002_projects.sql`. See `docs/product/23-project-workflow.md` and `docs/engineering/09-todo-task-technical-design.md`.
quick add + detailed create/edit, task detail with unified update log, multi-select sharing, and
author/participant rules are implemented. Recurrence is **Todoist-style (2026-06-16)** — a recurring
task is **one live row** that rolls forward to its next occurrence on completion (no pre-materialized
per-date rows); the calendar shows future occurrences as **virtual previews**. notifications cover the current slice — shared, update-log activity, **task_completed**, plus
time-based **due-soon** and **overdue** reminders (daily cron). An extra intermediate tab was removed in the 2026-06-12 IA cleanup; manual complete / reopen was re-introduced on 2026-06-13 and now drives the Completed (완료/기록) tab and the free template-based daily report (업무일지, no LLM). See
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
- shared work with one common task record
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

### 2. Shared Tasks Use One Common Record

Once a task is shared:

- all participants see the same core task information
- all participants stay on the same canonical task
- there are no per-user task copies

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

### 4. Participants Can Collaborate On The Shared Task

Once shared, participants can still:

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

#### Context Link — as-built (2026-06-12)

A task can optionally carry an operational **context link** so CS/field notes stay attached to the
building-only, building · room, reservation, or guest context they are about. This is a convenience pointer, not a second
reservation surface — it never creates calendar bars and stays separate from the Beds24 calendar.

Picker flow (four screens, bottom sheet from the create/edit form):

1. **Building** — choose a building. The list shows **only genuinely active buildings**, taken from
   the same active-room catalog the reservation calendar uses (not a raw property list). Each row
   shows its active room count and today's in-stay guest count.
2. **Room + Reservation** — pick a room (occupancy shown), then optionally a reservation in that
   room. Rooms shown are **only active rooms**, and physical sub-units are **merged into one cell**
   (e.g. `201` and `201_2` are the same room → one `201` cell), exactly like the calendar room axis.
   Reservations are the real bookings for that room across the current + next month window (Tokyo).
3. **Building-only / Room-only** — on the room step, the alt actions can link either just the
   building or the building · room without a reservation. This covers building-level notes where a
   room is irrelevant. Because the user already entered this step from a chosen building, the
   building-only action is shown with a slightly more active visual treatment than the neutral
   alternatives.
4. **Guest direct entry** — emergency fallback when Beds24 data is missing/not synced: link by typed
   guest name with no date restriction. Clearly labeled as the missing-data path.

Display:

- A linked task shows a small **context chip** on its list card (building, building · room, or guest
  name) and a full **linked-context block** in task detail (building / room when present, channel
  badge, guest, date range,
  and a "go to reservation" affordance).
- Property and room labels are shown in their **canonical/merged form** (e.g. a booking stored as
  `荒木町A` / `201_2` displays as `아라키초A` / `201`), consistent with the calendar and the picker.
- **Go to reservation** opens the reservation calendar filtered to that building and scrolled to the
  reservation's check-in month, and — when the link points at a specific reservation — **auto-opens
  that reservation's detail sheet** on arrival (via a `reservationId` deep-link param) so the guest
  info is shown immediately, with no extra tap or manual refresh. A building-only or room-only link
  opens the calendar without a sheet; a guest-only emergency link has no building to open, so its
  card is shown without the navigation affordance.

Reservation, building-only, and room-only links are all fully saved and displayed: the building name
always resolves, and the room number appears when a room was linked even with no reservation attached.

Deactivation safety (confirmed rule): the picker only lets you **newly link active rooms**, but an
**existing link is never dropped when its room/reservation later goes inactive** — the note keeps
showing its context. Active-only filtering applies to *creating* a link, not to *displaying* one.

#### Today / Tomorrow tabs, swipe + drag-reorder — as-built (2026-06-12)

There are two day tabs side by side: **Today** (오늘) and **Tomorrow** (내일). The Tomorrow tab is a
full copy of Today's behaviour (same card layout, chips, and drag-reorder), filtered to tasks
anchored to tomorrow (Tokyo).

**Swipe to move between the day tabs.** The card-body left-swipe reveals one action:

- **Today tab → "내일로"** (defer to tomorrow): sets `scheduled_date` = tomorrow (Tokyo), un-inboxes.
- **Tomorrow tab → "오늘로"** (pull to today): sets `scheduled_date` = today (Tokyo), un-inboxes.
- Inbox also swipes **"오늘로"**; Sent / Calendar lists have swipe disabled.
- After the move the server action returns the user to the **same tab** they swiped from (`?view=`),
  so the card simply leaves the list.

**Drag-reorder** (both day tabs):

- **Today + Tomorrow only.** Today's Overdue/Today sections and the Tomorrow list are each
  independently reorderable. Other views (Inbox/Sent/Calendar) keep their automatic ordering.
- **Dedicated drag handle.** Each card shows a small grip handle (≡) on its right edge; dragging
  starts only from the handle. It owns its own pointer gesture and stops propagation, so it never
  triggers the card's **tap** (open), **long-press** (context menu), or **swipe** — no conflict.
- **Persistence.** Order is stored in `tasks.sort_order` (nullable integer). NULL = unranked → falls
  back to **priority order**, so behaviour is unchanged until the user first drags. Dropping assigns
  every card in that section a sequential `sort_order` (0..n). The value is **global to the task, not
  per-user** (MVP limitation): a shared task reordered by one member moves for everyone who sees it.
- **Disabled when ambiguous.** Reorder is off (handles hidden, plain list) while a **search/date
  filter** is active (the list is a subset) or in **multi-select mode** (the card body owns the tap).

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
- one update-log stream

Not as sender/recipient independent copies.

## Main Views

The feature should feel like a structured task workspace, not one flat list.

Required major views:

- Today
- Tomorrow
- Inbox
- Sent By Me
- Completed (완료/기록)
- Calendar

### Default First View

First view on entry:

- `Today`

### Internal View Order

Recommended order:

```txt
Today
Tomorrow
Inbox
Sent By Me
Completed (완료/기록)
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

1. overdue section, then today's section
2. inside each section: manual drag order if present
3. then importance for unranked tasks

### Tomorrow

Purpose:

- show what is already anchored to tomorrow

Include:

- tasks scheduled for tomorrow
- tasks due tomorrow

Recommended sort:

1. manual drag order if present
2. then importance

### Inbox

Purpose:

- active management list for the current user's visible tasks

Meaning:

- quick capture still lands here first
- ongoing active tasks are also managed here
- this is the broadest day-to-day task list in the mobile IA

Rules:

- quick-add defaults to Inbox
- detailed create produces an organized task, not an Inbox task — opening the full create form is the deliberate "organize" act
- shared tasks may also remain in Inbox
- a shared Inbox task appears in every participant's Inbox
- current mobile implementation also uses this tab as the general active-task list (`관리함`), so users can review all active tasks in one place without a separate intermediate list tab

Recommended behavior:

- Inbox is an explicit workflow state
- a task should not unexpectedly leave Inbox just because some fields were filled
- moving in/out of Inbox should be deliberate

Recommended sort:

- newest first

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

### Completed (완료/기록) — as-built (2026-06-13)

Purpose:

- review finished work as a dated history

Include:

- completed tasks grouped by **completion day** using the Tokyo date of `completed_at`
  (`tokyoDateOf(completed_at)`), newest day first — so a task scheduled for tomorrow but finished
  today appears under today's group, not its scheduled date.

Tab order is `Today · Tomorrow · Inbox(관리함) · Sent(공유함) · Completed(완료) · Calendar`.

Rules:

- The tab's **count badge** = today's (Tokyo) completions only.
- Each day-group header carries a **보고서 (Report)** button that opens the daily report for that
  day (see Daily Report below).

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

As-built (2026-06-15):

- **Month navigation** — a compact header with prev/next chevrons moves month-to-month; the month grid
  and agenda both update. On any non-current month a small **Today** button resets to the current month
  and re-selects today; the personal/shared legend shows only on the current month (keeps the header
  light). Tasks load once for the whole workspace, so month navigation is instant and client-side.
- **Month grid** — each day cell shows up to three dots (shared = brand accent navy, personal = amber, chosen for clear hue + value contrast; the legend below the grid labels them).
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

As-built (2026-06-16, Todoist-style — supersedes the 2026-06-11 pre-materialization model):

- A recurring task is a **single live `tasks` row** carrying the `recurrence_rule`, its
  `recurrence_series_id`, and the current occurrence date (`recurrence_instance_date`). Future dates
  are **not** pre-created — so the date-agnostic tabs (관리함/공유함) show exactly **one entry** per
  recurring task (this fixed the duplicate-flood bug where a daily task created ~50 rows).
- **Completion rolls forward.** Completing a recurring task does not close it — `completeTask` moves
  the same row to the **next occurrence** (advancing `scheduled_date` / `due_at` /
  `recurrence_instance_date`, preserving time-of-day) and keeps it `open`, logging a `completed`
  update + firing the `task_completed` notification. The quick-complete **undo** (`reopenTask`) rolls
  the row **back** to the previous occurrence.
- **Not completed → becomes overdue (one row, not a pile).** Recurrence advances **only on
  completion**, never automatically when the day passes. So an uncompleted daily task stays on its
  date and simply shows as **overdue** (a single task in the Today tab's overdue section) until
  acted on — it does not multiply into one row per missed day.
- **Late completion skips to the future.** When a *late* (overdue) recurring task is completed,
  `nextRecurringInstance` advances past today (iterating the rule, so the weekday / day-of-month
  anchor is kept) so the next occurrence lands in the future — matching Todoist's "every day"
  behaviour, instead of forcing the user to complete once per missed day to catch up.
- **Overdue prompt on the Today tab (2026-06-16).** When the caller has **their own** overdue tasks,
  a banner appears at the top of the Today tab with two bulk actions:
  - **오늘로 가져오기** (`rescheduleOverdueToToday`) — moves each overdue task to today. A recurring
    task's single row is re-anchored to today (series preserved); a one-off task's due date moves to
    today (time-of-day kept).
  - **지난 미완료 삭제** (`dismissOverdueTasks`, two-step confirm) — a **one-off** overdue task is
    deleted, but a **recurring** task is **not** deleted (that would kill the series): it advances to
    its **next future occurrence**, so the missed run is dropped while the daily/weekly schedule
    continues. (e.g. a daily task overdue from a few days ago → the missed days clear, the next
    occurrence remains.)
  Both actions are **author-scoped** server-side (`createdByUserId === viewer`) so they never
  reschedule or delete another member's shared task. The banner hides while a search/date filter or
  multi-select is active. i18n: `tasks.overduePrompt*` (ko/ja/en).
- **Calendar previews are virtual.** The calendar/agenda expands each recurring task across the
  visible month from its rule (`recurringOccurrencesInRange`) for display only — no DB rows are
  added, and tapping/editing a virtual occurrence acts on the one real series task.
- The old window-materializer (`materializeRecurringTasks`) is **deprecated and no longer called**
  from any read path. Pre-existing materialized instances were collapsed to one row per series by
  migration `202606160002_collapse_recurring_instances.sql`.
- A repeat rule **requires a date anchor** (`scheduled_date` or `due_at`). Saving repeat with no date
  is rejected both in the form and in the server actions.
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
- Generation model (Todoist-style, 2026-06-16):
  - the task the user saves is the single live occurrence; **no future rows are generated**
  - completing it rolls the same row forward to the next occurrence (and stays open)
  - the calendar projects future occurrences virtually from the rule (display only)
  - clearing repeat (set None) turns it back into a one-off task; completing then closes it normally

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

Viewing (as-built 2026-06-12): attached photos are shown, not just counted. Task detail (both the task
header and each update-log note) renders a few **tiny thumbnails**; tapping them raises a **bottom
sheet** listing every attachment, and tapping one there opens a **full-screen swipeable viewer**
(multi-photo carousel with a position counter and dots). Before this, photos showed only as a
"사진 N장" count with no way to open them.

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
- follow-up notes
- optional update images

It should also support system-style small entries such as:

- task edited
- task shared

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

### Shared Task — Collaboration Actions

Any participant can:

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
- Below those, two one-tap day shortcuts sit side by side — **Add to Today** and **Add to Tomorrow** —
  which create an organized task (`is_inbox = false`) with `scheduled_date` set to today / tomorrow
  (Tokyo) and jump straight to that day tab (`quickCreateTodayTask` / `quickCreateTomorrowTask`).
- **Full create** is the deliberate organize path. It routes to `/mobile/tasks/new` (an organized task,
  `is_inbox = false`) where dates, share recipients, time, priority, tags, photos, and recurrence are
  configured. A short subtitle on that screen restates this. Any title already typed in Quick Add is
  **carried over** (`?title=`) so escalating from capture to full create never loses the input.
- The same `/mobile/tasks/new` is reused for date-prefilled creation from the **Calendar** day sheet
  (`?date=`); there is no separate full-create entry path.
- Wording is unambiguous about destination: Quick Add → Inbox, Full create → organized task. Detailed
  create never lands in Inbox (see Inbox Rules).
- **Sheet dismissal (2026-06-15)**: the Quick Add sheet — like every bottom sheet in this feature
  (Calendar day sheet, long-press menu, share picker, context picker, report sheet, photo-attachment
  sheet) — is dismissed by **dragging it down** (iOS-style), tapping the scrim, or Esc. The old
  top-right **X close button was removed** since the slide replaces it. Shared behavior + thresholds:
  Mobile Navigation doc → "2026-06-15 Bottom Sheets — iOS-style Drag-to-Dismiss".
- **Draft preservation (2026-06-12)**: the detailed create/edit form mirrors its in-progress values
  (title, description, dates, time, priority, tags, share recipients, linked context, expanded state)
  into `sessionStorage`, so leaving the form and coming back restores them. This matters most for the
  context link's **"예약 보기"** action, which navigates to the reservation calendar — a back-navigation
  no longer wipes what was typed. The draft is cleared on a successful save and on an explicit
  back-to-list; newly attached (not-yet-uploaded) photos are the one field a round-trip does not keep.

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

## Completion — as-built (2026-06-13)

Task completion was re-introduced (it had been removed in the 2026-06-12 IA cleanup):

- Tapping the leading **status circle** on any task card **completes** it (active task) or **reopens**
  it (completed task). Completing shows a bottom **undo toast** ("완료했습니다 · 되돌리기").
- The task **detail view** also has a **완료 / 다시 열기** button.
- Completing sets `status` + `completed_at` + `completed_by_user_id`, writes a `completed` row to the
  update log, and fans out a `task_completed` notification to other participants; reopening clears
  those fields and writes a `reopened` log row. Both revalidate the list and detail.

## Daily Report (업무일지) — as-built (2026-06-13)

Each day-group header in the **Completed (완료/기록)** tab has a **보고서 (Report)** button that opens
the **ReportSheet** bottom sheet:

- It gathers the **caller's own** completed tasks for that Tokyo date and builds a Korean daily work
  report ("업무일지") — a date header followed by one bullet per completed item.
- **Free, no AI.** The report is template-based with a deterministic local tidy-up (whitespace,
  leading bullet glyphs, punctuation spacing) for light auto-correction — no LLM, no API key, no
  per-use cost. (An LLM-backed variant was prototyped then dropped; see the decision log.)
- The result is shown in an **editable textarea** and **copied to the clipboard**.
- **Permission — staff-only.** Generation is allowed when the role is anything except
  `part_time_staff`, OR the user has an individually-granted `profiles.can_generate_report = true`
  override (the flag exists for the few part-timers who work in a management capacity; regular staff
  never need it). A non-permitted caller sees a **"권한 없음"** popup inside the sheet. The check is
  enforced server-side, not just in the UI.

See `docs/planning/01-decision-log.md` (2026-06-13) for the free-template decision.

## Swipe Actions

As-built (2026-06-12) — one move action per view, revealed by a card-body left-swipe:

- **Today** → "내일로" (defer to tomorrow)
- **Tomorrow / Inbox** → "오늘로" (pull to today)
- **Sent / Calendar lists** → swipe disabled

The action returns the user to the tab they swiped from. Full semantics live in the
"Today / Tomorrow tabs, swipe + drag-reorder" section above.

Possible later additions:

- date change
- share

Do not prioritize destructive swipe-delete.

## Search / Filters

First-slice required search/filter axes:

- title
- author name
- date

As-built (2026-06-11): a single lightweight search/filter bar sits below the view chips on the list
views (Today / Tomorrow / Inbox / Sent). One shared filter state is reused across those
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
- **Scope** — the **Calendar** view does not show the bar (it already navigates by date).
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
- Tomorrow
- Inbox
- Sent By Me
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
2. Tomorrow
3. Inbox
4. Sent By Me
5. Calendar
6. quick add
7. detailed create / edit
8. task detail
9. participant picker / share flow

## Verification Focus For Future Implementation

- private task visibility is preserved
- only original author edits core fields
- participants can update the shared update-log
- original-author leave = full delete
- participant self-remove = disappear only for self
- shared Inbox behavior is consistent for all participants
- calendar stays separate from reservation calendar
- ko/ja/en strings exist
