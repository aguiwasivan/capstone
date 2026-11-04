create extension if not exists pgcrypto;

create table if not exists public.blueprints (
  id uuid primary key default gen_random_uuid(),
  title text,
  image_url text,
  storage_path text,
  processing_status text default 'pending',
  created_at timestamp default now()
);

create table if not exists public.lots (
  id uuid primary key default gen_random_uuid(),
  blueprint_id uuid references public.blueprints(id) on delete cascade,
  lot_number text,
  block_number text,
  size text null,
  price numeric null,
  status text default 'available',
  coordinates jsonb,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

alter table public.blueprints enable row level security;
alter table public.lots enable row level security;

create policy "Authenticated users can view blueprints"
on public.blueprints for select
to authenticated
using (true);

create policy "Authenticated users can view lots"
on public.lots for select
to authenticated
using (true);

-- Django should write through the Supabase service role key on the backend.
-- Do not expose the service role key in React.
