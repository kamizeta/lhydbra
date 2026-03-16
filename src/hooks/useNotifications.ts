import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  category: string;
  severity: string;
  is_read: boolean;
  metadata: Record<string, any>;
  created_at: string;
}

export interface NotificationPreferences {
  sl_tp_enabled: boolean;
  sl_tp_sound: boolean;
  risk_alerts_enabled: boolean;
  risk_alerts_sound: boolean;
  regime_change_enabled: boolean;
  regime_change_sound: boolean;
  signals_enabled: boolean;
  signals_sound: boolean;
  pnl_threshold_enabled: boolean;
  pnl_threshold_sound: boolean;
  pnl_threshold_percent: number;
  agents_enabled: boolean;
  agents_sound: boolean;
}

const defaultPrefs: NotificationPreferences = {
  sl_tp_enabled: true,
  sl_tp_sound: true,
  risk_alerts_enabled: true,
  risk_alerts_sound: true,
  regime_change_enabled: true,
  regime_change_sound: false,
  signals_enabled: true,
  signals_sound: false,
  pnl_threshold_enabled: true,
  pnl_threshold_sound: false,
  pnl_threshold_percent: 5,
  agents_enabled: true,
  agents_sound: false,
};

// Sound utilities
const playAlertSound = () => {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch (e) {
    // Audio not available
  }
};

const playCriticalSound = () => {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'square';
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.setValueAtTime(800, ctx.currentTime + 0.15);
    osc.frequency.setValueAtTime(600, ctx.currentTime + 0.3);
    osc.frequency.setValueAtTime(800, ctx.currentTime + 0.45);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.6);
  } catch (e) {
    // Audio not available
  }
};

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [preferences, setPreferences] = useState<NotificationPreferences>(defaultPrefs);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const prefsRef = useRef(preferences);
  prefsRef.current = preferences;

  // Load notifications
  const loadNotifications = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (data) {
      setNotifications(data as unknown as Notification[]);
      setUnreadCount(data.filter((n: any) => !n.is_read).length);
    }
    setLoading(false);
  }, [user]);

  // Load preferences
  const loadPreferences = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    if (data) {
      const { id, user_id, created_at, updated_at, ...prefs } = data as any;
      setPreferences({ ...defaultPrefs, ...prefs });
    }
  }, [user]);

  // Save preferences
  const savePreferences = useCallback(async (newPrefs: NotificationPreferences) => {
    if (!user) return;
    setPreferences(newPrefs);
    await supabase
      .from('notification_preferences')
      .upsert({
        user_id: user.id,
        ...newPrefs,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
  }, [user]);

  // Create notification
  const createNotification = useCallback(async (
    title: string,
    message: string,
    category: string,
    severity: 'info' | 'warning' | 'critical' = 'info',
    metadata: Record<string, any> = {}
  ) => {
    if (!user) return;

    // Check if category is enabled
    const prefs = prefsRef.current;
    const categoryMap: Record<string, boolean> = {
      sl_tp: prefs.sl_tp_enabled,
      risk: prefs.risk_alerts_enabled,
      regime: prefs.regime_change_enabled,
      signal: prefs.signals_enabled,
      pnl: prefs.pnl_threshold_enabled,
      agent: prefs.agents_enabled,
    };
    if (categoryMap[category] === false) return;

    await supabase.from('notifications').insert({
      user_id: user.id,
      type: severity,
      title,
      message,
      category,
      severity,
      metadata,
    });
  }, [user]);

  // Mark as read
  const markAsRead = useCallback(async (id: string) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  const markAllAsRead = useCallback(async () => {
    if (!user) return;
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }, [user]);

  const deleteNotification = useCallback(async (id: string) => {
    await supabase.from('notifications').delete().eq('id', id);
    setNotifications(prev => {
      const n = prev.find(x => x.id === id);
      if (n && !n.is_read) setUnreadCount(c => Math.max(0, c - 1));
      return prev.filter(x => x.id !== id);
    });
  }, []);

  const clearAll = useCallback(async () => {
    if (!user) return;
    await supabase.from('notifications').delete().eq('user_id', user.id);
    setNotifications([]);
    setUnreadCount(0);
  }, [user]);

  // Load on mount
  useEffect(() => {
    loadNotifications();
    loadPreferences();
  }, [loadNotifications, loadPreferences]);

  // Realtime subscription
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('notifications_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const newNotif = payload.new as unknown as Notification;
          setNotifications(prev => [newNotif, ...prev]);
          setUnreadCount(prev => prev + 1);

          // Play sound based on category
          const prefs = prefsRef.current;
          const soundMap: Record<string, boolean> = {
            sl_tp: prefs.sl_tp_sound,
            risk: prefs.risk_alerts_sound,
            regime: prefs.regime_change_sound,
            signal: prefs.signals_sound,
            pnl: prefs.pnl_threshold_sound,
            agent: prefs.agents_sound,
          };
          if (soundMap[newNotif.category]) {
            if (newNotif.severity === 'critical') {
              playCriticalSound();
            } else {
              playAlertSound();
            }
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  return {
    notifications,
    unreadCount,
    loading,
    preferences,
    createNotification,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll,
    savePreferences,
    refetch: loadNotifications,
  };
}
