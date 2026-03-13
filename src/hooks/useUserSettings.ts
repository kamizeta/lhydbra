import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface UserSettings {
  initial_capital: number;
  current_capital: number;
  risk_per_trade: number;
  max_daily_risk: number;
  max_weekly_risk: number;
  max_drawdown: number;
  max_positions: number;
  max_leverage: number;
  max_single_asset: number;
  max_correlation: number;
  stop_loss_required: boolean;
  min_rr_ratio: number;
}

const defaultSettings: UserSettings = {
  initial_capital: 10000,
  current_capital: 10000,
  risk_per_trade: 1.5,
  max_daily_risk: 5,
  max_weekly_risk: 10,
  max_drawdown: 15,
  max_positions: 10,
  max_leverage: 2.0,
  max_single_asset: 25,
  max_correlation: 80,
  stop_loss_required: true,
  min_rr_ratio: 1.5,
};

export function useUserSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);

  const loadSettings = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (data) {
      setSettings({
        initial_capital: Number(data.initial_capital),
        current_capital: Number(data.current_capital),
        risk_per_trade: Number(data.risk_per_trade),
        max_daily_risk: Number(data.max_daily_risk),
        max_weekly_risk: Number(data.max_weekly_risk),
        max_drawdown: Number(data.max_drawdown),
        max_positions: Number(data.max_positions),
        max_leverage: Number(data.max_leverage),
        max_single_asset: Number(data.max_single_asset),
        max_correlation: Number(data.max_correlation),
        stop_loss_required: Boolean(data.stop_loss_required),
        min_rr_ratio: Number(data.min_rr_ratio),
      });
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Realtime subscription for instant updates
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('user_settings_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_settings',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') return;
          const data = payload.new as any;
          setSettings({
            initial_capital: Number(data.initial_capital),
            current_capital: Number(data.current_capital),
            risk_per_trade: Number(data.risk_per_trade),
            max_daily_risk: Number(data.max_daily_risk),
            max_weekly_risk: Number(data.max_weekly_risk),
            max_drawdown: Number(data.max_drawdown),
            max_positions: Number(data.max_positions),
            max_leverage: Number(data.max_leverage),
            max_single_asset: Number(data.max_single_asset),
            max_correlation: Number(data.max_correlation),
            stop_loss_required: Boolean(data.stop_loss_required),
            min_rr_ratio: Number(data.min_rr_ratio),
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return { settings, loading, refetch: loadSettings, defaultSettings };
}
