-- Beds24 webhook ingestion: durable raw-payload capture for unparseable deliveries.
--
-- Why: on 2026-07-22 every live Beds24 webhook was returning HTTP 400 and being
-- dropped *before* any observability row was written, so 5 days of new/cancelled
-- reservations went silently missing from the calendar (first noticed on
-- Takadanobaba room 7). The webhook path used to reject a delivery whose booking
-- record it could not locate (0 candidates) with a bare 400 and no trace.
--
-- Fix contract: an inbound webhook must NEVER be dropped without a trace again.
-- When the handler cannot extract a booking from a delivery, it now records a
-- 'webhook' observability event and stores the full raw body here so the exact
-- shape is debuggable and the delivery is replayable. Raw payload is captured
-- ONLY for failed/unparsed deliveries (the case we must debug), not for every
-- successful booking, keeping bulk PII out of the log as before.

alter table public.beds24_webhook_events
  add column if not exists raw_payload jsonb,
  add column if not exists content_type text;

comment on column public.beds24_webhook_events.raw_payload is
  'Full raw webhook body, captured only for failed/unparsed inbound deliveries so the shape is debuggable and the delivery is replayable. Null for successful webhook batches and reconciliation runs.';
comment on column public.beds24_webhook_events.content_type is
  'Content-Type header of the inbound webhook, captured for failed/unparsed deliveries to distinguish JSON vs form-encoded bodies.';
