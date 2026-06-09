# Staff Suggestions Technical Design

Status: Draft

## Purpose

This document defines the recommended technical design for the Staff Suggestions workflow.

## First-Slice Goal

Deliver:

- suggestion create flow
- visibility-aware list
- detail page
- management response/status update

## Recommended Tables

### `staff_suggestions`

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
created_by_user_id uuid not null references profiles(id)
title text not null
body text not null
category text
visibility text not null
status text not null default 'submitted'
property_id uuid references properties(id)
property_name text
response_note text
responded_by_user_id uuid references profiles(id)
responded_at timestamptz
resolved_at timestamptz
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Recommended `visibility` values:

```txt
public_team
employee_only
```

Recommended `status` values:

```txt
submitted
reviewing
planned
resolved
closed
```

## Visibility Logic

### `public_team`

- readable by all active org members

### `employee_only`

Readable by:

- author
- employee roles approved by policy

Not readable by:

- unrelated part-time staff

## RLS Direction

This module needs stricter role-aware RLS than the Board.

Recommended baseline:

- insert: all active org members
- select:
  - `public_team` visible to all active org members
  - `employee_only` visible only to:
    - author
    - approved employee audience
    - platform admin bypass
- update:
  - author can edit own row before review if that rule is accepted
  - authorized management roles can update status/response

## Why Separate From Board

The Suggestion Box has:

- structured visibility modes
- structured statuses
- response tracking

These rules would complicate the Board if both features were merged.

## Server Actions / Routes

Recommended actions:

- `createStaffSuggestion`
- `updateStaffSuggestion`
- `deleteStaffSuggestion` if deletion is allowed
- `updateStaffSuggestionStatus`
- `respondToStaffSuggestion`

## Query Direction

Recommended list filters:

- visibility
- status
- category
- property
- author

Recommended surfaces:

- my suggestions
- review queue
- public suggestion feed

## Deferred Extensions

- anonymous mode
- management-only mode
- comments
- voting
- escalation categories
