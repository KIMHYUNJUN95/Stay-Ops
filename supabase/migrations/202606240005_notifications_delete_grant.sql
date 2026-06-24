-- Grant DELETE permission on notifications to authenticated users.
-- The RLS delete policy already exists (202606240004_notifications_delete_policy.sql)
-- but the table-level grant was missing, causing all deletes to fail silently.
grant delete on public.notifications to authenticated;
