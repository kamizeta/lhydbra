
CREATE TABLE IF NOT EXISTS public.feature_flags (
  id TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID
);

INSERT INTO public.feature_flags (id, enabled, description) VALUES
  ('auto_trading', true, 'Enable automated trade execution via operator-mode'),
  ('signal_generation', true, 'Enable signal engine to generate new signals'),
  ('bracket_orders', true, 'Use bracket orders for SL/TP protection'),
  ('reconciliation', true, 'Enable periodic broker/DB reconciliation'),
  ('shadow_mode_available', true, 'Allow users to enable shadow mode'),
  ('crypto_trading', false, 'Enable crypto asset trading'),
  ('short_selling', false, 'Enable short position opening')
ON CONFLICT DO NOTHING;

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read flags" ON public.feature_flags
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can update flags" ON public.feature_flags
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
