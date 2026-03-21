import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface CoachingResult {
  phase: string;
  date: string;
  performance?: {
    pnl: number;
    trades: number;
    wins: number;
    losses: number;
    avg_r: number;
    win_rate: number;
  };
  briefing?: {
    capital: number;
    open_positions: number;
    open_pnl: number;
    risk_available: string;
    trades_remaining: number;
    cooldown_active: boolean;
    consecutive_losses: number;
  };
  goal: {
    monthly_target: number;
    daily_target: number;
    month_progress: number;
    week_progress?: number;
    progress_pct: number;
    pace: string;
    remaining_target?: number;
    remaining_days?: number;
    required_daily_from_now?: number;
  };
  grade?: string;
  mistakes?: string[];
  suggestions?: string[];
  message: string;
}

export function usePerformanceCoach() {
  const { user } = useAuth();
  const [result, setResult] = useState<CoachingResult | null>(null);
  const [loading, setLoading] = useState(false);

  const getPreMarket = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('performance-coach', {
        body: { action: 'pre_market' },
      });
      if (error) throw error;
      setResult(data as CoachingResult);
    } catch (err) {
      console.error('Pre-market briefing error:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const getDailyReview = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('performance-coach', {
        body: { action: 'daily_review' },
      });
      if (error) throw error;
      setResult(data as CoachingResult);
    } catch (err) {
      console.error('Daily review error:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  return { result, loading, getPreMarket, getDailyReview };
}
