
CREATE OR REPLACE FUNCTION public.increment_trade_counters(p_user_id uuid, p_trade_count integer, p_risk_pct numeric, p_today text, p_max_trades integer, p_max_risk numeric)
 RETURNS TABLE(new_trades_today integer, new_daily_risk_used numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $$
BEGIN
  UPDATE public.user_settings SET
    trades_today = CASE
      WHEN last_trade_date = p_today THEN LEAST(trades_today + p_trade_count, p_max_trades)
      ELSE p_trade_count
    END,
    daily_risk_used = CASE
      WHEN last_trade_date = p_today THEN LEAST(daily_risk_used + p_risk_pct, p_max_risk)
      ELSE p_risk_pct
    END,
    last_trade_date = p_today,
    updated_at = now()
  WHERE user_id = p_user_id;

  RETURN QUERY
  SELECT s.trades_today::INT, s.daily_risk_used
  FROM public.user_settings s WHERE s.user_id = p_user_id;
END;
$$;
