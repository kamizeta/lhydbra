
CREATE TABLE IF NOT EXISTS public.system_config (
  id TEXT PRIMARY KEY DEFAULT 'global',
  trading_enabled BOOLEAN NOT NULL DEFAULT true,
  max_daily_loss_pct NUMERIC(5,2) NOT NULL DEFAULT 3.0,
  kill_switch_reason TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

INSERT INTO public.system_config (id, trading_enabled, max_daily_loss_pct)
VALUES ('global', true, 3.0)
ON CONFLICT DO NOTHING;

ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read system_config"
ON public.system_config FOR SELECT TO authenticated USING (true);
