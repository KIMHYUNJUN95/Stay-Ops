do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'profile_gender'
  ) then
    create type public.profile_gender as enum (
      'female',
      'male'
    );
  end if;
end
$$;

alter table public.profiles
add column if not exists gender public.profile_gender;
