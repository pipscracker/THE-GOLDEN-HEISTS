-- Golden Heists / MADUMONEY SNIPER v5.0
-- Core schema: one row per MT5 account, plus live state, settings,
-- signal log, open/closed trades, and a remote command queue.

create extension if not exists "pgcrypto";

-- ── mt5_accounts ─────────────────────────────────────────────
create table if not exists mt5_accounts (
  id uuid primary key default gen_random_uuid(),
  account_name text not null,
  broker text not null,
  login_id text,
  server text,
  currency text not null default 'USD',
  leverage integer not null default 500,
  balance numeric not null default 0,
  equity numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── robot_state (one row per account, live EA telemetry) ────
create table if not exists robot_state (
  account_id uuid primary key references mt5_accounts(id) on delete cascade,
  robot_enabled boolean not null default false,
  robot_paused boolean not null default false,
  dashboard_message text,
  rsi_value numeric,
  cooldown_seconds_left integer,
  total_active_positions integer,
  basket_profit numeric,
  m5_high numeric,
  m5_low numeric,
  updated_at timestamptz not null default now()
);

-- ── ea_settings (remote-editable EA parameters) ──────────────
create table if not exists ea_settings (
  account_id uuid primary key references mt5_accounts(id) on delete cascade,
  lot_size numeric not null default 0.05,
  starting_sl_points integer not null default 10,
  max_trades integer not null default 3,
  target_profit_usd numeric not null default 15.00,
  target_loss_usd numeric not null default -30.00,
  session_start_hour integer not null default 0,
  session_end_hour integer not null default 24,
  settings_version integer not null default 1,
  updated_at timestamptz not null default now()
);

-- ── signal_log (every entry signal fired by either engine) ──
create table if not exists signal_log (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references mt5_accounts(id) on delete cascade,
  engine text not null check (engine in ('reversion', 'breakout')),
  signal_type text not null,
  direction text not null check (direction in ('BUY', 'SELL')),
  rsi_value numeric not null,
  bid_price numeric not null,
  m5_high numeric not null,
  m5_low numeric not null,
  lot_size numeric not null,
  positions_fired integer not null default 1,
  sl_points integer not null,
  tp_points integer not null,
  fired_at timestamptz not null default now()
);

-- ── open_trades ───────────────────────────────────────────────
create table if not exists open_trades (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references mt5_accounts(id) on delete cascade,
  ticket bigint not null,
  symbol text not null,
  trade_type text not null check (trade_type in ('BUY', 'SELL')),
  volume numeric not null,
  open_price numeric not null,
  current_price numeric not null,
  stop_loss numeric,
  take_profit numeric,
  profit numeric not null default 0,
  swap numeric not null default 0,
  commission numeric not null default 0,
  open_time timestamptz,
  unique (account_id, ticket)
);

-- ── closed_trades ─────────────────────────────────────────────
create table if not exists closed_trades (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references mt5_accounts(id) on delete cascade,
  ticket bigint not null,
  symbol text not null,
  trade_type text not null check (trade_type in ('BUY', 'SELL')),
  volume numeric not null,
  open_price numeric not null,
  close_price numeric not null,
  stop_loss numeric,
  take_profit numeric,
  profit numeric not null default 0,
  swap numeric not null default 0,
  commission numeric not null default 0,
  open_time timestamptz,
  close_time timestamptz
);

-- ── robot_commands (queue of remote start/stop/pause/resume) ─
create table if not exists robot_commands (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references mt5_accounts(id) on delete cascade,
  command text not null check (command in ('start', 'stop', 'pause', 'resume')),
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  consumed boolean not null default false
);

create index if not exists idx_signal_log_account_time on signal_log (account_id, fired_at desc);
create index if not exists idx_open_trades_account on open_trades (account_id);
create index if not exists idx_closed_trades_account_time on closed_trades (account_id, close_time desc);
create index if not exists idx_robot_commands_pending on robot_commands (account_id, consumed);

-- ── Row Level Security ────────────────────────────────────────
-- This app has no per-user auth layer (the anon key + account UUID is
-- the shared secret between the app and the EA), so policies simply
-- allow the anon/authenticated roles full access. Lock this down with
-- real auth checks before using this schema in production with
-- multiple untrusted users.
alter table mt5_accounts enable row level security;
alter table robot_state enable row level security;
alter table ea_settings enable row level security;
alter table signal_log enable row level security;
alter table open_trades enable row level security;
alter table closed_trades enable row level security;
alter table robot_commands enable row level security;

create policy "public full access" on mt5_accounts for all using (true) with check (true);
create policy "public full access" on robot_state for all using (true) with check (true);
create policy "public full access" on ea_settings for all using (true) with check (true);
create policy "public full access" on signal_log for all using (true) with check (true);
create policy "public full access" on open_trades for all using (true) with check (true);
create policy "public full access" on closed_trades for all using (true) with check (true);
create policy "public full access" on robot_commands for all using (true) with check (true);

-- ── Realtime ───────────────────────────────────────────────────
alter publication supabase_realtime add table mt5_accounts;
alter publication supabase_realtime add table robot_state;
alter publication supabase_realtime add table ea_settings;
alter publication supabase_realtime add table signal_log;
alter publication supabase_realtime add table open_trades;
alter publication supabase_realtime add table closed_trades;
