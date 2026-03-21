import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface GoalProfile {
  monthly_target: number;
  capital_available: number;
  risk_tolerance: string;
  daily_target: number;
  required_r_per_day: number;
  required_trades_per_day: number;
  automation_level: 'guided' | 'assisted' | 'full_operator';
  is_active: boolean;
}

const defaults: GoalProfile = {
  monthly_target: 3000,
  capital_available: 10000,
  risk_tolerance: 'moderate',
  daily_target: 150,
  required_r_per_day: 1.5,
  required_trades_per_day: 2,
  automation_level: 'guided',
  is_active: true,
};

export function useGoalProfile() {
  const { user } = useAuth();
  const [goal, setGoal] = useState<GoalProfile>(defaults);
  const [loading, setLoading] = useState(true);
  const [exists, setExists] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('goal_profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    if (data) {
      setGoal({
        monthly_target: Number(data.monthly_target),
        capital_available: Number(data.capital_available),
        risk_tolerance: String(data.risk_tolerance),
        daily_target: Number(data.daily_target),
        required_r_per_day: Number(data.required_r_per_day),
        required_trades_per_day: Number(data.required_trades_per_day),
        automation_level: data.automation_level as GoalProfile['automation_level'],
        is_active: Boolean(data.is_active),
      });
      setExists(true);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Realtime
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('goal_profile_changes')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'goal_profiles',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        if (payload.eventType === 'DELETE') return;
        const d = payload.new as Record<string, unknown>;
        setGoal({
          monthly_target: Number(d.monthly_target),
          capital_available: Number(d.capital_available),
          risk_tolerance: String(d.risk_tolerance),
          daily_target: Number(d.daily_target),
          required_r_per_day: Number(d.required_r_per_day),
          required_trades_per_day: Number(d.required_trades_per_day),
          automation_level: d.automation_level as GoalProfile['automation_level'],
          is_active: Boolean(d.is_active),
        });
        setExists(true);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const save = useCallback(async (updates: Partial<GoalProfile>) => {
    if (!user) return;
    const merged = { ...goal, ...updates };
    // Recalculate derived values
    const tradingDays = 22;
    merged.daily_target = merged.monthly_target / tradingDays;
    const riskPct = merged.risk_tolerance === 'conservative' ? 0.5 : merged.risk_tolerance === 'aggressive' ? 1.5 : 1;
    const riskPerTrade = merged.capital_available * (riskPct / 100);
    merged.required_r_per_day = riskPerTrade > 0 ? merged.daily_target / riskPerTrade : 1.5;
    merged.required_trades_per_day = Math.min(Math.ceil(merged.required_r_per_day / 1.8), 3);

    await supabase.from('goal_profiles').upsert({
      user_id: user.id,
      ...merged,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

    setGoal(merged);
    setExists(true);
  }, [user, goal]);

  return { goal, loading, exists, save, refetch: load };
}
