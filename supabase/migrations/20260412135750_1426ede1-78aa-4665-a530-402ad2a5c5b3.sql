
-- 1. Fix CRITICAL: Remove permissive UPDATE policy on feature_flags
-- Only service_role should be able to modify feature flags
DROP POLICY IF EXISTS "Authenticated users can update flags" ON public.feature_flags;

-- 2. Fix WARN: Add explicit deny-all policies documentation for rate_limit_log
-- RLS is enabled with no policies = no client access. This is intentional for backend-only table.
-- Adding a comment for clarity:
COMMENT ON TABLE public.rate_limit_log IS 'Backend-only table for rate limiting. RLS enabled with no policies intentionally blocks all client access.';
