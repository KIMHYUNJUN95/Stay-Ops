-- 게시판 신고 · 사용자 차단 (2026-10-06, 앱 출시 준비 B4).
--
-- 문서: docs/product/23-board-workflow.md → 「신고 · 차단」 · docs/engineering/04-data-model.md
--
-- 사용자 작성 콘텐츠가 있는 앱은 App Store(1.2) · Google Play(UGC) 모두 「부적절한 콘텐츠 신고」와 「사용자 차단」을
-- 요구한다. 신고하면 신고한 사람에게는 그 글 · 댓글이 즉시 숨겨지고, owner · office_admin 이 처리(삭제 / 문제없음)한다.
-- 차단하면 차단한 사람의 게시판에서 상대의 글 · 댓글이 보이지 않는다(상대에게는 알리지 않는다).
--
-- 서버 액션(service-role)만 읽고 쓴다 — RLS 를 켜고 정책은 두지 않는다.

create table if not exists public.board_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('post', 'comment')),
  -- 글 신고면 post_id 만, 댓글 신고면 둘 다(댓글이 속한 글).
  post_id uuid not null references public.board_posts(id) on delete cascade,
  comment_id uuid references public.board_comments(id) on delete cascade,
  -- 신고 당시 작성자(콘텐츠가 지워져도 누가 반복 신고되는지 남긴다).
  target_author_user_id uuid references auth.users(id) on delete set null,
  reason text not null check (reason in ('spam', 'harassment', 'inappropriate', 'privacy', 'other')),
  note text check (note is null or char_length(note) <= 500),
  status text not null default 'pending' check (status in ('pending', 'removed', 'dismissed')),
  resolved_by_user_id uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  check ((target_type = 'post' and comment_id is null) or (target_type = 'comment' and comment_id is not null))
);

-- 같은 사람이 같은 대상을 두 번 신고하지 않는다.
create unique index if not exists board_reports_one_per_reporter_post
  on public.board_reports (reporter_user_id, post_id) where target_type = 'post';
create unique index if not exists board_reports_one_per_reporter_comment
  on public.board_reports (reporter_user_id, comment_id) where target_type = 'comment';
create index if not exists board_reports_pending_idx
  on public.board_reports (organization_id, created_at desc) where status = 'pending';

comment on table public.board_reports is
  '게시판 글 · 댓글 신고. 신고자에게는 즉시 숨김, owner · office_admin 이 처리. service-role 전용.';

create table if not exists public.user_blocks (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  blocker_user_id uuid not null references auth.users(id) on delete cascade,
  blocked_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (organization_id, blocker_user_id, blocked_user_id),
  check (blocker_user_id <> blocked_user_id)
);

comment on table public.user_blocks is
  '사용자 차단 — 차단한 사람의 게시판에서 상대의 글 · 댓글을 숨긴다. service-role 전용.';

alter table public.board_reports enable row level security;
alter table public.user_blocks enable row level security;
revoke all on public.board_reports from anon, authenticated;
revoke all on public.user_blocks from anon, authenticated;
grant all on public.board_reports to service_role;
grant all on public.user_blocks to service_role;
