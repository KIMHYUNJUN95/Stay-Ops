-- Work-directive marker. A directive is a task a manager (author) pushes to a target member:
-- author = 지시자, participant = 대상(수행자). Distinguishes directives from peer shares, and lets the
-- sender's own views exclude sent directives (they live in the target's schedule + the 지시 tab).
-- "누가 지시했는지" = created_by_user_id; no extra column needed.
alter table public.tasks add column if not exists is_directive boolean not null default false;
comment on column public.tasks.is_directive is 'Manager work-directive marker. author=지시자, participant=대상. Sent directives are excluded from the sender own views (admin Todoist console).';
