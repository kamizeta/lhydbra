
-- Add unique constraint on position_id to prevent duplicate journal entries
ALTER TABLE public.trade_journal 
ADD CONSTRAINT trade_journal_position_id_unique UNIQUE (position_id);

-- Replace the trigger function with safer logic
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
BEGIN
  -- Only fire when status actually transitions TO 'closed' from something else
  IF NEW.status = 'closed' AND OLD.status IS DISTINCT FROM 'closed' THEN
    
    IF NEW.stop_loss IS NOT NULL AND NEW.stop_loss <> NEW.avg_entry THEN
      v_stop_distance := ABS(NEW.avg_entry - NEW.stop_loss);
      IF v_stop_distance > 0 THEN
        v_r_multiple := COALESCE(NEW.pnl, 0) / (v_stop_distance * NEW.quantity);
      END IF;
    END IF;

    NEW.actual_r_multiple := v_r_multiple;

    IF NEW.signal_id IS NOT NULL THEN
      SELECT * INTO v_signal FROM signals WHERE id = NEW.signal_id;
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
      COALESCE(v_signal.opportunity_score, NULL), NEW.id, NEW.signal_id,
      COALESCE(v_signal.reasoning, NEW.notes)
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
