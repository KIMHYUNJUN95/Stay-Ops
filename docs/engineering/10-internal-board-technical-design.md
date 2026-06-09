# Internal Board Technical Design

Status: Draft

## Purpose

This document defines the recommended technical design for the Internal Board workflow.

## First-Slice Goal

Deliver:

- board feed
- create post
- detail
- own-post edit/delete
- admin moderation

## Recommended Table

### `board_posts`

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
created_by_user_id uuid not null references profiles(id)
title text not null
body text not null
category text
image_urls text[] not null default '{}'
is_pinned boolean not null default false
archived_at timestamptz
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

## Query Direction

Default feed order:

1. pinned first
2. newest first

Baseline filters:

- category
- author
- archived/not archived

## RLS Direction

- read: all active org members
- insert: all active org members
- update/delete:
  - author can update/delete own post
  - admin-capable roles can moderate all posts

## Server Actions / Routes

Recommended actions:

- `createBoardPost`
- `updateBoardPost`
- `deleteBoardPost`
- `toggleBoardPostPinned`
- `archiveBoardPost`

## Images

Recommended choice:

- reuse existing direct-upload pattern and validation

## Deferred Tables

Possible later additions:

- `board_post_comments`
- `board_post_reactions`

Do not add them before the baseline feed is proven useful.
