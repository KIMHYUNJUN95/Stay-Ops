-- 자동화를 **켠 시각** (2026-10-07)
--
-- 도메인 계약: docs/product/36-automation-control.md → 「취소 · 당일예약 — 켠 뒤에 생긴 일만, 실시간」
--
-- 취소 · 당일예약 알림은 켠 시각 **이후에 생긴 일**(취소 시각 · 예약 시각)만 보낸다. 켜기 전 일은 사람이 이미 손으로
-- 알렸다. 2026-10-07 11:30 경 예약 약 12,800건이 한꺼번에 다시 저장되자, 켜기(10:17) 전 24시간 안의 취소 8건 ·
-- 당일예약 1건이 「바뀐 예약」으로 다시 잡혀 늦게 나갔다 — 그것을 막는다.
--
-- 켤 때(꺼짐 → 켜짐)마다 서버 액션이 지금으로 적는다. 이미 켜져 있는 줄은 설정 변경 이력의 마지막 「켬」 시각으로 채운다.

alter table public.automation_jobs add column if not exists enabled_at timestamptz;

comment on column public.automation_jobs.enabled_at is
  '마지막으로 켠 시각. 취소 · 당일예약 알림은 이 시각 이후의 취소 · 예약만 보낸다.';

update public.automation_jobs j
   set enabled_at = coalesce(
     (select max(l.created_at)
        from public.automation_setting_logs l
       where l.organization_id = j.organization_id
         and l.job_key = j.job_key
         and l.changes -> 'enabled' ->> 'after' = 'true'),
     j.updated_at
   )
 where j.enabled
   and j.enabled_at is null;
