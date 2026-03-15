
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS binance_api_key text,
ADD COLUMN IF NOT EXISTS binance_api_secret text;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;
