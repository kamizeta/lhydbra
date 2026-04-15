
-- 1. Recrear trigger con fallback a señal + ABS(qty)
CREATE OR REPLACE FUNCTION public.handle_position_closed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_signal RECORD;
  v_r_multiple numeric;
  v_stop_distance numeric;
  v_opp_score numeric;
  v_reasoning text;
  v_effective_sl numeric;
BEGIN
  IF NEW.status = 'closed' AND OLD.status IS DISTINCT FROM 'closed' THEN
    
    -- Determine effective stop_loss: position SL, fallback to signal SL
    v_effective_sl := NULL;
    IF NEW.stop_loss IS NOT NULL AND NEW.stop_loss <> NEW.avg_entry THEN
      v_effective_sl := NEW.stop_loss;
    ELSIF NEW.signal_id IS NOT NULL THEN
      SELECT s.stop_loss INTO v_effective_sl FROM signals s WHERE s.id = NEW.signal_id;
      IF v_effective_sl IS NOT NULL AND v_effective_sl = NEW.avg_entry THEN
        v_effective_sl := NULL; -- still invalid
      END IF;
    END IF;

    -- Calculate R-multiple using ABS(quantity)
    IF v_effective_sl IS NOT NULL THEN
      v_stop_distance := ABS(NEW.avg_entry - v_effective_sl);
      IF v_stop_distance > 0 AND ABS(NEW.quantity) > 0 THEN
        v_r_multiple := COALESCE(NEW.pnl, 0) / (v_stop_distance * ABS(NEW.quantity));
      END IF;
    END IF;

    NEW.actual_r_multiple := v_r_multiple;

    v_opp_score := NULL;
    v_reasoning := NEW.notes;

    IF NEW.signal_id IS NOT NULL THEN
      SELECT * INTO v_signal FROM signals WHERE id = NEW.signal_id;
      IF FOUND THEN
        v_opp_score := v_signal.opportunity_score;
        v_reasoning := COALESCE(v_signal.reasoning, NEW.notes);
      END IF;
    END IF;

    INSERT INTO public.trade_journal (
      user_id, symbol, asset_type, direction, quantity,
      entry_price, exit_price, entered_at, exited_at,
      pnl, r_multiple, strategy_family, market_regime,
      opportunity_score, position_id, signal_id,
      entry_reasoning
    ) VALUES (
      NEW.user_id, NEW.symbol, NEW.asset_type, NEW.direction, NEW.quantity,
      NEW.avg_entry, NEW.close_price, NEW.opened_at, NEW.closed_at,
      NEW.pnl, v_r_multiple, COALESCE(NEW.strategy_family, NEW.strategy),
      NEW.regime_at_entry,
      v_opp_score, NEW.id, NEW.signal_id,
      v_reasoning
    )
    ON CONFLICT (position_id) DO NOTHING;

    INSERT INTO public.strategy_performance (
      user_id, strategy_family, market_regime,
      total_trades, winning_trades, losing_trades,
      total_pnl, win_rate, avg_r_multiple
    ) VALUES (
      NEW.user_id,
      COALESCE(NEW.strategy_family, NEW.strategy, 'unknown'),
      COALESCE(NEW.regime_at_entry, 'all'),
      1,
      CASE WHEN COALESCE(NEW.pnl, 0) > 0 THEN 1 ELSE 0 END,
      CASE WHEN COALESCE(NEW.pnl, 0) <= 0 THEN 1 ELSE 0 END,
      COALESCE(NEW.pnl, 0),
      CASE WHEN COALESCE(NEW.pnl, 0) > 0 THEN 100 ELSE 0 END,
      COALESCE(v_r_multiple, 0)
    )
    ON CONFLICT (user_id, strategy_family, market_regime)
    DO UPDATE SET
      total_trades = strategy_performance.total_trades + 1,
      winning_trades = strategy_performance.winning_trades + CASE WHEN COALESCE(NEW.pnl, 0) > 0 THEN 1 ELSE 0 END,
      losing_trades = strategy_performance.losing_trades + CASE WHEN COALESCE(NEW.pnl, 0) <= 0 THEN 1 ELSE 0 END,
      total_pnl = strategy_performance.total_pnl + COALESCE(NEW.pnl, 0),
      win_rate = ROUND(
        ((strategy_performance.winning_trades + CASE WHEN COALESCE(NEW.pnl, 0) > 0 THEN 1 ELSE 0 END)::numeric /
        NULLIF(strategy_performance.total_trades + 1, 0)) * 100, 2
      ),
      avg_r_multiple = ROUND(
        ((strategy_performance.avg_r_multiple * strategy_performance.total_trades) + COALESCE(v_r_multiple, 0))::numeric /
        NULLIF(strategy_performance.total_trades + 1, 0), 4
      ),
      updated_at = now();
  END IF;

  RETURN NEW;
END;
$function$;

-- 2. Backfill: recalcular R-multiples faltantes en trade_journal
UPDATE public.trade_journal tj
SET r_multiple = COALESCE(tj.pnl, 0) / (ABS(tj.entry_price - s.stop_loss) * ABS(tj.quantity))
FROM public.signals s
WHERE tj.signal_id = s.id
  AND tj.r_multiple IS NULL
  AND s.stop_loss IS NOT NULL
  AND s.stop_loss <> tj.entry_price
  AND ABS(tj.entry_price - s.stop_loss) > 0
  AND ABS(tj.quantity) > 0;

-- 3. Backfill: actualizar actual_r_multiple en positions cerradas
UPDATE public.positions p
SET actual_r_multiple = COALESCE(p.pnl, 0) / (ABS(p.avg_entry - s.stop_loss) * ABS(p.quantity))
FROM public.signals s
WHERE p.signal_id = s.id
  AND p.status = 'closed'
  AND p.actual_r_multiple IS NULL
  AND s.stop_loss IS NOT NULL
  AND s.stop_loss <> p.avg_entry
  AND ABS(p.avg_entry - s.stop_loss) > 0
  AND ABS(p.quantity) > 0;
