-- Staff Suggestions — status-change history.
--
-- Records each status change as an event so the detail thread (comment sheet) can show inline log
-- entries like "○○ changed status to reviewing", interleaved with comments by time. Kept in its own
-- table (not in staff_suggestion_comments) so comment counts on the list/detail are unaffected.
--
-- Read access mirrors comments: any participant of the suggestion (author / recipient / referenced)
-- via the existing `public.can_view_staff_suggestion()` helper. Inserts are done by the server action
-- through the service role, so no insert policy for `authenticated` is required.

create table public.staff_suggestion_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  suggestion_id uuid not null references public.staff_suggestions(id) on delete cascade,
  actor_user_id uuid references public.profiles(id) on delete set null,
  status text not null,
  created_at timestamptz not null default now()
);

create index staff_suggestion_events_suggestion_idx
  on public.staff_suggestion_events (suggestion_id, created_at);

alter table public.staff_suggestion_events enable row level security;

create policy "participants can read staff suggestion events"
on public.staff_suggestion_events
for select
using (
  auth.uid() is not null
  and (public.is_platform_admin() or public.can_view_staff_suggestion(suggestion_id))
);

grant select on public.staff_suggestion_events to authenticated;
grant all on public.staff_suggestion_events to service_role;
