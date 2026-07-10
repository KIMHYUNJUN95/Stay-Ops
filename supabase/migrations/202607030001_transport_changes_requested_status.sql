-- Transport reimbursement review: add a 'changes_requested' report status.
--
-- Practical review gap: previously an admin could only reject or approve a submitted report, and an
-- approved/rejected report could never be reopened. This adds a distinct "sent back for fixes"
-- state (changes_requested) — the worker can edit and resubmit, unlike a hard rejection intent — and
-- enables reopening approved/rejected reports (which is a transition back to 'submitted', so no new
-- status value is needed for reopen). Only the CHECK constraint changes here.

alter table public.transport_reimbursement_reports
  drop constraint transport_reimbursement_reports_status_check;

alter table public.transport_reimbursement_reports
  add constraint transport_reimbursement_reports_status_check
  check (status in ('draft','submitted','reviewing','approved','rejected','changes_requested'));
