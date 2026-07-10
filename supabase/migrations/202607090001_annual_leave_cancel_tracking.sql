-- Track who cancelled a leave request and why, so an admin "승인 취소"(revoke) and an employee
-- self-cancel both show a processor + reason in the 이력(승인 장부). Mirrors the reject columns.
alter table public.annual_leave_requests
  add column if not exists cancelled_by_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists cancelled_reason text;
