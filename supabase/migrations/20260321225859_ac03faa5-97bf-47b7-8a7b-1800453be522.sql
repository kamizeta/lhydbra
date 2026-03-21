
-- Goal profiles table for tracking income targets
CREATE TABLE public.goal_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  monthly_target NUMERIC NOT NULL DEFAULT 3000,
  capital_available NUMERIC NOT NULL DEFAULT 10000,
  risk_tolerance TEXT NOT NULL DEFAULT 'moderate',
  daily_target NUMERIC NOT NULL DEFAULT 150,
  required_r_per_day NUMERIC NOT NULL DEFAULT 1.5,
  required_trades_per_day INTEGER NOT NULL DEFAULT 2,
  automation_level TEXT NOT NULL DEFAULT 'guided',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.goal_profiles ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can manage own goal profiles"
  ON public.goal_profiles
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Coaching logs table
CREATE TABLE public.coaching_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  phase TEXT NOT NULL DEFAULT 'post_market',
  summary TEXT NOT NULL DEFAULT '',
  mistakes TEXT[] DEFAULT '{}',
  suggestions TEXT[] DEFAULT '{}',
  daily_grade TEXT DEFAULT 'B',
  goal_progress_pct NUMERIC DEFAULT 0,
  metrics JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.coaching_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own coaching logs"
  ON public.coaching_logs
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Enable realtime for goal_profiles
ALTER PUBLICATION supabase_realtime ADD TABLE public.goal_profiles;
