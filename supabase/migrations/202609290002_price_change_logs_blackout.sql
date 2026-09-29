-- 변경 이력에 차단도 남긴다 — `price_change_logs.field` 에 'blackout' 추가.
--
-- 도메인 계약: docs/product/33-calendar-write-features.md → 「이력 · 전송 로그」
--
-- 판매 캘린더 「이력 → 변경 이력」이 가격·최소숙박·차단을 **한 이력**으로 보여준다. 차단은 값이 아니라
-- 상태라 `old_value`/`new_value` 에 **1 = 차단, 0 = 열림**으로 적는다. Beds24 에서 바뀐 차단(동기화가
-- 이전 값과 비교해 잡는다)과 우리 앱이 건 차단이 둘 다 여기로 온다. 가격 개입 판정은 `price1` 만 읽으므로
-- 영향이 없다.

alter table public.price_change_logs drop constraint if exists price_change_logs_field_check;
alter table public.price_change_logs
  add constraint price_change_logs_field_check
  check (field in ('price1', 'price2', 'price3', 'min_stay', 'blackout'));
