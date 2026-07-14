// Row types for every table used by the app.
// Field names match exactly what useAccount.ts, index.tsx, trades.tsx,
// signals.tsx, robot.tsx and settings.tsx read/write, so nothing needs
// `as any` casts anywhere else in the app.

export type Mt5Account = {
  id: string;
  account_name: string;
  broker: string;
  login_id: string | null;
  server: string | null;
  currency: string;
  leverage: number;
  balance: number;
  equity: number;
  created_at: string;
  updated_at: string;
};

export type RobotState = {
  account_id: string;
  robot_enabled: boolean;
  robot_paused: boolean;
  dashboard_message: string | null;
  rsi_value: number | null;
  cooldown_seconds_left: number | null;
  total_active_positions: number | null;
  basket_profit: number | null;
  m5_high: number | null;
  m5_low: number | null;
  updated_at: string;
};

export type EaSettings = {
  account_id: string;
  lot_size: number;
  starting_sl_points: number;
  max_trades: number;
  target_profit_usd: number;
  target_loss_usd: number;
  session_start_hour: number;
  session_end_hour: number;
  settings_version: number;
  updated_at: string;
};

export type SignalLog = {
  id: string;
  account_id: string;
  engine: 'reversion' | 'breakout';
  signal_type: string;
  direction: 'BUY' | 'SELL';
  rsi_value: number;
  bid_price: number;
  m5_high: number;
  m5_low: number;
  lot_size: number;
  positions_fired: number;
  sl_points: number;
  tp_points: number;
  fired_at: string;
};

export type OpenTrade = {
  id: string;
  account_id: string;
  ticket: number;
  symbol: string;
  trade_type: 'BUY' | 'SELL';
  volume: number;
  open_price: number;
  current_price: number;
  stop_loss: number | null;
  take_profit: number | null;
  profit: number;
  swap: number;
  commission: number;
  open_time: string | null;
};

export type ClosedTrade = {
  id: string;
  account_id: string;
  ticket: number;
  symbol: string;
  trade_type: 'BUY' | 'SELL';
  volume: number;
  open_price: number;
  close_price: number;
  stop_loss: number | null;
  take_profit: number | null;
  profit: number;
  swap: number;
  commission: number;
  open_time: string | null;
  close_time: string | null;
};

export type RobotCommand = {
  id: string;
  account_id: string;
  command: 'start' | 'stop' | 'pause' | 'resume';
  created_at: string;
  delivered_at: string | null;
  consumed: boolean;
};

export type Database = {
  public: {
    Tables: {
      mt5_accounts: { Row: Mt5Account };
      robot_state: { Row: RobotState };
      ea_settings: { Row: EaSettings };
      signal_log: { Row: SignalLog };
      open_trades: { Row: OpenTrade };
      closed_trades: { Row: ClosedTrade };
      robot_commands: { Row: RobotCommand };
    };
  };
};
