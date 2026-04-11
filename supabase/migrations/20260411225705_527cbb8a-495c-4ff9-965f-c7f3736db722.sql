CREATE OR REPLACE FUNCTION public.check_and_increment_rate_limit(
  p_key TEXT,
  p_max_count INT DEFAULT 10,
  p_window_seconds INT DEFAULT 60
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  INSERT INTO public.rate_limit_log (key, count, expires_at)
  VALUES (p_key, 1, NOW() + (p_window_seconds || ' seconds')::INTERVAL)
  ON CONFLICT (key) DO UPDATE SET
    count = CASE 
      WHEN rate_limit_log.expires_at < NOW() THEN 1
      ELSE rate_limit_log.count + 1
    END,
    expires_at = CASE
      WHEN rate_limit_log.expires_at < NOW() THEN NOW() + (p_window_seconds || ' seconds')::INTERVAL
      ELSE rate_limit_log.expires_at
    END
  RETURNING count INTO v_count;

  RETURN v_count;
END;
$$;