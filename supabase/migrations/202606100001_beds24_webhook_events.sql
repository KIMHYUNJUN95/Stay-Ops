-- Beds24 webhook / reconciliation observability log.
--
-- Why: reservation ingestion is webhook-first (see docs/planning/01-decision-log.md
-- "Beds24 Webhook Strategy"). A silently dropped or never-delivered webhook used to
-- leave zero trace, so a missing reservation could only be discovered by an operator
-- noticing a gap in the calendar. This table records every inbound webhook batch and
-- every reconciliation run with its processing result, making ingestion misses
-- visible and debuggable instead of invisible.
--
-- This is platform/operational data, not org business data: it is readable only by
-- platform admins and writable only by the service role (webhook + cron paths).

create table public.beds24_webhook_events (
  id uuid primary key default gen_random_uuid(),
  -- Resolved org when known. Nullable because an inbound webhook may fail to resolve
  -- an organization (one of the documented drop reasons we want to capture).
  organization_id uuid references public.organizations(id) on delete set null,
  -- 'webhook' = inbound Beds24 push; 'reconciliation' = scheduled/manual catch-up sync.
  trigger_source text not null default 'webhook',
  http_status integer,
  processed_count integer not null default 0,
  succeeded_count integer not null default 0,
  failed_count integer not null default 0,
  -- Per-result processing modes (e.g. upserted, cancelled_existing_rows,
  -- missing_required_fields) for quick scanning of what each batch did.
  modes text[] not null default '{}'::text[],
  -- Compact per-booking summary: [{ bookId, status, mode }]. Intentionally not the
  -- full raw payload — enough to trace a specific reservation without storing bulk PII.
  booking_summary jsonb not null default '[]'::jsonb,
  error_message text,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (trigger_source in ('webhook', 'reconciliation'))
);

create index beds24_webhook_events_received_idx
on public.beds24_webhook_events(received_at desc);

create index beds24_webhook_events_source_idx
on public.beds24_webhook_events(trigger_source, received_at desc);

alter table public.beds24_webhook_events enable row level security;

create policy "platform admins can read webhook events"
on public.beds24_webhook_events
for select
using (public.is_platform_admin());

create policy "platform admins can manage webhook events"
on public.beds24_webhook_events
for all
using (public.is_platform_admin())
with check (public.is_platform_admin());

grant select on public.beds24_webhook_events to authenticated;
grant all on public.beds24_webhook_events to service_role;
