ALTER TABLE public.correlation_matrix
  ADD COLUMN IF NOT EXISTS calculated_at TIMESTAMPTZ DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS correlation_matrix_pair_idx
  ON public.correlation_matrix (symbol_a, symbol_b);