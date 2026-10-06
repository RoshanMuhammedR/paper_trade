-- Paper trading schema. All tables are prefixed with pt_ so they can live
-- alongside other apps in the same Supabase project.
--
-- Security model
--   * Users can READ their own trading rows (RLS) but can never write
--     accounts / orders / holdings / trades directly.
--   * Every money-moving operation goes through a SECURITY DEFINER function.
--   * Functions that accept a fill price also require a server secret, so only
--     the Next.js server (which fetches the real market price) can execute
--     trades. The secret's sha256 lives in pt_private.config.

create schema if not exists pt_private;
revoke all on schema pt_private from public;
revoke all on schema pt_private from anon, authenticated;

create table if not exists pt_private.config (
  key text primary key,
  value text not null
);

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.pt_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cash numeric(20,4) not null,
  starting_cash numeric(20,4) not null,
  realized_pnl numeric(20,4) not null default 0,
  total_charges numeric(20,4) not null default 0,
  simulate_charges boolean not null default true,
  created_at timestamptz not null default now(),
  reset_at timestamptz not null default now()
);

create table public.pt_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  side text not null check (side in ('BUY','SELL')),
  order_type text not null check (order_type in ('MARKET','LIMIT','SL','SL-M')),
  qty integer not null check (qty > 0),
  limit_price numeric(20,4) check (limit_price > 0),
  trigger_price numeric(20,4) check (trigger_price > 0),
  ref_price numeric(20,4),
  validity text not null default 'DAY' check (validity in ('DAY','GTC')),
  status text not null default 'OPEN'
    check (status in ('OPEN','TRIGGERED','EXECUTED','CANCELLED','REJECTED','EXPIRED')),
  is_amo boolean not null default false,
  filled_price numeric(20,4),
  filled_at timestamptz,
  charges numeric(20,4) not null default 0,
  status_message text,
  active_from timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (order_type <> 'LIMIT' or limit_price is not null),
  check (order_type <> 'SL' or (limit_price is not null and trigger_price is not null)),
  check (order_type <> 'SL-M' or trigger_price is not null)
);
create index pt_orders_user_status_idx on public.pt_orders (user_id, status);
create index pt_orders_user_created_idx on public.pt_orders (user_id, created_at desc);

create table public.pt_holdings (
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  qty integer not null check (qty > 0),
  avg_price numeric(20,4) not null,
  first_bought_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, symbol)
);

create table public.pt_trades (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.pt_orders(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  side text not null check (side in ('BUY','SELL')),
  qty integer not null,
  price numeric(20,4) not null,
  charges numeric(20,4) not null default 0,
  avg_cost numeric(20,4),
  realized_pnl numeric(20,4),
  executed_at timestamptz not null
);
create index pt_trades_user_time_idx on public.pt_trades (user_id, executed_at desc);
create index pt_trades_order_idx on public.pt_trades (order_id);

create table public.pt_equity_snapshots (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  equity numeric(20,4) not null,
  cash numeric(20,4) not null,
  holdings_value numeric(20,4) not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

create table public.pt_watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  symbols jsonb not null default '[]'::jsonb,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
create index pt_watchlists_user_idx on public.pt_watchlists (user_id, sort);

create table public.pt_chart_drawings (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  symbol text not null,
  overlays jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, symbol)
);

create table public.pt_user_prefs (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  prefs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.pt_accounts enable row level security;
alter table public.pt_orders enable row level security;
alter table public.pt_holdings enable row level security;
alter table public.pt_trades enable row level security;
alter table public.pt_equity_snapshots enable row level security;
alter table public.pt_watchlists enable row level security;
alter table public.pt_chart_drawings enable row level security;
alter table public.pt_user_prefs enable row level security;

-- Read-only (writes happen exclusively through the functions below)
create policy "own account" on public.pt_accounts for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own orders" on public.pt_orders for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own holdings" on public.pt_holdings for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own trades" on public.pt_trades for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own snapshots" on public.pt_equity_snapshots for select to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete on public.pt_accounts, public.pt_orders, public.pt_holdings,
  public.pt_trades, public.pt_equity_snapshots from anon, authenticated;
revoke all on public.pt_accounts, public.pt_orders, public.pt_holdings, public.pt_trades,
  public.pt_equity_snapshots, public.pt_watchlists, public.pt_chart_drawings,
  public.pt_user_prefs from anon;

-- Fully user-owned UI state
create policy "own watchlists" on public.pt_watchlists for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own drawings" on public.pt_chart_drawings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own prefs" on public.pt_user_prefs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Private helpers
-- ---------------------------------------------------------------------------

create or replace function pt_private.assert_server(p_secret text)
returns void language plpgsql stable security definer set search_path = '' as $$
declare
  v_hash text;
begin
  select value into v_hash from pt_private.config where key = 'server_secret_sha256';
  if v_hash is null or p_secret is null
     or encode(extensions.digest(p_secret, 'sha256'), 'hex') <> v_hash then
    raise exception 'unauthorized server call' using errcode = '42501';
  end if;
end $$;

create or replace function pt_private.require_user()
returns uuid language plpgsql stable set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  return v_uid;
end $$;

-- Cash blocked by open BUY orders (like a broker's margin block)
create or replace function pt_private.reserved_cash(p_user uuid, p_exclude uuid default null)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(sum(o.qty * coalesce(o.limit_price, o.trigger_price, o.ref_price, 0)), 0)
  from public.pt_orders o
  where o.user_id = p_user and o.side = 'BUY' and o.status in ('OPEN','TRIGGERED')
    and (p_exclude is null or o.id <> p_exclude);
$$;

-- Quantity blocked by open SELL orders
create or replace function pt_private.reserved_qty(p_user uuid, p_symbol text, p_exclude uuid default null)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce(sum(o.qty), 0)::integer
  from public.pt_orders o
  where o.user_id = p_user and o.symbol = p_symbol and o.side = 'SELL'
    and o.status in ('OPEN','TRIGGERED')
    and (p_exclude is null or o.id <> p_exclude);
$$;

-- Executes an order at the given price. Caller must hold the account row lock.
create or replace function pt_private.execute_order(
  p_order_id uuid, p_price numeric, p_charges numeric, p_at timestamptz
) returns public.pt_orders language plpgsql security definer set search_path = '' as $$
declare
  v_order public.pt_orders;
  v_acc public.pt_accounts;
  v_hold public.pt_holdings;
  v_cost numeric;
  v_pnl numeric;
  v_charges numeric := greatest(coalesce(p_charges, 0), 0);
begin
  select * into v_order from public.pt_orders where id = p_order_id for update;
  select * into v_acc from public.pt_accounts where user_id = v_order.user_id for update;
  if not v_acc.simulate_charges then
    v_charges := 0;
  end if;
  if p_price is null or p_price <= 0 then
    raise exception 'invalid fill price';
  end if;

  if v_order.side = 'BUY' then
    v_cost := p_price * v_order.qty + v_charges;
    if v_acc.cash < v_cost then
      update public.pt_orders
        set status = 'REJECTED', status_message = 'Insufficient funds at execution', updated_at = now()
        where id = v_order.id returning * into v_order;
      return v_order;
    end if;

    update public.pt_accounts
      set cash = cash - v_cost, total_charges = total_charges + v_charges
      where user_id = v_order.user_id;

    insert into public.pt_holdings as h (user_id, symbol, qty, avg_price, first_bought_at, updated_at)
      values (v_order.user_id, v_order.symbol, v_order.qty, p_price, p_at, now())
      on conflict (user_id, symbol) do update set
        avg_price = (h.qty * h.avg_price + excluded.qty * excluded.avg_price) / (h.qty + excluded.qty),
        qty = h.qty + excluded.qty,
        updated_at = now();

    insert into public.pt_trades (order_id, user_id, symbol, side, qty, price, charges, executed_at)
      values (v_order.id, v_order.user_id, v_order.symbol, 'BUY', v_order.qty, p_price, v_charges, p_at);
  else
    select * into v_hold from public.pt_holdings
      where user_id = v_order.user_id and symbol = v_order.symbol for update;
    if not found or v_hold.qty < v_order.qty then
      update public.pt_orders
        set status = 'REJECTED', status_message = 'Insufficient holdings at execution', updated_at = now()
        where id = v_order.id returning * into v_order;
      return v_order;
    end if;

    v_pnl := (p_price - v_hold.avg_price) * v_order.qty;

    update public.pt_accounts
      set cash = cash + p_price * v_order.qty - v_charges,
          realized_pnl = realized_pnl + v_pnl,
          total_charges = total_charges + v_charges
      where user_id = v_order.user_id;

    if v_hold.qty = v_order.qty then
      delete from public.pt_holdings where user_id = v_order.user_id and symbol = v_order.symbol;
    else
      update public.pt_holdings set qty = qty - v_order.qty, updated_at = now()
        where user_id = v_order.user_id and symbol = v_order.symbol;
    end if;

    insert into public.pt_trades (order_id, user_id, symbol, side, qty, price, charges, avg_cost, realized_pnl, executed_at)
      values (v_order.id, v_order.user_id, v_order.symbol, 'SELL', v_order.qty, p_price, v_charges,
              v_hold.avg_price, v_pnl, p_at);
  end if;

  update public.pt_orders
    set status = 'EXECUTED', filled_price = p_price, filled_at = p_at, charges = v_charges,
        status_message = null, updated_at = now()
    where id = v_order.id returning * into v_order;
  return v_order;
end $$;

-- ---------------------------------------------------------------------------
-- Public RPCs
-- ---------------------------------------------------------------------------

create or replace function public.pt_ensure_account()
returns public.pt_accounts language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := pt_private.require_user();
  v_acc public.pt_accounts;
begin
  select * into v_acc from public.pt_accounts where user_id = v_uid;
  if found then
    return v_acc;
  end if;

  insert into public.pt_accounts (user_id, cash, starting_cash)
    values (v_uid, 1000000, 1000000)
    on conflict (user_id) do nothing;

  if not exists (select 1 from public.pt_watchlists where user_id = v_uid) then
    insert into public.pt_watchlists (user_id, name, symbols, sort) values
      (v_uid, 'Nifty Leaders',
       '["^NSEI","^NSEBANK","RELIANCE.NS","HDFCBANK.NS","ICICIBANK.NS","TCS.NS","INFY.NS","BHARTIARTL.NS","SBIN.NS","ITC.NS","LT.NS","AXISBANK.NS"]'::jsonb, 0),
      (v_uid, 'My List', '[]'::jsonb, 1);
  end if;

  select * into v_acc from public.pt_accounts where user_id = v_uid;
  return v_acc;
end $$;

create or replace function public.pt_place_order(
  p_secret text,
  p_symbol text,
  p_side text,
  p_order_type text,
  p_qty integer,
  p_limit_price numeric,
  p_trigger_price numeric,
  p_validity text,
  p_ref_price numeric,
  p_is_amo boolean,
  p_expires_at timestamptz,
  p_fill_price numeric default null,
  p_fill_charges numeric default 0
) returns public.pt_orders language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := pt_private.require_user();
  v_acc public.pt_accounts;
  v_order public.pt_orders;
  v_needed numeric;
  v_available numeric;
  v_held integer;
  v_reject text;
begin
  perform pt_private.assert_server(p_secret);

  select * into v_acc from public.pt_accounts where user_id = v_uid for update;
  if not found then
    raise exception 'account not initialised';
  end if;

  if p_side = 'BUY' then
    v_needed := p_qty * coalesce(p_fill_price, p_limit_price, p_trigger_price, p_ref_price, 0);
    v_available := v_acc.cash - pt_private.reserved_cash(v_uid);
    if v_needed > v_available then
      v_reject := format('Insufficient funds. Required ₹%s, available ₹%s',
                         to_char(v_needed, 'FM999,999,999,990.00'),
                         to_char(greatest(v_available, 0), 'FM999,999,999,990.00'));
    end if;
  else
    select coalesce(qty, 0) into v_held from public.pt_holdings where user_id = v_uid and symbol = p_symbol;
    v_held := coalesce(v_held, 0) - pt_private.reserved_qty(v_uid, p_symbol);
    if p_qty > v_held then
      v_reject := format('Insufficient holdings. Available quantity: %s', greatest(v_held, 0));
    end if;
  end if;

  insert into public.pt_orders (user_id, symbol, side, order_type, qty, limit_price, trigger_price,
                                ref_price, validity, is_amo, expires_at, status, status_message)
    values (v_uid, upper(p_symbol), p_side, p_order_type, p_qty,
            case when p_order_type in ('LIMIT','SL') then p_limit_price end,
            case when p_order_type in ('SL','SL-M') then p_trigger_price end,
            p_ref_price, coalesce(p_validity, 'DAY'), coalesce(p_is_amo, false), p_expires_at,
            case when v_reject is null then 'OPEN' else 'REJECTED' end, v_reject)
    returning * into v_order;

  if v_reject is null and p_fill_price is not null then
    v_order := pt_private.execute_order(v_order.id, p_fill_price, p_fill_charges, now());
  end if;

  return v_order;
end $$;

create or replace function public.pt_fill_order(
  p_secret text, p_order_id uuid, p_price numeric, p_charges numeric, p_at timestamptz
) returns public.pt_orders language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := pt_private.require_user();
  v_order public.pt_orders;
begin
  perform pt_private.assert_server(p_secret);
  perform 1 from public.pt_accounts where user_id = v_uid for update;
  select * into v_order from public.pt_orders where id = p_order_id and user_id = v_uid for update;
  if not found then
    raise exception 'order not found';
  end if;
  if v_order.status not in ('OPEN','TRIGGERED') then
    return v_order;
  end if;
  return pt_private.execute_order(v_order.id, p_price, p_charges, coalesce(p_at, now()));
end $$;

create or replace function public.pt_set_order_status(
  p_secret text, p_order_id uuid, p_status text, p_message text
) returns public.pt_orders language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := pt_private.require_user();
  v_order public.pt_orders;
begin
  perform pt_private.assert_server(p_secret);
  if p_status not in ('TRIGGERED','EXPIRED','REJECTED') then
    raise exception 'invalid status %', p_status;
  end if;
  update public.pt_orders
    set status = p_status, status_message = p_message, updated_at = now()
    where id = p_order_id and user_id = v_uid and status in ('OPEN','TRIGGERED')
    returning * into v_order;
  return v_order;
end $$;

create or replace function public.pt_cancel_order(p_order_id uuid)
returns public.pt_orders language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := pt_private.require_user();
  v_order public.pt_orders;
begin
  update public.pt_orders
    set status = 'CANCELLED', status_message = 'Cancelled by user', updated_at = now()
    where id = p_order_id and user_id = v_uid and status in ('OPEN','TRIGGERED')
    returning * into v_order;
  if not found then
    raise exception 'Order cannot be cancelled';
  end if;
  return v_order;
end $$;

-- Modifying restarts the order's active window, so fills are only evaluated
-- against prices that occur after the modification.
create or replace function public.pt_modify_order(
  p_order_id uuid, p_qty integer, p_limit_price numeric, p_trigger_price numeric
) returns public.pt_orders language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := pt_private.require_user();
  v_order public.pt_orders;
  v_acc public.pt_accounts;
  v_held integer;
  v_needed numeric;
begin
  select * into v_acc from public.pt_accounts where user_id = v_uid for update;
  select * into v_order from public.pt_orders
    where id = p_order_id and user_id = v_uid and status in ('OPEN','TRIGGERED') for update;
  if not found then
    raise exception 'Order cannot be modified';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'Quantity must be positive';
  end if;

  if v_order.side = 'BUY' then
    v_needed := p_qty * coalesce(p_limit_price, p_trigger_price, v_order.ref_price, 0);
    if v_needed > v_acc.cash - pt_private.reserved_cash(v_uid, v_order.id) then
      raise exception 'Insufficient funds for modified order';
    end if;
  else
    select coalesce(qty, 0) into v_held from public.pt_holdings where user_id = v_uid and symbol = v_order.symbol;
    if p_qty > coalesce(v_held, 0) - pt_private.reserved_qty(v_uid, v_order.symbol, v_order.id) then
      raise exception 'Insufficient holdings for modified order';
    end if;
  end if;

  update public.pt_orders set
      qty = p_qty,
      limit_price = case when order_type in ('LIMIT','SL') then coalesce(p_limit_price, limit_price) end,
      trigger_price = case when order_type in ('SL','SL-M') then coalesce(p_trigger_price, trigger_price) end,
      status = 'OPEN',
      active_from = now(),
      updated_at = now()
    where id = v_order.id returning * into v_order;
  return v_order;
end $$;

create or replace function public.pt_reset_account(p_starting_cash numeric)
returns public.pt_accounts language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := pt_private.require_user();
  v_acc public.pt_accounts;
begin
  if p_starting_cash is null or p_starting_cash < 10000 or p_starting_cash > 1000000000 then
    raise exception 'Starting capital must be between ₹10,000 and ₹100 crore';
  end if;
  perform 1 from public.pt_accounts where user_id = v_uid for update;
  delete from public.pt_trades where user_id = v_uid;
  delete from public.pt_orders where user_id = v_uid;
  delete from public.pt_holdings where user_id = v_uid;
  delete from public.pt_equity_snapshots where user_id = v_uid;
  update public.pt_accounts
    set cash = p_starting_cash, starting_cash = p_starting_cash, realized_pnl = 0,
        total_charges = 0, reset_at = now()
    where user_id = v_uid
    returning * into v_acc;
  return v_acc;
end $$;

create or replace function public.pt_set_simulate_charges(p_enabled boolean)
returns public.pt_accounts language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := pt_private.require_user();
  v_acc public.pt_accounts;
begin
  update public.pt_accounts set simulate_charges = coalesce(p_enabled, true)
    where user_id = v_uid returning * into v_acc;
  return v_acc;
end $$;

create or replace function public.pt_record_snapshot(
  p_secret text, p_equity numeric, p_cash numeric, p_holdings_value numeric
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := pt_private.require_user();
begin
  perform pt_private.assert_server(p_secret);
  insert into public.pt_equity_snapshots (user_id, day, equity, cash, holdings_value, updated_at)
    values (v_uid, (now() at time zone 'Asia/Kolkata')::date, p_equity, p_cash, p_holdings_value, now())
    on conflict (user_id, day) do update set
      equity = excluded.equity, cash = excluded.cash,
      holdings_value = excluded.holdings_value, updated_at = now();
end $$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

revoke all on all functions in schema pt_private from public, anon, authenticated;

revoke all on function public.pt_ensure_account() from public, anon;
revoke all on function public.pt_place_order(text, text, text, text, integer, numeric, numeric, text, numeric, boolean, timestamptz, numeric, numeric) from public, anon;
revoke all on function public.pt_fill_order(text, uuid, numeric, numeric, timestamptz) from public, anon;
revoke all on function public.pt_set_order_status(text, uuid, text, text) from public, anon;
revoke all on function public.pt_cancel_order(uuid) from public, anon;
revoke all on function public.pt_modify_order(uuid, integer, numeric, numeric) from public, anon;
revoke all on function public.pt_reset_account(numeric) from public, anon;
revoke all on function public.pt_set_simulate_charges(boolean) from public, anon;
revoke all on function public.pt_record_snapshot(text, numeric, numeric, numeric) from public, anon;

grant execute on function public.pt_ensure_account() to authenticated;
grant execute on function public.pt_place_order(text, text, text, text, integer, numeric, numeric, text, numeric, boolean, timestamptz, numeric, numeric) to authenticated;
grant execute on function public.pt_fill_order(text, uuid, numeric, numeric, timestamptz) to authenticated;
grant execute on function public.pt_set_order_status(text, uuid, text, text) to authenticated;
grant execute on function public.pt_cancel_order(uuid) to authenticated;
grant execute on function public.pt_modify_order(uuid, integer, numeric, numeric) to authenticated;
grant execute on function public.pt_reset_account(numeric) to authenticated;
grant execute on function public.pt_set_simulate_charges(boolean) to authenticated;
grant execute on function public.pt_record_snapshot(text, numeric, numeric, numeric) to authenticated;
