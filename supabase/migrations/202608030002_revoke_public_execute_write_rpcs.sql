-- ── 쓰기 RPC 의 PUBLIC EXECUTE 회수 ──────────────────────────────────────────────
-- 2026-08-03.
--
-- Postgres 는 함수를 만들면 **기본으로 PUBLIC 에 EXECUTE 를 준다.** Supabase 의 `anon` /
-- `authenticated` 역할도 PUBLIC 의 일원이라, `SECURITY DEFINER` 쓰기 함수가 PostgREST 의
-- `/rest/v1/rpc/<fn>` 로 **로그인 없이 호출 가능한 상태**였다(Supabase security advisor
-- `anon_security_definer_function_executable` 로 검출).
--
-- 특히 `issue_attendance_qr` 이 위험했다. 내부에 아무 권한 검사가 없고 인자를 그대로 신뢰해서,
-- org/site UUID 만 알면 누구나
--   1) 그 사이트의 활성 근태 QR 을 폐기하고(인쇄된 QR 이 먹통 → 출근 체크 불가)
--   2) **자기가 정한 토큰 문자열로** 새 QR 을 발급
-- 할 수 있었다. 2번은 현장에 있지 않아도 유효한 토큰을 손에 넣는다는 뜻이다.
--
-- 네 함수 모두 앱에서는 **service-role 클라이언트로만** 호출한다:
--   issue_attendance_qr        → src/lib/attendance-sites.ts
--   update_staff_suggestion    → src/app/mobile/suggestions/actions.ts
--   lostfound_auto_dispose/purge → 앱 호출 없음(운영 자동화)
-- 따라서 PUBLIC/anon/authenticated 에서 회수해도 앱 동작은 바뀌지 않는다.
--
-- **RLS 판정용 헬퍼는 건드리지 않는다.** `is_task_participant` / `has_org_role` /
-- `is_platform_admin` 같은 함수는 RLS 정책 안에서 **호출자 역할로 실행**되므로 `authenticated`
-- 에게서 EXECUTE 를 회수하면 정책 평가가 통째로 깨진다. advisor 가 같이 경고하지만 그건
-- 판정 전용이라 `auth.uid()` 없이 부르면 아무것도 돌려주지 않는다 — 의도된 노출이다.

revoke execute on function public.issue_attendance_qr(uuid, uuid, uuid, text) from public, anon, authenticated;

revoke execute on function public.update_staff_suggestion(
  uuid, uuid, text, text, text, uuid, uuid, text, uuid, text, text[], uuid[]
) from public, anon, authenticated;

revoke execute on function public.lostfound_auto_dispose() from public, anon, authenticated;
revoke execute on function public.lostfound_auto_purge() from public, anon, authenticated;

-- service_role 은 명시적으로 유지(위 revoke 가 PUBLIC 경유 권한만 없애도록).
grant execute on function public.issue_attendance_qr(uuid, uuid, uuid, text) to service_role;
grant execute on function public.update_staff_suggestion(
  uuid, uuid, text, text, text, uuid, uuid, text, uuid, text, text[], uuid[]
) to service_role;
grant execute on function public.lostfound_auto_dispose() to service_role;
grant execute on function public.lostfound_auto_purge() to service_role;
