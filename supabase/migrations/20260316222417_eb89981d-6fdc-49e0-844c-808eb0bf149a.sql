
CREATE TABLE IF NOT EXISTS public.api_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  action text NOT NULL DEFAULT 'quote',
  symbols_requested integer NOT NULL DEFAULT 0,
  symbols_returned integer NOT NULL DEFAULT 0,
  response_time_ms integer DEFAULT NULL,
  error_message text DEFAULT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_usage_source_created ON public.api_usage_log (source, created_at DESC);

ALTER TABLE public.api_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read api usage"
  ON public.api_usage_log FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Service can insert api usage"
  ON public.api_usage_log FOR INSERT TO authenticated
  WITH CHECK (true);
