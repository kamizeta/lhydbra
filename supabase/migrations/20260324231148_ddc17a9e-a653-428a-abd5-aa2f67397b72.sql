
-- Add vault reference columns
ALTER TABLE public.user_settings 
  ADD COLUMN IF NOT EXISTS binance_key_id uuid DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS binance_secret_id uuid DEFAULT NULL;

-- Drop old plaintext columns
ALTER TABLE public.user_settings 
  DROP COLUMN IF EXISTS binance_api_key,
  DROP COLUMN IF EXISTS binance_api_secret;
