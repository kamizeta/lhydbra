ALTER TABLE public.signals ADD COLUMN IF NOT EXISTS signal_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_signals_dedup 
ON public.signals (signal_key) 
WHERE signal_key IS NOT NULL;