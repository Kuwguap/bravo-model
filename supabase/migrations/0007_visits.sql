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
