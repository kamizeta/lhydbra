CREATE UNIQUE INDEX IF NOT EXISTS idx_positions_unique_open 
ON public.positions (user_id, symbol) 
WHERE status = 'open';