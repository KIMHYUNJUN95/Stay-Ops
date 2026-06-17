-- Staff Suggestions / Feedback Box — schema foundation (Step 1, schema-first).
-- See docs/product/22-staff-suggestions-workflow.md and
-- docs/engineering/12-staff-suggestions-technical-design.md.
--
-- Model: a participant-scoped feedback thread (NOT a public board, NOT an admin-only queue).
-- Each suggestion has exactly one required recipient, optional referenced users, and a comment
-- thread. It is visible only to the author, the recipient, the referenced users (and platform
-- admins). Only the recipient owns status; `on_hold` needs a hold reason and `completed` needs a
-- completion note.
--
-- Write boundary: all mutations go through service-role server actions in later steps. RLS below
-- governs direct authenticated READS only (no write policies → direct authenticated writes are
-- denied; service_role bypasses RLS). This migration adds no server actions and no notifications.

-- ── staff_suggestions ─────────────────────────────────────────────────────────
create table public.staff_suggestions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  recipient_user_id uuid not null references public.profiles(id) on delete restrict,
  title text not null,
  body text not null,
  category text,
  status text not null default 'submitted',
  hold_reason text,
  completion_note text,
  property_id uuid references public.properties(id) on delete set null,
  property_name text,
  room_id uuid references public.rooms(id) on delete set null,
  room_label text,
  image_urls text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('submitted', 'reviewing', 'on_hold', 'completed')),
  check (char_length(trim(title)) > 0),
  check (char_length(trim(body)) > 0),
  -- A suggestion cannot be addressed to its own author.
  check (recipient_user_id <> created_by_user_id),
  -- Main suggestion photos: max 5 (also re-applied server-side).
  check (coalesce(array_length(image_urls, 1), 0) <= 5),
  -- on_hold requires a hold reason; completed requires a completion note.
  check (status <> 'on_hold' or char_length(trim(coalesce(hold_reason, ''))) > 0),
  check (status <> 'completed' or char_length(trim(coalesce(completion_note, ''))) > 0)
);

create trigger staff_suggestions_set_updated_at
before update on public.staff_suggestions
for each row execute function public.set_updated_at();

-- Sent list (author), Received list (recipient), status filtering, context filtering.
create index staff_suggestions_sent_idx
  on public.staff_suggestions(organization_id, created_by_user_id, created_at desc);
create index staff_suggestions_received_idx
  on public.staff_suggestions(organization_id, recipient_user_id, created_at desc);
create index staff_suggestions_status_idx
  on public.staff_suggestions(organization_id, status, created_at desc);
create index staff_suggestions_property_idx
  on public.staff_suggestions(organization_id, property_id, created_at desc)
  where property_id is not null;

-- ── staff_suggestion_references ───────────────────────────────────────────────
-- One row per referenced (cc'd) user. Referenced users are visibility-sharing participants only —
-- they are not status owners. Author/recipient duplication is excluded server-side at write time.
create table public.staff_suggestion_references (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  suggestion_id uuid not null references public.staff_suggestions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (suggestion_id, user_id)
);

create index staff_suggestion_references_suggestion_idx
  on public.staff_suggestion_references(suggestion_id);
-- Referenced list for the current user.
create index staff_suggestion_references_user_idx
  on public.staff_suggestion_references(organization_id, user_id, created_at desc);

-- ── staff_suggestion_comments ─────────────────────────────────────────────────
create table public.staff_suggestion_comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  suggestion_id uuid not null references public.staff_suggestions(id) on delete cascade,
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  body text,
  image_urls text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Comment photos: max 5 (also re-applied server-side).
  check (coalesce(array_length(image_urls, 1), 0) <= 5),
  -- A comment may be text-only, image-only, or both, but not fully empty.
  check (
    char_length(trim(coalesce(body, ''))) > 0
    or coalesce(array_length(image_urls, 1), 0) > 0
  )
);

create trigger staff_suggestion_comments_set_updated_at
before update on public.staff_suggestion_comments
for each row execute function public.set_updated_at();

-- Comment thread loading (oldest first).
create index staff_suggestion_comments_thread_idx
  on public.staff_suggestion_comments(suggestion_id, created_at asc);

-- ── Visibility helper (created after the tables it reads) ──────────────────────
-- SECURITY DEFINER so it bypasses RLS and never recurses through the policies below. A suggestion
-- is visible to its author, its recipient, and any referenced user.
create or replace function public.can_view_staff_suggestion(target_suggestion_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_suggestions s
    where s.id = target_suggestion_id
      and (s.created_by_user_id = auth.uid() or s.recipient_user_id = auth.uid())
  )
  or exists (
    select 1
    from public.staff_suggestion_references r
    where r.suggestion_id = target_suggestion_id
      and r.user_id = auth.uid()
  );
$$;

-- ── staff_suggestions RLS ─────────────────────────────────────────────────────
alter table public.staff_suggestions enable row level security;

create policy "participants can read staff suggestions"
on public.staff_suggestions
for select
using (
  auth.uid() is not null
  and (public.is_platform_admin() or public.can_view_staff_suggestion(id))
);
-- Writes (create / author-edit while submitted / recipient status update / delete) are mediated by
-- service-role server actions in later steps.

grant select, insert, update, delete on public.staff_suggestions to authenticated;
grant all on public.staff_suggestions to service_role;

-- ── staff_suggestion_references RLS ───────────────────────────────────────────
alter table public.staff_suggestion_references enable row level security;

create policy "participants can read staff suggestion references"
on public.staff_suggestion_references
for select
using (
  auth.uid() is not null
  and (public.is_platform_admin() or public.can_view_staff_suggestion(suggestion_id))
);

grant select, insert, update, delete on public.staff_suggestion_references to authenticated;
grant all on public.staff_suggestion_references to service_role;

-- ── staff_suggestion_comments RLS ─────────────────────────────────────────────
alter table public.staff_suggestion_comments enable row level security;

create policy "participants can read staff suggestion comments"
on public.staff_suggestion_comments
for select
using (
  auth.uid() is not null
  and (public.is_platform_admin() or public.can_view_staff_suggestion(suggestion_id))
);

grant select, insert, update, delete on public.staff_suggestion_comments to authenticated;
grant all on public.staff_suggestion_comments to service_role;
