-- Add delivery_date to order_requests.
-- Nullable date column; populated when status transitions to "ordered".
alter table public.order_requests
  add column delivery_date date;
