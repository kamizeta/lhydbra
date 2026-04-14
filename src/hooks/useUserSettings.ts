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
  // Operator mode fields
  max_trades_per_day: number;
  loss_cooldown_count: number;
  operator_mode: boolean;
  auto_execute: boolean;
  consecutive_losses: number;
  trades_today: number;
  last_trade_date: string | null;
  daily_risk_used: number;
  // Signal filter fields
  min_score: number;
  min_r: number;
  min_confidence: number;
  // Broker environment
  paper_trading: boolean;
}

const defaultSettings: UserSettings = {
  initial_capital: 10000,
  current_capital: 10000,
  risk_per_trade: 1,
  max_daily_risk: 2,
  max_weekly_risk: 10,
  max_drawdown: 15,
  max_positions: 10,
  max_leverage: 2.0,
  max_single_asset: 25,
  max_correlation: 80,
  stop_loss_required: true,
  min_rr_ratio: 1.8,
  // Operator mode defaults
  max_trades_per_day: 3,
  loss_cooldown_count: 2,
  operator_mode: false,
  auto_execute: false,
  consecutive_losses: 0,
  trades_today: 0,
  last_trade_date: null,
  daily_risk_used: 0,
  min_score: 60,
  min_r: 1.5,
  min_confidence: 55,
  paper_trading: true,
};

function parseSettings(data: Record<string, unknown>): UserSettings {
  return {
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
    max_trades_per_day: Number(data.max_trades_per_day ?? 3),
    loss_cooldown_count: Number(data.loss_cooldown_count ?? 2),
    operator_mode: Boolean(data.operator_mode),
    auto_execute: Boolean(data.auto_execute),
    consecutive_losses: Number(data.consecutive_losses ?? 0),
    trades_today: Number(data.trades_today ?? 0),
    last_trade_date: data.last_trade_date ? String(data.last_trade_date) : null,
    daily_risk_used: Number(data.daily_risk_used ?? 0),
    min_score: data.min_score != null && !isNaN(Number(data.min_score)) ? Number(data.min_score) : 60,
    min_r: data.min_r != null && !isNaN(Number(data.min_r)) ? Number(data.min_r) : 1.5,
    min_confidence: data.min_confidence != null && !isNaN(Number(data.min_confidence)) ? Number(data.min_confidence) : 55,
    paper_trading: data.paper_trading !== false, // default to paper
  };
}

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
      setSettings(parseSettings(data as unknown as Record<string, unknown>));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

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
          setSettings(parseSettings(payload.new as unknown as Record<string, unknown>));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return { settings, loading, refetch: loadSettings, defaultSettings };
}
