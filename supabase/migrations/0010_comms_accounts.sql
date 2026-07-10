-- ============================================================
-- Multi-account comms bot: one Facebook Page = one "account" = its own sheet.
-- The primary account is seeded from the bot's env on boot; every other page
-- (and the primary, for visibility) is managed from the central dashboard.
-- Incoming webhook events are routed by Page id (entry[].id) to the matching
-- account and answered with that account's own page access token.
-- ============================================================

create table if not exists public.comms_accounts (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null default 'Facebook page',
  page_id            text unique,             -- Meta Page id (matches webhook entry[].id)
  page_access_token  text,                    -- page-scoped send token
  app_secret         text,                    -- optional per-app secret (else env fallback)
  verify_token       text,                    -- optional per-app verify token (else env fallback)
  is_primary         boolean not null default false,
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists comms_accounts_page_idx on public.comms_accounts (page_id);

alter table public.comms_accounts enable row level security;

drop trigger if exists comms_accounts_set_updated_at on public.comms_accounts;
create trigger comms_accounts_set_updated_at
  before update on public.comms_accounts
  for each row execute function public.set_updated_at();

-- Scope every lead (sheet row) to the account/page it came in on so each page
-- keeps its own separate sheet. Existing rows keep account_id null until re-seen.
alter table public.comms_leads add column if not exists account_id uuid
  references public.comms_accounts (id) on delete set null;
alter table public.comms_leads add column if not exists fb_page_id text;

-- A page-scoped sender id (PSID) is unique per page, so identify a lead by the
-- pair (account, psid). Partial so legacy null-account rows don't collide.
create unique index if not exists comms_leads_acct_psid_uidx
  on public.comms_leads (account_id, fb_psid)
  where account_id is not null;
create index if not exists comms_leads_account_idx on public.comms_leads (account_id);
