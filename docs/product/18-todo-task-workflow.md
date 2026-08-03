# Todoist / Task Workflow

Status: First slice implemented (2026-06-10), hardened through 2026-06-15. Mobile Todoist/Shared Task is live under
`/mobile/tasks/*` (side-menu entry `tasks`, user-facing label `Todoist`). Seven tabs now present: Today / Tomorrow / Inbox(관리함) / **프로젝트** / **지시(받은/보낸)** / Completed(완료/기록) / Calendar. The 프로젝트 tab is **functional (first slice, 2026-06-15)**: project create/delete, sections (add/rename/delete with their tasks), an Unsectioned area, project-task create + complete/reopen, member invite/remove/leave, a Completed-tab filter (전체/일반/프로젝트), and a `project_shared` notification. Project tasks appear only in the Projects tab (never in Today/Tomorrow/Inbox/지시/Calendar). Requires migration `202606150002_projects.sql`. See `docs/product/23-project-workflow.md` and `docs/engineering/09-todo-task-technical-design.md`.
quick add + detailed create/edit, task detail with unified update log, multi-select sharing, and
author/participant rules are implemented. Recurrence is the **occurrence model (2026-07-30, supersedes
the 2026-06-16 roll-forward model)** — a recurring task is **one live row** with a FIXED anchor; it shows
on **every** scheduled date independently (completion no longer rolls the row forward), per-occurrence
completion lives in `task_occurrence_state`, and overdue occurrences persist (grouped "N일 밀림" with
오늘로 가져오기 / 삭제). See the Recurrence section + `docs/planning/01-decision-log.md`. The calendar header has a
**"반복 숨기기" (Hide recurring) toggle** (2026-07-29) — a session-only client switch (default off, resets on
reload) that hides fixed/standard-recurring occurrences across the whole calendar (month grid, month agenda,
and day sheet) so one-off dated tasks read clearly; it is mirrored 1:1 on the admin console calendar. notifications cover the current slice — shared, update-log activity, **task_completed**, plus
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

This module is the canonical task workspace across mobile and admin.

## Naming And Admin Surface

- Mobile user-facing label is `Todoist`.
- Admin sidebar user-facing label is also `Todoist`.
- The current admin route is legacy `/admin/recurring-work` (a "준비 중" placeholder); the dashboard
  console will move to `/admin/tasks` (legacy path redirects). See the planning spec below.
- The old separate "Recurring Work Scheduler" concept is not the active user-facing module anymore; the shared task workspace is the canonical direction.
- **대시보드 Todoist 기획 스펙 (2026-07-24): `docs/product/28-admin-todoist-console.md`.** 대시보드는
  "모바일 코어 기능 그대로 + 업무 지시(Work Directive) 하나"로 심플하게 간다 — 관리자 분석/오버사이트나
  부가기능은 넣지 않는다. 정식 담당자(assignee)는 보류. 디자인은 대표님이 직접 진행.

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

- **Today + Tomorrow + 관리함(Inbox).** Today's Overdue/Today sections, the Tomorrow list, and the
  Inbox are reorderable (Inbox added 2026-07-30, mirrored on the admin console). In the Inbox,
  unranked tasks fall back to **newest-first** (so a new task still lands on top) rather than priority.
  Sent/Calendar keep automatic ordering.
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

### Legacy Separate Scheduler Concept

Again:

- recurring task support here is lightweight and personal/team-task oriented
- any future formal facility routine module must be treated as a new explicit feature, not as this Todoist workspace

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
- 프로젝트
- 지시 (받은 / 보낸)
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
프로젝트
지시 (받은 / 보낸)
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

Rules (Todoist "Inbox = default project" model):

- Inbox(`관리함`) = **every active task that is not in a named project** — dated or not. This is the one place to manage all non-project work. (Mobile `TasksWorkspace` keys the Inbox view off "no project", i.e. `isActive`, not the `is_inbox` flag.)
- **Today / Tomorrow are filters over this same set** — a task dated today appears in Inbox AND in Today (they are not mutually exclusive).
- **Project tasks are excluded** from Inbox/Today/Tomorrow/Sent/Calendar; they live only in the Projects tab.
- shared / received-directive tasks (non-project) also appear in Inbox; a shared Inbox task appears in every participant's Inbox.
- The `is_inbox` column still exists from earlier iterations but **no longer gates this view** (the view is "no project"). Quick-add still stamps it, harmlessly.
- **Dashboard(`/admin/tasks`) uses the identical model (aligned 2026-07-27):** `관리함` = all active non-project tasks, Today/Tomorrow are filters, project tasks only in the project view, "관리함으로 이동" = remove from project (keeps the date). See `docs/product/28-admin-todoist-console.md` §12.

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

Tab order is `Today · Tomorrow · Inbox(관리함) · 프로젝트 · 지시 · Completed(완료) · Calendar`.

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

### Single-date model + unified schedule picker (as-built 2026-07-24, A안 — supersedes the two-date UI)

The mobile create/edit form now exposes **one date**, not a scheduled/due pair, benchmarked on
Todoist's date popover. Rationale: field staff almost always mean "do it / due on this day"; the
scheduled + due split added UI weight without real use.

- **One date → `due_at`.** The single date maps to `due_at` (all-day = `00:00` Tokyo; a time sets the
  clock). This matches the app's existing anchor (`due ?? scheduled`, so Today/Tomorrow/Calendar/overdue
  already prefer due). The form submits `scheduledDate=""` + `dueDate=<date>`, so any created or edited
  task writes due-only and `scheduled_date` is cleared.
- **`scheduled_date` is legacy-only.** The column is kept (no migration); un-edited legacy tasks that
  only have `scheduled_date` still display via the anchor. Editing any such task through the form
  converts it to due-only.
- **Unified picker** — `src/components/tasks/task-schedule-sheet.tsx` (`TaskSchedulePicker`), a canonical
  `BottomSheet`: quick relative options (**오늘 · 내일 · 다음 주 · 다음 주말 · 날짜 없음**, each with its
  computed date), an inline month calendar, and expandable **시간 / 반복** rows — all in one sheet.
  Commit-on-close (Todoist-style: any dismiss keeps the current selection). The create/edit form's
  date/time/repeat now live only in this sheet (removed from the old "더 보기" section); the form shows a
  single 일정 chip summarizing date + time + repeat.
- **Consistency actions** — the quick-create (`quickCreateTodayTask` / `quickCreateTomorrowTask`) and
  swipe move (`moveTaskToToday` / `moveTaskToTomorrow`) actions now write `due_at` (move preserves
  time-of-day and re-anchors a recurring occurrence) instead of `scheduled_date`, so the single-date
  model is coherent across create, edit, quick-add, and swipe.
- i18n: `scheduleTitle` / `scheduleNoDate` / `scheduleNextWeek` / `scheduleNextWeekend` / `scheduleDone`
  / `scheduleEmpty` / `scheduleAddTime` / `scheduleAddRepeat` (ko/ja/en).

### Time-block duration + contextual repeat (as-built 2026-07-24)

Inside the schedule sheet, the **Time** and **Repeat** sub-pickers were rebuilt to match Todoist:

- **Duration (기간)** — a timed task can carry a same-day **time-block length**. Default is **기간 없음**;
  tapping offers **15분 / 30분 / 1시간 / 2시간 / 사용자 정의(분 입력)**. Stored in a new nullable column
  `tasks.duration_minutes` (migration `202607240001_task_duration.sql` — **apply in Supabase before
  deploy**). Duration is only kept when the task has a time-of-day (`time_label`); all-day tasks force it
  to null (server-guarded). Display: cards show `HH:MM–HH:MM` and detail shows `HH:MM – HH:MM · <length>`.
  This is a **single-day block**, not a multi-day span (the single-date model is preserved).
- **Repeat — contextual list keyed off the selected date** (Todoist-style vertical menu, not chips):
  반복 없음 · 매일 · **매주 {요일}** · 평일마다 (월-금) · **매월 {일}일** · **매년 {월 일}** · 사용자 정의
  (read-only, legacy). The weekly/monthly labels are display-only (the engine already anchors to the
  selected weekday/day-of-month). **`매년`(yearly) is a new recurrence rule** added to the engine
  (`nextOccurrence` = +1 year, same month/day, Feb-29 clamped). Standalone "주말마다"(weekends) was
  dropped from the new picker (engine + legacy display retained). i18n: `durationLabel` / `durationNone`
  / `duration15…120` / `durationCustom` / `durationMinUnit` / `repeatWeeklyOn` / `repeatEveryWeekday` /
  `repeatMonthlyOn` / `repeatYearlyOn` / `repeatYearly` (ko/ja/en).

### Overdue bulk reschedule reuses the picker + check-alignment fix (as-built 2026-07-24)

The Today-tab overdue **"일정변경 N개 선택"** sheet now renders the same `TaskSchedulePicker` in a
**date-only variant** (`variant="date"`: quick options 오늘/내일/다음 주/다음 주말 + inline calendar, no
time/repeat, no 날짜 없음). Unlike the create/edit picker (commit-on-close), the date variant **commits
only on the 완료 button** (a scrim tap / drag / Esc cancels), then applies the chosen date to every
selected overdue task via `rescheduleOverdueTo(date, ids)`. The previous bespoke reschedule sheet and its
custom mini-calendar (plus the `overdueCustom*` state) were removed. Also fixed: in the picker's quick
options, the selected row's 요일/날짜 no longer shifts left — the check (✓) now sits in a fixed-width slot.

The scheduling model description below is the **original two-date direction**, kept for history; the
single-date model above is the current UI truth.

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

As-built (2026-07-30, occurrence model — **supersedes** the 2026-06-16 roll-forward model. See
`docs/planning/01-decision-log.md` → "2026-07-30 롤포워드 폐지"):

- A recurring task is a **single live `tasks` row** carrying the `recurrence_rule`,
  `recurrence_series_id`, and a **FIXED anchor** (`recurrence_instance_date`). Occurrences are the
  rule's dates computed on the fly (`recurringOccurrencesInRange`) — **not** pre-created rows.
- **Every scheduled date shows independently — completion no longer rolls the row forward.** A
  recurring task appears on **each** of its occurrence dates in 오늘/내일/캘린더 (so "5 recurring →
  tomorrow also shows 5"), regardless of whether today's is done. The date-agnostic tabs (관리함/지시)
  still show one entry per series.
- **Per-occurrence completion lives in `task_occurrence_state`** (keyed by `(task_id,
  occurrence_date)`), **not** on the row. `completeTask(taskId, occurrenceDate)` records that date as
  `completed` (row untouched, stays `open`) + logs a `completed` update + fires `task_completed`. The
  quick-complete **undo** (`reopenTask(taskId, occurrenceDate)`) clears that occurrence's state row.
  The **Completed (완료/기록)** tab and **daily report** still read the `task_updates` completion log
  (unchanged), so recurring completions appear there by their completion day.
- **Overdue occurrences persist forever — no auto-skip, no auto-delete.** An occurrence whose date has
  passed with no recorded state is **overdue** and stays so (연차·연휴·업무 사정으로 며칠 밀려도 사라지지
  않는다). Overdue occurrences of a recurring task are collapsed into **one grouped item per task**
  ("○○ · N일 밀림") in the Today tab's overdue area, with two actions:
  - **오늘로 가져오기** (`carryOverdueToToday`) — marks the outstanding overdue occurrences `moved`
    and creates a **carry-over one-off** task dated today (a personal make-up for the actor). The
    recurring series continues on its schedule.
  - **삭제** (`skipOverdueOccurrences`) — marks the outstanding overdue occurrences `skipped` (kept
    forever, never re-appears). The series continues.
  One-off overdue tasks keep the existing bulk 오늘로 가져오기 / 지난 미완료 삭제 prompt (author-scoped).
- **Calendar/list previews are virtual** — the month grid, agenda, day sheet, and now the 오늘/내일
  lists expand each recurring task across its occurrence dates from the rule for display; tapping a
  virtual occurrence acts on the one real series row, and its checkbox completes **that date's**
  occurrence.
- The old window-materializer (`materializeRecurringTasks`) is **deprecated and no longer called**
  from any read path. Pre-existing materialized instances were collapsed to one row per series by
  migration `202606160002_collapse_recurring_instances.sql`.
- A repeat rule **requires a date anchor** (`scheduled_date` or `due_at`). Saving repeat with no date
  is rejected both in the form and in the server actions.
- User-selectable rules: **None, daily, weekly, monthly, yearly, weekdays, weekends** (None clears it).
  Recurrence can be set in create, changed in edit, and cleared back to None at any time.
- **Two recurrence-rule tables MUST stay in sync:** `STANDARD_RECURRENCE_RULES` +
  `nextOccurrence` exist in both `@/lib/tasks` (server-only, TaskRecord rollover) and
  `@/lib/tasks-recurrence` (client-safe, calendar previews + overdue dismiss/reschedule gating). A rule
  in one but not the other silently diverges the paths — this caused a **data-loss bug (fixed
  2026-07-29)** where an overdue `yearly` task was hard-deleted by "지난 미완료 삭제" instead of rolling
  forward, because `tasks-recurrence.ts` was missing `yearly`.
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

### Re-sharing — 참여자도 부를 수 있다 (규칙 유지, 2026-07-31 확인)

- **참여자도 다른 사람을 추가할 수 있다.** 지시를 받은 사람, 공유를 받은 사람 모두 해당한다.
- **부르기만 되고 빼기는 안 된다.** 남을 참여자에서 제거하는 것은 **작성자만** 가능하다
  (`removeTaskParticipant` — 자기 자신 나가기는 누구나). 참여자의 "지시/공유 성격 변경"
  (`is_directive` 전환)도 작성자 전용이다.
- 이 규칙은 원래 문서에 있었으나 **관리 콘솔만 작성자 전용으로 구현되어 두 화면이 갈라져
  있었다.** 2026-07-31 소유자 확인으로 **문서 쪽(참여자 허용)** 으로 통일했다.

**두 화면의 구현이 다른 점 — 서버가 흡수한다.**

| | 모바일 `shareTaskWithUsers` | 콘솔 `shareConsoleTask` |
| --- | --- | --- |
| 구조 | 추가 전용(`!existing.has`) | 피커 체크 상태로 **집합 재조정** |
| 참여자가 호출하면 | 그대로 추가 | **제거분을 버리고 추가만 적용**, `is_directive` 미변경 |

콘솔 액션을 그냥 열면 참여자가 다른 참여자를 축출할 수 있게 되므로, 작성자가 아닐 때는
`toRemove = []` 로 두고 `tasks` 갱신도 `is_shared: true` 만 한다. 화면에서도 기존 참여자 행을
`disabled` 로 잠가, 해제했다가 새로고침에 되살아나는 유령 조작을 막는다.

**알아둘 것.** 지시(`is_directive`) 작업에 참여자가 누군가를 추가하면, 추가된 사람에게는 **원
작성자가 보낸 지시**로 보인다(`recvInstr` 판정이 작성자 기준). 누가 실제로 불렀는지는
`task_participants.added_by_user_id` 에 남는다. 연결된 객실·예약·게스트 컨텍스트도 함께 전달된다.

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
  it (completed task). Completing shows a bottom **undo toast** ("완료했습니다 · 실행 취소"); for a
  **recurring** task it adds a **"다음: {날짜}"** subline (the next occurrence it rolled to). Undo = reopen.

### Soft-delete & Undo (2026-07-29, owner-approved deletion-policy change)

- **Tasks now use SOFT delete** (`deleted_at`, migration `202607290001`) so deletes are undoable. All
  task list/detail reads filter `deleted_at is null`; `restoreTask` clears it (author-checked). Create-
  rollback deletes stay hard. This is a scoped exception to the hard-delete MVP policy (CLAUDE.md §9).
- **Delete undo:** `deleteTask` soft-deletes and redirects to `/mobile/tasks?deleted=<id>`; the list
  shows a **"작업을 삭제했습니다 · 실행 취소"** toast that calls `restoreTask` (ref-guarded, once per id).
- The dashboard console (`/admin/tasks`) uses the identical model + a Todoist-style `.undobar`.
- The task **detail view** also has a **완료 / 다시 열기** button.
- Completing sets `status` + `completed_at` + `completed_by_user_id`, writes a `completed` row to the
  update log, and fans out a `task_completed` notification to other participants; reopening clears
  those fields and writes a `reopened` log row. Both revalidate the list and detail.

## Daily Report (업무일지) — as-built (2026-06-13)

Each day-group header in the **Completed (완료/기록)** tab has a **보고서 (Report)** button that opens
the **ReportSheet** bottom sheet:

- It gathers the **caller's own** completions for that Tokyo date and builds a Korean daily work
  report ("업무일지") — a date header followed by one bullet per completed item.
- **Recurring completions are included (fix 2026-07-29).** Because completing a recurring task rolls
  the row forward and keeps it `open` (never `status=completed`), the report is built from the
  `completed`/`reopened` events in **`task_updates`** (not `tasks.status`): the per-task net
  (`completed − reopened`) for that day. This captures a recurring task's daily completion (e.g. a
  daily cleaning check) — which the old `status=completed` query missed — and a same-day undo cancels
  out (net 0 → excluded). Titles are de-duplicated. The dashboard console report
  (`generateConsoleReport`) delegates here, so both surfaces behave identically.
- **Free, no AI.** The report is template-based with a deterministic local tidy-up (whitespace,
  leading bullet glyphs, punctuation spacing) for light auto-correction — no LLM, no API key, no
  per-use cost. (An LLM-backed variant was prototyped then dropped; see the decision log.)
- **Pick which items go in (2026-08-03).** Above the text body the sheet lists every completed item
  with a checkbox — **all checked by default**, so excluding is the exception. Unchecking an item
  removes it from the body and **renumbers the rest**; the total line follows the selection. A
  header shows "8개 중 6개" with a **전체 선택 / 전체 해제** toggle. This exists because a work log may
  contain items a staff member does not want to send to the whole company; before this, the only way
  to drop one was to delete the line in the textarea and fix the numbering by hand.
  - With **nothing selected** the body is empty and both 복사 / Slack 전송 are disabled — an empty
    report can never be sent.
  - Manual textarea edits are kept, but **changing the selection rebuilds the body** (it has to —
    numbering and the total are derived). The hint line under the box says so as soon as the text
    has been edited by hand. In the console, **"원본으로"** resets the selection along with the text,
    so the checkboxes never disagree with what would actually be sent.
  - The same picker exists on **both surfaces** — mobile `ReportSheet` and the admin console's
    report modal — sharing one assembly function, so numbering and the summary line cannot drift.
- The result is shown in an **editable textarea** and can be copied to the clipboard or manually sent
  to the one configured Slack daily-report channel. The send control keeps its label on one line even
  on a narrow screen. Slack receives the textarea body unchanged, so the
  existing report format and the author's final edits are preserved. The message already contains the
  report's author line; no Slack-user account matching is required.
- Sending uses the server-only `SLACK_DAILY_REPORT_WEBHOOK_URL` Incoming Webhook. It is never exposed
  to the browser. The same report-generation permission is rechecked server-side before every send;
  delivery succeeds only after Slack accepts the request. Successful sends write an `audit_logs`
  `task_daily_report_slack_sent` event containing the sender, Tokyo report date and character count
  (never the report body or webhook URL).
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

Admin web was intentionally deferred until the mobile feature set matured. **As of 2026-07-24 the mobile
Todoist is feature-complete for its first-slice scope** (single-date schedule picker + duration +
contextual repeat/yearly + overdue reschedule picker shipped), and the **dashboard console is now
planned** — see `docs/product/28-admin-todoist-console.md`. The dashboard reuses the same DB / server
actions (no separate sync layer) and stays simple: mobile parity + a manager **Work Directive** only.

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

## 2026-07-30 진행 중(in_progress) 상태 — 모바일 지원

**문제.** 상태 모델은 원래 3개(`open` / `in_progress` / `completed`)인데, 모바일에는
`completeTask` / `reopenTask` 두 액션뿐이라 **진행 중을 설정할 수단이 없었다.**
`task-detail-view.tsx`는 값을 **읽어서 표시만** 하고 있었고, 목록 카드에는 표시조차 없어 대기 상태와
구분되지 않았다. 어드민 콘솔은 3상태 세그먼트를 이미 쓰고 있어서, 관리자가 "진행 중"으로 바꾼 작업이
현장에서는 그냥 대기로 보였다 — 같은 데이터를 한쪽에서만 다룰 수 있는 상태였다.

**해결.**

- **서버**: `setTaskProgress(taskId, inProgress)` 신규 (`src/app/mobile/tasks/[id]/actions.ts`).
  `open ↔ in_progress` 만 다루고, 완료 전환은 기존 `completeTask` 가 계속 맡는다 — 완료는 반복
  회차(occurrence) 처리와 알림이 얽혀 있어 경로를 나누는 편이 안전하다. 이 액션으로 완료 상태가
  되살아나지 않도록 완료 스탬프(`completed_at` / `completed_by_user_id`)도 함께 지운다.
  `task_updates` 에 `status_changed` 로그를 남기는 것도 콘솔과 동일하다.
- **상세 화면**: 완료 버튼 위에 `대기 / 진행 중` 2칸 세그먼트. **완료 상태에서는 숨긴다** —
  그때 필요한 동작은 "다시 열기"가 먼저다. 완료는 계속 아래 전용 버튼이 맡으므로 콘솔의 3칸
  세그먼트와 모양은 다르지만 상태 모델은 같다.
- **목록 카드**: `진행 중` 칩 추가(primary 톤). 이게 없으면 목록에서 대기와 완전히 동일하게 보인다.

**i18n**: `tasks.statusOpen` / `tasks.statusInProgress` 는 ko·ja·en 모두 이미 존재해 재사용했다.

**남은 격차**: 관리함 드래그 정렬은 이제 콘솔에도 있다(2026-07-30). 프로젝트 섹션·멤버 관리 등 일부는
여전히 모바일 전용일 수 있으니 콘솔 문서(28)를 함께 참고.
관리자가 프로젝트를 구성하는 화면인데 섹션·멤버를 만질 수 없는 건 어색하므로 별도 슬라이스로 다룬다.

## 2026-07-30 반복 회차 중복 이동 차단

**요구.** 반복 작업의 오늘 회차를 내일로 옮기려는데 **내일에도 이미 그 반복의 회차가 있으면**,
안내 문구를 띄우고 이동을 거절한다.

단일 행 모델이라 옮겨도 행이 늘지는 않지만, 사용자 눈에는 "내일에도 이미 있는 그 작업"을 또 내일로
미는 것이라 의미가 없다 — 실제로 아무것도 바뀌지 않는다.

**판정은 한 곳.** `canMoveRecurringTo(rule, anchor, targetDate)`
(`src/lib/tasks-recurrence.ts`) — 대상 날짜에 회차가 있으면 `false`. 비반복 작업, 앵커 없는 작업,
그리고 앵커와 같은 날짜(애초에 no-op)는 항상 허용한다. 두 표면이 각자 판정하면 어긋나므로 공용
모듈에 둔다.

**적용 지점 (4개)**

| 표면 | 액션 | 거절 방식 |
| --- | --- | --- |
| 어드민 | `moveConsoleToToday` / `moveConsoleToTomorrow` | `{ ok:false, error:"duplicate_occurrence" }` → 토스트 |
| 모바일 | `moveTaskToToday` / `moveTaskToTomorrow` (스와이프) | `?moveError=duplicate_occurrence` 로 리다이렉트 → 목록 토스트 |

모바일 스와이프는 form POST + `redirect` 구조라 결과를 돌려줄 수 없어 쿼리로 전달한다. 목록이
읽어서 한 번만 띄우고 `history.replaceState` 로 URL을 정리한다 — 새로고침 시 안내가 다시 뜨면 안 된다.

**범위 밖.** 일정 변경 팝오버(`rescheduleConsoleTask`)로 임의 날짜를 고르는 경로는 막지 않는다.
그쪽은 사용자가 날짜를 직접 보고 고르는 흐름이라 실수로 겹칠 여지가 작고, 의도적으로 겹치게 두려는
경우까지 막게 된다.

**i18n**: `tasks.moveDuplicateOccurrence`, `adminTasks.errDuplicateOccurrence` (ko·ja·en).

## 2026-07-30 지시(받은/보낸) — 모바일 반영

관리 콘솔에만 있던 **받은 지시 / 보낸 지시**를 모바일에도 넣었다. 탭을 늘리지 않고 기존
**공유함(`sent`) 탭을 지시(`instr`) 탭으로 재구성**했다 — 7탭 유지.

### IA

- 탭 라벨: `지시` / `指示` / `Directives`. 탭 **배지 = 미확인(=`status open`) 받은 지시 건수** —
  탭을 열지 않아도 밀린 지시가 보인다.
- 탭 안에 **받은 지시 / 보낸 지시** 세그먼트 컨트롤(Bell / Megaphone + 카운트 배지).
  시각 규격은 이미 쓰고 있는 건의함 세그먼트(`suggestions.css` `.seg`/`.seg__b`)와 같다:
  슬레이트 트랙 + 흰 알약 + 활성 시 네이비 카운트.
- **받은 지시는 오늘 / 내일 / 관리함에도 그대로 보인다.** 지시 탭은 *모아보기* 역할이다.
- **내가 보낸 지시는 내 일정 뷰(오늘·내일·관리함·캘린더·기록)에서 빠진다** — 대상자의 일정이기
  때문이며, 관리 콘솔 `myOwn` 과 같은 규칙이다. 진행 상황은 `지시 › 보낸 지시`에서만 본다.

### 상태 그룹 (콘솔 `recvView`/`sentView` 와 동일 순서)

| | 그룹 |
| --- | --- |
| 받은 지시 | 지연 → 해야 할 지시(open) → 진행 중 → 완료 |
| 보낸 지시 | 미확인 · 대기(open) → 진행 중 → 완료 |

지연은 받은 지시에서만 따로 뽑는다(보낸 쪽의 지연은 대상자가 처리할 몫이라 상태로만 표시).
반복 작업은 기존 `isOverdue` 규약대로 지연 판정에서 빠진다.

### 카드

공용 `TaskCard` 를 그대로 쓰고 `instrMode="recv" | "sent"` 만 추가했다.

- `recv` — 지시자를 **이니셜 아바타 + 이름 칩**으로 칩 줄 맨 앞에 올린다(기존 `이름 →` 접두사 대체).
- `sent` — **담당 {n}명** 칩. 체크 원을 **렌더하지 않는다**(`onCompleteToggle` 미전달): 지시자가
  대상자의 작업을 대신 완료 처리하지 않는다. 스와이프도 끈다.

### 담당자별 진행률은 없다 (2026-07-30 확인)

`task_participants` 에는 **담당자별 완료 상태가 없다** — 완료는 작업 1건당
하나(`status` / `completed_at` / `completed_by_user_id`)다. 따라서 "2 / 3 완료" 같은 담당자별
진행률 바는 현재 데이터 모델로 만들 수 없고, 보낸 지시 카드는 **담당 인원 수 + 작업 상태**만
보여준다(콘솔 `sentView` 와 동일). 담당자별 진행이 필요해지면 `task_participants.completed_at`
추가 + 완료 의미 변경이라는 **별도 결정**이 필요하다.

### 구현 메모

- 지시 판별 술어(`sentInstr` / `recvInstr` / `myOwn` / `partsOf` / `isMine`)는
  **`src/lib/task-directives.ts` 한 곳**에 두고 `src/components/admin/tasks/helpers.ts` 는
  재수출만 한다. 모바일·콘솔에 같은 규칙을 복사하면 이 저장소가 이미 한 번 데인 쌍둥이 파일
  문제(`tasks.ts` / `tasks-recurrence.ts`)를 되풀이한다.
- 뷰 키 `sent` → `instr`. 예전 링크·되돌아오기 쿼리의 `?view=sent` 는 `page.tsx` 에서 조용히
  `instr` 로 넘긴다(`LIST_VIEWS` 도 두 키를 모두 받는다).
- **peer 공유 전용 목록은 모바일에서 사라졌다.** 내가 공유한(지시가 아닌) 작업은 여전히 내
  작업이므로 오늘/내일/관리함에 그대로 보인다 — 다만 "공유한 것만 모아 보는" 화면은 없다.
  콘솔에는 공유함 탭이 그대로 남아 있다.
- i18n: `dict.tasks.viewInstr / instrRecv / instrSent / instrRecvNote / instrSentNote /
  instrSec* / instrUnconfirmed / instrBy / instrAssigned / instrEmpty*`(ko·ja·en). 문구는
  콘솔(`admin-tasks-i18n.ts`)과 같은 표현을 쓴다. 로그 라벨 `system_shared` 가 탭 이름
  `viewSent` 를 빌려 쓰고 있어 전용 키 `logShared` 로 분리했다.

## 2026-07-30 반복 회차 건너뛰기 — "이 날짜만" vs "반복 전체"

**문제.** 오늘/내일 화면의 반복 카드를 길게 눌러 삭제하면 `tasks` 행이 지워져 **모든 날짜에서**
사라졌다. "오늘만 못 한다"(공실·휴무 등)를 표현할 수단이 없어, 사용자가 한 회차를 넘기려고
시리즈 전체를 날리게 되는 구조였다.

**해결(A안).** 반복 작업을 **회차로 보고 있을 때** 삭제를 누르면 확인 모달 대신 선택 시트를 띄운다.

```
반복되는 작업입니다
  ⏭  7/30 (목)만 건너뛰기 — 이 날짜만 넘어가고 반복은 계속됩니다
  🗑  반복 전체 삭제        — 모든 날짜에서 사라집니다
      취소
```

- **일회성 작업은 그대로** 기존 확인 모달을 쓴다.
- **관리함처럼 회차가 아닌 목록**에서는 행 자체가 시리즈를 뜻하므로 역시 기존 모달 그대로다.
  시트는 `occurrence` 로 렌더된 카드에서만 뜬다.

### 저장

새 테이블 없음. 기존 `task_occurrence_state` 에 `state='skipped'` 행을 하나 넣는다 — 오버듀 회차
정리에 이미 쓰던 그 상태다. 지금까지 **오늘/내일 회차에만 배선이 없었을 뿐**이다.

- `skipOccurrenceOn(taskId, occurrenceDate)` — 그 회차만 `skipped`
- `unskipOccurrenceOn(taskId, occurrenceDate)` — 되돌리기(`clearOccurrenceState`)

두 액션 모두 날짜를 **클라이언트에서 믿지 않고** 반복 규칙에서 다시 계산해 실제 회차인지 확인한다
(`isOccurrenceDate`). 아니면 조용히 무시한다 — 임의 날짜로 상태 행을 심을 수 없다.

### 되돌리기

`skipped` 는 영구 상태(*kept forever, never re-appears*)이므로 건너뛴 직후
**"{날짜} 건너뜀 · 실행 취소" 토스트**를 6초간 띄운다. 되돌릴 수 있으므로 별도 확인 모달은 두지
않는다(CLAUDE.md — 확인 UX는 되돌릴 수 없는 파괴적 동작에만).

되돌리기의 한계: 회차 상태는 한 칸뿐이라 종류별 삭제가 불가능하다. 토스트가 떠 있는 사이 같은
회차가 완료 처리되면 실행 취소가 그 완료까지 푼다(실무상 6초 안에 겹칠 일은 거의 없다).

### 같이 고친 버그 — 상태 있는 회차가 목록에 남던 문제

모바일·콘솔 모두 회차 필터가 `state !== "completed"` 였다. **상태 행이 있으면 그 회차는 해결된
것**(completed · skipped · moved)이므로 `!state` 로 바꿨다. 이걸 안 고치면 건너뛴 회차가 목록에
그대로 남는다. 콘솔은 주석에 이미 "완료·스킵·이동된 회차 제외"라고 적혀 있었는데 코드가 따라가지
못한 상태였고, 이제 `outstandingOverdueOccurrences` 의 "행이 있으면 해결" 규약과도 일치한다.

### 관리 콘솔도 동일 (2026-07-30)

`/admin/tasks` 의 행 메뉴 삭제도 같은 규칙을 따른다. 오늘/내일 목록의 반복 행은 `⋯` 메뉴가 회차
날짜(`RowMenuPop.occ`)를 함께 들고 열리고, 삭제를 누르면 `RecurDeleteModal` 이 뜬다 —
`이 날짜만 건너뛰기` / `반복 전체 삭제`. 서버는 `skipConsoleOccurrence` /
`unskipConsoleOccurrence` 로 모바일과 같은 `task_occurrence_state` 를 쓰고, 같은 방식으로 날짜를
규칙에서 재검증한다.

예외 두 곳은 의도된 것이다.

- **상세 패널의 삭제** — 패널은 작업 전체를 보여주므로 시리즈 삭제가 맞다(회차를 넘기지 않는다).
- **관리함 등 회차가 아닌 목록** — 행이 곧 시리즈다. 기존 즉시 삭제 + 실행 취소 그대로.

모달 크롬은 콘솔 규격(`day-scrim` + `pop`)을 그대로 쓰고, 두 선택지는 `.rcopt` 카드로 같은 크기로
놓되 되돌릴 수 없는 쪽(전체 삭제)만 danger 톤을 준다.

## 2026-07-31 지시 보내기 — 두 화면 모두 진입점 추가

지시를 **볼** 수는 있는데 **보낼** 수단이 화면마다 빠져 있었다. "보낸 지시" 탭이 빈 상태에서
"작업을 만들 때 대상을 지정하면…"이라고 안내만 하고, 정작 거기서 만들 수는 없었다.

### 관리 콘솔

`보낸 지시` 뷰(목록·빈 상태 둘 다)에 인라인 **지시 보내기** 트리거를 넣었다.

- `AddDraft.ctx` 에 `"instr"` 추가. 기존 인라인 추가 폼을 그대로 쓰므로 새 UI가 없다 —
  그 폼에는 이미 **대상(지시) 칩**(`openSharePop(…, "target")`)이 있다.
- **날짜 기본값 = 오늘.** 날짜 없는 지시는 대상자의 관리함에 묻히기 쉽다(스케줄 칩에서 변경 가능).
- **대상이 없으면 저장 불가.** 대상 없이 저장하면 `is_directive=false` 인 내 개인 작업이 되어
  저장 직후 이 목록에서 사라진다. 저장 버튼을 잠그고 라벨도 `지시 보내기` 로 바꾼다.

### 모바일

모바일에는 **지시를 보낼 경로가 아예 없었다** — 생성 액션이 `is_directive` 를 한 번도 쓰지 않아
모든 공유가 peer 공유로만 저장됐다.

- 상세 생성 폼(`/mobile/tasks/new`)에 **"지시로 보내기" 토글** 추가. 공유 대상을 고른 뒤에만
  노출된다(대상 없는 지시는 성립하지 않는다). 공유(동료끼리 같이 봄)와 지시(대상자가 수행)는 다른
  행위라 한 화면에서 분명히 갈라 준다.
- 서버: `is_directive: directive && shareIds.length > 0` — 콘솔 `createConsoleTask` 와 같은 규칙.
- `지시 › 보낸 지시` 화면 상단에 **지시 보내기** 진입점(→ `/mobile/tasks/new?directive=1`).
  쿼리로 들어오면 토글이 켜진 채 시작하고, **저장된 초안이 그 의도를 덮지 않는다**(초안의 false 는
  무시). 안 그러면 사용자가 눈치채지 못한 채 평범한 공유로 나간다.

### 검증 포인트

지시로 보낸 작업은 **지시자의 오늘/내일/관리함/캘린더에서 빠지고**(`myOwn`) 대상자의 일정에 잡힌다.
보낸 쪽은 `지시 › 보낸 지시`에서만 진행 상황을 본다.

## 2026-07-31 모바일 ↔ 콘솔 불일치 일괄 정리

에이전트 병렬 감사에서 나온 투두 관련 불일치를 정리했다. **기능 결손이 아니라 두 화면이 갈라져
있던 것들**이라 한쪽 기준으로 맞추는 작업이었다.

### 반복 옵션 비대칭 해소

| | 이전 | 지금 |
| --- | --- | --- |
| 모바일 | none · daily · weekly · weekdays · monthly · **yearly** | 6종 + **weekends** |
| 콘솔 | none · daily · weekly · weekdays · **weekends** · monthly | 6종 + **yearly** |

같은 작업을 **어디서 만들었느냐에 따라 선택지가 달랐다.** 양쪽 목록을 같게 맞췄다. 라벨은 두 사전에
이미 있었고(`repeatWeekends` / `repYearly`) 엔진도 `yearly` 를 처음부터 지원했다 —
콘솔 주석의 "yearly 미지원" 은 **틀린 서술**이라 함께 고쳤다.

### 목록 일괄 삭제에 실행 취소 추가 (모바일)

모바일은 **상세에서 지우면** `?deleted=<id>` 로 돌아와 실행 취소 토스트가 떴지만,
**목록에서 여러 개를 지우면** 되돌릴 방법이 없었다. 같은 앱 안에서 삭제 경로에 따라 되돌리기 유무가
갈리던 것.

- `deleteTasksInList` 가 **실제로 지워진 id** 를 돌려준다(`.select("id")`). 목록에서 남의 작업을
  같이 골라도 그건 안 지워지므로, 지우지도 않은 작업을 되살리면 안 된다.
- `restoreTasksInList(ids)` 신설 — 소프트 삭제라 `deleted_at` 만 비우면 복구된다(작성자 본인 한정).
- 클라이언트의 되돌리기 상태를 **id 배열 하나로 일반화**해 상세·목록 두 경로가 같은 토스트를 쓴다.

> `showDeleteUndo` 는 `performDelete` **위에** 선언해야 한다 — 아래에 두면 React Compiler 가
> "Cannot access variable before it is declared" 로 막는다.

### 완료 로그 조회 중복 제거

완료 집계(`task_updates` 의 completed − reopened net)가 `src/lib/tasks.ts` 와
`src/lib/admin-tasks.ts` 두 곳에 복사돼 있었다. **콘솔 완료·기록 탭과 모바일 완료·기록/업무일지가
같은 숫자를 보여야 하므로** 갈라지면 곧바로 사용자에게 드러난다. `admin-tasks.ts` 의
`getCompletionRecords` 는 이제 `getTaskCompletions()` 에 **위임만** 하고 콘솔이 쓰는 모양으로
좁힌다.

이 저장소는 반복 규칙을 두 파일에 복사해 뒀다가 정의가 갈리면서 **오버듀 작업이 하드 삭제되는**
사고를 낸 적이 있다. 같은 실수를 반복하지 않기 위한 정리다.
