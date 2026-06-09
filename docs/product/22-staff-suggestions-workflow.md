# Staff Suggestions Workflow

Status: Draft

## Purpose

The Staff Suggestions workflow provides a structured place for employees and part-time workers to submit improvement ideas, operational complaints, and workplace feedback.

Main goal:

- Give staff a safer and more structured channel than a free-form board post.

## Recommended Product Direction

This module should be treated as a suggestion box or feedback box, not as a normal discussion board.

Recommended distinction:

- Internal Board = casual team posting
- Staff Suggestions = structured feedback and improvement submission

## Why This Module Exists

The company needs a place for:

- process improvement suggestions
- operational pain points
- workplace feedback
- complaints or requests that should be reviewed

Some of these should be public to the team.
Some should not.

## Visibility Modes

Recommended first version:

### Public Team

Visible to:

- all active organization members

Use when:

- the suggestion is safe to share broadly
- the team can openly discuss it

### Employee Only

Visible to:

- author
- Owner
- Office Admin
- CS Staff
- Field Manager
- Staff
- Developer / Super Admin

Not visible to:

- other Part-time Staff

Use when:

- the post should not be broadly visible among all workers
- the author wants restricted internal visibility

## Future Visibility Option

Recommended later addition if needed:

### Management Only

Visible only to:

- author
- Owner
- Office Admin
- Developer / Super Admin

This is useful if the company later wants a narrower confidential route.

## Users

All active users should be allowed to submit suggestions.

This includes:

- Staff
- Part-time Staff
- Field Manager
- CS Staff
- Office Admin
- Owner

## Core Fields

Recommended baseline:

```txt
id
organization_id
created_by_user_id
title
body
category
visibility
status
property_id or property_name
response_note
created_at
updated_at
resolved_at
```

## Suggested Categories

Recommended first categories:

- operations
- workplace
- tools_system
- staffing
- safety
- property_specific
- other

## Suggested Statuses

Recommended first statuses:

- submitted
- reviewing
- planned
- resolved
- closed

## Workflow

Baseline flow:

```txt
User opens suggestion box
Writes suggestion
Chooses visibility
Optional category / property tag
Save
Authorized viewers can read it
Management updates status / response
Author tracks the result
```

## Mobile Views

Recommended mobile baseline:

- suggestion list
- create form
- detail page

Important mobile rule:

- visibility choice must be very clear before save

## Admin Views

Recommended admin baseline:

- review queue
- detail page
- response/status update controls

Useful admin filters:

- status
- visibility
- category
- property
- author

## Permissions

Recommended rules:

- All active users can create suggestions.
- Users can always read their own suggestions.
- `public_team` suggestions are readable by all active members in the organization.
- `employee_only` suggestions are readable only by the allowed employee audience and the author.
- Authorized management roles can update status and response.

## Important Product Recommendation

Do not start with anonymous posting in the first slice.

Reason:

- it makes follow-up harder
- it complicates abuse handling
- it complicates permissions and trust

If stronger confidentiality becomes necessary later, add:

- management-only visibility
- anonymous-to-peers but visible-to-management mode

## Suggested First MVP Slice

1. create suggestion
2. visibility-aware list
3. detail page
4. status update / response note

## Open Questions

- Should employee-only also include all Staff roles, or only management-capable roles?
- Should the author be allowed to edit/delete after review begins?
- Should public suggestions allow comments later?
- Is a separate harassment/escalation route needed outside this module?
