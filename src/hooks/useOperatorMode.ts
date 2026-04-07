import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface OperatorStatus {
  status: string;
  capital: number;
  positions_open: number;
  positions: Array<{
    symbol: string;
    direction: string;
    quantity: number;
    avg_entry: number;
    stop_loss: number | null;
    pnl: number | null;
    strategy: string | null;
  }>;
  trades_today: number;
  max_trades_per_day: number;
  consecutive_losses: number;
  cooldown_active: boolean;
  daily_risk_used: number;
  max_daily_risk: number;
  today_pnl: number;
  today_wins: number;
  auto_execute: boolean;
  preflight_warnings: string[];
}

interface OperatorTrade {
  symbol: string;
  direction: string;
  score: string;
  confidence: string;
  expected_r: string;
  quantity: number;
  entry: number;
  stop_loss: number;
  take_profit: number;
  risk_pct: string;
  strategy: string;
  regime: string;
}

interface OperatorRunResult {
  status: string;
  signals_generated?: number;
  signals_rejected?: number;
  trades?: OperatorTrade[];
  execution?: Array<{ symbol: string; success: boolean; error?: string }>;
  daily_summary?: {
    trades_today: number;
    max_trades: number;
    daily_risk_used: number;
    max_daily_risk: number;
    consecutive_losses: number;
  };
  reasons?: string[];
  message?: string;
}

export function useOperatorMode() {
  const { user } = useAuth();
  const [status, setStatus] = useState<OperatorStatus | null>(null);
  const [runResult, setRunResult] = useState<OperatorRunResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    const attempt = async (): Promise<OperatorStatus | null> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) return null;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/operator-mode`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ action: 'status' }),
        }
      );
      if (!response.ok) return null;
      return response.json();
    };

    try {
      let result = await attempt();
      if (!result) {
        // Retry after 1s to let token refresh
        await new Promise(r => setTimeout(r, 1000));
        result = await attempt();
      }
      if (result) setStatus(result);
    } catch {
      // Silent fail — dashboard uses local fallbacks
    } finally {
      setLoading(false);
    }
  }, [user]);

  const runOperator = useCallback(async (paper = true) => {
    if (!user) return;
    setLoading(true);
    setError(null);
    setRunResult(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('operator-mode', {
        body: { action: 'run', paper },
      });

      if (fnError) throw fnError;
      setRunResult(data as OperatorRunResult);
      // Refresh status after run
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operator run failed');
    } finally {
      setLoading(false);
    }
  }, [user, fetchStatus]);

  return { status, runResult, loading, error, fetchStatus, runOperator };
}
