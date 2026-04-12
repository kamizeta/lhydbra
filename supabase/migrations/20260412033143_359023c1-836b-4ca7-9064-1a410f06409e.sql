
-- Add shadow_mode to user_settings
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS shadow_mode BOOLEAN DEFAULT false;

-- Add 'shadow' to orders status constraint
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check CHECK (status IN (
  'pending', 'submitted', 'filled', 'protection_placed', 'failed', 'cancelled', 'fail_safe_closed', 'shadow'
));
