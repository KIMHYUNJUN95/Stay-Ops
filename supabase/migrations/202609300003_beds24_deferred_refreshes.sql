-- 미뤄 둔 Beds24 웹훅 재조회 (2026-09-30).
--
-- 도메인 계약: docs/product/33-calendar-write-features.md 「쿨다운이 풀리면 1분 안에 이어서 보낸다 ·
-- 미뤄 둔 웹훅 재조회」
--
-- 가격·재고 웹훅이 건물을 다시 읽으려 할 때 쿨다운 중이거나 가격 작업이 대기 중이면 물러난다
-- (`price-webhook.ts` → `refreshProperty`). 예전에는 물러난 변경을 **어디에도 적지 않아서**
-- 다음 주기 동기화(실측 몇 시간 뒤)까지 우리 화면이 Beds24 와 달랐다. 이제 「이 건물은 다시 읽어야
-- 한다」를 여기 한 줄 남기고, 틱(`/api/beds24/tick`)이 조건이 풀리면 읽은 뒤 지운다.
--
-- 건물당 한 줄이다 — 같은 건물에 배달이 몇 번 오든 한 번 읽으면 전부 반영된다.
create table if not exists public.beds24_deferred_refreshes (
  external_property_id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- 'cooldown' | 'price_job' = 물러났다, 'failed' = 읽었는데 실패했다(429·HTTP 오류 등)
  reason text not null check (reason in ('cooldown', 'price_job', 'failed')),
  -- 가장 최근에 「다시 읽어야 한다」가 생긴 시각. 읽기가 **이 시각 전에** 시작됐으면 지우지 않는다 —
  -- 그 읽기는 이 변경을 못 봤을 수 있다.
  requested_at timestamptz not null default now(),
  -- 틱이 읽기를 시도했다가 실패한 횟수. 5회를 넘기면 틱이 더 부르지 않는다(크레딧 보호).
  -- 새 웹훅이 오면 0 으로 돌아간다.
  attempts integer not null default 0,
  -- 실패 코드만 남긴다(`room-rates:calendar-…-http-429` 같은). 토큰·응답 본문은 넣지 않는다.
  last_error text,
  updated_at timestamptz not null default now()
);

comment on table public.beds24_deferred_refreshes is
  '쿨다운·가격 작업 때문에 미룬 Beds24 건물 재조회. 틱이 읽은 뒤 지운다. 서비스 롤 전용.';

create index if not exists beds24_deferred_refreshes_requested_idx
  on public.beds24_deferred_refreshes (requested_at);

-- 서비스 롤만 쓴다. RLS 를 켜고 정책을 하나도 두지 않으면 anon/authenticated 는 0행이 된다
-- (`beds24_sync_state` 와 같은 방식).
alter table public.beds24_deferred_refreshes enable row level security;
revoke all on public.beds24_deferred_refreshes from anon, authenticated;
grant all on public.beds24_deferred_refreshes to service_role;
