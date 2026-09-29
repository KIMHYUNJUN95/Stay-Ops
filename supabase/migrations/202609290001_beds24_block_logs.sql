-- Beds24 차단(블록) 전송 로그 — 판매 캘린더 「이력 → Beds24 전송」 탭.
--
-- 도메인 계약: docs/product/33-calendar-write-features.md → 「이력 · 전송 로그」
--
-- 가격·최소숙박은 `beds24_price_jobs` 가 작업마다 상태·객실별 결과를 이미 남긴다. 차단은 큐 없이
-- 바로 쓰고, 성공하면 `room_block_snapshots` 만 남아 **실패는 어디에도 없었다.** 「막았는데 왜
-- 팔렸지?」를 되짚으려면 성공과 실패가 같은 곳에 있어야 한다.
--
-- 한 줄 = 서버 액션이 Beds24 에 보낸 **구간 하나**(한 객실의 연속된 밤). 이력이라 고치지 않는다.

create table if not exists public.beds24_block_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  action text not null check (action in ('block', 'unblock')),
  status text not null check (status in ('succeeded', 'failed')),
  property_name text,
  room_label text,
  external_room_ids text[] not null default '{}',
  start_date date not null,
  end_date date not null,
  nights integer,
  -- 실패 사유 코드(`block-write.ts` 의 reason)와 세부.
  reason text,
  detail text,
  requested_by uuid,
  requested_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists beds24_block_logs_org_created_idx
  on public.beds24_block_logs (organization_id, created_at desc);

-- RLS — `beds24_price_jobs` 와 같은 규칙. 조직 구성원은 읽고, **쓰기는 서비스 롤만** 한다
-- (서버 액션이 권한을 확인한 뒤 남긴다).
alter table public.beds24_block_logs enable row level security;

create policy "members can read organization block logs"
on public.beds24_block_logs
for select
using (
  auth.uid() is not null
  and (
    public.is_platform_admin()
    or public.has_active_membership(organization_id)
  )
);

create policy "platform admins can manage block logs"
on public.beds24_block_logs
for all
using (public.is_platform_admin())
with check (public.is_platform_admin());

grant select on public.beds24_block_logs to authenticated;
grant all on public.beds24_block_logs to service_role;
