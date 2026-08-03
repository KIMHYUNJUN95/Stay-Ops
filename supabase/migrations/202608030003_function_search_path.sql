-- ── 트리거 함수의 search_path 고정 ───────────────────────────────────────────────
-- 2026-08-03. Supabase security advisor `function_search_path_mutable` 해소.
--
-- `search_path` 를 안 박아두면 함수가 호출자의 search_path 를 따른다. 공격자가 자기 스키마를
-- 앞에 끼워 넣고 같은 이름의 객체를 정의하면 함수가 그쪽을 부르게 된다. 두 함수 모두 트리거라
-- 임의 호출은 어렵지만, **다른 함수들은 이미 전부 `SET search_path` 를 쓰고 있어** 여기만
-- 예외로 남아 있었다. 본문은 그대로 두고 설정만 붙인다.
alter function public.set_updated_at() set search_path = public;
alter function public.prevent_popup_dismissal_identity_change() set search_path = public;
