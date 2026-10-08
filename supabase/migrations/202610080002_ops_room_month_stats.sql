-- 매출 · 가동률 · 비교 화면용 객실 × 월 집계 표 (2026-10-08).
--
-- 도메인 계약: docs/product/34-metrics-and-automation.md 「객실 × 월 집계 표」
--
-- ## 왜
--
-- 화면을 열 때마다 예약 1만 2천 건(해마다 늘어난다)을 읽어 다시 계산했다(2초 남짓). 결과는 예약이 바뀔 때만 바뀐다 —
-- 객실 × 달로 한 번 계산해 두고, 바뀐 달만 다시 계산한다. 계산은 앱의 같은 함수(`buildOpsSalesSummary`)가 한다.
--
-- ## 어떻게 「바뀐 달」을 아는가
--
-- 예약 행이 생기거나 · 바뀌거나 · 지워지면 트리거가 **바뀌기 전 날짜와 바뀐 뒤 날짜의 달을 둘 다** `ops_stats_months` 에
-- 「다시 계산(dirty)」으로 적는다 — 날짜를 옮긴 예약의 옛 달까지. 웹훅 · 정합성 · 수기 예약 · 직접 수정 어느 경로든 같다.
-- 객실 목록(분모)이 바뀌면 그 조직의 모든 달을 dirty 로. 화면은 읽기 전에 dirty · 없는 달을 그 자리에서 계산한다(낡은 숫자가
-- 나올 수 없다). 1분 틱은 dirty 달을 미리 계산해 둔다. 매일 한 번 전체를 dirty 로(안전망).
--
-- ## 권한
--
-- RLS 를 켜고 정책을 두지 않는다 — 서버(service role)만 읽고 쓴다. 화면 게이트는 앱(`requireOpsAdminPage`)이 먼저 한다.

-- ── ① 표 ─────────────────────────────────────────────────────────────────────
create table if not exists public.ops_stats_months (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  month date not null,
  -- 앱의 계산 규칙 판(`OPS_STATS_VERSION`). 다르면 다시 계산한다.
  version integer not null default 0,
  dirty boolean not null default true,
  dirty_at timestamptz not null default now(),
  built_at timestamptz,
  primary key (organization_id, month),
  check (month = date_trunc('month', month)::date)
);

create index if not exists ops_stats_months_dirty_idx on public.ops_stats_months (organization_id, month) where dirty;

create table if not exists public.ops_room_month_stats (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  month date not null,
  -- 판매 캘린더 객실 행 키(`toRoomAxisKey` — 건물::표시 이름, 듀얼 유닛 = 한 행).
  room_key text not null,
  property_name text not null,
  room_label text not null,
  -- 객실 목록(분모)에 있는 방인가. 목록 밖 방은 매출만 있고 판매 · 전체 박은 0.
  in_catalog boolean not null,
  revenue numeric not null default 0,
  commission numeric not null default 0,
  occupied_nights integer not null default 0,
  -- 방 하나 × 그 달 일수(목록 방만). 「문 열기 전 달」 규칙은 읽는 쪽(건물 단위)이 한다.
  available_nights integer not null default 0,
  airbnb numeric not null default 0,
  booking numeric not null default 0,
  direct numeric not null default 0,
  other numeric not null default 0,
  -- 그 달에 체크인한 확정 예약 중 가장 이른 체크인 — 객실 첫 판매일(비교 화면 「새 객실」)을 모든 달의 최솟값으로.
  first_check_in date,
  primary key (organization_id, month, room_key)
);

alter table public.ops_stats_months enable row level security;
alter table public.ops_room_month_stats enable row level security;
revoke all on public.ops_stats_months from anon, authenticated;
revoke all on public.ops_room_month_stats from anon, authenticated;
-- 이 프로젝트는 새 표에 service_role 권한이 기본으로 붙지 않는다 — 명시한다(적용 때 permission denied 로 확인).
grant select, insert, update, delete on public.ops_stats_months to service_role;
grant select, insert, update, delete on public.ops_room_month_stats to service_role;

-- ── ② 예약이 바뀌면 그 달(전 · 후)을 dirty 로 ─────────────────────────────────
create or replace function public.ops_stats_mark_range(p_org uuid, p_check_in date, p_check_out date)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.ops_stats_months (organization_id, month, dirty, dirty_at)
  select p_org, gs::date, true, now()
    from generate_series(
      date_trunc('month', p_check_in),
      date_trunc('month', greatest(p_check_out - 1, p_check_in)),
      interval '1 month'
    ) as gs
   where p_org is not null and p_check_in is not null and p_check_out is not null
  on conflict (organization_id, month) do update set dirty = true, dirty_at = now();
$$;

create or replace function public.ops_stats_mark_reservation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and old.organization_id is not distinct from new.organization_id
     and old.check_in_date is not distinct from new.check_in_date
     and old.check_out_date is not distinct from new.check_out_date
     and old.status is not distinct from new.status
     and old.property_name is not distinct from new.property_name
     and old.room_label is not distinct from new.room_label
     and old.raw_payload is not distinct from new.raw_payload then
    return null;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.ops_stats_mark_range(old.organization_id, old.check_in_date, old.check_out_date);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.ops_stats_mark_range(new.organization_id, new.check_in_date, new.check_out_date);
  end if;
  return null;
end;
$$;

drop trigger if exists ops_stats_mark_reservation on public.reservations;
create trigger ops_stats_mark_reservation
  after insert or update or delete on public.reservations
  for each row execute function public.ops_stats_mark_reservation();

-- ── ③ 객실 목록(분모)이 바뀌면 그 조직 전부 dirty ──────────────────────────────
create or replace function public.ops_stats_mark_org(p_org uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.ops_stats_months set dirty = true, dirty_at = now() where organization_id = p_org;
$$;

create or replace function public.ops_stats_mark_room()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.ops_stats_mark_org(old.organization_id);
  end if;
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.organization_id is distinct from old.organization_id) then
    perform public.ops_stats_mark_org(new.organization_id);
  end if;
  return null;
end;
$$;

drop trigger if exists ops_stats_mark_room on public.rooms;
-- 객실 목록 판정에 쓰는 컬럼(`ROOM_CATALOG_SELECT`)이 실제로 바뀔 때만 — 아무 칸이나 고칠 때마다 전부 다시 계산하지 않게.
create trigger ops_stats_mark_room
  after update on public.rooms
  for each row
  when (
    old.property_id is distinct from new.property_id
    or old.room_label is distinct from new.room_label
    or old.external_room_id is distinct from new.external_room_id
    or old.status is distinct from new.status
    or old.external_provider is distinct from new.external_provider
    or old.external_minimum_stay is distinct from new.external_minimum_stay
  )
  execute function public.ops_stats_mark_room();

drop trigger if exists ops_stats_mark_room_insdel on public.rooms;
create trigger ops_stats_mark_room_insdel
  after insert or delete on public.rooms
  for each row execute function public.ops_stats_mark_room();

create or replace function public.ops_stats_mark_property()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.ops_stats_mark_org(new.organization_id);
  return null;
end;
$$;

drop trigger if exists ops_stats_mark_property on public.properties;
create trigger ops_stats_mark_property
  after update on public.properties
  for each row
  when (old.name is distinct from new.name)
  execute function public.ops_stats_mark_property();

-- ── ④ 1분 틱 — dirty 달이 있을 때만 앱을 부른다 ────────────────────────────────
--
-- 토큰은 Beds24 틱과 같은 것(`beds24_tick_token`, 대조는 `beds24_tick_token_ok`)을 쓴다 — 새 비밀값이 없다.
-- 주소만 따로 둔다. 돌려주는 값은 `cron.job_run_details.return_message`: 'idle' · 'not_configured' · 'fired'.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'ops_stats_tick_url') then
    perform vault.create_secret(
      'https://stay-ops-two.vercel.app/api/ops/stats-tick',
      'ops_stats_tick_url',
      'Endpoint pg_cron calls when ops_stats_months has dirty months.'
    );
  end if;
end;
$$;

create or replace function public.ops_stats_tick_if_needed()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_token text;
begin
  if not exists (select 1 from public.ops_stats_months where dirty) then
    return 'idle';
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'ops_stats_tick_url' limit 1;
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'beds24_tick_token' limit 1;
  if v_url is null or v_token is null then
    return 'not_configured';
  end if;
  perform net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_token),
    timeout_milliseconds := 60000
  );
  return 'fired';
end;
$$;

revoke all on function public.ops_stats_tick_if_needed() from public, anon, authenticated;
grant execute on function public.ops_stats_tick_if_needed() to service_role;
revoke all on function public.ops_stats_mark_range(uuid, date, date) from public, anon, authenticated;
revoke all on function public.ops_stats_mark_org(uuid) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'ops-stats-tick') then
    perform cron.unschedule('ops-stats-tick');
  end if;
  perform cron.schedule('ops-stats-tick', '* * * * *', 'select public.ops_stats_tick_if_needed()');
  -- 매일 04:10(도쿄) 전부 dirty — 트리거가 못 보는 변화(코드 밖 규칙 등)에 대한 안전망.
  if exists (select 1 from cron.job where jobname = 'ops-stats-daily') then
    perform cron.unschedule('ops-stats-daily');
  end if;
  perform cron.schedule('ops-stats-daily', '10 19 * * *', 'update public.ops_stats_months set dirty = true, dirty_at = now()');
end;
$$;
