ALTER TABLE public.signals
  ADD COLUMN ai_grade text DEFAULT NULL,
  ADD COLUMN ai_rationale text DEFAULT NULL;