# Data Model

## Purpose

This document defines the initial Supabase/PostgreSQL data model for StayOps.

The model must support:

- Multi-tenant organizations
- PWA mobile field app
- Admin web app
- Role-based permissions
- Korean/Japanese/English UI
- Beds24 reservation calendar
- Cleaning timer records
- Maintenance requests
- Lost and found
- Order requests
- Announcements
- User directory
- Notifications
- Recurring work scheduler
- Linen defect registration (approved post-MVP batch, 2026-06-09)
- Personal todo / shared task inbox (approved post-MVP batch)
- Internal board (approved post-MVP batch)
- Staff suggestions / feedback (approved post-MVP batch)
- Attendance / clock-in-out + hourly payroll (attendance approved; payroll calc deferred)

## Core Principles

## 1. Organization Isolation

Every business record must belong to an organization.

Core rule:

```txt
organization_id is required on every operational table.
```

## 2. Internal IDs + External IDs

StayOps should use internal UUID primary keys.

External systems such as Beds24 should be mapped through external ID fields.

Example:

```txt
external_provider = "beds24"
external_id = "..."
```

## 3. Role-Based Access

Permissions should be enforced with:

- Application-level checks
- Supabase Row Level Security

Do not rely only on hiding UI buttons.

## 4. Hard Delete Policy

User-triggered deletion is hard delete in MVP.

Important:

- Show confirmation popup before delete.
- Be careful with foreign keys and cascading behavior.

## 5. Attachments

Implementation note (updated): The actual MVP implementation stores image URLs directly on each feature table as `image_urls text[]` rather than using a shared `attachments` table. The shared table approach was the original design intent but was not used in practice. Each table (lost_items, maintenance_reports, order_requests, announcements) stores its own `image_urls text[]` column. The Supabase Storage bucket for request images is `request-images`; the bucket for announcement images is `announcement-images`.

## Core Tables

Implementation note:

- The first implementation migration is `supabase/migrations/202605090001_initial_foundation.sql`.
- The first migration intentionally covers only the foundation tables needed before authentication and onboarding:
  - organizations
  - profiles
  - memberships
  - invite_codes
  - platform_admins
  - audit_logs
- Feature tables such as properties, rooms, reservations, cleaning records, requests, announcements, notifications, and recurring work should be added in later migrations after the auth/invite foundation is connected and tested.

## organizations

Represents a company/workspace.

Fields:

```txt
id uuid primary key
name text not null
slug text unique
status text not null
created_at timestamptz
updated_at timestamptz
```

## profiles

Extends Supabase auth users.

Fields:

```txt
id uuid primary key references auth.users(id)
name text not null
age integer
phone_number text
profile_photo_url text
preferred_language text not null
theme_preference text not null default 'system'  -- schema only; NOT used by the app (light-mode-only since 2026-06-08)
bottom_nav_tabs text[] not null default '{home,calendar,requests,announcements}'
can_generate_report boolean not null default false
created_at timestamptz
updated_at timestamptz
```

`can_generate_report` (migration `supabase/migrations/202606130001_profile_report_access.sql`) is a
per-user override for the Todo **daily-report generator** (업무일지; free, template-based — no LLM).
Default `false`. The report
permission is `role != 'part_time_staff' OR can_generate_report = true`, so regular staff are covered
by the role check and never need the flag; it is toggled per-user by owner/office_admin in admin user
management for the few part-timers who work in a management capacity. See
`docs/engineering/05-rls-permissions.md` and `docs/product/18-todo-task-workflow.md` (2026-06-13).

`bottom_nav_tabs` stores the user's customized mobile bottom-bar tabs (ordered ids, max 4 enforced in app logic). Added in `supabase/migrations/202606080001_profile_bottom_nav.sql`. Selectable ids match the mobile side-menu nav items (`home`, `calendar`, `cleaning`, `requests`, `announcements`, `notifications`, `directory`).

Language values:

```txt
ko
ja
en
```

Theme values (schema only — the app no longer reads or writes `theme_preference`; light-mode-only since 2026-06-08, dark mode deferred until post-launch):

```txt
system
light
dark
```

## memberships

Connects users to organizations.

Fields:

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
user_id uuid not null references profiles(id)
role text not null
status text not null
joined_at timestamptz
created_at timestamptz
updated_at timestamptz
```

Role values:

```txt
owner
office_admin
cs_staff
field_manager
staff
part_time_staff
```

Developer/Super Admin is not stored as an organization membership role. It uses `platform_admins`.

Status values:

```txt
invited
active
suspended
removed
```

## invite_codes

Invite codes for onboarding, especially part-time staff.

Fields:

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
code text unique not null
name text not null
default_role text not null
expires_at timestamptz not null
max_uses integer not null
used_count integer not null default 0
is_active boolean not null default true
created_by_user_id uuid references profiles(id)
created_at timestamptz
updated_at timestamptz
```

## platform_admins

Platform-level admin access.

This is separate from organization memberships.

Fields:

```txt
id uuid primary key
user_id uuid not null references profiles(id)
role text not null
is_active boolean not null default true
created_at timestamptz
updated_at timestamptz
```

Role values:

```txt
developer_super_admin
```

Purpose:

- Create organizations during MVP
- Access all organizations for support/debugging
- Manage platform-level settings later

## audit_logs

Records important admin/platform actions.

MVP does not need a full audit log UI, but important actions should be stored.

Fields:

```txt
id uuid primary key
organization_id uuid references organizations(id)
actor_user_id uuid references profiles(id)
action text not null
target_type text
target_id uuid
metadata jsonb
created_at timestamptz
```

Example actions:

```txt
organization.created
membership.role_changed
membership.deactivated
invite_code.created
request.deleted
reservation.manual_checkout_updated
platform_admin.used
```

Notes:

- `organization_id` can be null for platform-level actions.
- Super Admin actions should be recorded.
- Important role and permission changes should be recorded.

## properties

Buildings, hotels, or standalone accommodations.

Fields:

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
name text not null
display_name_ko text
display_name_ja text
display_name_en text
property_type text not null
address text
status text not null
external_provider text
external_property_id text
created_at timestamptz
updated_at timestamptz
```

## rooms

Rooms or units inside a property.

Migration: `supabase/migrations/202605240001_properties_rooms.sql`

Fields:

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
property_id uuid not null references properties(id)
room_label text not null           -- canonical room label (e.g. "201", "A301")
status room_status not null        -- active | inactive
external_provider text             -- "beds24" for Beds24-synced rooms
external_room_id text              -- Beds24 unitId
external_minimum_stay integer      -- from Beds24 inventory API; null = unknown/unclassified
created_at timestamptz
updated_at timestamptz
```

Status values (room_status enum):

```txt
active
inactive
```

Note: `external_minimum_stay` determines whether a Beds24 room is classified as active or inactive. Rooms with `external_minimum_stay < 50` are treated as active; `null` or `>= 50` are treated as inactive. This is used by `getActiveRoomLabels()` to decide which rooms render on the calendar.

## reservations

Beds24 reservation data used for calendar display.

Migration: `supabase/migrations/202605220001_reservations.sql`

Fields:

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
property_name text not null        -- free text from Beds24 payload, not a FK to properties
room_label text not null           -- free text from Beds24 payload, not a FK to rooms
source text not null               -- channel name: "Booking.com", "Airbnb", "Direct", etc.
source_reservation_id text not null -- Beds24 booking ID (may include "::room::{label}" suffix for multi-room)
guest_name text not null
guest_count integer
check_in_date date not null        -- Beds24 firstNight date
check_out_date date not null       -- lastNight + 1 calendar day
status reservation_status not null
raw_payload jsonb                  -- original Beds24 webhook payload for recovery/debugging
created_at timestamptz not null
updated_at timestamptz not null
unique (organization_id, source, source_reservation_id)
```

Status values (reservation_status enum):

```txt
confirmed
checked_in
checked_out
cancelled
no_show
```

Notes:
- property_name and room_label are free text (not FKs) because Beds24 sends string labels. The `properties` and `rooms` tables are maintained in parallel for room master management but are not enforced as FKs here.
- check_out_date uses exclusive semantics: guest checks out on check_out_date morning, not the night before.
- Cancelled and no_show reservations are excluded from all calendar renders and counts.
- source_reservation_id may encode room assignment as "{originalId}::room::{label}" to support multi-room bookings under the same unique constraint.
- Realtime is enabled on this table (migration `202605260002_enable_reservations_realtime.sql`).

## beds24_webhook_events

Observability log for Beds24 reservation ingestion. Records every inbound webhook batch and every reconciliation run with its processing result, so a dropped or never-delivered webhook is detectable instead of silently missing. See `docs/product/15-reservation-calendar.md` → "Webhook Reliability".

Migration: `supabase/migrations/202606100001_beds24_webhook_events.sql`

Fields:

```txt
id uuid primary key
organization_id uuid references organizations(id) on delete set null  -- nullable: webhook may fail to resolve org
trigger_source text not null            -- 'webhook' | 'reconciliation' (CHECK constrained)
http_status integer
processed_count integer not null        -- bookings in the batch / rows fetched by reconciliation
succeeded_count integer not null
failed_count integer not null
modes text[] not null                   -- per-result processing modes (upserted, missing_required_fields, ...)
booking_summary jsonb not null          -- compact [{bookId,status,mode}] (webhook) or window/skip summary (reconciliation)
error_message text
received_at timestamptz not null
created_at timestamptz not null
```

Notes:
- This is platform/operational data, not org business data: readable only by platform admins, writable only by the service role (webhook + cron paths).
- `booking_summary` is intentionally a compact summary, NOT the full raw payload — enough to trace a specific reservation without storing bulk PII. The full payload still lives in `reservations.raw_payload` for recovered rows.
- Written by `src/lib/beds24/webhook-events.ts` from the webhook route and the reconciliation route; logging failures are swallowed and never block the ingestion response.

## cleaning_sessions

Cleaning timer and completion records.

Migration: `supabase/migrations/202605210001_cleaning_sessions.sql`

Fields:

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
staff_user_id uuid not null references profiles(id)
room_label text not null          -- canonical "PropertyName RoomLabel" string, not a FK
task_label text not null          -- task type key (checkout_cleaning, simple_cleaning, long_stay_cleaning)
status cleaning_status not null
cleaning_date date not null       -- JST operating date (Asia/Tokyo)
started_at timestamptz not null
completed_at timestamptz
duration_seconds integer
notes text
created_at timestamptz not null
updated_at timestamptz not null
```

Status values (cleaning_status enum):

```txt
in_progress
completed
```

Note: room_label and property are stored as free text rather than FKs to properties/rooms tables because cleaning sessions predate the room master and must survive property data changes. The room master (properties/rooms tables) is used for display and filtering but is not enforced as a FK here.

## maintenance_reports

Maintenance/field issue records.

Migration: `supabase/migrations/202605210007_maintenance_reports.sql`

Fields:

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
reported_by_user_id uuid not null references profiles(id)
room_label text not null           -- free text, matches cleaning_sessions.room_label pattern
issue_title text not null
description text
category text                      -- optional category key
status maintenance_status not null
image_urls text[] not null default '{}'
cleaning_session_id uuid references cleaning_sessions(id)  -- set when created during active cleaning
created_at timestamptz not null
updated_at timestamptz not null
```

Status values (maintenance_status enum):

```txt
open
in_progress
resolved
closed
```

Note: room is stored as free text `room_label` (same pattern as cleaning_sessions). There is no property_id or room_id FK. When created from an active cleaning session, `cleaning_session_id` is set automatically.

## lost_items

Lost and found records.

Migration: `supabase/migrations/202605210006_lost_items.sql`

Fields:

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
reported_by_user_id uuid not null references profiles(id)
room_label text not null           -- free text, matches cleaning_sessions.room_label pattern
item_name text not null
found_at timestamptz not null
status lost_item_status not null
image_urls text[] not null default '{}'
memo text
cleaning_session_id uuid references cleaning_sessions(id)  -- set when created during active cleaning
created_at timestamptz not null
updated_at timestamptz not null
```

Status values (lost_item_status enum):

```txt
registered
stored
disposal_scheduled
disposed
```

Note: storage_location, retrieval_status, retrieved_at, retrieved_by_user_id, guest_name, reservation_id, and dispose-tracking fields were planned in the original design but are not in the current MVP implementation.

## order_requests

Free-text supply/amenity requests. Multiple items per request stored as JSONB.

Migrations: `202606010001_order_requests.sql`, `202606010002_order_requests_delivery_date.sql`, `202606020001_order_requests_delivery_range.sql`

Fields:

```txt
id                    uuid primary key default gen_random_uuid()
organization_id       uuid not null references organizations(id) on delete cascade
reported_by_user_id   uuid not null references profiles(id) on delete restrict
building_name         text not null
room_label            text not null default '-'
title                 text not null
description           text
reason                text
urgency               order_request_urgency not null default 'normal'
status                order_request_status not null default 'requested'
items                 jsonb not null default '[]'    -- array of {id, name, quantity, link, memo, imageUrls?}
delivery_date         date                            -- single delivery date; populated at ordered transition
delivery_start_date   date                            -- range start (mutually exclusive with delivery_date)
delivery_end_date     date                            -- range end; constraint: start <= end, both null or both set
created_at            timestamptz not null default now()
updated_at            timestamptz not null default now()
```

Constraint: `order_requests_delivery_range_valid` ensures delivery_start_date and delivery_end_date are either both null or both set with start <= end.

Enums:

```txt
order_request_status:  requested | approved | ordered | received | closed
order_request_urgency: normal | high
```

Note: per-transition audit columns are not in the MVP schema. The `status` enum value tracks workflow state. Per-item photo URLs are stored inside `items[].imageUrls` within the JSONB column.

## announcements

Internal notices.

Migrations: `202605100001_announcements.sql`, `202605100003_announcement_images.sql`, and related hardening migrations.

Fields:

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
title text not null
content text not null
created_by_user_id uuid not null references profiles(id)
target_scope text not null
target_property_ids uuid[]
target_roles text[]
is_important boolean not null default false
is_pinned boolean not null default false
show_popup_on_app_open boolean not null default false
popup_until timestamptz
allow_comments boolean not null default true
status text not null default 'draft'   -- draft | published | archived
image_urls text[] not null default '{}' -- up to 5 announcement images in announcement-images bucket
published_at timestamptz
archived_at timestamptz
created_at timestamptz
updated_at timestamptz
```

## attachments (not implemented)

Note: The shared `attachments` table design was planned but not implemented. All feature tables (lost_items, maintenance_reports, order_requests, announcements) store image URLs directly in an `image_urls text[]` column. This is the current production approach.

File limits per feature:

```txt
lost_item images: max 5
maintenance_report images: max 5
order request per-item images: max 5 per item
announcement images: max 5
```

Storage buckets:

```txt
request-images   -- shared image bucket; path: {org_id}/{request_type}/{request_id}/{filename}
                 -- request_type whitelist (storage RLS): lost-items, maintenance-reports,
                 -- order-images, linen-returns, task-images, task-update-images, suggestion-images
                 -- (suggestion-images added 202606160004; part_time_staff may upload only there)
announcement-images -- announcement images
                 -- path: {org_id}/{announcement_id}/{filename}
```

## announcement_reads

Read tracking.

Fields:

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
announcement_id uuid not null references announcements(id)
user_id uuid not null references profiles(id)
read_at timestamptz not null
```

## announcement_comments

Announcement comments.

Fields:

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
announcement_id uuid not null references announcements(id)
user_id uuid not null references profiles(id)
content text not null
created_at timestamptz
updated_at timestamptz
```

## notifications

In-app notification center records.

Base migration: `supabase/migrations/202606030001_notifications.sql`. Enum values were later extended
by `supabase/migrations/202606100003_todo_tasks.sql` (task activity) and
`supabase/migrations/202606110001_task_reminder_notifications.sql` (task reminders).

The notifications table now backs three dispatch surfaces:
- order processing notifications
- Todo / Shared Task activity (shared / update / completed)
- Todo / Shared Task time-based reminders (due-soon / overdue)

Fields:

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
recipient_user_id uuid not null references profiles(id)
type notification_type not null    -- enum (see values below)
href text not null                 -- in-app navigation target on tap
source_type text not null          -- e.g. "order_request", "task"
source_id uuid not null            -- FK-equivalent to the source record
dedupe_key text not null           -- unique per (recipient, event) to prevent duplicates
payload jsonb not null default '{}' -- event-specific data (order/task title, delivery date, event, etc.)
read_at timestamptz                -- null = unread
created_at timestamptz not null
unique (recipient_user_id, dedupe_key)
```

Notification type values (notification_type enum, as implemented):

```txt
order_processed
task_shared
task_updated
task_completed
task_due_soon
task_overdue
project_shared
suggestion_activity
```

Implementation notes:
- `order_processed` is dispatched when an order request status transitions to `ordered` (and reused,
  with a `kind: "delivery_updated"` payload flag, for a later delivery-date edit).
- `suggestion_activity` (migration `202606160003_suggestion_notifications.sql`) is one type for all
  Staff Suggestions events, distinguished by `payload.event` (`created` / `referenced` / `status` /
  `comment`); fan-out only to valid participants, deep-linking to `/mobile/suggestions/{id}`.
- `task_shared` / `task_updated` / `task_completed` are event-driven from the task server actions and
  fan out only to a task's current participants (org-scoped). `task_updated` is one type distinguished
  by `payload.event` — `edited` (author core edit), `note` (update-log activity), `reopened`.
- `task_due_soon` / `task_overdue` are time-based system reminders produced only by the daily
  `/api/tasks/reminders` cron (`src/lib/notifications/task-reminders.ts`): due-soon = active task due
  today (Tokyo), overdue = active task due before today. The `unique (recipient_user_id, dedupe_key)`
  constraint (key `task_due_soon|task_overdue:<taskId>`) limits each task to one reminder per recipient,
  so the cron never re-spams. See `docs/product/14-notification-design.md` for the full matrix.
- Self-notifications are suppressed for event-driven types (the actor is excluded from recipients).
  Reminders have no actor, so a task's author is intentionally reminded about their own deadline.
- A `schemaUnavailable` graceful fallback is used if the migration has not yet been applied; the
  notifications UI shows an info card instead of crashing.
- Push notifications are not yet implemented; in-app only.

## recurring_work_templates

Recurring work definitions.

Fields:

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
title text not null
description text
property_id uuid references properties(id)
room_id uuid references rooms(id)
frequency_type text not null
frequency_interval integer
created_by_user_id uuid references profiles(id)
is_active boolean not null default true
created_at timestamptz
updated_at timestamptz
```

## recurring_work_occurrences

Generated recurring work instances.

Fields:

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
template_id uuid references recurring_work_templates(id)
property_id uuid references properties(id)
room_id uuid references rooms(id)
due_date date not null
status text not null
completed_by_user_id uuid references profiles(id)
completed_at timestamptz
notes text
created_at timestamptz
updated_at timestamptz
```

# Post-MVP Feature Batch Tables (approved 2026-06-09)

The tables below back the approved post-MVP batch. Full column types, enums, indexes, and RLS detail live in the per-feature technical-design docs (`docs/engineering/08`–`12`); the definitions here are the canonical inventory. The three `linen_*` tables (migration `202606100002_linen_returns.sql`) and the three task tables
(`tasks` / `task_participants` / `task_updates`, migration `202606100003_todo_tasks.sql`) are
**implemented**; the rest are not implemented yet.

## linen_items

Implemented. Selectable linen item catalog. Org-scoped with nullable `building_name`
(`NULL` = available for all buildings; a value scopes the item to one canonical building name).
Building is the canonical property name (text), not a `properties` FK — consistent with the rest
of the app. Current default global set per org is 7 items
(`duvet_single, duvet_double, mattress_single, mattress_double, pillow, towel, mat`); older
generic defaults are retired from the active picker but kept for historical rows. See
`docs/engineering/08-linen-defect-technical-design.md` → "As-Built".

```txt
id uuid primary key
organization_id uuid not null references organizations(id) on delete cascade
building_name text                 -- NULL = all buildings
code text
name text not null
category text
is_active boolean not null default true
display_order integer not null default 0
created_by_user_id uuid references profiles(id) on delete set null
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

## linen_return_records

Implemented. Building-scoped linen return header. One row = one return registration event.
`building_name` is the canonical property name (text), matching `order_requests.building_name`.
No status column in the first slice.

```txt
id uuid primary key
organization_id uuid not null references organizations(id) on delete cascade
building_name text not null
note text
image_urls text[] not null default '{}'
registered_by_user_id uuid not null references profiles(id) on delete restrict
registered_at timestamptz not null default now()
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

## linen_return_record_items

Implemented. Child item lines under one `linen_return_records` row. `unique (return_record_id,
linen_item_id)` blocks the same item appearing twice in one record (quantities are summed into a
single line instead).

```txt
id uuid primary key
return_record_id uuid not null references linen_return_records(id) on delete cascade
linen_item_id uuid not null references linen_items(id) on delete restrict
quantity integer not null check (quantity > 0)
sort_order integer not null default 0
created_at timestamptz not null default now()
unique (return_record_id, linen_item_id)
```

## tasks

Implemented (migration `202606100003_todo_tasks.sql`). One canonical task + `task_participants`
(one set, author + participants) + `task_updates` (unified log). Private by default; sharing adds
participant rows. `priority`/`status` are text+check (not enums). Notification enum gained
`task_shared` / `task_updated` / `task_completed`; task photos reuse the `request-images` bucket
(`task-images` / `task-update-images` subfolders). All writes go through service-role server
actions with explicit permission checks; reads are RLS-scoped via `is_task_participant()`.

Personal todo / shared task inbox. Private by default, but expandable to one shared task with participant set and common status. See `docs/engineering/09-todo-task-technical-design.md`.

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
priority text not null default 'normal'   -- normal | important | urgent
status text not null default 'open'        -- open | in_progress | completed | cancelled
is_inbox boolean not null default true
is_shared boolean not null default false
recurrence_rule text
tags text[]
image_urls text[]
completed_by_user_id uuid references profiles(id)
completed_at timestamptz
created_at timestamptz
updated_at timestamptz
```

Note (2026-06-13): `completed_at` / `completed_by_user_id` (and `status`) are **actively written
again** by the re-introduced complete/reopen actions (`completeTask` / `reopenTask` in
`src/app/mobile/tasks/[id]/actions.ts`). They are no longer dormant — completing a task stamps
`completed_at` (its Tokyo date drives the Completed/기록 tab grouping) and the completing user, and
reopening clears them.

## task_participants

Current participant set for each task.

```txt
id uuid primary key
task_id uuid not null references tasks(id)
user_id uuid not null references profiles(id)
role text not null            -- author | participant
is_first_recipient boolean not null default false
added_by_user_id uuid references profiles(id)
created_at timestamptz
```

## task_updates

Unified task update-log. Covers participant notes plus small system entries such as edited/shared/completed/reopened.

```txt
id uuid primary key
task_id uuid not null references tasks(id)
created_by_user_id uuid references profiles(id)
update_type text not null     -- note | system_edited | system_shared | status_changed | completed | reopened
body text
image_urls text[]
created_at timestamptz
```

## board_posts

Internal board feed. See `docs/engineering/10-internal-board-technical-design.md`.

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
created_by_user_id uuid not null references profiles(id)
title text not null
body text
category text   -- general | property_note | handover | incident | other
image_urls text[]
is_pinned boolean not null default false
archived_at timestamptz
created_at timestamptz
updated_at timestamptz
```

Permissions note: all active roles **including part_time_staff** can create posts (confirmed 2026-06-09).

## staff_suggestions

Structured feedback thread with one required recipient, optional referenced users, recipient-owned status, and participant comments. **Schema implemented (Step 1, 2026-06-16) — migration `supabase/migrations/202606160001_staff_suggestions.sql`.** Server actions / queries / notifications are NOT wired yet (later steps). See `docs/engineering/12-staff-suggestions-technical-design.md`.

```txt
id uuid primary key default gen_random_uuid()
organization_id uuid not null references organizations(id) on delete cascade
created_by_user_id uuid not null references profiles(id) on delete restrict
recipient_user_id uuid not null references profiles(id) on delete restrict
title text not null
body text not null
category text
status text not null default 'submitted'   -- submitted | reviewing | on_hold | completed
hold_reason text
completion_note text
property_id uuid references properties(id) on delete set null
property_name text
room_id uuid references rooms(id) on delete set null
room_label text
image_urls text[] not null default '{}'
created_at timestamptz not null default now()
updated_at timestamptz not null default now()  -- maintained by set_updated_at() trigger
```

CHECK constraints (as built):
- `status in ('submitted','reviewing','on_hold','completed')`
- `char_length(trim(title)) > 0`, `char_length(trim(body)) > 0`
- `recipient_user_id <> created_by_user_id` (cannot address own author)
- `coalesce(array_length(image_urls,1),0) <= 5` (max 5 photos; re-applied server-side)
- `status <> 'on_hold' or trim(hold_reason) <> ''` (hold needs a reason)
- `status <> 'completed' or trim(completion_note) <> ''` (completion needs a note)

Indexes: `(organization_id, created_by_user_id, created_at desc)` Sent · `(organization_id, recipient_user_id, created_at desc)` Received · `(organization_id, status, created_at desc)` status · `(organization_id, property_id, created_at desc)` context.

```txt
staff_suggestion_references
  id uuid primary key default gen_random_uuid()
  organization_id uuid not null references organizations(id) on delete cascade
  suggestion_id uuid not null references staff_suggestions(id) on delete cascade
  user_id uuid not null references profiles(id) on delete cascade
  created_at timestamptz not null default now()
  unique (suggestion_id, user_id)
```

Indexes: `(suggestion_id)` join lookups · `(organization_id, user_id, created_at desc)` Referenced list. (Author/recipient duplication of a referenced user is excluded server-side at write time, not by a DB constraint.)

```txt
staff_suggestion_comments
  id uuid primary key default gen_random_uuid()
  organization_id uuid not null references organizations(id) on delete cascade
  suggestion_id uuid not null references staff_suggestions(id) on delete cascade
  created_by_user_id uuid not null references profiles(id) on delete restrict
  body text
  image_urls text[] not null default '{}'
  created_at timestamptz not null default now()
  updated_at timestamptz not null default now()  -- set_updated_at() trigger
```

CHECK constraints: `coalesce(array_length(image_urls,1),0) <= 5` (max 5 photos) · not fully empty (`trim(body) <> '' or array_length(image_urls,1) > 0`). Index: `(suggestion_id, created_at asc)` thread loading.

Visibility helper: `public.can_view_staff_suggestion(target_suggestion_id uuid)` — `SECURITY DEFINER`, returns true if `auth.uid()` is the author, the recipient, or a referenced user (used by the three SELECT policies; bypasses RLS to avoid recursion).

Permissions note: read access is limited to author + recipient + referenced users (+ platform admin). Only the recipient changes status. Referenced users can comment but cannot change status or edit the main suggestion. The author edits/deletes the main suggestion only while `submitted`; comment edit/delete is always comment-author only. These mutation rules are enforced in server actions (later steps); RLS currently grants read-only to participants and routes all writes through the service role.

## Attendance / Payroll tables

See `docs/engineering/11-attendance-payroll-technical-design.md`. Attendance capture tables are approved for build; payroll tables (`payroll_periods`, `payroll_calculations`, `attendance_corrections`, `attendance_exports`) remain design-only until wage rules are defined.

```txt
attendance_sites
  id uuid primary key
  organization_id uuid not null references organizations(id)
  name text not null
  property_id uuid references properties(id)
  latitude double precision
  longitude double precision
  allowed_radius_meters integer
  is_active boolean not null default true
  created_at timestamptz
  updated_at timestamptz

attendance_qr_tokens
  id uuid primary key
  organization_id uuid not null references organizations(id)
  site_id uuid not null references attendance_sites(id)
  token text not null
  is_active boolean not null default true
  created_at timestamptz

attendance_events
  id uuid primary key
  organization_id uuid not null references organizations(id)
  user_id uuid not null references profiles(id)
  site_id uuid references attendance_sites(id)
  qr_token_id uuid references attendance_qr_tokens(id)
  event_type text not null   -- clock_in | clock_out | manual_correction
  captured_at timestamptz not null   -- Asia/Tokyo operating-date boundaries apply
  latitude double precision
  longitude double precision
  gps_accuracy_meters double precision
  device_info jsonb
  created_at timestamptz

employment_profiles
  id uuid primary key
  organization_id uuid not null references organizations(id)
  user_id uuid not null references profiles(id)
  employment_type text not null   -- hourly | salaried
  created_at timestamptz
  updated_at timestamptz

hourly_rate_history
  id uuid primary key
  organization_id uuid not null references organizations(id)
  user_id uuid not null references profiles(id)
  hourly_rate numeric not null
  effective_from date not null
  effective_to date
  created_at timestamptz
```

## Storage buckets — batch note

Linen/board/todo image uploads reuse the existing 5-file client-compressed pattern. The linen tech-design proposes a dedicated `linen-images` bucket as an alternative to reusing `request-images`; pick one at implementation and keep org-id in the storage path (decision pending — see `docs/engineering/08`).

## Initial RLS Direction

Basic rules:

- Users can only access rows for organizations where they have active membership.
- Developer/Super Admin can access all organizations.
- Part-time Staff can create/view requests but cannot change statuses.
- Order request processing is office-level only.
- Price/revenue data is not stored in StayOps MVP reservation tables.

## Resolved Decisions

- CS Staff is treated as office-level for order request processing (can approve/reject/process orders).
- Shared `attachments` table is not used. Each feature table stores `image_urls text[]` directly.
- Hard delete is the MVP policy. Cascades or blocks are handled per-table per FK.
- Reservation raw payloads are stored in `reservations.raw_payload jsonb` for recovery. A separate `beds24_webhook_events` table stores ingestion processing results (webhook + reconciliation) for observability — it is a result log, not raw-payload storage.

## Open Questions

- Which exact actions must be audit logged in MVP?
- Should hard delete cascade related records or be blocked when related records exist (currently varies by table)?
- Will age and profile photo be added to the profile editing screen?
