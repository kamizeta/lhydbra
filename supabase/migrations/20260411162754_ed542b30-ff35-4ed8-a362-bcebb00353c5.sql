
CREATE TABLE public.alpha_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  message TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.alpha_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own alpha notes"
  ON public.alpha_notes FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own alpha notes"
  ON public.alpha_notes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own alpha notes"
  ON public.alpha_notes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_alpha_notes_user_created ON public.alpha_notes (user_id, created_at DESC);
