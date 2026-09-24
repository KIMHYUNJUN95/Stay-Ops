-- 판매 캘린더 쓰기의 토대 — 가격 소스 연결 + 작업 큐
--
-- 도메인 계약: docs/product/33-calendar-write-features.md
-- 원본: STAY ARI Manager `functions/index.js` — `BEDS24_PRICE_SOURCE_ROOM_ID`,
--       `beds24_price_jobs`, `setRoomPrices`, `setMinStay`, `processPriceJob`

-- ── ① 가격 소스 연결 ────────────────────────────────────────────────────────
--
-- Beds24 에서 가격은 **연결(Daily Price link)로 퍼진다.** 한 물리적 방의 유닛이 여럿일 때
-- 가격은 한 유닛(소스=메인)에만 쓰고 나머지는 그 값을 받는다.
--
--   450096 오쿠보 2-1 (소스)   priceLinking.roomId = null
--   496532 1-13-1-2            priceLinking.roomId = 450096
--   648399 OkuboCC             priceLinking.roomId = 450096
--
-- **쓰기 대상이 두 가지로 갈린다** — 저쪽 주석 그대로다:
--   가격        → 소스 유닛에 쓴다
--   최소숙박·재고 → 그 날짜에 **운영 중인** 유닛에 쓴다
--
-- 엉뚱한 유닛에 가격을 쓰면 Beds24 는 그래도 `success: true` 를 돌려준다. 그래서 쓴 뒤 다시
-- 읽어 대조한다(워커의 readback 검증).
--
-- 저쪽은 이 표를 코드에 24줄로 박아 두었다. 우리는 **API 에서 파생한다** —
-- `GET /properties?includePriceRules=true` 의 `priceRules[].priceLinking.roomId`.
-- 2026-09-24 실측으로 저쪽 표 24건과 **24/24 일치**했다. 박아 두면 Beds24 설정이 바뀌는
-- 날부터 조용히 틀린 유닛에 쓴다.
alter table public.rooms
  add column if not exists external_price_source_room_id text;

comment on column public.rooms.external_price_source_room_id is
  '가격을 써야 하는 Beds24 roomId. 자기 자신이 소스면 null. priceRules[].priceLinking.roomId 에서 동기화한다.';

-- ── ② 작업 큐 ──────────────────────────────────────────────────────────────
--
-- 화면에서 Beds24 로 **바로 쏘지 않는다.** Beds24 V2 는 계정 단위 5분 크레딧을 예약·가격·
-- 캘린더가 함께 쓰므로, 객실 90개를 즉시 순차 POST 하면 주기 동기화·웹훅과 크레딧을 다투고
-- 429 가 난다.
--
-- **모바일에서 특히 중요하다** — 접수만 하고 응답하면 화면을 꺼도 서버가 끝낸다.
create table if not exists public.beds24_price_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  -- 'price' | 'min_stay' — **쓰기 대상 유닛이 달라진다**(위 ① 참고).
  job_type text not null check (job_type in ('price', 'min_stay')),
  -- 진행 상황을 건물 단위로 묶어 본다. 합치기(coalescing)도 같은 건물끼리만 한다.
  property_id uuid references public.properties(id) on delete set null,

  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'partial_failed', 'failed')),

  -- [{ externalRoomId, roomLabel, dates: { 'YYYY-MM-DD': { p1?, p2?, p3?, m?, mx?, na?, ov? } } }]
  -- 날짜별 값 그대로 담는다. Beds24 로 나갈 구간 병합은 보낼 때 한다 — 큐에 병합해 두면
  -- 나중 작업과 합칠 때 날짜 단위로 덮어쓸 수가 없다.
  room_updates jsonb not null,

  -- 누가 바꿨나. 이력에 남는다.
  requested_by uuid references public.profiles(id) on delete set null,
  requested_by_name text,

  -- 처리 결과. [{ externalRoomId, success, error?, verified? }]
  results jsonb not null default '[]'::jsonb,
  processed_count integer not null default 0,
  total_count integer not null default 0,
  failed_room_ids text[] not null default '{}',
  error text,

  -- 멈춘 작업 회수용. 15분 넘게 processing 이면 queued 로 되돌린다.
  attempt_count integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 워커는 「가장 오래된 queued 하나」를 집는다.
create index if not exists beds24_price_jobs_queue_idx
  on public.beds24_price_jobs (status, created_at)
  where status in ('queued', 'processing');

-- 화면의 작업 상태 폴링 — 내가 방금 낸 작업을 찾는다.
create index if not exists beds24_price_jobs_org_created_idx
  on public.beds24_price_jobs (organization_id, created_at desc);

create trigger beds24_price_jobs_set_updated_at
  before update on public.beds24_price_jobs
  for each row execute function public.set_updated_at();

-- RLS — `room_daily_rates` 와 같은 규칙이다. 조직 구성원은 읽고, **쓰기는 서비스 롤만** 한다.
-- 큐에 넣는 것도 서버 액션에서 권한을 확인한 뒤 서비스 롤로 넣는다. 클라이언트가 직접
-- insert 할 수 있으면 `room_updates` 를 마음대로 만들어 넣을 수 있고, 그건 곧 남의 건물
-- 가격을 바꾸는 길이 된다.
alter table public.beds24_price_jobs enable row level security;

create policy "members can read organization price jobs"
on public.beds24_price_jobs
for select
using (
  auth.uid() is not null
  and (
    public.is_platform_admin()
    or public.has_active_membership(organization_id)
  )
);

create policy "platform admins can manage price jobs"
on public.beds24_price_jobs
for all
using (public.is_platform_admin())
with check (public.is_platform_admin());

grant select on public.beds24_price_jobs to authenticated;
grant all on public.beds24_price_jobs to service_role;
