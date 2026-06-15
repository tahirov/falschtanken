-- Tankhilfe24 backend: orders log + custom admin auth
-- ---------------------------------------------------------------------------

-- pgcrypto for bcrypt password hashing (Supabase ships it in the extensions schema)
create extension if not exists pgcrypto with schema extensions;

-- ===========================================================================
-- ORDERS  (every customer case == one row in the admin "log")
-- ===========================================================================
create table if not exists public.orders (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),

  -- intake funnel data
  situation      text,
  engine_started text,
  litres         text,
  location       text,
  vehicle        text,

  -- offer / derived
  severity       text check (severity in ('low','medium','high')),
  price          numeric(10,2),
  eta_minutes    integer,
  lang           text default 'de',

  -- lifecycle
  status         text not null default 'requested'
                 check (status in ('requested','dispatched','completed','cancelled')),

  -- optional contact captured later
  contact_name   text,
  contact_phone  text
);

create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_status_idx     on public.orders (status);

alter table public.orders enable row level security;

-- Customers (anon) may CREATE orders from the public funnel...
drop policy if exists "public can insert orders" on public.orders;
create policy "public can insert orders"
  on public.orders for insert
  to anon, authenticated
  with check (true);

-- ...but there is deliberately NO select/update/delete policy, so orders can
-- never be read directly with the anon key. Reading happens only through the
-- admin_orders() SECURITY DEFINER function below, gated by a login token.

-- ===========================================================================
-- ADMIN USERS + SESSIONS  (custom credential auth)
-- ===========================================================================
create table if not exists public.admin_users (
  id            uuid primary key default gen_random_uuid(),
  username      text unique not null,
  password_hash text not null,
  role          text not null default 'admin',
  created_at    timestamptz not null default now()
);

create table if not exists public.admin_sessions (
  token      uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.admin_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days'
);

alter table public.admin_users    enable row level security;
alter table public.admin_sessions enable row level security;
-- No policies on purpose: these tables are unreachable with the anon key.
-- Everything goes through the SECURITY DEFINER functions below.

-- First user == admin: ihsan / ihsan (bcrypt-hashed, never stored in plaintext)
insert into public.admin_users (username, password_hash, role)
values ('ihsan', extensions.crypt('ihsan', extensions.gen_salt('bf')), 'admin')
on conflict (username) do nothing;

-- ===========================================================================
-- AUTH RPCs
-- ===========================================================================

-- Verify credentials, open a session, return a bearer token.
create or replace function public.admin_login(p_username text, p_password text)
returns table (token uuid, username text, role text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user public.admin_users;
  v_token uuid;
begin
  select * into v_user
  from public.admin_users u
  where u.username = p_username
    and u.password_hash = extensions.crypt(p_password, u.password_hash);

  if not found then
    return; -- empty result == invalid credentials
  end if;

  insert into public.admin_sessions (user_id)
  values (v_user.id)
  returning admin_sessions.token into v_token;

  return query select v_token, v_user.username, v_user.role;
end;
$$;

-- Resolve a token back to the current admin (or empty if invalid/expired).
create or replace function public.admin_me(p_token uuid)
returns table (username text, role text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select u.username, u.role
  from public.admin_sessions s
  join public.admin_users u on u.id = s.user_id
  where s.token = p_token and s.expires_at > now();
end;
$$;

-- The orders log — readable only with a valid token.
create or replace function public.admin_orders(p_token uuid)
returns setof public.orders
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.admin_sessions s
    where s.token = p_token and s.expires_at > now()
  ) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  return query select * from public.orders order by created_at desc;
end;
$$;

-- End a session.
create or replace function public.admin_logout(p_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.admin_sessions where token = p_token;
end;
$$;

-- Expose only these RPCs to the public roles.
grant execute on function public.admin_login(text, text) to anon, authenticated;
grant execute on function public.admin_me(uuid)          to anon, authenticated;
grant execute on function public.admin_orders(uuid)      to anon, authenticated;
grant execute on function public.admin_logout(uuid)      to anon, authenticated;
