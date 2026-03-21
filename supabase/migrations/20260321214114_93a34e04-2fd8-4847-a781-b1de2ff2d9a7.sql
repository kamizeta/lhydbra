
-- Allocation items: individual allocation decisions per optimizer run
CREATE TABLE public.allocation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid REFERENCES public.allocation_plans(id) ON DELETE CASCADE NOT NULL,
  user_id uuid NOT NULL,
  signal_id uuid REFERENCES public.trade_signals(id) ON DELETE SET NULL,
  symbol text NOT NULL,
  asset_type text NOT NULL DEFAULT 'stock',
  direction text NOT NULL DEFAULT 'long',
  strategy_family text,
  opportunity_score numeric DEFAULT 0,
  confidence_score numeric DEFAULT 0,
  expected_r_multiple numeric DEFAULT 0,
  allocation_priority numeric DEFAULT 0,
  correlation_penalty numeric DEFAULT 0,
  adjusted_priority numeric DEFAULT 0,
  score_multiplier numeric DEFAULT 1.0,
  allocated_capital numeric DEFAULT 0,
  position_size numeric DEFAULT 0,
  risk_used numeric DEFAULT 0,
  risk_percent numeric DEFAULT 0,
  final_weight numeric DEFAULT 0,
  priority_rank integer DEFAULT 0,
  status text NOT NULL DEFAULT 'allocated',
  rejection_reason text,
  explanation jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.allocation_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own allocation items"
  ON public.allocation_items FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Correlation matrix: pairwise asset correlations
CREATE TABLE public.correlation_matrix (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol_a text NOT NULL,
  symbol_b text NOT NULL,
  correlation numeric NOT NULL DEFAULT 0,
  asset_class_a text NOT NULL DEFAULT 'stock',
  asset_class_b text NOT NULL DEFAULT 'stock',
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(symbol_a, symbol_b)
);

ALTER TABLE public.correlation_matrix ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read correlation matrix"
  ON public.correlation_matrix FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Service can insert correlation matrix"
  ON public.correlation_matrix FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Service can update correlation matrix"
  ON public.correlation_matrix FOR UPDATE TO authenticated
  USING (true);
