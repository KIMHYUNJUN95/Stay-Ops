-- ── 근태 정정 요청 취소(철회) ────────────────────────────────────────────────────
-- 2026-08-03.
--
-- 지금까지 직원은 한 번 낸 정정 요청을 **거둘 방법이 없었다.** 잘못 낸 요청은 관리자가
-- 반려해 주기 전까지 대기 큐에 남았고, `getFinalizationEligibility` 가 `requested|in_review`
-- 를 전부 세므로 그 달의 근태 마감까지 막았다.
--
-- 재제출은 2026-08-03 에 "기존 pending 을 갱신(supersede)" 하도록 바뀌어 중복은 더 이상 쌓이지
-- 않지만, **낸 요청을 없던 것으로 되돌리는 경로**는 여전히 없다. 이 마이그레이션이 그 상태를 연다.
--
-- 왜 하드 삭제가 아니라 상태인가: 관리자가 이미 검토를 시작했을 수 있고(`in_review`), 마감
-- 판정과 감사 흐름이 요청 이력을 근거로 삼는다. 연차 요청(`annual_leave_requests`)도 같은
-- 이유로 `cancelled` 상태 + `cancelled_at` 을 쓴다 — 그 선례를 따른다.
--
-- 취소는 **요청자 본인만**, **아직 처리되지 않은 요청(`requested` / `in_review`)에 대해서만**
-- 가능하다. 그 강제는 서버 액션에서 한다(service-role 쓰기라 RLS 가 막지 않는다).
alter table public.attendance_correction_requests
  drop constraint if exists attendance_correction_requests_status_check;

alter table public.attendance_correction_requests
  add constraint attendance_correction_requests_status_check
  check (status in ('requested', 'in_review', 'approved', 'rejected', 'cancelled'));

-- 취소 시각. 행위자는 항상 `requested_by_user_id`(본인만 취소 가능)이라 별도 컬럼을 두지 않는다.
alter table public.attendance_correction_requests
  add column if not exists cancelled_at timestamptz;

comment on column public.attendance_correction_requests.cancelled_at is
  '요청자가 스스로 철회한 시각. status = ''cancelled'' 일 때만 채워진다. 행위자는 requested_by_user_id.';

-- 마감 판정(`getFinalizationEligibility`)과 대기 큐는 `requested|in_review` 만 세므로,
-- `cancelled` 는 자동으로 두 곳 모두에서 빠진다. 별도 인덱스는 필요 없다.
