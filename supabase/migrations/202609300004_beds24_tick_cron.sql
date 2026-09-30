-- Beds24 틱 — 쿨다운이 풀리면 1분 안에 이어서 보낸다 (2026-09-30).
--
-- 도메인 계약: docs/product/33-calendar-write-features.md 「쿨다운이 풀리면 1분 안에 이어서 보낸다 ·
-- 미뤄 둔 웹훅 재조회」
-- 설정·토큰 교체: docs/engineering/07-environment-setup.md 「Beds24 틱 (pg_cron + pg_net)」
--
-- ## 왜
--
-- 429·크레딧 부족으로 쿨다운이 켜지면 가격 작업 워커는 작업을 `queued` 로 되돌리고 멈춘다. 그걸
-- 다시 깨우는 것은 판매 캘린더를 누가 열거나, 새 작업이 들어오거나, GitHub Actions 크론뿐이었는데
-- 그 크론은 실측 3~5시간 간격으로 돌았다. 쿨다운은 길어야 5분인데 작업은 몇 시간을 기다렸다.
--
-- ## 어떻게
--
-- pg_cron 이 **매 분** `beds24_tick_if_needed()` 를 부른다. 이 함수는 DB 안에서만 싸게 판단한다 —
-- 쿨다운이 끝났고, 대기 작업이나 미뤄 둔 재조회가 있고, 틱이 이미 돌고 있지 않을 때만
-- `net.http_post` 로 `/api/beds24/tick` 을 부른다. 할 일이 없으면 Vercel 함수는 한 번도 안 뜬다.
--
-- ## 비밀값
--
-- 틱 토큰은 **이 SQL 안에서 난수로 만든다** — 값이 저장소·채팅·로그 어디에도 나오지 않는다.
-- 라우트는 `beds24_tick_token_ok()` 로 대조만 한다. 새 환경변수가 필요 없다.

create extension if not exists pg_net with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ── ① Vault — 토큰(난수)과 호출 주소 ─────────────────────────────────────────
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'beds24_tick_token') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'beds24_tick_token',
      'Bearer token pg_cron sends to /api/beds24/tick. Rotate with vault.update_secret; never print.'
    );
  end if;
  -- 프로덕션 도메인: docs/engineering/07-environment-setup.md (2026-09-09 확인)
  if not exists (select 1 from vault.secrets where name = 'beds24_tick_url') then
    perform vault.create_secret(
      'https://stay-ops-two.vercel.app/api/beds24/tick',
      'beds24_tick_url',
      'Endpoint pg_cron calls when Beds24 queued work can resume.'
    );
  end if;
end;
$$;

-- ── ② 토큰 대조 — 라우트가 서비스 롤로 부른다 ──────────────────────────────────
--
-- 값을 돌려주지 않고 **맞는지만** 돌려준다. 원문끼리 `=` 로 비교하지 않고 SHA-256 다이제스트끼리
-- 비교한다 — 앞 글자가 얼마나 맞았는지에 따라 비교 시간이 달라지는 것을 줄인다.
create or replace function public.beds24_tick_token_ok(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select length(p_token) >= 32
         and extensions.digest(p_token, 'sha256') = extensions.digest(s.decrypted_secret, 'sha256')
        from vault.decrypted_secrets s
       where s.name = 'beds24_tick_token'
       limit 1
    ),
    false
  );
$$;

revoke all on function public.beds24_tick_token_ok(text) from public, anon, authenticated;
grant execute on function public.beds24_tick_token_ok(text) to service_role;

-- ── ③ 부를지 판단하고, 필요할 때만 부른다 ──────────────────────────────────────
--
-- 돌려주는 값은 `cron.job_run_details.return_message` 에 남는다 — 「왜 안 불렀나」를 거기서 본다.
--   'cooldown'        쿨다운 중(`beds24_sync_locks.api_cooldown`)
--   'busy'            틱이 이미 돌고 있다(`beds24_sync_locks.beds24_tick`)
--   'idle'            할 일이 없다
--   'not_configured'  Vault 에 토큰·주소가 없다
--   'fired'           불렀다
--
-- 판단 조건은 앱 쪽 `decideBeds24Tick()` (`src/lib/beds24/tick-plan.ts`) 과 같다. 한쪽을 바꾸면
-- 다른 쪽도 바꾼다. 멈춘 작업 15분 · 재시도 5회는 워커의 `STUCK_JOB_MS` · 틱의
-- `DEFERRED_REFRESH_MAX_ATTEMPTS` 와 같은 값이다.
create or replace function public.beds24_tick_if_needed()
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
     where name = 'api_cooldown' and expires_at > now()
  ) then
    return 'cooldown';
  end if;

  if exists (
    select 1 from public.beds24_sync_locks
     where name = 'beds24_tick' and expires_at > now()
  ) then
    return 'busy';
  end if;

  if not exists (
    select 1 from public.beds24_price_jobs
     where status = 'queued'
        or (status = 'processing' and started_at < now() - interval '15 minutes')
  ) and not exists (
    select 1 from public.beds24_deferred_refreshes where attempts < 5
  ) then
    return 'idle';
  end if;

  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'beds24_tick_url' limit 1;
  select decrypted_secret into v_token
    from vault.decrypted_secrets where name = 'beds24_tick_token' limit 1;
  if v_url is null or v_token is null then
    return 'not_configured';
  end if;

  -- 라우트가 최대 60초 돈다. 응답(JSON 요약)은 `net._http_response` 에 몇 시간 남는다.
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

revoke all on function public.beds24_tick_if_needed() from public, anon, authenticated;
grant execute on function public.beds24_tick_if_needed() to service_role;

-- ── ④ 매 분 ─────────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from cron.job where jobname = 'beds24-tick') then
    perform cron.unschedule('beds24-tick');
  end if;
  perform cron.schedule('beds24-tick', '* * * * *', 'select public.beds24_tick_if_needed()');
end;
$$;
