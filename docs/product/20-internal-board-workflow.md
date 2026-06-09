# Internal Board Workflow

Status: Draft

## Purpose

The Internal Board is a shared communication space for normal team posts that are less formal than announcements and less structured than tasks.

Main goal:

- Give all users a place to post internal updates, notes, and everyday communication.

## Why This Module Exists

The Board should cover posts that are not a good fit for:

- Announcements
- Todo / Task
- Suggestions / Feedback

Examples:

- a general operational note
- a building-specific heads-up
- a temporary internal reminder
- a light team communication post

## Difference From Announcements

Announcement:

- more formal
- targeted
- may require read tracking
- may use popup behavior
- usually created by limited roles

Internal Board:

- lighter, everyday posting
- no required read tracking in MVP
- no popup behavior in MVP
- all active users can create posts in the baseline direction

If users are expected to confirm reading, use Announcements, not Board.

## Users

Primary users:

- all active organization members

Rule:

- everyone can create and read board posts in the first design direction

## Core Fields

Recommended baseline:

```txt
id
organization_id
created_by_user_id
title
body
image_urls
category
is_pinned
archived_at
created_at
updated_at
```

## Field Meaning

### Title

Required.

Short enough for list scanning.

### Body

Required.

Free text.

### Images

Optional.

The Board can reuse the existing image upload approach already used in requests and announcements.

### Category

Optional in the first slice.

Recommended initial categories:

- general
- property_note
- handover
- incident
- other

### Pinned

Optional admin-level control.

Pinned posts remain near the top of the list.

## Workflow

Baseline flow:

```txt
User opens board
Reads existing posts
Creates a new post
Optional image attachment
Save
Post appears in board feed
```

## Mobile Views

Recommended mobile baseline:

- board feed
- create post
- board detail

Important mobile rules:

- keep the feed fast and readable
- do not turn the first version into a social app

## Admin Views

Recommended admin baseline:

- board feed
- detail page
- moderation controls

Moderation controls can include:

- pin
- archive
- delete

## Permissions

Recommended first rules:

- All active users can create posts.
- All active users can read posts in their organization.
- Users can edit/delete their own posts.
- Admin-capable roles can moderate all posts.

## Deferred Features

Good later additions:

- comments
- reactions
- search
- role/property filtering
- archive views

## Suggested First MVP Slice

Build in this order:

1. feed
2. create
3. detail
4. own-post edit/delete
5. admin moderation

## Open Questions

- Should comments exist in v1 or later?
- Should posts support role/property visibility targeting later?
- Should part-time staff also be allowed to create posts in the first live version?
