-- 수기 예약 — 같은 요청은 한 번만 만든다(멱등 키) (2026-10-05).
--
-- 문서: docs/product/33-calendar-write-features.md → 「수동 예약 생성」 · docs/engineering/04-data-model.md
--
-- Beds24 에 예약은 만들어졌는데 우리 표 반영이 실패하면 화면엔 안 보이고, 사람이 다시 누르면 **같은 예약이 하나 더**
-- 생겼다. 화면은 패널을 열 때 요청 키(uuid) 하나를 만들고, 서버는 Beds24 를 부르기 **전에** 그 키를 여기 잡는다.
-- 같은 키가 다시 오면: 이미 만든 예약이 있으면 그 예약을 돌려주고(새로 만들지 않음), 아직 처리 중이면 거절한다.
-- Beds24 가 실패로 답하면 키를 지워 다시 시도할 수 있게 한다.
--
-- 서버 액션(service-role)만 읽고 쓴다 — RLS 를 켜고 정책은 두지 않는다.
create table if not exists public.ops_manual_booking_requests (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  request_key text not null check (char_length(request_key) between 8 and 64),
  booking_id text,
  reservation_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (organization_id, request_key)
);

comment on table public.ops_manual_booking_requests is
  '수기 예약 멱등 키 — 같은 요청으로 Beds24 예약이 두 번 생기지 않게 한다. service-role 전용.';

alter table public.ops_manual_booking_requests enable row level security;
revoke all on public.ops_manual_booking_requests from anon, authenticated;
grant all on public.ops_manual_booking_requests to service_role;
