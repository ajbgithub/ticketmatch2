-- Ticketmatch schema for events, market postings, trades, and admin RPCs

-- 1) Events
create table if not exists public.events (
  id text primary key,
  label text not null,
  type text not null check (type in ('market','ceiling')),
  price numeric,
  created_at timestamptz not null default now()
);

-- 2) Market postings (for price-based events like US Open)
create table if not exists public.market_postings (
  id bigint generated always as identity primary key,
  device_id text not null,
  event_id text not null references public.events(id) on delete cascade,
  role text not null check (role in ('buyer','seller')),
  price numeric not null check (price > 0),
  description text,
  tickets int not null default 1 check (tickets > 0),
  username text not null,
  phone_e164 text,
  cohort text,
  venmo_handle text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_market_postings_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;$$;

drop trigger if exists trg_market_postings_updated_at on public.market_postings;
create trigger trg_market_postings_updated_at
before update on public.market_postings
for each row execute function public.set_market_postings_updated_at();

-- 3) Trades
create table if not exists public.trades (
  id bigint generated always as identity primary key,
  event_id text not null references public.events(id) on delete cascade,
  source text not null check (source in ('market','ceiling')),
  buyer_id text,
  seller_id text,
  price numeric not null,
  tickets int not null default 1,
  created_at timestamptz not null default now()
);

-- 4) Admins (simple demo). For production, use proper auth and hashing.
create table if not exists public.admins (
  username text primary key,
  password text not null
);

insert into public.admins (username, password)
values ('admin','marketmaker')
on conflict (username) do update set password = excluded.password;

-- RPC: admin login
create or replace function public.tm_admin_login(p_username text, p_password text)
returns jsonb language sql security definer as $$
  select jsonb_build_object('ok', exists(
    select 1 from public.admins a where a.username = p_username and a.password = p_password
  ));
$$;

-- RPC: mark a single posting as traded and remove it (source: 'market' or 'ceiling')
create or replace function public.tm_mark_traded(p_posting_id text, p_source text)
returns void language plpgsql security definer as $$
begin
  if p_source = 'market' then
    insert into public.trades(event_id, source, buyer_id, seller_id, price, tickets)
    select mp.event_id, 'market',
           case when mp.role = 'buyer' then mp.device_id end,
           case when mp.role = 'seller' then mp.device_id end,
           mp.price, mp.tickets
      from public.market_postings mp where mp.id = p_posting_id::bigint;
    delete from public.market_postings where id = p_posting_id::bigint;
  elsif p_source = 'ceiling' then
    -- ceiling postings do not store price; price is computed client-side when recording a trade
    insert into public.trades(event_id, source, buyer_id, seller_id, price, tickets)
    select pp.event_id, 'ceiling',
           case when pp.role = 'buyer' then pp.device_id end,
           case when pp.role = 'seller' then pp.device_id end,
           0, pp.tickets
      from public.postings_public pp where pp.id = p_posting_id::bigint;
    delete from public.postings_public where id = p_posting_id::bigint;
  end if;
end;$$;

-- RPC: record a successful mutual trade between two parties
create or replace function public.tm_we_traded(
  p_buyer text, p_seller text, p_event_id text, p_price numeric, p_tickets int
) returns void language sql security definer as $$
  insert into public.trades(event_id, source, buyer_id, seller_id, price, tickets)
  values (p_event_id, 'market', p_buyer, p_seller, p_price, p_tickets);
$$;

-- RLS: allow public read of events and market_postings (for FOMO views)
alter table public.events enable row level security;
alter table public.market_postings enable row level security;
alter table public.trades enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='events' and policyname='events_select_all') then
    create policy events_select_all on public.events for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='market_postings' and policyname='market_postings_select_all') then
    create policy market_postings_select_all on public.market_postings for select using (true);
  end if;
  -- Allow authenticated users to insert their own market postings
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='market_postings' and policyname='market_postings_insert_auth') then
    create policy market_postings_insert_auth on public.market_postings
      for insert to authenticated
      with check (email = auth.email());
  end if;
  -- Allow owners to delete/update their own market postings
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='market_postings' and policyname='market_postings_delete_owner') then
    create policy market_postings_delete_owner on public.market_postings
      for delete to authenticated
      using (email = auth.email());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='market_postings' and policyname='market_postings_update_owner') then
    create policy market_postings_update_owner on public.market_postings
      for update to authenticated
      using (email = auth.email())
      with check (email = auth.email());
  end if;
end $$;

-- Optional: enable realtime replication (Supabase UI -> Realtime) for tables:
--   events, market_postings, trades

-- RPC: create event with admin credentials (avoid granting insert broadly)
create or replace function public.tm_create_event(
  p_username text, p_password text,
  p_id text, p_label text, p_type text, p_price numeric
) returns void language plpgsql security definer as $$
begin
  if not exists (select 1 from public.admins where username = p_username and password = p_password) then
    raise exception 'unauthorized';
  end if;
  insert into public.events(id, label, type, price)
  values (p_id, p_label, p_type, p_price)
  on conflict (id) do nothing;
end;$$;
