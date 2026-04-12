
CREATE TABLE IF NOT EXISTS public.capital_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'trade_open', 'trade_close', 'fee', 'adjustment', 'deposit', 'withdrawal', 'reconciliation'
  )),
  symbol TEXT,
  amount NUMERIC(14,4) NOT NULL,
  balance_after NUMERIC(14,4) NOT NULL,
  reference_id UUID,
  reference_type TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.capital_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own ledger" ON public.capital_ledger
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_capital_ledger_user ON public.capital_ledger (user_id, created_at DESC);
CREATE INDEX idx_capital_ledger_ref ON public.capital_ledger (reference_id);

CREATE TRIGGER audit_capital_ledger AFTER INSERT ON public.capital_ledger
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
