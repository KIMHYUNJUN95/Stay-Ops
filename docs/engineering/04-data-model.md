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
created_at timestamptz
updated_at timestamptz
```

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
request-images   -- lost_items and maintenance_reports images
                 -- path: {org_id}/{request_type}/{request_id}/{filename}
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

Migration: `supabase/migrations/202606030001_notifications.sql`

Fields:

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
recipient_user_id uuid not null references profiles(id)
type notification_type not null    -- enum, currently: order_processed
href text not null                 -- in-app navigation target on tap
source_type text not null          -- e.g. "order_request"
source_id uuid not null            -- FK-equivalent to the source record
dedupe_key text not null           -- unique per (recipient, event) to prevent duplicates
payload jsonb not null default '{}' -- event-specific data (order title, delivery date, etc.)
read_at timestamptz                -- null = unread
created_at timestamptz not null
unique (recipient_user_id, dedupe_key)
```

Notification type values (notification_type enum):

```txt
order_processed
```

Implementation notes:
- `order_processed` notification is dispatched when an order request status transitions to `ordered`.
- Self-notifications are suppressed (processor = requester does not trigger a notification).
- A `schemaUnavailable` graceful fallback is used if the migration has not yet been applied; the notifications UI shows an info card instead of crashing.
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

The tables below back the approved post-MVP batch. Full column types, enums, indexes, and RLS detail live in the per-feature technical-design docs (`docs/engineering/08`–`12`); the definitions here are the canonical inventory. None are implemented yet — no migrations exist for them.

## linen_items

Per property/building linen item master. See `docs/engineering/08-linen-defect-technical-design.md`.

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
property_id uuid references properties(id)
property_name text
code text
display_name text not null
category text
display_order integer
is_active boolean not null default true
created_at timestamptz
updated_at timestamptz
```

## linen_return_records

Building-scoped linen return header record. One row = one return registration event. See `docs/engineering/08-linen-defect-technical-design.md`.

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
property_id uuid references properties(id)
note text
image_urls text[]
registered_by_user_id uuid references profiles(id)
registered_at timestamptz
created_at timestamptz
updated_at timestamptz
```

## linen_return_record_items

Child item lines under one `linen_return_records` row.

```txt
id uuid primary key
return_record_id uuid not null references linen_return_records(id) on delete cascade
linen_item_id uuid not null references linen_items(id)
quantity integer not null check (quantity > 0)
sort_order integer
created_at timestamptz
```

## tasks

Personal todo / shared task inbox, private-by-default. See `docs/engineering/09-todo-task-technical-design.md`.

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
owner_user_id uuid not null references profiles(id)
title text not null
description text
property_id uuid references properties(id)
room_id uuid references rooms(id)
reservation_id uuid references reservations(id)
guest_name text
is_private boolean not null default true
assigned_to_user_id uuid references profiles(id)
source_task_id uuid references tasks(id)
source_type text   -- personal | shared_copy | system_linked
priority text not null default 'normal'   -- low | normal | high | urgent
status text not null default 'open'        -- open | in_progress | completed | cancelled
due_at timestamptz
reminder_at timestamptz
tags text[]
completed_by_user_id uuid references profiles(id)
completed_at timestamptz
created_by_user_id uuid references profiles(id)
created_at timestamptz
updated_at timestamptz
```

## task_transfers

Teammate send/share records. NOTE: the exact share model (single shared record vs. sender/recipient copy) is still TBD before build — see `docs/planning/01-decision-log.md` (2026-06-09 Personal Todo decision).

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
source_task_id uuid not null references tasks(id)
sender_user_id uuid not null references profiles(id)
recipient_user_id uuid not null references profiles(id)
recipient_task_id uuid references tasks(id)
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

Structured feedback box with visibility + review lifecycle. See `docs/engineering/12-staff-suggestions-technical-design.md`.

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
created_by_user_id uuid not null references profiles(id)
title text not null
body text
category text   -- operations | workplace | tools_system | staffing | safety | property_specific | other
visibility text not null   -- public_team | employee_only
status text not null default 'submitted'   -- submitted | reviewing | planned | resolved | closed
property_id uuid references properties(id)
property_name text
response_note text
responded_by_user_id uuid references profiles(id)
responded_at timestamptz
resolved_at timestamptz
created_at timestamptz
updated_at timestamptz
```

Permissions note: `employee_only` rows are readable by the author plus owner/office_admin/cs_staff/field_manager/staff/developer_super_admin — **not** other part_time_staff.

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
