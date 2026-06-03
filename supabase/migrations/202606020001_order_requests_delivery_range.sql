-- Support delivery date range for order processing.
alter table public.order_requests
  add column delivery_start_date date,
  add column delivery_end_date date;

alter table public.order_requests
  add constraint order_requests_delivery_range_valid
  check (
    (delivery_start_date is null and delivery_end_date is null)
    or (
      delivery_start_date is not null
      and delivery_end_date is not null
      and delivery_start_date <= delivery_end_date
    )
  );

