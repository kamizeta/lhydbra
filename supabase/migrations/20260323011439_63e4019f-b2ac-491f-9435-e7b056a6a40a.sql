ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS notify_email TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS notify_telegram_chat_id TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS notify_on_trade_executed BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_on_stop_loss BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_on_take_profit BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_on_cooldown BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_drawdown_threshold NUMERIC DEFAULT 5;