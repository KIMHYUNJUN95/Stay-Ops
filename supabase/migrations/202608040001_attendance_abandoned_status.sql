-- ── 근태 미퇴근 방치 상태(`abandoned`) ────────────────────────────────────────────
-- 2026-08-04.
--
-- 지금까지 "출근을 찍고 퇴근을 안 찍은" 세션은 계속 `open` 으로 남았다. 그런데
-- `attendance_sessions_one_open_per_user_idx` 가 **날짜와 무관하게** 사용자당 `open` 을 하나로
-- 제한하고, 출근 액션도 열린 세션이 있으면 무조건 거절한다. 그래서:
--
--   어제 퇴근을 깜빡함 → 오늘 현장에 나와도 **출근을 찍을 수 없음**
--
-- 실제로 2026-07-15 출근 후 미퇴근인 세션이 20일간 그 직원의 모든 출근을 막고 있었다.
-- 기록이 지저분한 것보다 **현장에 나온 사람이 일을 시작하지 못하는 것이 훨씬 나쁘다.**
--
-- 그래서 지난 운영일의 `open` 은 출근 시점에 `abandoned` 로 옮기고 새 출근을 허용한다.
--
-- ## 왜 `clock_out_at` 을 채우지 않는가
--
-- "아마 18시쯤 퇴근했겠지" 로 시각을 추정해 채우면 **그 값이 그대로 급여가 된다.** 근태는 돈이
-- 걸린 기록이라 추측이 들어가면 안 된다. `abandoned` 는 퇴근 시각이 **비어 있는 채로** 남고,
-- 급여 집계는 `clock_in_at`·`clock_out_at` 이 둘 다 있어야만 계산하므로 자동으로 0원 처리된다.
--
-- ## 그래도 방치되지 않는 이유
--
-- 월 마감 판정(`getFinalizationEligibility`)이 `abandoned` 를 미해소 건으로 세기 때문에, 누군가
-- 정리하기 전에는 그 달을 닫을 수 없다. **막을 것은 마감이지 출근이 아니다.**
--
-- 해소 경로는 이미 있는 것을 그대로 쓴다:
--   실제 근무였다 → 직원의 정정 요청 승인, 또는 관리자의 `updateAttendanceSessionAdmin`
--                   (퇴근 시각 입력 + 사유 필수) → 시각이 채워지면 급여에 포함된다
--   안 왔다/테스트  → `invalidateAttendanceSession` (무효 표시, 삭제 아님)
--
-- 유니크 인덱스는 `status = 'open'` 조건이라 `abandoned` 는 걸리지 않는다 — 손대지 않는다.

alter table public.attendance_sessions
  drop constraint if exists attendance_sessions_status_check;

alter table public.attendance_sessions
  add constraint attendance_sessions_status_check
  check (status in ('open', 'completed', 'reopened', 'invalid', 'abandoned'));

-- 자동 전환 시각. 누가 눌러서가 아니라 시스템이 옮긴 것이므로 행위자 컬럼은 두지 않는다.
-- (관리자가 나중에 정리하면 그 이력은 기존 감사 경로에 남는다.)
alter table public.attendance_sessions
  add column if not exists abandoned_at timestamptz;

comment on column public.attendance_sessions.abandoned_at is
  '지난 운영일의 미퇴근 세션이 abandoned 로 자동 전환된 시각. status = ''abandoned'' 일 때만 채워진다. clock_out_at 은 비어 있는 채로 남는다(추측 시각으로 급여를 만들지 않기 위해).';

-- 관리자 콘솔의 "미퇴근" 목록이 조직 단위로 훑는 조회를 받쳐 준다.
create index if not exists attendance_sessions_abandoned_idx
  on public.attendance_sessions (organization_id, operating_date)
  where status = 'abandoned';
