
-- Create the signals table
CREATE TABLE public.signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  asset text NOT NULL,
  asset_class text NOT NULL DEFAULT 'stock',
  strategy_id uuid REFERENCES public.strategies(id) ON DELETE SET NULL,
  strategy_family text,
  market_regime text DEFAULT 'undefined',
  direction text NOT NULL DEFAULT 'long',
  entry_price numeric NOT NULL,
  stop_loss numeric NOT NULL,
  targets jsonb NOT NULL DEFAULT '[]'::jsonb,
  expected_r_multiple numeric NOT NULL DEFAULT 0,
  opportunity_score numeric NOT NULL DEFAULT 0,
  confidence_score numeric NOT NULL DEFAULT 0,
  score_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  modifiers_applied jsonb NOT NULL DEFAULT '{}'::jsonb,
  weight_profile_used jsonb NOT NULL DEFAULT '{}'::jsonb,
  reasoning text,
  explanation jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  invalidation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.signals ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own signals" ON public.signals FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own signals" ON public.signals FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own signals" ON public.signals FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own signals" ON public.signals FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Index for fast queries
CREATE INDEX idx_signals_user_status ON public.signals(user_id, status);
CREATE INDEX idx_signals_asset ON public.signals(asset);
CREATE INDEX idx_signals_created ON public.signals(created_at DESC);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.signals;
