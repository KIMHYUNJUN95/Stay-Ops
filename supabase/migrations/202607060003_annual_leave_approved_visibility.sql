-- Annual leave — mobile team calendar (L5) visibility.
-- Confirmed 2026-07-06: the mobile leave calendar shows ALL staff's leave (including the viewer's
-- own), but ONLY approved requests — pending/rejected/draft/cancelled stay private to the requester
-- (and to leave approvers). This is a narrower, additive read grant on top of the existing
-- self-or-approver policy from migration 202607060002; it does not change any write behavior.

create policy "annual_leave_requests_org_approved_select"
  on public.annual_leave_requests
  for select to authenticated
  using (
    status = 'approved'
    and auth.uid() is not null
    and public.has_active_membership(organization_id)
  );
