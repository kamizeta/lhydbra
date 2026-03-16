
-- Notifications table
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  severity TEXT NOT NULL DEFAULT 'info',
  is_read BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own notifications" ON public.notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Notification preferences table
CREATE TABLE public.notification_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  sl_tp_enabled BOOLEAN NOT NULL DEFAULT true,
  sl_tp_sound BOOLEAN NOT NULL DEFAULT true,
  risk_alerts_enabled BOOLEAN NOT NULL DEFAULT true,
  risk_alerts_sound BOOLEAN NOT NULL DEFAULT true,
  regime_change_enabled BOOLEAN NOT NULL DEFAULT true,
  regime_change_sound BOOLEAN NOT NULL DEFAULT false,
  signals_enabled BOOLEAN NOT NULL DEFAULT true,
  signals_sound BOOLEAN NOT NULL DEFAULT false,
  pnl_threshold_enabled BOOLEAN NOT NULL DEFAULT true,
  pnl_threshold_sound BOOLEAN NOT NULL DEFAULT false,
  pnl_threshold_percent NUMERIC NOT NULL DEFAULT 5,
  agents_enabled BOOLEAN NOT NULL DEFAULT true,
  agents_sound BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own prefs" ON public.notification_preferences FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own prefs" ON public.notification_preferences FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own prefs" ON public.notification_preferences FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_notifications_user_created ON public.notifications (user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON public.notifications (user_id, is_read) WHERE is_read = false;
