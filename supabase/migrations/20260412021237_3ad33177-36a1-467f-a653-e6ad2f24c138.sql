
-- 1. Migrate trade_signals rows that don't exist in signals
INSERT INTO public.signals (
  user_id, asset, asset_class, direction, entry_price, stop_loss,
  targets, expected_r_multiple, opportunity_score, confidence_score,
  score_breakdown, reasoning, strategy_family, market_regime, status,
  created_at, updated_at
)
SELECT
  ts.user_id,
  ts.symbol,
  ts.asset_type,
  ts.direction,
  ts.entry_price,
  ts.stop_loss,
  jsonb_build_array(ts.take_profit),
  ts.risk_reward,
  COALESCE(ts.opportunity_score, 0),
  ts.confidence,
  COALESCE(ts.score_breakdown, '{}'::jsonb),
  COALESCE(ts.reasoning, ts.agent_analysis),
  ts.strategy_family,
  ts.market_regime,
  ts.status,
  ts.created_at,
  ts.updated_at
FROM public.trade_signals ts
WHERE NOT EXISTS (
  SELECT 1 FROM public.signals s
  WHERE s.user_id = ts.user_id
    AND s.asset = ts.symbol
    AND s.entry_price = ts.entry_price
    AND s.created_at = ts.created_at
);

-- 2. Update allocation_items FK to point to signals
ALTER TABLE public.allocation_items DROP CONSTRAINT IF EXISTS allocation_items_signal_id_fkey;
ALTER TABLE public.allocation_items ADD CONSTRAINT allocation_items_signal_id_fkey
  FOREIGN KEY (signal_id) REFERENCES public.signals(id) ON DELETE SET NULL;

-- 3. Rename trade_signals to deprecated
ALTER TABLE public.trade_signals RENAME TO trade_signals_deprecated;
