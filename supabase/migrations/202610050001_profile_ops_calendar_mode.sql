-- 판매 캘린더 보기 기억 (2026-10-05).
--
-- 도메인 계약: docs/product/33-calendar-write-features.md 「30일 · 월간 보기 기억」
--
-- 사용자마다 마지막으로 고른 보기(30일 `rolling` / 월간 `monthly`)를 남겨, 다음에 판매 캘린더를 열면
-- (주소에 보기가 없을 때) 그 보기로 연다. 대시보드 · 모바일이 같은 값을 쓴다. 비어 있으면 30일.
-- 본인 행만 서버(service-role)가 쓰고 읽는다 — 새 RLS 정책은 없다.
alter table public.profiles
  add column if not exists ops_calendar_mode text
    check (ops_calendar_mode is null or ops_calendar_mode in ('rolling', 'monthly'));

comment on column public.profiles.ops_calendar_mode is '판매 캘린더 마지막 보기(rolling·monthly). 없으면 30일.';
