-- Account deletion: tombstone support for profiles
--
-- Strategy: when a user deletes their account we keep the profiles row as a
-- tombstone so that operational records (attendance, cleaning, tasks, etc.)
-- retain their user_id FK and do not orphan. The auth user is hard-deleted so
-- the email is freed and re-registration is possible.
--
-- Changes:
--   1. Remove the ON DELETE CASCADE from profiles → auth.users so that
--      deleting the auth user does NOT cascade-delete the profile row.
--   2. Add deleted_at to track tombstoned profiles.
--   3. Recreate the phone_number unique index as a partial index that excludes
--      deleted profiles, so the same number can be used after re-registration.

-- 1. Drop the cascading FK from profiles.id to auth.users
alter table public.profiles
  drop constraint if exists profiles_id_fkey;

-- 2. Add tombstone timestamp
alter table public.profiles
  add column if not exists deleted_at timestamptz;

-- 3. Recreate partial phone uniqueness (only among non-deleted profiles)
drop index if exists profiles_phone_number_unique;
create unique index profiles_phone_number_unique
  on public.profiles (phone_number)
  where deleted_at is null;
