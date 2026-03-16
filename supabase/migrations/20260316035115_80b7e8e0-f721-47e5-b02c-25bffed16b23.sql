
CREATE TABLE public.regime_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  asset_type text NOT NULL DEFAULT 'stock',
  previous_regime text NOT NULL,
  new_regime text NOT NULL,
  regime_confidence numeric DEFAULT 0,
  detected_at timestamp with time zone NOT NULL DEFAULT now(),
  seen_by_user boolean NOT NULL DEFAULT false
);

ALTER TABLE public.regime_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read regime changes" ON public.regime_changes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service can insert regime changes" ON public.regime_changes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Service can update regime changes" ON public.regime_changes FOR UPDATE TO authenticated USING (true);

CREATE INDEX idx_regime_changes_detected_at ON public.regime_changes (detected_at DESC);
CREATE INDEX idx_regime_changes_unseen ON public.regime_changes (seen_by_user) WHERE seen_by_user = false;
