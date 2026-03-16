-- Market cache table with TTL support
CREATE TABLE public.market_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  asset_class text NOT NULL DEFAULT 'stock',
  provider text NOT NULL DEFAULT 'unknown',
  price numeric NOT NULL,
  open_price numeric,
  high_price numeric,
  low_price numeric,
  volume numeric DEFAULT 0,
  change_val numeric DEFAULT 0,
  change_percent numeric DEFAULT 0,
  previous_close numeric,
  bid numeric,
  ask numeric,
  is_market_open boolean DEFAULT true,
  raw_data jsonb DEFAULT '{}'::jsonb,
  request_count integer DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '2 minutes'),
  UNIQUE(symbol)
);

CREATE INDEX idx_market_cache_symbol ON public.market_cache(symbol);
CREATE INDEX idx_market_cache_expires ON public.market_cache(expires_at);

ALTER TABLE public.market_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read market cache"
  ON public.market_cache FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Service can insert market cache"
  ON public.market_cache FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Service can update market cache"
  ON public.market_cache FOR UPDATE TO authenticated
  USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.market_cache;