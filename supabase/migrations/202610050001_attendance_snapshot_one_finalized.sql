-- 근태 월 마감 — 사람 · 달마다 finalized 스냅샷은 하나 (2026-10-05).
--
-- 문서: docs/product/21-attendance-payroll-workflow.md → 월 마감 · docs/engineering/04-data-model.md
--
-- 두 관리자가 같은 사람 · 같은 달을 동시에 마감하면 둘 다 insert 된 뒤 서로를 superseded 로 바꿔 마감본이 하나도
-- 안 남을 수 있었다. 마감 가능 판정(getFinalizationEligibility)이 이미 「마감된 달은 다시 열어야 마감」을 요구하므로
-- 정상 흐름에서 finalized 는 늘 하나다 — 그것을 DB 가 보장한다. 두 번째 insert 는 23505 로 떨어지고 서버 액션이
-- 「이미 마감됨」으로 돌려준다. (적용 전 중복 0건 확인, 2026-10-05.)
create unique index if not exists attendance_month_snapshots_one_finalized
  on public.attendance_month_snapshots (organization_id, user_id, target_month)
  where status = 'finalized';
