-- 룸 링크 — 객실(유닛)별 판매 채널 리스팅 링크 (2026-10-02).
--
-- 문서: docs/product/35-room-links.md
--       docs/engineering/04-data-model.md → room_listing_links
--       docs/engineering/05-rls-permissions.md → 「2026-10-02 룸 링크 — 읽기는 `room_links.access`」
--
-- STAY ARI Manager 의 Room Links(`RoomLinksDashboard`)를 옮긴다. 저쪽은 Firestore 문서 하나에
-- {건물: {객실 이름: {host, guest}}} 를 통째로 덮어써서 ① 이름으로만 객실을 찾고 ② 두 사람이 동시에 고치면
-- 나중 저장이 앞의 것을 지웠다. 여기서는 **우리 객실 유닛(`rooms.id`)에 한 줄씩** 붙인다 — 이름 매칭이 없고,
-- 한 칸을 고쳐도 그 줄만 바뀐다.
--
-- ## 한 줄 = 유닛 하나 × 채널 하나
--
-- 같은 물리 객실을 두 Airbnb 계정이 번갈아 판다(아라키초A 201 / 201_2 등). 우리 객실 마스터도 이미 유닛을
-- 따로 두므로 리스팅도 유닛에 붙인다. 화면은 캘린더와 같은 행 키(`opsUnitRoomKey`)로 다시 묶는다.
--
-- - `listing_id`  — Airbnb 리스팅 ID(숫자 문자열). 호스트 편집 화면 주소를 여기서 만들 수 있고, 같은 ID 가
--                   다른 유닛에 또 붙으면 화면이 경고한다(저쪽 데이터에 실제로 그런 복사 실수가 있었다).
-- - `host_url`    — 호스트 쪽 화면(Airbnb 리스팅 편집 · Booking.com 엑스트라넷). 로그인한 사람만 열린다.
-- - `guest_url`   — 손님에게 보내는 링크(`airbnb.co.kr/h/…`). 화면의 「복사」가 이것이다.
--
-- ## 권한
--
-- 새 키 `room_links.access` — 정책은 `ops_admin.access` 와 같다(대표 · 전무 역할 + 개인 지정, 기한 · 차단 없음).
-- 생성 구간(202609100001)은 레지스트리에서 다시 만들었고, 이미 적용된 DB 를 위해 **새 키의 행만** 여기서 넣는다
-- (202609170001 과 같은 방식).
--
-- 쓰기는 서버 액션이 service-role 로 한다(권한 재확인 후). RLS 는 읽기만 연다.

insert into public.capability_roles (capability, role) values
  ('room_links.access', 'owner'::organization_role),
  ('room_links.access', 'senior_managing_director'::organization_role)
on conflict (capability, role) do nothing;

insert into public.capability_policies (capability, individual_grant, individual_deny, platform_bypass)
values ('room_links.access', true, false, true)
on conflict (capability) do update set
  individual_grant = excluded.individual_grant,
  individual_deny = excluded.individual_deny,
  platform_bypass = excluded.platform_bypass;

create table if not exists public.room_listing_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  channel text not null check (channel in ('airbnb', 'booking')),
  listing_id text,
  host_url text,
  guest_url text,
  memo text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint room_listing_links_room_channel_key unique (room_id, channel),
  constraint room_listing_links_memo_len check (memo is null or char_length(memo) <= 200)
);

comment on table public.room_listing_links is
  '객실 유닛별 판매 채널 리스팅 링크(호스트 화면 · 손님용 링크). 쓰기는 서버 액션(service-role), 읽기는 room_links.access.';

create index if not exists room_listing_links_org_idx on public.room_listing_links (organization_id);
create index if not exists room_listing_links_listing_idx on public.room_listing_links (organization_id, listing_id)
  where listing_id is not null;

alter table public.room_listing_links enable row level security;

-- 읽기: 그 조직에서 `room_links.access` 를 가진 사람만. 헬퍼는 쿼리당 한 번(InitPlan) — 202609300007 참고.
drop policy if exists "room links readers can read" on public.room_listing_links;
create policy "room links readers can read"
  on public.room_listing_links
  for select
  to authenticated
  using (organization_id = any ((select public.capability_organization_ids('room_links.access'))::uuid[]));

drop policy if exists "platform admins can manage room links" on public.room_listing_links;
create policy "platform admins can manage room links"
  on public.room_listing_links
  for all
  to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

revoke all on public.room_listing_links from anon;
grant select on public.room_listing_links to authenticated;
grant all on public.room_listing_links to service_role;
