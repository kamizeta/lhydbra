-- Redirect FK on allocation_items
ALTER TABLE public.allocation_items DROP CONSTRAINT IF EXISTS allocation_items_signal_id_fkey;
ALTER TABLE public.allocation_items ADD CONSTRAINT allocation_items_signal_id_fkey
  FOREIGN KEY (signal_id) REFERENCES public.signals(id) ON DELETE SET NULL;

-- Rename old table (idempotent — skip if already renamed)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'trade_signals') THEN
    ALTER TABLE public.trade_signals RENAME TO trade_signals_deprecated;
  END IF;
END $$;