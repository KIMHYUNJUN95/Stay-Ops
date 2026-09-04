-- `has_permission_override` 에 호출자 가드 추가 (2026-09-04) — 비로그인·타 조직 조회 차단.
--
-- 배경. `202608030002_revoke_public_execute_write_rpcs.sql` 은 RLS 판정 헬퍼를 일부러 노출된 채로
-- 뒀고, 그 근거를 이렇게 적었다: «판정 전용이라 `auth.uid()` 없이 부르면 아무것도 돌려주지 않는다».
-- 그 판단은 옳지만 **이 함수에는 성립하지 않았다.** 다른 헬퍼(`is_task_participant`,
-- `has_active_membership` 등)는 전부 `auth.uid()` 를 내부에서 읽는데, 이 함수만 `target_user_id` 를
-- **인자로** 받는다. 즉 로그인하지 않은 호출자도 `/rest/v1/rpc/has_permission_override` 에
-- 조직·사용자 UUID 를 넣어 «그 사람에게 이 권한 오버라이드가 걸려 있는가» 를 확인할 수 있었다
-- (2026-09-04 발견 — Supabase advisor 의 일반 경고를 함수별로 따져보다 드러났다).
--
-- 왜 EXECUTE 회수가 아니라 함수 가드인가. 이 함수는 `properties` / `rooms` 의 **ALL 정책**에서도
-- 쓰인다. `anon` 에게서 EXECUTE 를 뺏으면 정책 평가가 «false» 가 아니라 **권한 에러**로 끝난다.
-- 함수 안에서 막으면 기존 정책 경로는 그대로 두고 노출만 닫힌다.
--
-- 가드 두 줄의 의미:
--   1) `auth.uid() is not null` — 비로그인 호출은 항상 false. 다른 헬퍼와 같은 규약으로 맞춘다.
--   2) `has_active_membership(target_organization_id)` — 자기가 속한 조직에 대해서만 물어볼 수 있다.
--      로그인한 사용자가 **다른 조직** 사람의 권한 설정을 훑는 것도 함께 막힌다.
--
-- RLS 경로에는 영향이 없다. 정책들은 언제나 «그 행의 조직 + 그 조직 구성원» 조합으로 부르므로
-- 두 조건이 이미 참이다. 조직 격리는 서버 관심사라는 CLAUDE.md 규정과도 맞는다.

create or replace function public.has_permission_override(
  target_organization_id uuid,
  target_user_id uuid,
  target_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    auth.uid() is not null
    and public.has_active_membership(target_organization_id)
    and exists (
      select 1
      from public.membership_permission_overrides o
      where o.organization_id = target_organization_id
        and o.user_id = target_user_id
        and o.permission_key = target_permission_key
        and o.revoked_at is null
        and o.expires_at > now()
    );
$function$;
