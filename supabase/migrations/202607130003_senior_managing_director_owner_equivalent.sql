-- Phase 2 (cont.) of the 2026-07-13 user/permission model rework.
--
-- Make `senior_managing_director` (전무) FULLY owner-equivalent across every RLS policy WITHOUT editing
-- each policy: `has_org_role` is the single choke point every owner-gated policy calls
-- (`has_org_role(org, array['owner', ...])`). We redefine it so that a member whose role is
-- senior_managing_director satisfies any check that allows 'owner'. One function change → 전무 gains
-- owner's access everywhere the DB enforces it.
--
-- Requires 202607130002 (the enum value) to be applied first.
create or replace function public.has_org_role(
  target_organization_id uuid,
  allowed_roles public.organization_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    where m.organization_id = target_organization_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and (
        m.role = any(allowed_roles)
        -- 전무 is owner-equivalent: it passes any policy that allows owner.
        or (m.role = 'senior_managing_director' and 'owner' = any(allowed_roles))
      )
  );
$$;
