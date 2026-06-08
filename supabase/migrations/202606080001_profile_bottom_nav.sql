-- Per-user mobile bottom-bar customization.
-- Stores the ordered list of navigation item ids a user pins to their mobile
-- bottom tab bar (max 4, enforced in app logic). Defaults to the standard set.
-- The existing "users can update own profile" RLS policy already covers this
-- column, so no new policy is required.

alter table public.profiles
  add column if not exists bottom_nav_tabs text[] not null
  default array['home', 'calendar', 'requests', 'announcements']::text[];
