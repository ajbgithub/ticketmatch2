-- Ticketmatch complete schema (idempotent where possible)
-- This file recreates all public tables, RLS policies, and RPCs used by the app.

-- 0) Helpers
create or replace function public.now_utc()
returns timestamptz language sql immutable as $$ select now() at time zone 'utc' $$;

-- 1) Events
create table if not exists public.events (
  id text primary key,
  label text not null,
  type text not null check (type in ('market','ceiling')),
  price numeric,
  created_at timestamptz not null default now()
);

-- Seed a single default event only (no US Open / Red and Blue)
insert into public.events (id, label, type, price)
values ('colombia-trek', 'Colombia Trek - Face Value $0', 'ceiling', 0)
on conflict (id) do nothing;

-- 2) Market postings (for price-based events)
create table if not exists public.market_postings (
  id bigint generated always as identity primary key,
  user_id uuid,
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

create index if not exists idx_market_postings_event on public.market_postings(event_id);
create index if not exists idx_market_postings_user on public.market_postings(user_id);

-- Auto-fill user_id on insert if omitted
create or replace function public.set_market_postings_user_id()
returns trigger language plpgsql as $$
begin
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;
  return new;
end;$$;

drop trigger if exists trg_market_postings_set_uid on public.market_postings;
create trigger trg_market_postings_set_uid
before insert on public.market_postings
for each row execute function public.set_market_postings_user_id();

-- 3) Ceiling postings (percent-of-face postings)
create table if not exists public.postings_public (
  id bigint generated always as identity primary key,
  user_id uuid,
  device_id text not null,
  event_id text not null references public.events(id) on delete cascade,
  role text not null check (role in ('buyer','seller')),
  percent int not null check (percent >= 0 and percent <= 100),
  tickets int not null default 1 check (tickets > 0),
  username text not null,
  phone_e164 text,
  cohort text,
  venmo_handle text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_postings_public_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;$$;

drop trigger if exists trg_postings_public_updated_at on public.postings_public;
create trigger trg_postings_public_updated_at
before update on public.postings_public
for each row execute function public.set_postings_public_updated_at();

create index if not exists idx_postings_public_event on public.postings_public(event_id);
create index if not exists idx_postings_public_user on public.postings_public(user_id);

-- Auto-fill user_id on insert if omitted
create or replace function public.set_postings_public_user_id()
returns trigger language plpgsql as $$
begin
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;
  return new;
end;$$;

drop trigger if exists trg_postings_public_set_uid on public.postings_public;
create trigger trg_postings_public_set_uid
before insert on public.postings_public
for each row execute function public.set_postings_public_user_id();

-- Ensure upsert ON CONFLICT(device_id, event_id, role) works
create unique index if not exists uq_postings_public_conflict
  on public.postings_public(device_id, event_id, role);

-- 4) Trades (successful trades recorded via RPC or mark-traded)
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

create index if not exists idx_trades_event on public.trades(event_id);

-- 5) Admins (demo credentials for RPC)
create table if not exists public.admins (
  username text primary key,
  password text not null
);

insert into public.admins (username, password)
values ('admin','marketmaker')
on conflict (username) do update set password = excluded.password;

insert into public.admins (username, password)
values ('mbamoveteam@gmail.com','marketmaker')
on conflict (username) do update set password = excluded.password;

-- 6) Chat messages (public chat for authenticated users)
create table if not exists public.chat_messages (
  id bigint generated always as identity primary key,
  user_id text not null,
  username text not null,
  message text not null check (char_length(message) <= 250),
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_messages_created on public.chat_messages(created_at desc);

-- 7) Profiles (if not managed elsewhere). This mirrors the app's usage.
-- If your project already provisions profiles via auth triggers, skip this block.
create table if not exists public.profiles (
  id uuid primary key,
  username text,
  wharton_email text,
  recovery_email text,
  cohort text,
  phone_e164 text,
  venmo_handle text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Relax cohort options to include school names the app uses
do $$ begin
  begin
    alter table public.profiles drop constraint if exists profiles_cohort_check;
  exception when others then null; end;
  begin
    alter table public.profiles add constraint profiles_cohort_check
    check (cohort in ('Wharton','Penn','HBS','GSB','WG26','WG27'));
  exception when others then null; end;
end $$;

create or replace function public.set_profiles_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_profiles_updated_at();

-- 8) RLS
alter table public.events enable row level security;
alter table public.market_postings enable row level security;
alter table public.postings_public enable row level security;
alter table public.trades enable row level security;
alter table public.chat_messages enable row level security;
alter table public.profiles enable row level security;

-- events: public can read
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='events' and policyname='events_select_all') then
    create policy events_select_all on public.events for select to public using (true);
  end if;
end $$;

-- market_postings: public read, authenticated manage own by user_id
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='market_postings' and policyname='market_postings_select_all') then
    create policy market_postings_select_all on public.market_postings for select to public using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='market_postings' and policyname='market_postings_insert_own') then
    create policy market_postings_insert_own on public.market_postings for insert to authenticated with check (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='market_postings' and policyname='market_postings_update_own') then
    create policy market_postings_update_own on public.market_postings for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='market_postings' and policyname='market_postings_delete_own') then
    create policy market_postings_delete_own on public.market_postings for delete to authenticated using (user_id = auth.uid());
  end if;
end $$;

-- postings_public: public read, authenticated manage own by user_id
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='postings_public' and policyname='postings_public_select_all') then
    create policy postings_public_select_all on public.postings_public for select to public using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='postings_public' and policyname='postings_public_insert_own') then
    create policy postings_public_insert_own on public.postings_public for insert to authenticated with check (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='postings_public' and policyname='postings_public_update_own') then
    create policy postings_public_update_own on public.postings_public for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='postings_public' and policyname='postings_public_delete_own') then
    create policy postings_public_delete_own on public.postings_public for delete to authenticated using (user_id = auth.uid());
  end if;
end $$;

-- trades: public read, authenticated insert (RPCs may use definer)
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='trades' and policyname='trades_select_all') then
    create policy trades_select_all on public.trades for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='trades' and policyname='trades_insert_auth') then
    create policy trades_insert_auth on public.trades for insert to authenticated with check (true);
  end if;
end $$;

-- chat_messages: authenticated read/insert, no public access
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='chat_messages' and policyname='chat_select_auth') then
    create policy chat_select_auth on public.chat_messages for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='chat_messages' and policyname='chat_insert_auth') then
    create policy chat_insert_auth on public.chat_messages for insert to authenticated with check (true);
  end if;
end $$;

-- profiles: self-access only (select/insert/update own row)
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_select_own') then
    create policy profiles_select_own on public.profiles for select to authenticated using (id::text = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_insert_own') then
    create policy profiles_insert_own on public.profiles for insert to authenticated with check (id::text = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_update_own') then
    create policy profiles_update_own on public.profiles for update to authenticated using (id::text = auth.uid()::text) with check (id::text = auth.uid()::text);
  end if;
end $$;

-- 9) RPCs

-- Admin login
create or replace function public.tm_admin_login(p_username text, p_password text)
returns jsonb language sql security definer as $$
  select jsonb_build_object('ok', exists(select 1 from public.admins a where a.username = p_username and a.password = p_password));
$$;

-- Create event (admin credentials required)
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

-- Delete event (admin credentials required)
create or replace function public.tm_delete_event(
  p_username text, p_password text,
  p_id text
) returns void language plpgsql security definer as $$
begin
  if not exists (select 1 from public.admins where username = p_username and password = p_password) then
    raise exception 'unauthorized';
  end if;
  delete from public.events where id = p_id;
end;$$;

-- Mark a posting as traded (removes posting and records a trade)
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
    insert into public.trades(event_id, source, buyer_id, seller_id, price, tickets)
    select pp.event_id, 'ceiling',
           case when pp.role = 'buyer' then pp.device_id end,
           case when pp.role = 'seller' then pp.device_id end,
           0, pp.tickets
      from public.postings_public pp where pp.id = p_posting_id::bigint;
    delete from public.postings_public where id = p_posting_id::bigint;
  end if;
end;$$;

-- Record a successful mutual trade
create or replace function public.tm_we_traded(
  p_buyer text,
  p_seller text,
  p_event_id text,
  p_price numeric,
  p_tickets int,
  p_source text default 'market'
) returns void language sql security definer as $$
  insert into public.trades(event_id, source, buyer_id, seller_id, price, tickets)
  values (p_event_id, coalesce(p_source, 'market'), p_buyer, p_seller, p_price, p_tickets);
$$;
