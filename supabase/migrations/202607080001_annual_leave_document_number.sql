-- 休暇届 document number for approved annual-leave requests.
--
-- Format: AL-YYYY-MM-NNN, where YYYY-MM is the approval month (Asia/Tokyo) and NNN is a
-- zero-padded sequence within that organization + month. Assigned when a request is approved
-- (see approveLeaveRequestForApprover). No separate documents table — the printable 休暇届 is
-- derived from the approved request row; only the document number is persisted here.

alter table public.annual_leave_requests
  add column if not exists document_number text;

-- Unique per organization so numbers never collide; a partial index (non-null only) also lets
-- concurrent approvals fail-and-retry cleanly on a duplicate.
create unique index if not exists annual_leave_requests_org_docnum_uniq
  on public.annual_leave_requests(organization_id, document_number)
  where document_number is not null;

-- Backfill already-approved requests: sequential per organization + approval(Tokyo) month,
-- ordered by approval time (falling back to created_at for any legacy row without approved_at).
with numbered as (
  select
    id,
    to_char((coalesce(approved_at, created_at) at time zone 'Asia/Tokyo'), 'YYYY-MM') as ym,
    row_number() over (
      partition by
        organization_id,
        to_char((coalesce(approved_at, created_at) at time zone 'Asia/Tokyo'), 'YYYY-MM')
      order by coalesce(approved_at, created_at), id
    ) as nnn
  from public.annual_leave_requests
  where status = 'approved' and document_number is null
)
update public.annual_leave_requests r
set document_number = 'AL-' || n.ym || '-' || lpad(n.nnn::text, 3, '0')
from numbered n
where r.id = n.id;
