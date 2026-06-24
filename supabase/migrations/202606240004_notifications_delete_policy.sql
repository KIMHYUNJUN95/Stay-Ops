-- Allow users to delete their own notifications.
-- RLS for select/insert/update was added in 202606030001_notifications.sql;
-- delete was not covered there, so we add it here.

alter table public.notifications enable row level security;

create policy "Users can delete own notifications"
  on public.notifications
  for delete
  using (recipient_user_id = auth.uid());
