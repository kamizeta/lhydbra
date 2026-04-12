
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  signal_id UUID REFERENCES public.signals(id) ON DELETE SET NULL,
  position_id UUID REFERENCES public.positions(id) ON DELETE SET NULL,
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('long', 'short')),
  quantity NUMERIC(12,6),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'submitted', 'filled', 'protection_placed',
    'failed', 'cancelled', 'fail_safe_closed'
  )),
  broker_order_id TEXT,
  idempotency_key TEXT UNIQUE,
  submitted_price NUMERIC(12,4),
  filled_price NUMERIC(12,4),
  slippage_pct NUMERIC(8,6),
  stop_loss NUMERIC(12,4),
  take_profit NUMERIC(12,4),
  protection_confirmed BOOLEAN DEFAULT false,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own orders" ON public.orders
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_orders_user_status ON public.orders (user_id, status);
CREATE INDEX idx_orders_idempotency ON public.orders (idempotency_key);
CREATE INDEX idx_orders_signal ON public.orders (signal_id);

CREATE TRIGGER audit_orders AFTER INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
