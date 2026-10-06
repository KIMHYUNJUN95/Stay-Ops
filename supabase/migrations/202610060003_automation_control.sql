-- 자동화 관제실 — Slack 자동화(일일 운영 리포트 · 청소/셋팅 명단 · 취소 · 당일예약 · 실패 알림) (2026-10-06).
--
-- 도메인 계약: docs/product/36-automation-control.md
--             docs/engineering/04-data-model.md → 「자동화」
--             docs/engineering/05-rls-permissions.md → 「2026-10-06 자동화 — 보기 ops_admin.access / 쓰기 automation.manage」
--             docs/engineering/07-environment-setup.md → 「자동화 틱 · Slack 채널」
--
-- STAY ARI Manager 의 Slack 자동화(functions/modules/slackReports.js · cancelAlert.js · sameDayBookingAlert.js)를
-- 옮긴다. 저쪽은 시각이 코드(`onSchedule`)에 박혀 있었고, 발송 여부가 Firestore 스냅샷에만 남았다. 여기서는
--   ① 자동화마다 발송 토글 · 시각 · 요일 · 재시도 마감을 **표에** 두고(대시보드에서 바꾼다),
--   ② 받는 곳(Slack 채널) × 언어마다 한 통씩 보내고,
--   ③ 한 번 실행 = 한 줄로 실행 기록을 남긴다(원문 · 결과 · 건너뛴 사유).
--
-- 실행은 1분 틱이다 — `beds24-tick`(202609300004)과 같은 방식. pg_cron 이 매 분 `automation_tick_if_needed()` 로
-- **할 일이 있는지만** DB 안에서 보고, 있을 때만 pg_net 으로 `/api/automation/tick` 을 부른다.

-- ── ① 권한 키 `automation.manage` — 설정 변경 · 발송 · 담당자 이름 입력 ─────────────────────────
--
-- 역할 기본 부여 **없음**(사용자 결정 — 「중요한 사람만, 내가 권한을 준 사람만」). 개인 부여만. 보기는 `ops_admin.access`.
-- 역할표 생성 구간은 202609100001 에만 있다(capability-registry.test.ts). 이 키는 역할 행이 없으므로 정책 행만 넣는다.
insert into public.capability_policies (capability, individual_grant, individual_deny, platform_bypass)
values ('automation.manage', true, false, true)
on conflict (capability) do update set
  individual_grant = excluded.individual_grant,
  individual_deny = excluded.individual_deny,
  platform_bypass = excluded.platform_bypass;

-- ── ② 자동화 한 개 = 조직 × 자동화 키 한 줄 ─────────────────────────────────────────────
--
-- 줄이 없으면 **꺼짐**이다(기본값은 앱 레지스트리 `src/lib/automation/jobs.ts`). 처음 저장할 때 생긴다.
create table if not exists public.automation_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_key text not null check (job_key in ('daily_report', 'cleaning_list', 'cancel_alert', 'same_day_alert', 'failure_alert')),
  -- 발송 토글. 드라이런 단계는 두지 않는다(2026-10-06 사용자 결정).
  enabled boolean not null default false,
  -- 도쿄 시각. 시각형 자동화(일일 리포트 · 청소 명단)만 쓴다.
  send_time time not null default '06:30',
  retry_until time not null default '09:00',
  -- ISO 요일(1=월 … 7=일).
  weekdays smallint[] not null default '{1,2,3,4,5,6,7}',
  -- 제외 건물 · 채널 필터 · 변동 재전송 등(앱이 검증한다).
  settings jsonb not null default '{}'::jsonb,
  -- 틱이 이 자동화를 다시 볼 시각. 앱이 매번 다시 계산한다(정시 · 재시도 · 변동/정정 확인).
  next_wake_at timestamptz,
  -- 시각형: 오늘 정시 발송을 끝낸(보냈거나 마감까지 못 보낸) 도쿄 날짜.
  last_done_on date,
  -- 이벤트형: 여기까지 바뀐 예약은 이미 봤다.
  event_cursor timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint automation_jobs_org_job_key unique (organization_id, job_key),
  constraint automation_jobs_weekdays_check check (weekdays <@ '{1,2,3,4,5,6,7}'::smallint[]),
  constraint automation_jobs_window_check check (retry_until >= send_time)
);

comment on table public.automation_jobs is
  '자동화 설정(발송 토글 · 시각 · 요일 · 재시도 마감 · 규칙). 줄이 없으면 꺼짐. 쓰기는 서버 액션(service-role) — automation.manage.';

-- ── ③ 받는 곳 = 자동화 × Slack 채널. 체크한 언어마다 한 통 ─────────────────────────────────
--
-- 채널 주소는 표에 두지 않는다 — Vercel 환경변수 `SLACK_AUTOMATION_<KEY>_WEBHOOK_URL`(사용자 결정). 여기에는 KEY 만.
create table if not exists public.automation_destinations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_key text not null,
  channel_key text not null check (channel_key ~ '^[A-Z0-9_]{1,40}$'),
  locales text[] not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint automation_destinations_unique unique (organization_id, job_key, channel_key),
  constraint automation_destinations_locales_check check (
    cardinality(locales) >= 1 and locales <@ array['ko', 'ja', 'en']::text[]
  )
);

comment on table public.automation_destinations is
  '자동화 받는 곳(Slack 채널 키 × 언어). 언어마다 메시지를 따로 보낸다. 웹훅 주소는 Vercel 환경변수에만 있다.';

-- ── ④ 실행 기록 = 받는 곳 × 언어 × 실행 한 번 ─────────────────────────────────────────────
create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_key text not null,
  channel_key text,
  locale text,
  -- 리포트가 다루는 날(일일 리포트 = 어제, 청소 명단 = 오늘). 이벤트는 null.
  target_date date,
  trigger text not null check (trigger in ('scheduled', 'retry', 'manual', 'event', 'correction', 'resend')),
  status text not null check (status in ('sent', 'skipped', 'failed')),
  -- 건너뜀 · 실패 사유 코드(화면이 문구로 바꾼다).
  reason text,
  message text,
  message_hash text,
  -- 일일 리포트의 숫자 4개 · 이벤트의 예약 번호 등.
  meta jsonb not null default '{}'::jsonb,
  -- 같은 것을 두 번 보내지 않는다(취소 알림 · 정시 발송). 수동 발송은 null.
  dedupe_key text,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists automation_runs_dedupe_idx
  on public.automation_runs (organization_id, dedupe_key) where dedupe_key is not null;
create index if not exists automation_runs_job_created_idx
  on public.automation_runs (organization_id, job_key, created_at desc);

comment on table public.automation_runs is
  '자동화 실행 기록(받는 곳 × 언어 × 한 번). sent / skipped / failed + 사유 · 원문. dedupe_key 로 중복 발송을 막는다.';

-- ── ⑤ 설정 변경 이력 ────────────────────────────────────────────────────────────────────
create table if not exists public.automation_setting_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_key text not null,
  actor_id uuid references auth.users(id) on delete set null,
  -- {field: {before, after}} — 화면이 문구로 바꾼다.
  changes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists automation_setting_logs_job_idx
  on public.automation_setting_logs (organization_id, job_key, created_at desc);

-- ── ⑥ 청소 명단 담당자 — 대시보드 수기 입력 ────────────────────────────────────────────────
--
-- Hotelsmart 자동 수집은 약관(제10조 10호 — 자동 접근 금지) 때문에 하지 않는다. 사람이 넣은 이름만 명단에 붙는다.
-- 키는 운영 객실 키(`buildRoomKey` — 「건물_객실」) — 청소 화면 · 예약 묶음과 같은 키.
create table if not exists public.cleaning_list_assignees (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  assign_date date not null,
  room_key text not null check (char_length(room_key) between 1 and 80),
  names text not null check (char_length(names) between 1 and 120),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, assign_date, room_key)
);

comment on table public.cleaning_list_assignees is
  '청소 · 셋팅 명단에 붙일 담당자 이름(대시보드 수기 입력). 날짜 × 운영 객실 키. 쓰기는 서버 액션 — automation.manage.';

-- ── ⑦ RLS — 읽기는 ops_admin.access, 쓰기는 서버 액션(service-role)만 ─────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['automation_jobs', 'automation_destinations', 'automation_runs', 'automation_setting_logs', 'cleaning_list_assignees']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "ops admins can read" on public.%I', t);
    execute format(
      'create policy "ops admins can read" on public.%I for select to authenticated using (organization_id = any ((select public.capability_organization_ids(''ops_admin.access''))::uuid[]))',
      t
    );
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end;
$$;

-- 이벤트형 자동화(취소 · 당일예약)가 매 분 「이 커서 뒤에 바뀐 예약이 있나」를 본다.
create index if not exists reservations_org_updated_idx on public.reservations (organization_id, updated_at);

-- ── ⑧ 1분 틱 — Vault 토큰 · 주소, 토큰 대조, 판단 함수, pg_cron ───────────────────────────────
create extension if not exists pg_net with schema extensions;
create extension if not exists pgcrypto with schema extensions;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'automation_tick_token') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'automation_tick_token',
      'Bearer token pg_cron sends to /api/automation/tick. Rotate with vault.update_secret; never print.'
    );
  end if;
  if not exists (select 1 from vault.secrets where name = 'automation_tick_url') then
    perform vault.create_secret(
      'https://stay-ops-two.vercel.app/api/automation/tick',
      'automation_tick_url',
      'Endpoint pg_cron calls when an automation is due.'
    );
  end if;
end;
$$;

create or replace function public.automation_tick_token_ok(p_token text)
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
       where s.name = 'automation_tick_token'
       limit 1
    ),
    false
  );
$$;

revoke all on function public.automation_tick_token_ok(text) from public, anon, authenticated;
grant execute on function public.automation_tick_token_ok(text) to service_role;

-- 돌려주는 값은 `cron.job_run_details.return_message` 에 남는다:
--   'busy' 틱이 이미 돈다 · 'idle' 할 일 없음 · 'not_configured' Vault 없음 · 'fired' 불렀다
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

do $$
begin
  if exists (select 1 from cron.job where jobname = 'automation-tick') then
    perform cron.unschedule('automation-tick');
  end if;
  perform cron.schedule('automation-tick', '* * * * *', 'select public.automation_tick_if_needed()');
end;
$$;
