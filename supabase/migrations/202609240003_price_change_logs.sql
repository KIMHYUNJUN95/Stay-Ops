-- 가격·최소숙박 변경 이력
--
-- 도메인 계약: docs/product/33-calendar-write-features.md 「이력을 남긴다」
-- 원본: STAY ARI Manager `price_change_logs`
--
-- ## 왜 필요한가
--
-- 이 값들은 **채널로 그대로 나간다.** 가격이 이상하면 제일 먼저 나오는 질문이 「누가 언제
-- 얼마에서 얼마로 바꿨나」다. 지금은 작업 큐에 결과만 남고 **이전 값이 없어** 되돌릴 근거도
-- 없다.
--
-- ## 칸 단위로 넣는다
--
-- 저쪽은 한 번의 수정을 문서 하나에 `priceSnapshot` 배열로 담고 화면에서 펼친다 — Firestore
-- 라 그게 쌌기 때문이다. 우리는 **(객실, 날짜) 한 칸이 한 행**이다. 「이 칸의 이력」이
-- 인덱스 조회 한 번으로 끝나고, 저쪽이 상한(`PRICE_HISTORY_TOTAL_BUDGET`)을 두고 메모리에서
-- 펼치던 일을 안 해도 된다.
create table if not exists public.price_change_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  -- **실제로 쓴 유닛**이다. 가격은 소스 유닛, 최소숙박은 그날 운영 중인 유닛으로 가므로
  -- 같은 칸이라도 서로 다를 수 있다(docs 33 「쓰기 대상 유닛」).
  room_id uuid references public.rooms(id) on delete set null,
  external_room_id text not null,
  -- 화면의 **행**. 유닛이 바뀌어도 사람이 보는 객실은 그대로라 이력이 끊기면 안 된다.
  room_label text,
  stay_date date not null,

  field text not null check (field in ('price1', 'price2', 'price3', 'min_stay')),
  -- `null` 은 **값이 없었다**는 뜻이다. 0 이 아니다.
  old_value integer,
  new_value integer,

  -- 어떤 작업에서 나왔나. 한 번의 조정이 수십 행을 만들므로 묶어 보려면 필요하다.
  job_id uuid references public.beds24_price_jobs(id) on delete set null,
  -- 'amount' | 'percent' | 'min_stay' — 「퍼센트로 바꿨다」가 이력에 남아야 한다.
  adjust_mode text,
  percent_value integer,

  changed_by uuid references public.profiles(id) on delete set null,
  changed_by_name text,
  created_at timestamptz not null default now()
);

-- 「이 칸의 이력」 — 캘린더가 창 범위로 읽는다.
create index if not exists price_change_logs_cell_idx
  on public.price_change_logs (organization_id, stay_date, room_label, created_at desc);

-- 「이 작업이 무엇을 바꿨나」.
create index if not exists price_change_logs_job_idx
  on public.price_change_logs (job_id);

alter table public.price_change_logs enable row level security;

-- `room_daily_rates` 와 같은 규칙 — 구성원은 읽고, 쓰기는 서비스 롤(워커)만.
create policy "members can read organization price logs"
on public.price_change_logs
for select
using (
  auth.uid() is not null
  and (
    public.is_platform_admin()
    or public.has_active_membership(organization_id)
  )
);

create policy "platform admins can manage price logs"
on public.price_change_logs
for all
using (public.is_platform_admin())
with check (public.is_platform_admin());

grant select on public.price_change_logs to authenticated;
grant all on public.price_change_logs to service_role;

-- 조정 방식은 **작업에 실려 와야** 워커가 이력에 적을 수 있다.
alter table public.beds24_price_jobs
  add column if not exists adjust_mode text,
  add column if not exists percent_value integer;
