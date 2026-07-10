-- Keep exactly one current finalized payroll snapshot per org/user/month.
-- Older finalized duplicates, if any were created by concurrent finalization,
-- are preserved as superseded history before the unique index is added.

with ranked as (
  select
    id,
    row_number() over (
      partition by organization_id, user_id, target_month
      order by created_at desc, id desc
    ) as rn
  from public.attendance_month_snapshots
  where status = 'finalized'
)
update public.attendance_month_snapshots s
set status = 'superseded'
from ranked r
where s.id = r.id
  and r.rn > 1;

create unique index if not exists attendance_month_snapshots_one_finalized_idx
  on public.attendance_month_snapshots(organization_id, user_id, target_month)
  where status = 'finalized';
