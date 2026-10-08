-- 자동화 1분 틱 — 시스템 경보 점검을 위해 10분마다 한 번은 깨운다 (2026-10-08)
--
-- 도메인 계약: docs/product/36-automation-control.md → 「시스템 경보」
--
-- `automation_tick_if_needed()` 는 할 일이 있을 때만 `/api/automation/tick` 을 부른다(정시 발송 · 이벤트 알림). 시스템 경보
-- (Beds24 웹훅 끊김 · 예약 맞추기 멈춤 · 가격 반영 실패 등)는 「할 일」이 아니라 「점검」이라, 켜진 자동화가 하나라도 있으면
-- **10분마다(분이 0 · 10 · 20 …) 한 번** 깨운다. 라우트도 같은 분에만 점검한다(`runner.ts` HEALTH_EVERY_MINUTES).
-- 나머지 동작은 202610060003 과 같다.

create or replace function public.automation_tick_if_needed()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_token text;
begin
  if exists (
    select 1 from public.beds24_sync_locks
     where name = 'automation_tick' and expires_at > now()
  ) then
    return 'busy';
  end if;

  if not exists (
    select 1 from public.automation_jobs j
     where j.enabled and j.next_wake_at is not null and j.next_wake_at <= now()
  ) and not exists (
    select 1 from public.automation_jobs j
     where j.enabled
       and j.job_key in ('cancel_alert', 'same_day_alert')
       and exists (
         select 1 from public.reservations r
          where r.organization_id = j.organization_id
            and r.updated_at > coalesce(j.event_cursor, now())
       )
  ) and not (
    extract(minute from now())::int % 10 = 0
    and exists (select 1 from public.automation_jobs j where j.enabled)
  ) then
    return 'idle';
  end if;

  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'automation_tick_url' limit 1;
  select decrypted_secret into v_token
    from vault.decrypted_secrets where name = 'automation_tick_token' limit 1;
  if v_url is null or v_token is null then
    return 'not_configured';
  end if;

  perform net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_token
    ),
    timeout_milliseconds := 60000
  );
  return 'fired';
end;
$$;

revoke all on function public.automation_tick_if_needed() from public, anon, authenticated;
grant execute on function public.automation_tick_if_needed() to service_role;
