# Bug Report / Problem Report Workflow

Status: Draft planning started (2026-06-25)

Design note:

- UI/UX design will be prepared by the user and handed off later.
- This document defines product behavior and scope only.

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

The first slice should be intentionally simple:

- any active member can report a product problem quickly
- the reporter can track the current status of their own report
- office/admin reviewers can triage and close the report
- the workflow should behave like a lightweight internal ticket, not a full helpdesk
- the create form should ask only for the minimum information needed

## First-Slice Goal

Deliver a first version where:

- all active members including `part_time_staff` can submit a bug report
- the report is private to the reporter and designated reviewers
- reviewers can change status
- the reporter receives status-change visibility without needing a comment thread
- the create form contains only `title`, `description`, and optional `photos`

Not included in the first slice:

- public discussion
- threaded comments
- crash-log ingestion
- external customer support
- browser-console dump upload
- SLA / assignee workflow
- duplicate merge tools
- category
- severity
- separate reproduction / expected / actual fields

## Users

### Reporter

- any active organization member
- `part_time_staff` included

Can:

- create a report
- read their own reports
- edit or delete their own report only while status is `submitted`

Cannot:

- read other users' reports
- change status after submit

### Reviewers

Recommended first-slice reviewers:

- `owner`
- `office_admin`
- `developer_super_admin` (cross-org support/debug)

Can:

- read all reports in the organization
- change status

Open question:

- should `cs_staff` or `field_manager` also be included as org-level reviewers?

## Visibility Model

Readable by:

- report author
- organization reviewers
- active `developer_super_admin`

Not readable by:

- other ordinary members in the organization

Important rule:

- this is a **private operational issue log**, not a team board

## Core Flow

```txt
Member finds a StayOps problem
-> submits a bug report
-> reviewer checks and triages it
-> reviewer changes status
-> reporter checks the result
```

## Entry Points

Recommended first-slice entry points:

- mobile app dedicated bug-report menu entry
- optional account/help entry
- admin web review list for reviewers

Open question:

- should the first entry live under side menu only, or also under `/account` help/support?

## Main Fields

Recommended first-slice fields:

```txt
id
organization_id
reported_by_user_id
title
description
image_urls
status
reviewed_by_user_id
closed_by_user_id
created_at
updated_at
closed_at
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

Implementation direction:

- reuse the shared request-image upload/compression policy

## Reviewer Actions

Reviewer-side first slice should also stay simple.

Allowed:

- read all reports in the organization
- change status

Deferred:

- reviewer comments
- internal threaded discussion
- structured triage note fields

## Statuses

Recommended first-slice statuses:

- `submitted`
- `reviewing`
- `fixed`
- `closed`

Meaning:

- `submitted`: newly reported and not yet triaged
- `reviewing`: reviewer is checking or reproducing it
- `fixed`: issue is considered resolved
- `closed`: duplicate / invalid / cannot reproduce / obsolete

Status rules:

- new report always starts as `submitted`
- only reviewers can change status
- reporter cannot reopen or reassign in the first slice

## Notifications

Recommended first-slice notifications:

### New Report

When a new bug report is created:

- designated reviewers receive an in-app notification

### Status Changed

When a reviewer changes status:

- the reporter receives an in-app notification

Recommended baseline:

- suppress self-notifications for the acting user

Deferred:

- push notifications
- comment/reply notifications
- assignee notifications

## Mobile / Admin Surface Direction

### Mobile

First-slice mobile surface should prioritize:

- fast create
- my reports list
- my report detail/status view

### Admin Web

First-slice reviewer surface should prioritize:

- org-wide list
- filter by status
- detail view
- status change

## Recommended Minimal UI

### Reporter-side

- `내 신고` list
- `신고하기` create form
- detail screen with current status

### Reviewer-side

- all reports list
- detail screen
- status change action

## Out Of Scope

Do not include in the first slice:

- multi-assignee workflow
- threaded internal discussion
- Jira/GitHub sync
- public release-note linkage
- automatic error log ingestion
- app-version/device auto-capture as a hard requirement
- category/severity-based triage UI

## Open Questions

- Should reviewer scope be only `owner` + `office_admin`, or include `cs_staff` too?
- Should device/browser/app-version or current route be auto-captured silently in the first slice, or added later?
- Should `fixed` and `closed` both stay visible to the reporter forever, or should older closed items auto-archive later?
