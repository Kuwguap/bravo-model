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
