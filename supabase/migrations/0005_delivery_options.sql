-- Delivery method sub-choice + fee for the aggregate checkout total.
--   delivery_method: email | mail | pickup | robot | driver  (existing column)
--   delivery_option: sub-choice — mail tier (priority/overnight) or Uber zone
--   delivery_price:  surcharge added on top of the $150 tag (dollars)

alter table public.orders
  add column if not exists delivery_option text,
  add column if not exists delivery_price  numeric not null default 0;
