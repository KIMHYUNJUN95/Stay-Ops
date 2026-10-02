-- 룸 링크 — 건물 단위 판매 채널 링크(Booking.com) (2026-10-02).
--
-- 문서: docs/product/35-room-links.md → 「Booking.com 은 건물 단위」
--       docs/engineering/04-data-model.md → building_listing_links
--       docs/engineering/05-rls-permissions.md → 「2026-10-02 룸 링크 — 읽기는 `room_links.access`」
--
-- Airbnb 는 객실(계정)마다 리스팅이 있지만 **Booking.com 은 숙소(건물) 하나에 객실 타입이 붙는 구조**라
-- 엑스트라넷 · 손님용 페이지가 건물마다 하나다(사용자 지적, 2026-10-02). 그래서 유닛 표(`room_listing_links`)가
-- 아니라 건물에 한 줄씩 붙인다.
--
-- 건물 키는 `canonical_name`(캘린더 · 건물 정보와 같은 이름 — 「아라키초A」 · 「STAY ARI Apartment Hotel」).
-- `property_operation_infos` 와 같은 방식이다. 건물 하나가 Beds24 프로퍼티 여럿일 수 있어 properties.id 로
-- 묶지 않는다.
--
-- - `listing_id` — Booking.com 숙소 ID(`hotel_id`). 엑스트라넷 주소를 여기서 만든다.
-- - `host_url`   — 엑스트라넷(로그인한 사람만 열림). 세션 값(`ses=`)은 저장하지 않는다.
-- - `guest_url`  — 손님용 숙소 페이지. 추적 · 세션 값(`label` · `sid`)과 언어 꼬리(`.ko`)는 떼고 저장한다.

create table if not exists public.building_listing_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  canonical_name text not null,
  channel text not null check (channel in ('booking')),
  listing_id text,
  host_url text,
  guest_url text,
  memo text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint building_listing_links_building_channel_key unique (organization_id, canonical_name, channel),
  constraint building_listing_links_memo_len check (memo is null or char_length(memo) <= 200)
);

comment on table public.building_listing_links is
  '건물 단위 판매 채널 링크(Booking.com 엑스트라넷 · 손님용 페이지). 쓰기는 서버 액션(service-role), 읽기는 room_links.access.';

alter table public.building_listing_links enable row level security;

drop policy if exists "room links readers can read building links" on public.building_listing_links;
create policy "room links readers can read building links"
  on public.building_listing_links
  for select
  to authenticated
  using (organization_id = any ((select public.capability_organization_ids('room_links.access'))::uuid[]));

drop policy if exists "platform admins can manage building links" on public.building_listing_links;
create policy "platform admins can manage building links"
  on public.building_listing_links
  for all
  to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

revoke all on public.building_listing_links from anon;
grant select on public.building_listing_links to authenticated;
grant all on public.building_listing_links to service_role;

-- 객실 단위 Booking 줄은 이제 쓰지 않는다(지금 0건). 유닛 표는 Airbnb 만.
delete from public.room_listing_links where channel = 'booking';
alter table public.room_listing_links drop constraint if exists room_listing_links_channel_check;
alter table public.room_listing_links add constraint room_listing_links_channel_check check (channel in ('airbnb'));

-- 사용자 제공 링크(2026-10-02). 아라키초A 는 엑스트라넷(숙소 ID 5653523), 나머지는 손님용 페이지.
insert into public.building_listing_links (organization_id, canonical_name, channel, listing_id, host_url, guest_url)
select o.id, v.canonical_name, 'booking', v.listing_id, v.host_url, v.guest_url
from (values
  ('아라키초A', '5653523',
    'https://admin.booking.com/hotel/hoteladmin/extranet_ng/manage/home.html?hotel_id=5653523', null),
  ('아라키초B', null, null, 'https://www.booking.com/hotel/jp/stay-ari-arakicho-b.html'),
  ('가부키초', null, null, 'https://www.booking.com/hotel/jp/shinjuku-jjhouse-kabukicho.html'),
  ('다카다노바바', null, null, 'https://www.booking.com/hotel/jp/stay-ari-apatomentohotel-63ping-mi.html'),
  ('STAY ARI Apartment Hotel', null, null, 'https://www.booking.com/hotel/jp/stay-ari-apartment.html'),
  ('오쿠보A', null, null, 'https://www.booking.com/hotel/jp/jj-house-dong-xin-su.html'),
  ('오쿠보B', null, null, 'https://www.booking.com/hotel/jp/okubo4.html'),
  ('오쿠보C', null, null, 'https://www.booking.com/hotel/jp/new-twelve-people-shin-ookubo-6min-pocket-wifi.html')
) as v(canonical_name, listing_id, host_url, guest_url)
cross join (
  select distinct organization_id as id from public.room_listing_links
) as o
on conflict (organization_id, canonical_name, channel) do nothing;
