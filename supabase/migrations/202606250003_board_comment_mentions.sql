-- Board comment @mentions.
--
-- Adds two columns to board_comments so a comment can target specific users (@user)
-- and/or the whole organization (@ALL). The text body stays plain — the IDs/flag below
-- are the authoritative source for permission checks and notification fan-out.
--
-- - mentioned_user_ids: array of organization member ids the comment targets.
--   Empty array == no per-user mention. Server-side validation rejects ids that
--   are not active members of the same org (silent drop, not insert failure).
-- - mention_all: when true, the @ALL rule wins — per-user mentions are ignored
--   for notification fan-out (the server addresses every active member instead).
--
-- A GIN index makes "comments that mention user X" lookups fast (used by
-- mention-related notification + inbox queries).
--
-- See docs/product/23-board-workflow.md §3.3 and §9 (@멘션 기능).

alter table board_comments
  add column mentioned_user_ids uuid[] not null default '{}',
  add column mention_all boolean not null default false;

create index board_comments_mentions_idx
  on board_comments using gin (mentioned_user_ids);
