-- Attendance allowance — replace the free reason field with a payroll CATEGORY (2026-07-10)
--
-- The "사유(reason)" field is repurposed into a category that decides which payroll column the amount
-- lands in: 'regular' (추가수당) or 'special' (특별수당). Base wage and transport stay separate. The
-- calculation method still lives in `allowance_type` (daily_fixed / hourly_extra).

alter table public.attendance_pay_allowances
  drop constraint if exists attendance_pay_allowances_reason_check;

alter table public.attendance_pay_allowances
  rename column reason_type to category;

-- No production rows expected yet; normalize any stragglers before applying the stricter check.
update public.attendance_pay_allowances
  set category = 'regular'
  where category is null or category not in ('regular', 'special');

alter table public.attendance_pay_allowances
  alter column category set default 'regular';

alter table public.attendance_pay_allowances
  add constraint attendance_pay_allowances_category_check
  check (category in ('regular', 'special'));
