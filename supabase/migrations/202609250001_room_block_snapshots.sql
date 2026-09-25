-- 우리가 건 블록(blackout override)을 되돌리기 위한 스냅샷 (2026-09-25).
--
-- WHY A SEPARATE TABLE
-- --------------------
-- `room_blocks` 에 컬럼을 더할 수 없다. Beds24 블록 동기화(`room-blocks-sync.ts`)는 창 안의
-- `source='beds24'` 행을 **전부 지우고 다시 넣는다.** 거기 붙인 값은 다음 동기화에 날아간다.
-- 블록 자체는 Beds24 가 진실이고(그래서 지우고 다시 읽는 게 맞다), 스냅샷은 **우리만 아는
-- 사실**이라 수명이 다르다. 성격이 다른 것은 따로 둔다.
--
-- WHY A SNAPSHOT AT ALL
-- ---------------------
-- blackout 을 걸면 Beds24 가 그 날짜의 재고를 건드린다. 해제할 때 `override: "none"` 만 돌리면
-- **막기 전 재고로 돌아가지 않는다** — 방이 안 팔리거나, 있어야 할 것보다 많이 팔린다.
-- 그래서 저쪽도 막기 **전에** numAvail 을 찍어 두었다가 해제할 때 같이 써넣는다
-- (`preBlockNumAvailByDate` — `functions/index.js:7643`).
--
-- WHY IT DOUBLES AS AN OWNERSHIP RECORD
-- -------------------------------------
-- 행이 있으면 **우리가 건 블록**이고, 없으면 사람이 Beds24 화면에서 직접 건 것이다.
-- 후자는 복원할 값이 없으므로 재고를 건드리지 않고 `override: none` 만 돌려야 한다 —
-- 저쪽의 `isAppCreatedBlockEntry` / `isBulkDeletableBlockEntry` 가 하던 구분이다.
-- 우리 화면에서 남의 블록도 해제할 수 있게 하되, **무엇을 되돌릴 수 있는지는 구분해서** 보여준다.

create table public.room_block_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Beds24 roomId. 방 이름이 바뀌어도 되돌릴 대상을 잃지 않는다.
  external_room_id text not null,
  -- 막은 「밤」의 범위. 양끝 포함 — `room_blocks` 와 같은 규칙이다.
  start_date date not null,
  end_date date not null,
  -- { "2026-10-01": 1, "2026-10-02": 1 } — 막기 직전의 numAvail. 값을 못 읽은 날짜는 빠진다.
  pre_block_num_avail jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (char_length(trim(external_room_id)) > 0),
  -- 같은 방·같은 구간의 블록은 하나뿐이다. 다시 걸면 스냅샷을 덮어쓴다.
  unique (organization_id, external_room_id, start_date, end_date)
);

create trigger room_block_snapshots_set_updated_at
before update on public.room_block_snapshots
for each row execute function public.set_updated_at();

-- 해제할 때 「이 방의 이 날짜를 덮는 스냅샷」을 찾는다.
create index room_block_snapshots_org_room_range_idx
on public.room_block_snapshots(organization_id, external_room_id, start_date, end_date);

alter table public.room_block_snapshots enable row level security;

-- 읽기는 조직 구성원. 쓰기는 **서비스 롤 전용** — 블록 생성·해제는 Beds24 왕복과 검증을 거쳐야
-- 하므로 클라이언트가 직접 행을 만들 일이 없다.
create policy "members can read organization room block snapshots"
on public.room_block_snapshots
for select
using (
  auth.uid() is not null
  and (
    public.is_platform_admin()
    or public.has_active_membership(organization_id)
  )
);

create policy "platform admins can manage room block snapshots"
on public.room_block_snapshots
for all
using (public.is_platform_admin())
with check (public.is_platform_admin());

grant select on public.room_block_snapshots to authenticated;
grant all on public.room_block_snapshots to service_role;
