-- 청소 명단 「청소 방 직접 추가」 (2026-10-07)
--
-- 도메인 계약: docs/product/36-automation-control.md → 「청소 방 직접 추가」
--
-- 저쪽(STAY ARI Manager)은 스테이아리 청소 일정을 Hotelsmart 화면에서 읽어, 퇴실이 없어도 Hotelsmart 에 청소로
-- 잡힌 방(연박 중 청소 등)을 명단에 더했다. 우리는 Hotelsmart 를 읽지 않으므로(약관 제10조 10호) 그런 방은
-- 사람이 관제실 담당자 탭에서 그날 명단에 직접 넣는다. 넣은 방은 Slack 청소 명단의 청소 칸에 일반 방과 같이 나간다.
--
-- 키는 **물리 객실 키**(「건물_표시 객실」 — 아라키초 `_2` 판매 리스팅을 접은 것). 청소 대상 판정과 같은 기준이라
-- 이미 그날 퇴실 청소가 있는 방을 또 넣으면 명단에서 한 번만 나온다.

create table if not exists public.cleaning_list_extra_rooms (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  target_date date not null,
  room_key text not null check (char_length(room_key) between 1 and 80),
  -- 운영 표준 건물 이름 · 표시 객실(메시지의 방 코드 · 건물 묶음에 쓴다).
  property_name text not null check (char_length(property_name) between 1 and 80),
  room_label text not null check (char_length(room_label) between 1 and 40),
  -- 「연박 청소」 같은 짧은 메모(없으면 메시지에 「추가 청소」).
  note text check (note is null or char_length(note) between 1 and 60),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (organization_id, target_date, room_key)
);

comment on table public.cleaning_list_extra_rooms is
  '청소 명단에 사람이 직접 더한 청소 방(날짜 × 물리 객실 키). Hotelsmart 를 대신한다. 쓰기는 서버 액션 — automation.manage.';

alter table public.cleaning_list_extra_rooms enable row level security;
drop policy if exists "ops admins can read" on public.cleaning_list_extra_rooms;
create policy "ops admins can read" on public.cleaning_list_extra_rooms for select to authenticated
  using (organization_id = any ((select public.capability_organization_ids('ops_admin.access'))::uuid[]));
grant select on public.cleaning_list_extra_rooms to authenticated;
grant all on public.cleaning_list_extra_rooms to service_role;
