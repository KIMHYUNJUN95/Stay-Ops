alter table public.cleaning_sessions
alter column cleaning_date set default ((now() at time zone 'Asia/Seoul')::date);

drop index if exists public.cleaning_sessions_one_active_per_user_idx;

create unique index if not exists cleaning_sessions_one_active_per_org_user_idx
on public.cleaning_sessions(organization_id, staff_user_id)
where status = 'in_progress';
