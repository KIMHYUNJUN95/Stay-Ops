grant usage on schema public to anon, authenticated, service_role;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

grant execute on function public.is_platform_admin() to authenticated, service_role;
grant execute on function public.has_active_membership(uuid) to authenticated, service_role;
grant execute on function public.has_org_role(uuid, public.organization_role[]) to authenticated, service_role;
