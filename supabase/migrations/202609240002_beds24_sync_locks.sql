-- Beds24 호출 조율 — 락 하나, 쿨다운 하나
--
-- 도메인 계약: docs/product/33-calendar-write-features.md
-- 원본: STAY ARI Manager `functions/index.js` — `price_job_execution_lock`,
--       `price_sync_lock`, `beds24_api_guard`
--
-- ## 왜 락이 필요한가 — 저쪽이 실제로 겪은 사고
--
-- 저쪽 주석: *"주석만 「기존 price sync lock 재사용」이라고 되어 있었을 뿐 실제로는 별개
-- 문서라 배타가 전혀 없었다. 그래서 job이 POST 후 검증 재시도를 도는 사이 15분 주기
-- scheduled sync가 Beds24에서 옛 가격을 읽어 캐시를 덮고, lm에 「Beds24가 되돌렸다」는
-- 허위 이력까지 남겼다."*
--
-- 우리도 똑같은 구조다 — 쓰기 작업이 도는 사이 `rates-sync` 크론이 돌면 **방금 바꾼 가격이
-- 옛 값으로 되돌아간 것처럼 보인다.** 실제 Beds24 값은 맞는데 우리 표만 틀리므로, 화면을 보고
-- 「반영이 안 됐다」며 한 번 더 바꾸게 된다.
--
-- ## 쿨다운도 같은 표에 둔다
--
-- Beds24 V2 는 **계정 단위 5분 크레딧**을 예약·가격·캘린더가 함께 쓴다. 한 번 429 를 맞으면
-- 그 시각까지 **모든** 경로가 쉬어야 한다 — 쓰기만 쉬면 크론이 계속 긁어 한도가 안 풀린다.
-- 락이든 쿨다운이든 「이름 붙은 것이 언제까지 유효한가」라 한 표로 다룬다.
create table if not exists public.beds24_sync_locks (
  -- 'price_job_worker' | 'rates_sync' | 'api_cooldown'
  name text primary key,
  locked_by text,
  locked_at timestamptz not null default now(),
  -- 이 시각이 지나면 없는 것으로 본다. **TTL 이 없으면 죽은 인스턴스가 영영 막는다** —
  -- 서버리스에서는 함수가 중간에 사라지는 일이 정상 범주다.
  expires_at timestamptz not null,
  -- 쿨다운일 때: 'rate_limit' | 'low_credit'
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.beds24_sync_locks is
  'Beds24 호출 조율. 만료된 행은 없는 것으로 본다(지우지 않아도 된다).';

alter table public.beds24_sync_locks enable row level security;

-- 사람이 읽을 일은 진단뿐이다. 쓰기는 서비스 롤만.
create policy "platform admins can read sync locks"
on public.beds24_sync_locks
for select
using (public.is_platform_admin());

create policy "platform admins can manage sync locks"
on public.beds24_sync_locks
for all
using (public.is_platform_admin())
with check (public.is_platform_admin());

grant select on public.beds24_sync_locks to authenticated;
grant all on public.beds24_sync_locks to service_role;
