-- Beds24 캘린더 「블락」을 우리 캘린더에도 보이게 한다 (2026-09-11).
--
-- WHAT A BLOCK IS
-- ---------------
-- Beds24 캘린더에서 객실을 막으면 채널 판매가 멈춘다. 그 표현은 예약이 아니라 **인벤토리
-- 오버라이드**다 — `GET /inventory/rooms/calendar?includeOverride=true` 의 `override` 필드가
-- `blackout` 이 된다(명세 enum: none | blackout | exception | noCheckIn | noCheckOut |
-- noCheckInOrCheckOut).
--
-- Beds24 에는 `status: "black"` 예약으로 막는 방법도 있지만 이 계정은 쓰지 않는다(전 기간 조회
-- 결과 0건). 그래서 블락은 `/bookings` 로는 **절대 들어오지 않는다** — 지금까지 우리 캘린더에
-- 안 보이던 이유다.
--
-- WHY A SEPARATE TABLE
-- --------------------
-- 예약 테이블에 끼워 넣지 않는다. 블락은 손님도 채널도 예약번호도 없고, `reservations` 의 키는
-- `<apiReference>::room::<room_label>` 라서 억지로 맞추면 합성 키를 또 만들어야 한다. 2026-09-11
-- 에 그 합성 키가 어긋나 같은 예약이 두 행이 된 일이 있었다(docs/engineering/01-beds24-integration.md).
-- 성격이 다른 것은 따로 둔다.
--
-- 실무에서 블락과 예약은 **겹친다.** 채널 판매를 막아 두고(blackout) 그 자리에 수기 예약을 넣는
-- 운영이 실제로 쓰인다. 그래서 블락 구간에 예약이 있다고 해서 블락이 아닌 것이 아니다.
--
-- KEYING
-- ------
-- 예약과 같은 방식으로 건물명·방이름을 그대로 들고 간다(`property_name`, `room_label`). 캘린더가
-- 이미 그 두 값으로 행을 찾기 때문이다. `external_room_id` 는 Beds24 roomId — 방 이름이 바뀌어도
-- 원본을 되짚을 수 있게 남긴다.

create table public.room_blocks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source text not null default 'beds24',
  property_name text not null,
  room_label text not null,
  -- Beds24 roomId. 방 마스터가 아직 없어 이름을 못 찾은 구간도 원본은 남는다.
  external_room_id text,
  -- 막힌 「밤」의 범위. 양끝 포함 — 9/23~9/26 이면 23·24·25·26 네 밤이 막힌 것이다.
  start_date date not null,
  end_date date not null,
  -- override enum 원문. 지금은 blackout 만 저장하지만, noCheckIn 등을 나중에 쓰게 되면
  -- 테이블을 바꾸지 않고 값만 늘리면 된다.
  override_kind text not null default 'blackout',
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(trim(source)) > 0),
  check (char_length(trim(property_name)) > 0),
  check (char_length(trim(room_label)) > 0),
  check (char_length(trim(override_kind)) > 0),
  check (end_date >= start_date),
  -- 한 방의 한 시작일에 구간은 하나뿐이다. 동기화가 여러 번 돌아도 행이 늘지 않는다.
  unique (organization_id, source, property_name, room_label, start_date)
);

create trigger room_blocks_set_updated_at
before update on public.room_blocks
for each row execute function public.set_updated_at();

-- 캘린더는 「이 달에 걸치는 블락」을 찾는다 — 조직 + 기간으로 훑는다.
create index room_blocks_org_range_idx
on public.room_blocks(organization_id, start_date, end_date);

create index room_blocks_org_room_idx
on public.room_blocks(organization_id, property_name, room_label, start_date);

alter table public.room_blocks enable row level security;

create policy "members can read organization room blocks"
on public.room_blocks
for select
using (
  auth.uid() is not null
  and (
    public.is_platform_admin()
    or public.has_active_membership(organization_id)
  )
);

create policy "platform admins can manage room blocks"
on public.room_blocks
for all
using (public.is_platform_admin())
with check (public.is_platform_admin());

grant select on public.room_blocks to authenticated;
grant all on public.room_blocks to service_role;
