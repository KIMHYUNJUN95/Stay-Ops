-- 예약의 **마지막으로 알던 금액** (2026-10-07)
--
-- 도메인 계약: docs/product/36-automation-control.md → 「취소 금액 — 얼마가 빠졌나」
--
-- Beds24 는 예약이 취소되면 `price` 를 0 으로 비운다. 취소 알림 · 일일 리포트가 「얼마가 빠져나갔나」를 보여야 하는데(사용자),
-- 요금 내역(`rateDescription`)으로 되살리는 것은 Booking.com 은 되지만 Airbnb 취소의 약 28% 는 내역까지 0 으로 바뀌어 온다
-- (최근 30일 116건 중 33건). 그래서 **DB 가 직접 기억한다** — 예약 행이 바뀔 때 새 금액이 0 이하이면 직전 금액을 남긴다.
--
-- Beds24 동기화 코드(웹훅 · 정합성 · 백필)는 건드리지 않는다. 그 코드는 이 컬럼을 모르므로 upsert 의 SET 에 없고, 트리거만
-- 값을 정한다. 기존 행은 채우지 않는다(일괄 수정이 updated_at 을 12,000건 넘게 흔든다) — 취소되는 순간 OLD 의 금액을 잡으므로
-- 따로 채울 필요가 없다. 금액을 숫자로 못 읽으면 아무것도 하지 않는다(예약 저장을 절대 막지 않는다).

alter table public.reservations add column if not exists last_known_amount numeric;

comment on column public.reservations.last_known_amount is
  '마지막으로 0 보다 컸던 raw_payload.price. 취소로 price 가 0 이 돼도 남는다(취소 금액 표시용). 트리거가 채운다.';

create or replace function public.reservations_keep_last_known_amount()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_new numeric;
  v_old numeric;
begin
  begin
    v_new := nullif(regexp_replace(coalesce(new.raw_payload ->> 'price', ''), '[^0-9.]', '', 'g'), '')::numeric;
  exception when others then
    v_new := null;
  end;

  if v_new is not null and v_new > 0 then
    new.last_known_amount := v_new;
  elsif tg_op = 'UPDATE' then
    begin
      v_old := nullif(regexp_replace(coalesce(old.raw_payload ->> 'price', ''), '[^0-9.]', '', 'g'), '')::numeric;
    exception when others then
      v_old := null;
    end;
    new.last_known_amount := coalesce(old.last_known_amount, case when v_old > 0 then v_old end, new.last_known_amount);
  end if;
  return new;
end;
$$;

drop trigger if exists reservations_keep_last_known_amount on public.reservations;
create trigger reservations_keep_last_known_amount
  before insert or update on public.reservations
  for each row execute function public.reservations_keep_last_known_amount();
