# Bug Report / Problem Report Workflow

Status: 1차 구현 (2026-06-25)

Design note:

- 디자인 1차 구현 완료, 모바일 3개 화면 (목록/작성/상세).
- 수정 페이지 (`/mobile/bugs/[id]/edit`) 는 1차 deferred — 상세 페이지의 "수정" 버튼 1차 숨김.

## Purpose

The Bug Report / Problem Report workflow is for reporting issues found while using **StayOps itself**.

This module is for:

- app bugs
- broken flows
- wrong data shown in the UI
- permission/access problems
- notification mistakes
- severe slowness or repeated failure in one screen

This module is **not** for:

- property/facility issues inside a building
- cleaning quality issues in one room
- supply ordering
- general staff suggestions or opinions

Separation:

- `Maintenance` = real-world property/facility issue
- `Staff Suggestions` = structured internal feedback to a person
- `Bug Report` = StayOps product/system issue

Confirmed scope note:

- this module is specifically for **StayOps app bugs and product issues**
- it is not a general "problem report" bucket for field operations

## Core Product Direction

The first slice is intentionally simple:

- any active member can report a product problem quickly
- the reporter can track the current status of their own report
- office/admin reviewers can triage and close the report
- the workflow should behave like a lightweight internal ticket, not a full helpdesk
- the create form asks only for the minimum information needed

## First-Slice Goal

Delivered in 1차 구현:

- all active members including `part_time_staff` can submit a bug report
- the report is private to the reporter and designated reviewers
- reviewers can change status from the detail screen via a status BottomSheet
- the reporter receives status-change visibility without needing a comment thread
- the create form contains only `title`, `description`, and optional `photos`
- empty state shown when the list is empty
- after creating a report the user is redirected to `/mobile/bugs`

### 1차 deferred

- edit page `/mobile/bugs/[id]/edit` — design not finalized; "수정" button hidden on detail screen in first slice
- admin web reviewer page (`/admin/bug-reports`) — reviewers handle all triage via mobile
- `cs_staff` / `developer_super_admin` as reviewers — open question, deferred
- threaded comments
- categories
- severity
- SLA / assignee workflow

## Routes

### Mobile (1차 구현)

```txt
/mobile/bugs          -- list (mine / all-org for reviewers)
/mobile/bugs/new      -- create form
/mobile/bugs/[id]     -- detail + reviewer status change BottomSheet
```

Note: the route is `/mobile/bugs`, **not** `/mobile/bug-reports` (changed per design decision 2026-06-25).

### 1차 deferred routes

```txt
/mobile/bugs/[id]/edit   -- edit page (design not finalized; 1차 deferred)
/admin/bug-reports        -- admin web reviewer page (1차 deferred)
```

## Users

### Reporter

- any active organization member
- `part_time_staff` included

Can:

- create a report
- read their own reports
- delete their own report only while status is `submitted`

Cannot:

- read other users' reports
- change status after submit
- edit their report (edit button hidden in 1차; available only while `submitted` when the edit page ships)

### Reviewers (1차 확정)

First-slice reviewers:

- `owner`
- `office_admin`

Can:

- read all reports in the organization
- change status (via BottomSheet on the detail screen)

Open question (deferred):

- should `cs_staff` or `developer_super_admin` also be included as org-level reviewers?

## Visibility Model

Readable by:

- report author
- organization reviewers (`owner`, `office_admin`)

Not readable by:

- other ordinary members in the organization

Important rule:

- this is a **private operational issue log**, not a team board

## Core Flow

```txt
Member finds a StayOps problem
-> submits a bug report (/mobile/bugs/new)
-> redirected to /mobile/bugs list
-> reviewer checks and triages via detail screen
-> reviewer taps status row → status BottomSheet → selects new status
-> reporter checks the result (status visible on detail)
```

## Entry Points

- mobile side menu → "버그 신고" (`/mobile/bugs`)
- optional: account/help entry (deferred)

## Main Fields

```txt
id                    uuid primary key
organization_id       uuid not null references organizations(id)
reported_by_user_id   uuid not null references profiles(id)
title                 text not null
description           text not null
image_urls            text[] not null default '{}'  -- max 5
status                text not null default 'submitted'
reviewed_by_user_id   uuid references profiles(id)
closed_by_user_id     uuid references profiles(id)
closed_at             timestamptz
created_at            timestamptz not null
updated_at            timestamptz not null
```

## Creation Fields

### Title

Required.

Short summary of the issue.

Examples:

- "출근 QR 스캔 후 로딩이 끝나지 않음"
- "알림 벨 unread 숫자가 줄지 않음"

### Description

Required.

Free-text explanation of what happened.

### Screenshots / Photos

Optional but strongly recommended.

Limit:

- maximum 5 images

Implementation:

- reuses the shared `request-images` bucket upload/compression policy
- path: `{organization_id}/bug-reports/{report_id}/{filename}`

## Reviewer Actions

Reviewer-side (1차 구현):

- read all reports in the organization (list shows all when viewer is reviewer)
- change status via BottomSheet on the detail screen (status row tap)

Deferred:

- reviewer comments
- internal threaded discussion
- structured triage note fields

## Statuses

```txt
submitted   -- newly reported and not yet triaged
reviewing   -- reviewer is checking or reproducing it
fixed       -- issue is considered resolved
closed      -- duplicate / invalid / cannot reproduce / obsolete
```

Status rules:

- new report always starts as `submitted`
- only reviewers can change status
- reporter cannot reopen or reassign in the first slice
- author can hard-delete only while `submitted`

## Notifications

### New Report

When a new bug report is created:

- type: `bug_report_activity`
- event: `created`
- recipients: designated reviewers (`owner`, `office_admin`) in the same org
- suppresses self-notification

### Status Changed

When a reviewer changes status:

- type: `bug_report_activity`
- event: `status_changed`
- recipient: original reporter (actor suppressed)

Deferred:

- push notifications
- comment/reply notifications
- assignee notifications

## Mobile Surface

1차 구현 screens:

- `/mobile/bugs` — list (my reports; all-org list for reviewers)
- `/mobile/bugs/new` — create form (title + description + screenshots)
- `/mobile/bugs/[id]` — detail (status KV row → BottomSheet for reviewer status change; delete for author while submitted; edit button hidden in 1차)

Empty state:

- shown when list is empty
- title: "아직 신고가 없어요"
- subtitle: "버그를 발견하면 알려주세요"

## Admin Web Surface

1차 deferred.

Reviewers handle all triage via the mobile list/detail screens.

## Out Of Scope (1차)

- multi-assignee workflow
- threaded internal discussion
- Jira/GitHub sync
- public release-note linkage
- automatic error log ingestion
- app-version/device auto-capture as a hard requirement
- category/severity-based triage UI
- admin web page for reviewers

## Open Questions

- Should reviewer scope be expanded to include `cs_staff` or `developer_super_admin`? (open, deferred)
- Should device/browser/app-version or current route be auto-captured silently in a later slice?
- Should `fixed` and `closed` both stay visible to the reporter forever, or should older closed items auto-archive later?
