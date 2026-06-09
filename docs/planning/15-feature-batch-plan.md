# Feature Batch Plan

Status: Draft  
Owner: Product / Engineering  
Last updated: 2026-06-08

## Purpose

This document is the working plan for the next implementation batch.

Use it before coding starts when 2-3 upcoming features must be compared, scoped, prioritized, and broken into implementation slices.

This file should be updated first, then implementation should begin only after the target slice is clear.

## Current Batch Summary

| Feature | Status | Priority | Primary Surface | Main Dependency | Recommended Next Action |
|---|---|---:|---|---|---|
| Linen Defect Registration | Candidate | High | Mobile + Admin | Property-specific linen item master | Define the first property/item catalog slice |
| Personal Todo / Shared Task Inbox | Candidate | High | Mobile + Admin | Private-by-default task visibility rules | Tighten personal vs shared task rules |
| Staff Suggestions / Feedback Box | Candidate | Medium-High | Mobile + Admin | Visibility model for public vs employee-only posts | Confirm privacy and response rules |
| Internal Board | Candidate | Medium | Mobile + Admin | Clear separation from Announcements | Define posting rules and first create/read flow |
| Attendance / Clock-In-Out + Payroll | Candidate | High but blocked | PWA + Admin | Scope change decision + wage policy rules + export template | Run discovery and spec phase before coding |

## Planning Rules

- Do not start coding from an undefined feature request.
- Prefer small vertical slices over broad multi-surface rewrites.
- Document permissions and edge cases before implementation.
- If a feature changes schema, RLS, or workflow behavior, update the related docs in the same cycle.
- If code and this plan diverge, update the incorrect side immediately.

## Additional Planned Extensions

### Order Request Delivery-Date Calendar Entry

This is not a new standalone feature candidate. It is an extension of the existing Order Request workflow.

Requested rule:

- the order-delivery calendar entry must be created only when `delivery_date` is explicitly entered
- this calendar usage is only for delivery-date scheduling
- no other order-request dates should create calendar entries in the baseline design

Required related docs:

- `docs/product/10-order-request-workflow.md`
- `docs/product/15-reservation-calendar.md`

### Todo Calendar Requirement

The Personal Todo / Shared Task Inbox feature must include a calendar surface.

Requested direction:

- users need a calendar view for their todo items
- the todo calendar should help users see due dates and scheduled follow-up work
- CS-heavy tasks should still support room/guest/reservation context inside the calendar-linked task detail

Required related docs:

- `docs/product/18-todo-task-workflow.md`

## Scope Change Notes

### Attendance Scope Conflict

Current project docs still say attendance / clock-in-out is out of scope for the first MVP:

- `docs/product/00-product-requirements.md`
- `docs/planning/01-decision-log.md`
- `docs/planning/03-mvp-priority.md`

This batch plan records the new requested direction from 2026-06-08.  
Until attendance is formally approved as an active build slice, treat it as a planned scope change, not yet a confirmed MVP baseline.

### Board vs Announcement Separation

The project already has a formal `Announcements` module.

The new `Internal Board` should remain a separate module with different behavior:

- Announcement = formal notice, targeted audience, read tracking, popup, more controlled publishing
- Internal Board = freer all-user posting space, lighter moderation, no required read tracking in MVP

If this distinction becomes unclear, the board should not be implemented until the product rule is tightened.

### Suggestion Box vs Board Separation

The proposed Suggestions / Feedback Box should not be merged into the Internal Board by default.

Recommended distinction:

- Internal Board = free everyday internal posting and communication
- Suggestions / Feedback Box = structured improvement ideas, complaints, process feedback, and workplace issues with stricter visibility rules and response tracking

If these two modules are merged too early, privacy and operational follow-up will become unclear.

### Todo Scope Clarification

The project already has a `Todo / Task Workflow` direction in `docs/product/18-todo-task-workflow.md`.

This batch adds a sharper rule from the 2026-06-08 request:

- default = personal/private task or memo, visible only to the owner
- optional send/share = push a task into a teammate's task list
- CS-heavy usage must support room/guest/change-request context, not only generic personal notes

The implementation should treat this as a refinement of the Todo module, not as a separate unrelated feature.

## Feature 1: Linen Defect Registration

**Status:** Candidate  
**Priority:** High  
**Target iteration:** First implementation candidate

### 1. Problem

- The linen vendor visits the sites about four times per week.
- Each visit can reveal damaged or defective linen items that must be registered on-site.
- The linen mix differs by building/property, so one fixed global item list will not be enough.
- Without a system record, defect history, quantity tracking, and follow-up with the vendor become inconsistent.

### 2. Users and Roles

- Primary users: all active organization members who handle site operations
- Allowed roles: `owner`, `office_admin`, `cs_staff`, `field_manager`, `staff`, `part_time_staff`, `developer_super_admin`
- Special admin responsibilities:
  - office/admin-capable roles manage the linen item master
  - all users can create and read defect records
- Blocked users: suspended or removed memberships

### 3. Entry Points

- Mobile:
  - dedicated create form from mobile side menu or Requests-adjacent operational entry
  - property-scoped list/detail view
- Admin:
  - operational list/detail page
  - linen item master management screen
- API / background:
  - none required for first slice

### 4. MVP Scope

- In scope:
  - register a linen defect record with property/building, linen item, quantity, defect reason/type, optional memo, optional photos, and reporter
- In scope:
  - property-specific linen item catalog so each building can have a different selectable item set
- In scope:
  - all users can create and read records inside their organization
- In scope:
  - admin-capable roles can activate/deactivate linen items in the catalog
- In scope:
  - basic list/detail history for operational review

### 5. Out of Scope

- Deferred:
  - vendor settlement / cost-claim workflow
- Deferred:
  - automatic inventory deduction or stock reconciliation
- Deferred:
  - recurring vendor visit scheduling
- Deferred:
  - analytics dashboard or loss-rate reporting

### 6. Workflow

1. User enters from a mobile or admin linen-defect entry point.
2. User selects property/building.
3. User selects a linen item from the property-specific active catalog.
4. User enters quantity, defect type/reason, optional memo, and optional photos.
5. System validates organization membership and item/property relationship.
6. System stores the record with reporter and timestamps.
7. All organization users can view the record history.

### 7. Data and Technical Impact

- Tables affected:
  - new `linen_items`
  - new `linen_defect_reports`
- New schema needed:
  - property-linked linen item master
  - defect report table with organization, property, optional room, item, quantity, status, reason, memo, reporter, timestamps
- Server actions / routes:
  - create report
  - list/detail queries
  - admin item master CRUD
- Shared components:
  - image upload pattern can likely reuse the existing request/announcement direct-upload flow
  - property/room selectors can likely reuse current room/property helpers
- Permissions / RLS impact:
  - all active org members can insert/select defect reports
  - admin-capable roles manage the linen item master
- Notification impact:
  - not required for the baseline slice

### 8. Risks and Open Questions

- Risk:
  - if the linen item master is skipped, the feature will drift into inconsistent free-text naming
- Risk:
  - some defects may be property-level while others may need room/unit linkage; room linkage is not yet required
- Open question:
  - should one vendor visit create multiple defect rows under a shared visit batch ID?
- Open question:
  - do users need defect photos in the first slice, or is quantity + item enough operationally?
- Open question:
  - do defect reasons need a fixed enum (`tear`, `stain`, `unusable`, `missing_set`, `other`) or free text first?

### 9. Recommended Implementation Slice

1. Update product/engineering docs for a property-scoped linen item master and defect-report workflow.
2. Add `linen_items` and `linen_defect_reports` schema + types + RLS.
3. Build admin master management for property/item names and active flags.
4. Build mobile create flow and shared list/detail read flow.
5. Verify role access and property-scoped item selection.
6. Reconcile docs after the real field shape is confirmed.

### 10. Verification Checklist

- [ ] Mobile create flow verified
- [ ] Mobile list/detail verified
- [ ] Admin master management verified
- [ ] All-role read access verified
- [ ] Property-specific item filtering verified
- [ ] Korean/Japanese/English copy verified
- [ ] Empty/error states verified
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm test` when shared logic or i18n changes

## Feature 2: Internal Board

**Status:** Candidate  
**Priority:** Medium  
**Target iteration:** Second implementation candidate

### 1. Problem

- The team needs a shared place where all users can write and read operational posts.
- Existing announcements are more formal and currently do not allow part-time staff to create posts.
- A lighter internal posting space is needed for everyday communication that does not belong in requests or announcements.

### 2. Users and Roles

- Primary users: all active organization members
- Allowed roles: all active roles including `part_time_staff`
- Special admin responsibilities:
  - admin-capable roles can moderate, pin, archive, or hide problematic posts
- Blocked users: suspended or removed memberships

### 3. Entry Points

- Mobile:
  - board list
  - board detail
  - create post
- Admin:
  - board list/detail
  - moderation controls
- API / background:
  - none required for first slice

### 4. MVP Scope

- In scope:
  - all users can create a board post
- In scope:
  - all users can read board posts in their organization
- In scope:
  - basic fields: title, body, optional images, author, created_at
- In scope:
  - own-post edit/delete and admin moderation
- In scope:
  - simple sort order such as newest first, optional pinned posts by admin-capable roles

### 5. Out of Scope

- Deferred:
  - read tracking
- Deferred:
  - popup on app open
- Deferred:
  - audience targeting by role/property
- Deferred:
  - approval flow before publish
- Deferred:
  - rich reactions, mentions, or threaded comments

### 6. Workflow

1. User opens the board surface.
2. User creates a post with title/body and optional images.
3. System validates organization membership and attachment ownership.
4. System stores the post and shows it in the organization board feed.
5. User can open detail and edit/delete if they own the post.
6. Admin-capable roles can pin or moderate posts if needed.

### 7. Data and Technical Impact

- Tables affected:
  - new `board_posts`
- New schema needed:
  - organization, author, title, body, image_urls or attachment relation, pinned flag, archived_at, timestamps
- Server actions / routes:
  - create
  - update
  - delete
  - list/detail
  - admin moderation actions
- Shared components:
  - announcement image uploader/grid may be reusable
  - card/list/detail patterns from announcements can reduce implementation cost
- Permissions / RLS impact:
  - all active org members can select/insert posts
  - owners of a post can update/delete their own post
  - admin-capable roles can moderate broader content
- Notification impact:
  - not required for the baseline slice

### 8. Risks and Open Questions

- Risk:
  - if board and announcement rules overlap too much, users will not know where to post
- Risk:
  - if comments are included too early, the scope expands quickly toward a mini social feed
- Open question:
  - should board posts support comments in v1, or should create/read stay the only baseline?
- Open question:
  - should posts be categorized (`general`, `property_note`, `handover`, `incident`, `other`)?
- Open question:
  - should pinned posts be admin-only or also available to all authors for their own posts?

### 9. Recommended Implementation Slice

1. Confirm the product distinction between Board and Announcements.
2. Add `board_posts` schema + RLS + types.
3. Build mobile-first list/detail/create flow.
4. Add admin moderation/pin/archive controls.
5. Verify author permissions, all-user visibility, and image handling.
6. Reconcile docs after the first real usage feedback.

### 10. Verification Checklist

- [ ] Mobile list/detail/create verified
- [ ] Admin moderation verified
- [ ] All-user create/read access verified
- [ ] Own-post edit/delete verified
- [ ] Korean/Japanese/English copy verified
- [ ] Empty/error states verified
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm test` when shared logic or i18n changes

## Feature 3: Personal Todo / Shared Task Inbox

**Status:** Candidate  
**Priority:** High  
**Target iteration:** Second implementation candidate

### 1. Problem

- Each user needs a personal place to store tasks, reminders, and operational notes.
- The default behavior should be private: personal tasks should be visible only to the owner unless explicitly shared.
- CS-heavy operations need richer context than a generic todo list because guest requests, room changes, and exception handling change frequently.
- Users also need a way to send a task to a teammate so it appears in that teammate's todo list.

### 2. Users and Roles

- Primary users: all active organization members
- Allowed roles: all active roles including `part_time_staff`
- Special usage emphasis:
  - `cs_staff` needs property/room/guest/reservation-linked follow-up
  - all users need fast personal memo/task capture
- Blocked users: suspended or removed memberships

### 3. Entry Points

- Mobile:
  - personal todo list
  - quick-add task/memo
  - task detail
  - send-to-teammate action
- Admin:
  - personal todo list
  - task detail
  - broader operational view for office roles later if approved
- API / background:
  - reminder or due-date notifications later

### 4. MVP Scope

- In scope:
  - private-by-default personal task storage per user
- In scope:
  - task title, optional details, due date, status, priority, and timestamps
- In scope:
  - task calendar view for due dates and scheduled follow-up work
- In scope:
  - optional property/building, room, guest, or reservation context
- In scope:
  - send/share action that creates a linked copy in a teammate's task list
- In scope:
  - owner can manage their own tasks; recipient manages tasks sent to them in their own list
- In scope:
  - fast capture UX for CS follow-up and personal reminders

### 5. Out of Scope

- Deferred:
  - complex subtasks
- Deferred:
  - recurring tasks
- Deferred:
  - full team-wide board view by default
- Deferred:
  - advanced automation rules or natural-language date parsing
- Deferred:
  - rich chat/thread behavior inside tasks

### 6. Workflow

1. User creates a private personal task or memo.
2. System stores it under the owner's private task scope.
3. User optionally links the task to property, room, guest, or reservation context.
4. User can optionally send the task to a teammate.
5. System creates a share/assignment record so the teammate receives the task in their own list.
6. Owner and recipient each manage visibility and status according to the final sharing rule.

### 7. Data and Technical Impact

- Tables affected:
  - likely new `tasks`
  - likely new `task_assignments` or `task_shares`
- New schema needed:
  - private owner-scoped task record
  - optional linked context fields for property/room/reservation/guest
  - teammate share/assignment relation with sender, recipient, and status
- Server actions / routes:
  - create personal task
  - update/delete own task
  - send task to teammate
  - list personal tasks
  - read received/shared tasks
  - task calendar query by date range
- Shared components:
  - room/property selectors
  - optional reservation linking later
  - existing request/list card patterns may be reusable
- Permissions / RLS impact:
  - private tasks must not leak across users by default
  - shared/assigned tasks must become visible only to the sender/recipient set and approved admin roles if that rule is adopted
- Notification impact:
  - teammate task assignment notification is recommended later, not required for the first slice

### 8. Risks and Open Questions

- Risk:
  - if privacy rules are vague, personal notes may leak to other team members
- Risk:
  - if send/share mutates one shared record instead of creating a controlled recipient copy, ownership/status semantics may become confusing
- Open question:
  - when a task is sent to a teammate, should it remain editable by the sender, the recipient, or both?
- Open question:
  - should shared tasks sync status both ways, or should sender and recipient each have separate completion states?
- Open question:
  - do personal tasks need attachments in the first slice?
- Open question:
  - should CS follow-up tasks support multiple guests/rooms, or only one linked context per task in MVP?

### 9. Recommended Implementation Slice

1. Refine `docs/product/18-todo-task-workflow.md` with private-by-default rules and teammate-send behavior.
2. Add a simple private task schema + RLS.
3. Build personal task create/list/detail/update flow.
4. Add the task calendar view for due-date-based scheduling.
5. Add teammate send/share as a second slice after the private baseline is stable.
6. Add CS-specific room/guest context fields in the same cycle if the data links are already practical.
7. Reconcile docs after real operational feedback.

### 10. Verification Checklist

- [ ] Private task visibility verified
- [ ] Own task create/update/delete verified
- [ ] Task calendar view verified
- [ ] Teammate send/share verified
- [ ] Sender/recipient visibility boundaries verified
- [ ] Korean/Japanese/English copy verified
- [ ] Empty/error states verified
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm test` when shared logic or i18n changes

## Feature 4: Staff Suggestions / Feedback Box

**Status:** Candidate  
**Priority:** Medium-High  
**Target iteration:** Third implementation candidate

### 1. Problem

- Staff and part-time workers need a safe place to submit improvement ideas, workplace complaints, and operational suggestions.
- Some suggestions should be visible to the whole team, while others should not be openly visible.
- A free-form board is not enough because suggestion items often need privacy, categorization, and response tracking.

### 2. Users and Roles

- Primary users: all active organization members, including `part_time_staff`
- Allowed submitters: all active roles
- Recommended private-visibility audience:
  - author
  - `owner`
  - `office_admin`
  - `cs_staff`
  - `field_manager`
  - `staff`
  - `developer_super_admin`
- Excluded from other users' employee-only suggestions:
  - other `part_time_staff`
- Blocked users: suspended or removed memberships

### 3. Entry Points

- Mobile:
  - suggestion list
  - create suggestion
  - detail / response view
- Admin:
  - review queue
  - detail / response / status update
- API / background:
  - optional notification or digest later

### 4. MVP Scope

- In scope:
  - create suggestion with title, body, category, visibility, optional property/building tag, and optional memo
- In scope:
  - visibility modes:
    - `public_team`: visible to all active organization members
    - `employee_only`: visible to the author plus employee roles, but not to other part-time staff
- In scope:
  - status tracking such as `submitted`, `reviewing`, `planned`, `resolved`, `closed`
- In scope:
  - admin/management response note on the suggestion detail
- In scope:
  - author can see the status/result of their own suggestion even when it is employee-only

### 5. Out of Scope

- Deferred:
  - fully anonymous submission
- Deferred:
  - voting / upvote ranking
- Deferred:
  - threaded discussion or reactions
- Deferred:
  - automatic escalation workflow

### 6. Workflow

1. User opens the suggestion box.
2. User writes a suggestion, complaint, or improvement request.
3. User chooses visibility:
   - `public_team`
   - `employee_only`
4. System validates visibility and membership rules.
5. System stores the suggestion and makes it visible only to the allowed audience.
6. Management or authorized employee roles review the item and update status or response.
7. The author can track the outcome in the detail view.

### 7. Data and Technical Impact

- Tables affected:
  - likely new `staff_suggestions`
  - optional `staff_suggestion_responses`
- New schema needed:
  - organization, author, title, body, category, visibility, status, property tag, created_at, updated_at, resolved_at
- Server actions / routes:
  - create suggestion
  - list by visibility
  - update status
  - add response
  - edit/delete own suggestion within allowed rules
- Shared components:
  - card/list/detail patterns from announcements or board can be reused
  - category chips and status badges can share existing UI patterns
- Permissions / RLS impact:
  - `public_team` suggestions visible to all active org members
  - `employee_only` suggestions visible only to the author and allowed employee roles
  - other part-time staff must not see employee-only suggestions
- Notification impact:
  - optional later notification to the author when a response or status update is added

### 8. Risks and Open Questions

- Risk:
  - if "private" is defined too loosely, sensitive feedback may leak to the wrong audience
- Risk:
  - if employee-only posts are visible to every employee, some users may still feel unsafe sharing sensitive issues
- Open question:
  - should `employee_only` mean all employee roles, or only management-level roles?
- Open question:
  - should the author be allowed to edit/delete the suggestion after review begins?
- Open question:
  - should part-time workers be allowed to comment on public-team suggestions?
- Open question:
  - should there be a separate category for harassment / workplace conflict that bypasses normal visibility?

### 9. Recommended Implementation Slice

1. Confirm the exact meaning of `employee_only`.
2. Add a structured suggestion schema + RLS.
3. Build mobile-first create/list/detail flow.
4. Add admin review queue with status update and response.
5. Verify public-team vs employee-only visibility boundaries.
6. Reconcile docs after first internal usage feedback.

### 10. Verification Checklist

- [ ] Public-team visibility verified
- [ ] Employee-only visibility verified
- [ ] Author visibility for own suggestion verified
- [ ] Part-time exclusion from others' employee-only suggestions verified
- [ ] Admin review/status update verified
- [ ] Korean/Japanese/English copy verified
- [ ] Empty/error states verified
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm test` when shared logic or i18n changes

## Feature 5: Attendance / Clock-In-Out + Payroll

**Status:** Candidate  
**Priority:** High but blocked by specification depth  
**Target iteration:** Discovery first, implementation later

### 1. Problem

- The team wants to replace a paper timecard workflow currently used in Japan.
- The first delivery target is PWA, not a store-distributed native app.
- Clock-in/out must work across changing work locations.
- QR codes will be printed on-site and should remain stable.
- The long-term direction includes stronger location verification such as GPS now and Wi-Fi + GPS later.
- Part-time workers need automatic pay calculation and export.
- Salaried staff still need attendance logging, but not hourly payroll calculation.
- Managers need to control role type and hourly rate without hardcoding.

### 2. Users and Roles

- Primary users:
  - `staff`, `part_time_staff`, `field_manager`, and operational users who need attendance logging
- Allowed attendance users:
  - all active organization members unless explicitly disabled
- Payroll-specific users:
  - hourly workers only
- Admin responsibilities:
  - `owner`, `office_admin`, `cs_staff`, and possibly `field_manager` view logs, manage sites, manage employment type, manage hourly rate rules, and export attendance/payroll data
- Special role rule:
  - salaried employees can use attendance but are excluded from hourly wage calculation

### 3. Entry Points

- Mobile / PWA:
  - scan QR
  - request geolocation
  - clock in / clock out
  - view own daily/monthly records
- Admin:
  - site master and QR management
  - worker employment type and hourly-rate settings
  - attendance log review
  - correction and export screen
- API / background:
  - payroll aggregation jobs may be required later

### 4. MVP Scope

- In scope:
  - site master with stable QR codes per workplace/location
- In scope:
  - PWA QR scan + GPS capture for clock-in and clock-out
- In scope:
  - attendance logs with immutable captured proof fields (site, QR, GPS, timestamp, device/browser metadata if needed)
- In scope:
  - admin-managed employment type per user (`hourly` vs `salaried`)
- In scope:
  - admin-managed hourly rate configuration with effective dates for hourly workers
- In scope:
  - monthly payroll calculation for hourly workers only
- In scope:
  - basic export once the required sheet shape is known

### 5. Out of Scope

- Deferred:
  - Wi-Fi validation until later native/app-assisted phase or a later PWA enhancement
- Deferred:
  - final Excel export shape before the real sheet template is supplied
- Deferred:
  - salaried payroll calculation
- Deferred:
  - advanced labor-rule engine (night differential, overtime policy variants, tax/social insurance handling) unless specifically defined
- Deferred:
  - biometric verification

### 6. Workflow

1. Admin creates a workplace/site record and assigns a stable QR token.
2. QR code is printed and fixed at the site.
3. Worker opens the PWA, scans the site QR, and grants GPS access.
4. System validates the QR token and stores the attendance proof with timestamp and coordinates.
5. Worker repeats the same flow for clock-out.
6. Admin reviews daily/monthly logs.
7. For hourly workers, the system calculates payable time using configured wage rules.
8. Admin exports the monthly result once the required template is available.

### 7. Data and Technical Impact

- Tables affected:
  - new `attendance_sites`
  - new `attendance_qr_tokens`
  - new `attendance_logs`
  - new `employment_profiles`
  - new `hourly_rate_history`
  - new monthly summary/export tables if needed
- New schema needed:
  - site/location master
  - immutable attendance event records
  - employment type and hourly-rate history
  - payroll summary structure for hourly workers
- Server actions / routes:
  - QR validation and clock event creation
  - admin site/worker/rate management
  - monthly calculation
  - export endpoint
- Shared components:
  - camera/QR scanner surface
  - current user/session/profile infrastructure
  - export helper utilities
- Permissions / RLS impact:
  - users can read their own attendance logs
  - admins can read broader org attendance/payroll data
  - only authorized roles can manage rates and exports
- Notification impact:
  - optional later reminders for missing clock-out or shift anomalies

### 8. Risks and Open Questions

- Risk:
  - this feature directly affects compensation, so unclear rules will create financial and trust risk
- Risk:
  - PWA camera/geolocation behavior differs by browser and device; QR/GPS reliability needs real-device QA
- Risk:
  - current project docs explicitly exclude attendance/payroll from first MVP, so this is a scope decision change
- Risk:
  - a static printed QR code must be stable, but if it is too simple it may be easy to misuse off-site without stronger validation
- Open question:
  - what are the exact pay rules for breaks, rounding, lateness, overtime, overnight shifts, and holiday treatment?
- Open question:
  - do workers need one active clock-in session per organization or per site?
- Open question:
  - what is the payroll cutoff period: monthly calendar month or a custom closing date?
- Open question:
  - what corrections are allowed after submission, and who can approve them?
- Open question:
  - should `field_manager` be allowed to edit attendance records or only request corrections?
- Open question:
  - can one worker clock into different sites on the same day, and how should pay be split?

### 9. Recommended Implementation Slice

1. Do not start with payroll code.
2. First write a dedicated attendance/payroll product spec covering site rules, QR rules, GPS policy, pay rules, cutoff rules, correction rules, and export requirements.
3. Implement attendance capture first:
   - site master
   - stable QR issuance
   - PWA QR scan + GPS clock-in/out
   - own-history and admin log review
4. Implement employment type and hourly-rate management second.
5. Implement payroll calculation third, after rule confirmation.
6. Implement final export last, after the real sheet template is provided.

### 10. Verification Checklist

- [ ] Real-device PWA QR scan verified on iPhone
- [ ] Real-device PWA QR scan verified on Android
- [ ] Geolocation permission and failure states verified
- [ ] Stable QR validation verified
- [ ] Own-history visibility verified
- [ ] Admin rate management verified
- [ ] Hourly-vs-salaried branching verified
- [ ] Payroll calculation verified against sample cases
- [ ] Export verified against the real target sheet
- [ ] Korean/Japanese/English copy verified
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm test` when shared logic or i18n changes

## Active Batch

### Selected Order

1. Linen Defect Registration
2. Personal Todo / Shared Task Inbox
3. Staff Suggestions / Feedback Box
4. Internal Board
5. Attendance / Clock-In-Out + Payroll (discovery/spec first, implementation later)

### Why This Order

- Linen Defect Registration is operationally concrete, narrow enough for a first build slice, and has a visible day-to-day workflow.
- Personal Todo / Shared Task Inbox has broad day-to-day value across all roles and extends an already-documented product direction.
- Staff Suggestions / Feedback Box adds structured feedback with privacy rules and avoids overloading the Board with sensitive workplace feedback.
- Internal Board is useful but still needs one clear rule: how it differs from Announcements.
- Attendance / Payroll is high-value but much larger and more sensitive; compensation logic must not start from vague assumptions.

### First Slice To Implement

- Feature:
  - Linen Defect Registration
- Scope boundary:
  - property-scoped linen item master + create/list/detail baseline
  - no vendor settlement, no analytics, no inventory sync in the first slice
- Must-update docs before coding:
  - `docs/product/02-feature-map.md`
  - `docs/product/19-linen-defect-workflow.md`
  - `docs/engineering/04-data-model.md`
  - `docs/engineering/05-rls-permissions.md`
  - `docs/engineering/06-implementation-plan.md`
  - `docs/engineering/08-linen-defect-technical-design.md`
- Verification minimum:
  - mobile create flow
  - all-user read access
  - admin catalog management
  - i18n coverage
