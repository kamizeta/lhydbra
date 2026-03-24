
CREATE TABLE public.rate_limit_log (
  key TEXT PRIMARY KEY,
  count INTEGER DEFAULT 1,
  expires_at TIMESTAMPTZ
);

ALTER TABLE public.rate_limit_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_rate_limit_expires ON public.rate_limit_log(expires_at);
