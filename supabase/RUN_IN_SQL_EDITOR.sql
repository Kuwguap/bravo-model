-- ============================================================
-- NJ Temporary Tag — run this ONCE in the Supabase SQL editor.
-- Safe to re-run. Does NOT touch your insurance tables.
-- ============================================================

drop function if exists public.allocate_plate(boolean);

-- ==== 0001_init_tags_dispatch ====

-- ============================================================================
-- Phase 1 schema: tag orders + Telegram dispatch (drivers/supervisors/deliveries)
-- + unified transactions ledger + plate-allocation settings.
--
-- Access in Phase 1 is exclusively via the Supabase service role (tag-site API
-- routes and the dispatch bot), which bypasses RLS. RLS is enabled with no
-- public policies so anon/authenticated clients are denied by default.
-- Phase 2 (insurance portal + auth-based customer access) adds scoped policies.
-- ============================================================================

create extension if not exists pgcrypto;

-- ─── users (tag customers; app-managed, magic-link auth) ─────────────────────
create table if not exists public.users (
  id                   uuid primary key default gen_random_uuid(),
  email                text not null unique,
  first_name           text,
  last_name            text,
  phone                text,
  renewal_enabled      boolean not null default true,
  last_reminder_at     timestamptz,
  next_renewal_due_at  timestamptz,
  created_at           timestamptz not null default now()
);

-- ─── orders (temp-tag purchases + dispatch bookkeeping) ──────────────────────
create table if not exists public.orders (
  id                          uuid primary key default gen_random_uuid(),
  reference                   text unique,
  user_id                     uuid references public.users (id) on delete set null,
  status                      text not null default 'pending'
                                check (status in ('pending','paid','failed')),
  state                       text,
  first_name                  text,
  last_name                   text,
  email                       text,
  phone                       text,
  address                     text,
  address2                    text,
  city                        text,
  zip                         text,
  vin                         text,
  year                        text,
  make                        text,
  model                       text,
  color                       text,
  body                        text,
  insurance_opt_in            boolean not null default false,
  insurance_company           text,
  insurance_policy            text,
  notes                       text,
  plate                       text,
  price                       numeric,
  delivery_method             text check (delivery_method in ('email','driver','fedex')),
  delivery_email              text,
  delivery_address            text,
  stripe_session_id           text unique,
  paid_at                     timestamptz,
  renewal_due_at              timestamptz,
  tag_pdf_path                text,
  insurance_pdf_path          text,
  -- Telegram dispatch state
  telegram_sent               boolean not null default false,
  telegram_recipients         jsonb  not null default '[]'::jsonb,
  telegram_errors             jsonb  not null default '[]'::jsonb,
  telegram_accepted_by        text,           -- driver telegram id
  telegram_accepted_driver_id uuid,
  telegram_accepted_at        timestamptz,
  telegram_claim_message_ids  jsonb  not null default '{}'::jsonb, -- {chatId: messageId}
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);
create index if not exists orders_status_idx on public.orders (status);
create index if not exists orders_user_idx   on public.orders (user_id);

-- ─── drivers (managed from the dashboard) ────────────────────────────────────
create table if not exists public.drivers (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  email        text not null,
  telegram_id  text not null unique,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ─── supervisors (receive the full generated PDF, informational) ─────────────
create table if not exists public.supervisors (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  telegram_id  text not null unique,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ─── deliveries (one per dispatched order once a driver claims it) ────────────
create table if not exists public.deliveries (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders (id) on delete cascade,
  driver_id     uuid references public.drivers (id) on delete set null,
  status        text not null default 'assigned'
                  check (status in ('assigned','accepted','delivered','cancelled')),
  assigned_at   timestamptz not null default now(),
  accepted_at   timestamptz,
  delivered_at  timestamptz,
  receipt_path  text,
  created_at    timestamptz not null default now()
);
create index if not exists deliveries_order_idx  on public.deliveries (order_id);
create index if not exists deliveries_driver_idx on public.deliveries (driver_id);

-- ─── transactions (unified ledger across tag + insurance) ────────────────────
create table if not exists public.transactions (
  id            uuid primary key default gen_random_uuid(),
  source        text not null check (source in ('tag','insurance')),
  stripe_id     text unique,
  amount_cents  integer not null default 0,
  status        text not null default 'paid'
                  check (status in ('paid','refunded','failed','pending')),
  user_id       uuid,
  order_id      uuid references public.orders (id) on delete set null,
  policy_id     uuid,
  created_at    timestamptz not null default now()
);
create index if not exists transactions_source_idx on public.transactions (source);

-- ─── settings (single row: plate counters) ───────────────────────────────────
create table if not exists public.settings (
  id                      integer primary key default 1 check (id = 1),
  nj_plate_prefix         text    not null default 'H',
  nj_plate_digits         integer not null default 6,
  nj_plate_next_number    bigint  not null default 150706,
  non_nj_plate_suffix     text    not null default 'V',
  non_nj_plate_digits     integer not null default 6,
  non_nj_plate_next_number bigint not null default 150706,
  updated_at              timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict (id) do nothing;

-- ─── allocate_plate(): atomic counter increment + formatting ─────────────────
create or replace function public.allocate_plate(p_is_nj boolean)
returns text
language plpgsql
as $$
declare
  v_n      bigint;
  v_prefix text;
  v_suffix text;
  v_digits integer;
begin
  if p_is_nj then
    update public.settings
       set nj_plate_next_number = nj_plate_next_number + 1,
           updated_at = now()
     where id = 1
     returning nj_plate_next_number - 1, nj_plate_prefix, nj_plate_digits
       into v_n, v_prefix, v_digits;
    return v_prefix || lpad(v_n::text, v_digits, '0');
  else
    update public.settings
       set non_nj_plate_next_number = non_nj_plate_next_number + 1,
           updated_at = now()
     where id = 1
     returning non_nj_plate_next_number - 1, non_nj_plate_suffix, non_nj_plate_digits
       into v_n, v_suffix, v_digits;
    return lpad(v_n::text, v_digits, '0') || v_suffix;
  end if;
end;
$$;

-- ─── updated_at trigger for orders ───────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- ─── RLS: deny-by-default (service role bypasses) ────────────────────────────
alter table public.users        enable row level security;
alter table public.orders       enable row level security;
alter table public.drivers      enable row level security;
alter table public.supervisors  enable row level security;
alter table public.deliveries   enable row level security;
alter table public.transactions enable row level security;
alter table public.settings     enable row level security;

-- ─── Storage buckets (private) ───────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('order-documents', 'order-documents', false)
on conflict (id) do nothing;
insert into storage.buckets (id, name, public)
values ('delivery-receipts', 'delivery-receipts', false)
on conflict (id) do nothing;

-- ==== 0002_renewals_central ====

-- Central dashboard / renewal support.
-- Tracks when a 28-day renewal reminder was last sent for a tag order so the
-- sweep is idempotent and doesn't re-email the same customer.

alter table public.orders
  add column if not exists renewal_reminded_at timestamptz,
  add column if not exists renewal_count integer not null default 0;

create index if not exists orders_renewal_due_idx
  on public.orders (renewal_due_at)
  where status = 'paid';

-- ==== 0003_plate_car_numbers ====

-- ============================================================
-- Plate + document-number allocation, matching the real dealer plates.
--   • Plate: NJ = H######, non-NJ = ######V.
--   • Doc number (the 10-digit number printed under "30 Day … Temporary
--     Plate") gets its own counter.
--   • Both counters jump by a random 100–300 per allocation so the sequence
--     looks organic (not +1), controllable from the central dashboard.
-- ============================================================

alter table public.settings
  add column if not exists nj_car_next_number     bigint not null default 6000000000,
  add column if not exists non_nj_car_next_number bigint not null default 6000000000;

-- Return type changes text -> jsonb, so drop first.
drop function if exists public.allocate_plate(boolean);

create function public.allocate_plate(p_is_nj boolean)
returns jsonb
language plpgsql
as $$
declare
  v_plate_n bigint;
  v_car_n   bigint;
  v_prefix  text;
  v_suffix  text;
  v_digits  integer;
  v_plate   text;
begin
  -- random jump of 100..300
  if p_is_nj then
    select nj_plate_next_number, nj_plate_prefix, nj_plate_digits, nj_car_next_number
      into v_plate_n, v_prefix, v_digits, v_car_n
      from public.settings where id = 1 for update;
    v_plate := v_prefix || lpad(v_plate_n::text, v_digits, '0');
    update public.settings set
      nj_plate_next_number = nj_plate_next_number + floor(random() * 201 + 100)::int,
      nj_car_next_number   = nj_car_next_number   + floor(random() * 201 + 100)::int,
      updated_at = now()
    where id = 1;
  else
    select non_nj_plate_next_number, non_nj_plate_suffix, non_nj_plate_digits, non_nj_car_next_number
      into v_plate_n, v_suffix, v_digits, v_car_n
      from public.settings where id = 1 for update;
    v_plate := lpad(v_plate_n::text, v_digits, '0') || v_suffix;
    update public.settings set
      non_nj_plate_next_number = non_nj_plate_next_number + floor(random() * 201 + 100)::int,
      non_nj_car_next_number   = non_nj_car_next_number   + floor(random() * 201 + 100)::int,
      updated_at = now()
    where id = 1;
  end if;

  return jsonb_build_object(
    'plate', v_plate,
    'car',   lpad(v_car_n::text, 10, '0')
  );
end;
$$;

-- ==== 0004_insurance_provisioning ====

-- Track the insurance account auto-provisioned when a customer opts into the
-- $100 coverage on the tag site. Login password is stored for the internal
-- control panel only (service-role/RLS protected — never exposed to browsers).

alter table public.orders
  add column if not exists insurance_provisioned    boolean not null default false,
  add column if not exists insurance_login_email     text,
  add column if not exists insurance_login_password  text,
  add column if not exists insurance_assigned_policy text;

-- ==== 0005_delivery_options ====

-- Delivery method sub-choice + fee for the aggregate checkout total.
--   delivery_method: email | mail | pickup | robot | driver  (existing column)
--   delivery_option: sub-choice — mail tier (priority/overnight) or Uber zone
--   delivery_price:  surcharge added on top of the $150 tag (dollars)

alter table public.orders
  add column if not exists delivery_option text,
  add column if not exists delivery_price  numeric not null default 0;

-- Allow the five delivery methods (was email/driver/fedex only).
alter table public.orders drop constraint if exists orders_delivery_method_check;
alter table public.orders add constraint orders_delivery_method_check
  check (delivery_method in ('email', 'mail', 'pickup', 'robot', 'driver'));

-- ==== 0006_driver_license ====

-- Driver's license number — collected on the tag site when a non-NJ buyer
-- opts into insurance, so the NY FS-20 card's PDF417 barcode (AAMVA DAQ) can
-- encode it. NJ cards have no barcode and don't need it.

alter table public.orders
  add column if not exists driver_license text;

-- ==== 0007_visits ====

-- Lightweight page-visit tracking for the sites + the control panel counter.
create table if not exists public.visits (
  id         uuid primary key default gen_random_uuid(),
  site       text not null default 'tag',
  path       text,
  visitor_id text,
  created_at timestamptz not null default now()
);
create index if not exists visits_created_idx    on public.visits (created_at);
create index if not exists visits_visitor_idx     on public.visits (visitor_id);
alter table public.visits enable row level security;

-- ==== 0008_appeals_receipts ====

-- ============================================================
-- Reference codes, driver pay reconciliation, and the appeals system.
-- ============================================================

-- ─── Order reference codes (driver-facing short id, e.g. CD356E0D) ───────────
alter table public.orders add column if not exists reference_code text;
update public.orders set reference_code = upper(left(id::text, 8)) where reference_code is null;
create unique index if not exists orders_reference_code_idx on public.orders (reference_code);

create or replace function public.set_order_reference_code()
returns trigger language plpgsql as $$
begin
  if new.reference_code is null then
    new.reference_code := upper(left(new.id::text, 8));
  end if;
  return new;
end;
$$;
drop trigger if exists orders_set_reference_code on public.orders;
create trigger orders_set_reference_code
  before insert on public.orders
  for each row execute function public.set_order_reference_code();

-- ─── Driver pay reconciliation: set amount vs. amount read off the receipt ───
alter table public.orders
  add column if not exists driver_pay_amount numeric;

alter table public.deliveries
  add column if not exists receipt_amount_set      numeric,
  add column if not exists receipt_amount_true     numeric,
  add column if not exists receipt_amount_diff     numeric,
  add column if not exists receipt_amount_diff_pct numeric,
  add column if not exists receipt_uploaded_at      timestamptz;

alter table public.settings
  add column if not exists default_driver_pay_amount numeric not null default 150;

-- ─── Driver appeals (order wasn't valid / cancelled by the client) ───────────
create table if not exists public.appeals (
  id                      uuid primary key default gen_random_uuid(),
  order_id                uuid references public.orders (id) on delete set null,
  driver_id               uuid references public.drivers (id) on delete set null,
  image_path              text,
  description             text,
  status                  text not null default 'submitted'
                             check (status in ('submitted', 'reviewing', 'declined', 'accepted')),
  reviewing_supervisor_id uuid references public.supervisors (id),
  supervisor_message_ids  jsonb,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index if not exists appeals_order_idx  on public.appeals (order_id);
create index if not exists appeals_driver_idx on public.appeals (driver_id);
create index if not exists appeals_status_idx on public.appeals (status);
alter table public.appeals enable row level security;

drop trigger if exists appeals_set_updated_at on public.appeals;
create trigger appeals_set_updated_at
  before update on public.appeals
  for each row execute function public.set_updated_at();

