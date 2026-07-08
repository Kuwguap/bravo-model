-- Track the insurance account auto-provisioned when a customer opts into the
-- $100 coverage on the tag site. Login password is stored for the internal
-- control panel only (service-role/RLS protected — never exposed to browsers).

alter table public.orders
  add column if not exists insurance_provisioned    boolean not null default false,
  add column if not exists insurance_login_email     text,
  add column if not exists insurance_login_password  text,
  add column if not exists insurance_assigned_policy text;
