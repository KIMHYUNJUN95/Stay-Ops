-- 세션 없는 근태 예외 정정 요청의 근무 날짜 (2026-10-01).
--
-- 예외 요청(session_id is null)은 날짜를 고를 수 없어 늘 「오늘」로 접수됐고, 날짜를 어디에도 남기지
-- 않았다(희망 시각에서 거꾸로 짐작할 뿐 — 시각을 비우면 날짜가 사라진다). 이제 직원이 근무 날짜를 고르고
-- 그 날짜를 여기에 둔다. 세션이 있는 요청은 세션의 operating_date 가 날짜라 비워 둔다.
--
-- 같은 사람의 대기 중 예외 요청 덮어쓰기(supersede)도 target_month 가 아니라 이 날짜로 짝을 짓는다.
-- target_month 는 월 마감 판정이 그대로 쓴다.

alter table public.attendance_correction_requests
  add column if not exists target_date date;

-- 기존 예외 요청: 희망 출근(없으면 퇴근)의 도쿄 날짜로 채운다. 둘 다 없으면 비워 둔다.
update public.attendance_correction_requests
set target_date = coalesce(
  (desired_clock_in_at at time zone 'Asia/Tokyo')::date,
  (desired_clock_out_at at time zone 'Asia/Tokyo')::date
)
where session_id is null
  and target_date is null;

create index if not exists attendance_correction_requests_sessionless_date_idx
  on public.attendance_correction_requests (organization_id, requested_by_user_id, target_date)
  where session_id is null;
