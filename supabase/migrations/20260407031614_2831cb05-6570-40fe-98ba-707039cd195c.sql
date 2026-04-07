
-- Remove overpermissive policies on api_usage_log
DROP POLICY IF EXISTS "Authenticated users can read api usage" ON public.api_usage_log;
DROP POLICY IF EXISTS "Service can insert api usage" ON public.api_usage_log;

-- api_usage_log should only be accessible via service role (edge functions)
-- No authenticated user policies needed

-- Remove client-facing INSERT policy on audit_log
-- Writes should only happen from edge functions using service role
DROP POLICY IF EXISTS "Authenticated users can insert own audit logs" ON public.audit_log;
