# Bug Report / Problem Report Technical Design

Status: Draft planning started (2026-06-25)

Design note:

- visual/UI design is not defined here
- the user will provide the feature design separately
- this document covers schema, permission, route, and action direction only

## Purpose

This document defines the recommended technical design for the first Bug Report / Problem Report slice.

Important distinction:

- this is for **StayOps product/system issues**
- it is not a maintenance/facility workflow
- it is not the staff-suggestions feedback thread

## First-Slice Goal

Deliver:

- member-created bug reports
- reporter-only history
- reviewer triage
- status updates
- optional screenshots

Do not include:

- threaded comments
- public visibility
- advanced assignment
- external ticket sync
- automatic crash analytics ingestion

## Data Model Direction

Use a single primary table first:

```txt
bug_reports
```

No separate comments/events table is required in the first slice.

If timeline/history becomes necessary later, add:

```txt
bug_report_events
```

as a second-step expansion.

## Recommended Table

### `bug_reports`

Purpose:

- one bug/problem report row per submitted issue

Recommended fields:

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
reported_by_user_id uuid not null references profiles(id)
title text not null
description text not null
image_urls text[] not null default '{}'
status text not null default 'submitted' -- submitted | reviewing | fixed | closed
reviewed_by_user_id uuid references profiles(id)
closed_by_user_id uuid references profiles(id)
closed_at timestamptz
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

## Constraints

Recommended checks:

```txt
title trim <> ''
description trim <> ''
array_length(image_urls, 1) <= 5
status in (...)
```

## Storage Direction

Reuse the shared request-image storage pattern.

Recommended path:

```txt
request-images / {organization_id}/bug-reports/{report_id}/{file}
```

Rules:

- max 5 images
- client-side compression before upload
- store public URLs in `image_urls text[]`

## Permission / RLS Direction

### Read

Readable by:

- the report author
- active org reviewers (`owner`, `office_admin`; open question: `cs_staff`)
- active `developer_super_admin`

### Create

Allowed for:

- any active organization member

### Update

Split by action:

- author: may edit/delete own report only while `status = 'submitted'`
- reviewer: may update status inside the organization
- platform admin: full support/debug access

### Delete

Recommended first-slice rule:

- author can hard-delete only while `submitted`
- reviewers can hard-delete only if an explicit admin cleanup policy is approved later

Safer default:

- do **not** allow reviewer hard delete in the first slice

## Server-Action Direction

Recommended first-slice actions:

```txt
createBugReport(formData)
updateBugReport(formData)             -- author, submitted only
deleteBugReport(reportId)             -- author, submitted only
updateBugReportStatus(formData)       -- reviewer only
getMyBugReports(session)
getBugReportDetail(session, id)
getOrgBugReports(session, filters)    -- reviewer only
```

Write-path recommendation:

- reads may use RLS-scoped server client
- writes may use service-role server actions with explicit org/role checks

This is consistent with the current StayOps pattern for sensitive workflow writes.

## Notification Direction

Recommended first-slice notification type:

```txt
bug_report_activity
```

Payload shape recommendation:

```txt
{
  reportId: string,
  reportTitle: string,
  event: "created" | "status_changed",
  status?: "submitted" | "reviewing" | "fixed" | "closed"
}
```

Recipients:

- `created` -> org reviewers
- `status_changed` -> original reporter

Rules:

- self-notification suppressed
- deep link to detail page

## Routes

Recommended first-slice routes:

### Mobile

```txt
/mobile/bug-reports
/mobile/bug-reports/new
/mobile/bug-reports/[id]
/mobile/bug-reports/[id]/edit
```

### Admin

```txt
/admin/bug-reports
/admin/bug-reports/[id]
```

## UI Notes

Reporter-side create form should stay small:

- title
- description
- screenshots

Reviewer detail should emphasize:

- status
- screenshots
- raw report content

## Implementation Order

Recommended order:

1. Product doc confirmed
2. Technical design confirmed
3. Migration + TS types
4. Mobile create + my-list + my-detail
5. Admin review list + detail + status action
6. Notifications
7. QA + doc sync

## Open Questions

- whether reviewer roles include `cs_staff`
- whether route/device/app-version is auto-captured silently in the first slice
- whether admin review lives in `/admin` first, or whether a temporary mobile reviewer flow is acceptable
