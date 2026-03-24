
-- Remove authenticated write policies from market data tables.
-- Writes only come from edge functions via service role which bypasses RLS.

DROP POLICY IF EXISTS "Service can insert ohlcv" ON public.ohlcv_cache;
DROP POLICY IF EXISTS "Service can update ohlcv" ON public.ohlcv_cache;
DROP POLICY IF EXISTS "Authenticated can insert ohlcv" ON public.ohlcv_cache;
DROP POLICY IF EXISTS "Authenticated can update ohlcv" ON public.ohlcv_cache;
DROP POLICY IF EXISTS "Users can insert ohlcv cache" ON public.ohlcv_cache;
DROP POLICY IF EXISTS "Users can update ohlcv cache" ON public.ohlcv_cache;
DROP POLICY IF EXISTS "Service can insert ohlcv cache" ON public.ohlcv_cache;
DROP POLICY IF EXISTS "Service can update ohlcv cache" ON public.ohlcv_cache;

DROP POLICY IF EXISTS "Service can insert market features" ON public.market_features;
DROP POLICY IF EXISTS "Service can update market features" ON public.market_features;
DROP POLICY IF EXISTS "Authenticated can insert market features" ON public.market_features;
DROP POLICY IF EXISTS "Authenticated can update market features" ON public.market_features;
DROP POLICY IF EXISTS "Users can insert market features" ON public.market_features;
DROP POLICY IF EXISTS "Users can update market features" ON public.market_features;

DROP POLICY IF EXISTS "Service can insert opportunity scores" ON public.opportunity_scores;
DROP POLICY IF EXISTS "Service can update opportunity scores" ON public.opportunity_scores;
DROP POLICY IF EXISTS "Authenticated can insert opportunity scores" ON public.opportunity_scores;
DROP POLICY IF EXISTS "Authenticated can update opportunity scores" ON public.opportunity_scores;
DROP POLICY IF EXISTS "Users can insert opportunity scores" ON public.opportunity_scores;
DROP POLICY IF EXISTS "Users can update opportunity scores" ON public.opportunity_scores;
