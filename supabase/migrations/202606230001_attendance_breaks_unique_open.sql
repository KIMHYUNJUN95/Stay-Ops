-- Prevent duplicate open breaks per session at the DB level.
-- A session may have at most one break with ended_at IS NULL.
-- The existing attendance_breaks_open_idx (non-unique) is kept for query performance;
-- this new unique index adds the write-side constraint.
create unique index attendance_breaks_one_open_per_session_idx
  on public.attendance_breaks(session_id)
  where ended_at is null;
