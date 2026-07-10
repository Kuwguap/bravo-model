-- ============================================================
-- Communications bot "sheet": one live row per Facebook client, updated in
-- real time as each piece of information comes in during the conversation.
-- ============================================================

create table if not exists public.comms_leads (
  id                     uuid primary key default gen_random_uuid(),
  handle                 text unique,            -- e.g. JOHN8832 (name + random)
  source                 text not null default 'facebook',
  fb_psid                text,                   -- page-scoped sender id

  -- collected tag fields (each saved the instant the client provides it)
  first_name             text,
  last_name              text,
  email                  text,
  phone                  text,
  state                  text,
  address                text,
  address2               text,
  city                   text,
  zip                    text,
  vin                    text,
  year                   text,
  make                   text,
  model                  text,
  color                  text,
  body                   text,
  driver_license         text,
  insurance_company      text,
  insurance_policy       text,
  insurance_opt_in       boolean not null default false,
  notes                  text,

  -- flow control
  pay_method             text,                   -- 'site' | 'chat' | null
  status                 text not null default 'collecting'
                            check (status in ('collecting','awaiting_payment','paid','dispatched','abandoned')),
  order_id               uuid references public.orders (id) on delete set null,
  stripe_session_id      text,
  follow_up_count        integer not null default 0,
  transcript             jsonb not null default '[]'::jsonb,  -- rolling short history

  last_client_message_at timestamptz,
  last_bot_message_at     timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists comms_leads_psid_idx   on public.comms_leads (fb_psid);
create index if not exists comms_leads_status_idx  on public.comms_leads (status);
create index if not exists comms_leads_name_idx    on public.comms_leads (lower(first_name), lower(last_name));

alter table public.comms_leads enable row level security;

drop trigger if exists comms_leads_set_updated_at on public.comms_leads;
create trigger comms_leads_set_updated_at
  before update on public.comms_leads
  for each row execute function public.set_updated_at();

-- Link an order back to the comms lead that produced it (for pay-on-site matching).
alter table public.orders add column if not exists comms_handle text;
