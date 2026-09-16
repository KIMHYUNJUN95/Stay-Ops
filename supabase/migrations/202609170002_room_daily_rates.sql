-- 객실 × 날짜별 요금·재고 (2026-09-17).
--
-- StayOps 는 지금까지 Beds24 에서 **예약만** 가져왔다. 가격·최소숙박·재고는 한 번도 저장한 적이
-- 없어서 운영 관리자의 판매 캘린더가 세 트랙 중 두 줄을 비워 두고 있었다. 이 표가 그 자리를
-- 채운다.
--
-- 설계: docs/product/33-calendar-write-features.md
--
-- ## 어디서 오는가
--
-- `GET /inventory/rooms/calendar?propertyId=…&startDate=…&endDate=…`
--   `&includePrices=true&includeNumAvail=true&includeMinStay=true&includeMaxStay=true`
--   `&includeOverride=true`
--
-- 응답은 **날짜별이 아니라 구간별**이다 — 값이 같은 날이 이어지면 한 덩어리로 온다.
--
-- ```json
-- {"from":"2026-09-23","to":"2026-09-24","numAvail":0,"minStay":2,"maxStay":50,
--  "override":"none","price1":23671}
-- ```
--
-- (2026-09-17 실측: 아라키초A 5일치 59구간 중 26구간이 이틀 이상이었다.)
-- 동기화가 이것을 **날짜 단위로 펼쳐** 넣는다. 캘린더 격자가 날짜 칸으로 그려지기 때문이다.
--
-- ## 왜 날짜별로 펼치는가 (구간 그대로 두지 않는 이유)
--
-- 구간으로 두면 「9/22 의 가격」을 찾을 때마다 범위 검색을 해야 하고, 30일 × 90객실 = 2,700칸을
-- 그릴 때 그 검색이 칸마다 돈다. 날짜별로 두면 한 번의 범위 조회로 전부 집어 온다.
-- 90객실 × 365일 × 2년 ≈ 6.6만 행 — 이 규모에서는 저장 비용이 문제가 되지 않는다.
--
-- ## 가격 슬롯
--
-- Beds24 는 `price1`~`price3` 를 갖는다. 저쪽 프로젝트 기준 `p1` = 에어비앤비,
-- `p2` = 부킹닷컴, `p3` = 에어비앤비 대체가다.
--
-- **지금 이 계정은 `price1` 만 쓴다** — 2026-09-17 실측에서 59구간 전부 `price1` 만 있었고
-- `price2`/`price3` 는 응답에 나타나지 않았다(설정된 적이 없으면 생략된다). 그래도 세 칸을 전부
-- 두는 이유는 **나중에 쓰기 시작해도 표를 바꾸지 않기 위해서**다. 값이 없으면 null 로 남는다.
--
-- ## `num_avail` 로 공실을 판단하지 않는다
--
-- `numAvail: 0` 은 「팔 수 없음」이라 **예약이 차 있어도 0** 이다(2026-09-11 실측).
-- 블락 판정은 `override = 'blackout'` 하나로만 한다 — `room_blocks` 와 같은 규칙이다.
-- 여기서는 원본 값을 그대로 보관만 한다.

create table public.room_daily_rates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- 우리 방 UUID 로 묶는다. Beds24 roomId 는 방이 교체되면 바뀌지만 이 행은 방을 따라가야 한다.
  room_id uuid not null references public.rooms(id) on delete cascade,
  -- 묵는 「밤」의 날짜. 체크아웃 날짜는 포함하지 않는다.
  stay_date date not null,
  -- 에어비앤비 / 부킹닷컴 / 에어비앤비 대체가. 엔화 정수.
  price1 integer,
  price2 integer,
  price3 integer,
  min_stay integer,
  max_stay integer,
  num_avail integer,
  -- override enum 원문: none | blackout | exception | noCheckIn | noCheckOut | noCheckInOrCheckOut
  override_kind text,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 한 방의 한 밤은 한 행이다. 동기화가 여러 번 돌아도 행이 늘지 않는다.
  unique (room_id, stay_date)
);

create trigger room_daily_rates_set_updated_at
before update on public.room_daily_rates
for each row execute function public.set_updated_at();

-- 캘린더는 「이 창에 걸치는 전 객실의 요금」을 한 번에 집어 온다.
create index room_daily_rates_org_date_idx
on public.room_daily_rates(organization_id, stay_date);

alter table public.room_daily_rates enable row level security;

create policy "members can read organization room rates"
on public.room_daily_rates
for select
using (
  auth.uid() is not null
  and (
    public.is_platform_admin()
    or public.has_active_membership(organization_id)
  )
);

-- 쓰기는 동기화(서비스 역할)만 한다. 사람이 고치는 경로는 아직 없다 —
-- 병행 기간에는 Beds24 에 쓰지 않는다(docs/product/33-calendar-write-features.md).
create policy "platform admins can manage room rates"
on public.room_daily_rates
for all
using (public.is_platform_admin())
with check (public.is_platform_admin());

grant select on public.room_daily_rates to authenticated;
grant all on public.room_daily_rates to service_role;
