-- Beds24 예약 정합성의 「어디까지 봤는가」 (2026-09-16).
--
-- WHY
-- ---
-- 정합성 작업은 지금까지 **날짜 창**(당월 + 2개월)을 훑었다. 그런데 예약 웹훅은 날짜와 무관하게
-- 들어와서, 창 밖 예약이 이미 223건 쌓여 있었다(가장 먼 것 2027-05-03). 그것들은 **안전망 밖**이다
-- — 웹훅을 한 번 놓치면 영영 안 들어온다. 2026-09-11 에 크리스마스 예약 3건이 그렇게 빠져 있었다.
--
-- 창을 넓히는 대신 **질문을 바꾼다.** Beds24 는 `modifiedFrom` 을 지원한다 — 「이 시각 이후 바뀐
-- 것만」이다. 그러면 2022년 예약이든 2027년 예약이든 **날짜와 무관하게** 잡히고, 바뀐 게 없으면
-- 거의 공짜다(실측: 24시간치 34건, 요청 비용 1).
--
-- 이 테이블은 그 기준 시각 하나를 들고 있다.
create table if not exists public.beds24_sync_state (
  -- 조직당 한 행. 전역 상태라 단일 행 제약을 쓴다(recruit_sync_state 와 같은 방식).
  id boolean primary key default true,
  -- 마지막으로 성공한 증분 수집의 기준 시각. 다음 실행은 여기서부터(겹침 여유를 빼고) 본다.
  last_modified_cursor timestamptz,
  -- 마지막으로 전량 창 훑기를 돌린 시각. 커서가 깨졌을 때의 대비책이 언제 돌았는지 본다.
  last_full_sweep_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint beds24_sync_state_single_row check (id)
);

insert into public.beds24_sync_state (id) values (true) on conflict (id) do nothing;

alter table public.beds24_sync_state enable row level security;

-- 서비스 롤만 쓴다. 사용자 클라이언트가 읽을 이유가 없다.
-- RLS 를 켜고 정책을 하나도 안 두면 서비스 롤 외에는 조용히 0행이 된다 — 의도한 동작이다.
grant all on public.beds24_sync_state to service_role;
