-- market_cache: drop write policies
DROP POLICY IF EXISTS "Anyone can insert market cache" ON public.market_cache;
DROP POLICY IF EXISTS "Anyone can update market cache" ON public.market_cache;
DROP POLICY IF EXISTS "Anyone can delete market cache" ON public.market_cache;
DROP POLICY IF EXISTS "Users can insert market cache" ON public.market_cache;
DROP POLICY IF EXISTS "Users can update market cache" ON public.market_cache;
DROP POLICY IF EXISTS "Users can delete market cache" ON public.market_cache;
DROP POLICY IF EXISTS "Authenticated can insert market cache" ON public.market_cache;
DROP POLICY IF EXISTS "Authenticated can update market cache" ON public.market_cache;
DROP POLICY IF EXISTS "Authenticated can delete market cache" ON public.market_cache;

-- correlation_matrix: drop write policies
DROP POLICY IF EXISTS "Anyone can insert correlation matrix" ON public.correlation_matrix;
DROP POLICY IF EXISTS "Anyone can update correlation matrix" ON public.correlation_matrix;
DROP POLICY IF EXISTS "Anyone can delete correlation matrix" ON public.correlation_matrix;
DROP POLICY IF EXISTS "Users can insert correlation matrix" ON public.correlation_matrix;
DROP POLICY IF EXISTS "Users can update correlation matrix" ON public.correlation_matrix;
DROP POLICY IF EXISTS "Users can delete correlation matrix" ON public.correlation_matrix;
DROP POLICY IF EXISTS "Authenticated can insert correlation matrix" ON public.correlation_matrix;
DROP POLICY IF EXISTS "Authenticated can update correlation matrix" ON public.correlation_matrix;
DROP POLICY IF EXISTS "Authenticated can delete correlation matrix" ON public.correlation_matrix;
DROP POLICY IF EXISTS "Anyone can manage correlation matrix" ON public.correlation_matrix;
DROP POLICY IF EXISTS "Users can manage correlation matrix" ON public.correlation_matrix;