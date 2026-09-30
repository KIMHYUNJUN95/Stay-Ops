-- has_capability 는 로그인 사용자에게 **자기 권한만** 답한다 (2026-09-30).
--
-- 도메인 계약: docs/engineering/05-rls-permissions.md 「has_capability 는 자기 자신만」
-- 원본: 202609100001_capability_foundation.sql
--
-- 이 함수는 SECURITY DEFINER 이고 `authenticated` 에 EXECUTE 가 있다. 대상 사용자를 인자로 받으므로
-- 로그인한 누구나 `rpc('has_capability', {…, target_user_id: <남의 id>})` 로 **다른 직원이 어떤 권한을
-- 가졌는지** 알아낼 수 있었다(05 문서의 RLS 작성 규칙 2 가 경고하는 형태). 데이터는 새지 않지만
-- 권한 지도는 샌다.
--
-- 호출처는 전부 `auth.uid()` 를 넘긴다 — job_applications 읽기 정책, capability_organization_ids().
-- 그래서 **JWT 가 있는 호출에서 대상 ≠ auth.uid() 이면 false** 를 조건으로 더한다. 서비스 롤(JWT 에
-- sub 없음 → auth.uid() null)과 SQL 직접 실행은 예전 그대로다. 판정 본문은 한 글자도 바꾸지 않았다.
create or replace function public.has_capability(target_organization_id uuid, target_user_id uuid, target_capability text)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  with me as (
    select
      exists (
        select 1 from public.platform_admins pa
        where pa.user_id = target_user_id and pa.is_active = true
      ) as is_platform,
      (
        select m.role from public.memberships m
        where m.organization_id = target_organization_id
          and m.user_id = target_user_id
          and m.status = 'active'
        limit 1
      ) as role
  ),
  policy as (
    select
      coalesce((select cp.individual_grant from public.capability_policies cp
                where cp.capability = target_capability), false) as individual_grant,
      coalesce((select cp.individual_deny from public.capability_policies cp
                where cp.capability = target_capability), false) as individual_deny,
      coalesce((select cp.platform_bypass from public.capability_policies cp
                where cp.capability = target_capability), true) as platform_bypass
  ),
  effects as (
    select
      bool_or(o.effect = 'grant') as granted,
      bool_or(o.effect = 'deny') as denied
    from public.membership_permission_overrides o
    where o.organization_id = target_organization_id
      and o.user_id = target_user_id
      and o.permission_key = target_capability
      and o.revoked_at is null
      and (o.expires_at is null or o.expires_at > now())
  )
  select
    -- 로그인 사용자는 자기 자신만 물을 수 있다(서비스 롤·SQL 직접 실행은 auth.uid() 가 null).
    (auth.uid() is null or target_user_id = auth.uid())
    and not (
      coalesce((select denied from effects), false)
      and (select individual_deny from policy)
      and coalesce((select role from me), 'staff'::organization_role)
          not in ('owner', 'senior_managing_director')
      and not coalesce((select is_platform from me), false)
    )
    and (
      (coalesce((select is_platform from me), false) and (select platform_bypass from policy))
      or (coalesce((select granted from effects), false) and (select individual_grant from policy))
      or exists (
        select 1 from public.capability_roles cr
        where cr.capability = target_capability
          and (
            cr.role = (select role from me)
            or ((select role from me) = 'senior_managing_director' and cr.role = 'owner')
          )
      )
    );
$function$;
