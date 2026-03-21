
-- Add operator mode columns to user_settings
ALTER TABLE user_settings 
  ADD COLUMN IF NOT EXISTS max_trades_per_day integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS loss_cooldown_count integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS operator_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_execute boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consecutive_losses integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trades_today integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_trade_date date DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS daily_risk_used numeric NOT NULL DEFAULT 0;

-- Create daily performance tracking table
CREATE TABLE IF NOT EXISTS daily_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  date date NOT NULL,
  starting_capital numeric NOT NULL DEFAULT 0,
  ending_capital numeric NOT NULL DEFAULT 0,
  realized_pnl numeric NOT NULL DEFAULT 0,
  unrealized_pnl numeric NOT NULL DEFAULT 0,
  trades_opened integer NOT NULL DEFAULT 0,
  trades_closed integer NOT NULL DEFAULT 0,
  win_count integer NOT NULL DEFAULT 0,
  loss_count integer NOT NULL DEFAULT 0,
  avg_r_multiple numeric DEFAULT 0,
  max_drawdown_pct numeric DEFAULT 0,
  risk_used_pct numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);

ALTER TABLE daily_performance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own daily performance"
ON daily_performance FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Enable realtime for daily_performance
ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_performance;
