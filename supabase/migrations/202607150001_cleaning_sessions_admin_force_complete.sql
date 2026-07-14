-- Admin cleaning console: 관리자 대리 완료 (force-complete) support.
-- See docs/product/07-cleaning-workflow.md → "2026-07-13 어드민 청소 대시보드 — 재기획" → 강제완료.
--
-- No RLS policy change: the force-complete server action writes via the service-role client
-- (bypasses RLS) after an app-level role check, matching the existing attendance admin-action
-- pattern (isAttendancePayrollAdmin + getSupabaseServiceClient in src/app/admin/attendance/actions.ts).

alter table public.cleaning_sessions
  add column completed_by_admin uuid references public.profiles(id) on delete set null;

create index cleaning_sessions_completed_by_admin_idx
  on public.cleaning_sessions(completed_by_admin)
  where completed_by_admin is not null;

comment on column public.cleaning_sessions.completed_by_admin is
  '관리자가 담당자를 대신해 강제완료 처리한 경우의 관리자 user id. 일반(직원 본인) 완료는 null.';
