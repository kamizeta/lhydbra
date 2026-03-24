
CREATE TABLE public.symbol_sectors (
  symbol TEXT PRIMARY KEY,
  sector TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.symbol_sectors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read symbol sectors"
  ON public.symbol_sectors FOR SELECT
  TO authenticated
  USING (true);

INSERT INTO public.symbol_sectors (symbol, sector) VALUES
  ('AAPL', 'tech'),
  ('MSFT', 'tech'),
  ('NVDA', 'tech'),
  ('GOOGL', 'tech'),
  ('META', 'tech'),
  ('AMZN', 'tech'),
  ('TSLA', 'tech'),
  ('AMD', 'tech'),
  ('QQQ', 'tech_etf'),
  ('SOXX', 'tech_etf'),
  ('SMH', 'tech_etf'),
  ('SPY', 'broad_etf'),
  ('VOO', 'broad_etf'),
  ('IWM', 'broad_etf'),
  ('JPM', 'finance'),
  ('BAC', 'finance'),
  ('GS', 'finance'),
  ('XLF', 'finance'),
  ('XLE', 'energy'),
  ('CVX', 'energy'),
  ('XOM', 'energy'),
  ('GLD', 'commodity'),
  ('XAU/USD', 'commodity'),
  ('BTC/USD', 'crypto'),
  ('ETH/USD', 'crypto'),
  ('EUR/USD', 'forex'),
  ('GBP/USD', 'forex'),
  ('USD/JPY', 'forex');
