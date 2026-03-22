import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface OpportunityScore {
  id: string;
  asset: string;
  symbol: string; // alias for asset
  asset_class: string;
  asset_type: string; // alias for asset_class
  total_score: number;
  direction: string;
  strategy_family: string | null;
  confidence_score: number;
  expected_r_multiple: number;
  market_regime: string | null;
  status: string;
  created_at: string;
  // Compat fields for components expecting opportunity_scores shape
  structure_score: number;
  momentum_score: number;
  volatility_score: number;
  strategy_score: number;
  rr_score: number;
  macro_score: number;
  sentiment_score: number;
  historical_score: number;
  computed_at: string;
  expires_at: string | null;
  timeframe: string;
}

export function useOpportunityScores(_timeframe = '1d') {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['opportunity-scores', user?.id],
    queryFn: async (): Promise<Record<string, OpportunityScore>> => {
      if (!user) return {};
      const { data, error } = await supabase
        .from('signals')
        .select('id, asset, asset_class, direction, opportunity_score, confidence_score, expected_r_multiple, strategy_family, market_regime, status, created_at, score_breakdown')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('opportunity_score', { ascending: false })
        .limit(20);

      if (error) throw error;
      const map: Record<string, OpportunityScore> = {};
      for (const row of (data || [])) {
        const breakdown = (row.score_breakdown || {}) as Record<string, number>;
        map[row.asset] = {
          id: row.id,
          asset: row.asset,
          symbol: row.asset,
          asset_class: row.asset_class,
          asset_type: row.asset_class,
          total_score: Number(row.opportunity_score),
          direction: row.direction,
          strategy_family: row.strategy_family,
          confidence_score: Number(row.confidence_score),
          expected_r_multiple: Number(row.expected_r_multiple),
          market_regime: row.market_regime,
          status: row.status,
          created_at: row.created_at,
          structure_score: breakdown.structure || 0,
          momentum_score: breakdown.momentum || 0,
          volatility_score: breakdown.volatility || 0,
          strategy_score: breakdown.strategy || 0,
          rr_score: breakdown.rr || 0,
          macro_score: breakdown.macro || 0,
          sentiment_score: breakdown.sentiment || 0,
          historical_score: breakdown.historical || 0,
          computed_at: row.created_at,
          expires_at: null,
          timeframe: '1d',
        };
      }
      return map;
    },
    enabled: !!user,
    staleTime: 120_000,
  });
}

// Kept as no-op for backward compat — scoring now happens via signal-engine
export function useRunOpportunityScoring() {
  return {
    mutateAsync: async (_symbols?: string[]) => {
      return { scores: [], count: 0, weights: {} };
    },
    isPending: false,
  };
}
