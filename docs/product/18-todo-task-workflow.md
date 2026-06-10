# Todo / Task Workflow

Status: Draft — refined product plan (2026-06-10)

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
- whether the task was updated

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

Not required in first slice:

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
