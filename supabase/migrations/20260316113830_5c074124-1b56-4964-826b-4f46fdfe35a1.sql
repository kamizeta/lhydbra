-- Create resilient AI agent run queue tables
CREATE TABLE IF NOT EXISTS public.agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  requested_agents TEXT[] NOT NULL DEFAULT '{}'::text[],
  current_agent TEXT,
  language TEXT NOT NULL DEFAULT 'en',
  input_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_run_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  agent_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  content TEXT NOT NULL DEFAULT '',
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_run_results_run_agent_unique UNIQUE (run_id, agent_type)
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_user_created_at ON public.agent_runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status_created_at ON public.agent_runs(status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_agent_run_results_run_id ON public.agent_run_results(run_id);
CREATE INDEX IF NOT EXISTS idx_agent_run_results_user_id ON public.agent_run_results(user_id);

ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_run_results ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'agent_runs' AND policyname = 'Users can view own agent runs'
  ) THEN
    CREATE POLICY "Users can view own agent runs"
    ON public.agent_runs
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'agent_runs' AND policyname = 'Users can insert own agent runs'
  ) THEN
    CREATE POLICY "Users can insert own agent runs"
    ON public.agent_runs
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'agent_runs' AND policyname = 'Users can update own agent runs'
  ) THEN
    CREATE POLICY "Users can update own agent runs"
    ON public.agent_runs
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'agent_run_results' AND policyname = 'Users can view own agent run results'
  ) THEN
    CREATE POLICY "Users can view own agent run results"
    ON public.agent_run_results
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'agent_run_results' AND policyname = 'Users can insert own agent run results'
  ) THEN
    CREATE POLICY "Users can insert own agent run results"
    ON public.agent_run_results
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'agent_run_results' AND policyname = 'Users can update own agent run results'
  ) THEN
    CREATE POLICY "Users can update own agent run results"
    ON public.agent_run_results
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id);
  END IF;
END $$;

-- Enable extensions needed for scheduled background processing
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;