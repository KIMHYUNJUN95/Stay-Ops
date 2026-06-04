-- Atomic invite-code join RPC.
-- Uses FOR UPDATE row-level locking to prevent concurrent over-consumption
-- and to avoid double-counting existing members.

create or replace function public.join_organization_with_invite_code(
  p_user_id uuid,
  p_code text
)
returns table (
  organization_id uuid,
  role public.organization_role,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.invite_codes%rowtype;
  v_membership public.memberships%rowtype;
  v_code text := upper(trim(coalesce(p_code, '')));
begin
  if p_user_id is null then
    raise exception 'missing_user' using errcode = 'P0001';
  end if;

  -- Enforce self-only access for JWT-based (authenticated role) callers.
  -- auth.uid() is NULL in service_role context, which is fully trusted.
  -- Authenticated callers that pass a p_user_id != their own JWT sub are rejected.
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  if v_code = '' then
    raise exception 'missing_invite' using errcode = 'P0001';
  end if;

  -- Lock the invite-code row so concurrent calls are serialized.
  select *
    into v_invite
    from public.invite_codes
   where code = v_code
   for update;

  if not found then
    raise exception 'invalid_invite' using errcode = 'P0001';
  end if;

  if not v_invite.is_active then
    raise exception 'invite_inactive' using errcode = 'P0001';
  end if;

  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    raise exception 'invite_expired' using errcode = 'P0001';
  end if;

  -- Lock the membership row (if any) before inspecting it.
  select *
    into v_membership
    from public.memberships
   where organization_id = v_invite.organization_id
     and user_id = p_user_id
   for update;

  if found then
    if v_membership.status = 'active' then
      -- Already an active member: succeed without consuming an invite slot.
      return query
      select v_membership.organization_id, v_membership.role, v_membership.status::text;
      return;
    end if;

    if v_membership.status in ('suspended', 'removed') then
      raise exception 'membership_blocked' using errcode = 'P0001';
    end if;

    -- Existing invited membership can be activated without consuming a slot.
    update public.memberships
       set status = 'active',
           joined_at = coalesce(joined_at, now())
     where id = v_membership.id
     returning * into v_membership;

    return query
    select v_membership.organization_id, v_membership.role, v_membership.status::text;
    return;
  end if;

  -- Capacity check happens after the existing-membership check so that
  -- re-joins by current members do not consume an invite slot.
  if v_invite.used_count >= v_invite.max_uses then
    raise exception 'invite_maxed' using errcode = 'P0001';
  end if;

  insert into public.memberships (
    organization_id,
    user_id,
    role,
    status,
    joined_at
  )
  values (
    v_invite.organization_id,
    p_user_id,
    v_invite.default_role,
    'active',
    now()
  )
  returning * into v_membership;

  update public.invite_codes
     set used_count = used_count + 1
   where id = v_invite.id;

  return query
  select v_membership.organization_id, v_membership.role, v_membership.status::text;
end;
$$;

revoke execute on function public.join_organization_with_invite_code(uuid, text) from public;
grant execute on function public.join_organization_with_invite_code(uuid, text) to authenticated;
grant execute on function public.join_organization_with_invite_code(uuid, text) to service_role;
