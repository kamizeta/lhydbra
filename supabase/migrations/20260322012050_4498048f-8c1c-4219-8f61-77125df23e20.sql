INSERT INTO public.symbol_mapping 
  (internal_symbol, display_name, asset_class, twelvedata_symbol, is_active)
VALUES
  ('EUR/USD', 'Euro / US Dollar', 'forex', 'EUR/USD', true),
  ('GBP/USD', 'British Pound / US Dollar', 'forex', 'GBP/USD', true),
  ('USD/JPY', 'US Dollar / Japanese Yen', 'forex', 'USD/JPY', true),
  ('AUD/USD', 'Australian Dollar / US Dollar', 'forex', 'AUD/USD', true),
  ('USD/CAD', 'US Dollar / Canadian Dollar', 'forex', 'USD/CAD', true),
  ('USD/CHF', 'US Dollar / Swiss Franc', 'forex', 'USD/CHF', true),
  ('USD/MXN', 'US Dollar / Mexican Peso', 'forex', 'USD/MXN', true),
  ('XAU/USD', 'Gold / US Dollar', 'commodity', 'XAU/USD', true)
ON CONFLICT (internal_symbol) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  twelvedata_symbol = EXCLUDED.twelvedata_symbol,
  is_active = true;