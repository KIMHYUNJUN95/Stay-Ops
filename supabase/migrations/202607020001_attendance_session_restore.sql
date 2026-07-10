-- Allow a new `restore` audit action_type: an admin un-invalidating a session (status back to
-- completed/open, invalidated_* cleared, review_state normalized) after confirming the original
-- clock-in/out was legitimate and the earlier invalidate was a mistake. Invalidate remains
-- non-destructive (no hard delete); this is its explicit, auditable reverse.
alter table public.attendance_session_audits
  drop constraint attendance_session_audits_action_type_check;

alter table public.attendance_session_audits
  add constraint attendance_session_audits_action_type_check
  check (action_type in ('manual_create', 'manual_update', 'invalidate', 'restore', 'correction_apply', 'reopen', 'finalize'));
