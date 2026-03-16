import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface OpportunityScore {
  symbol: string;
  timeframe: string;
  asset_type: string;
  total_score: number;
  structure_score: number;
  momentum_score: number;
  volatility_score: number;
  strategy_score: number;
  rr_score: number;
  macro_score: number;
  sentiment_score: number;
  historical_score: number;
  direction: string;
  strategy_family: string;
  computed_at: string;
  expires_at: string | null;
}

export function useOpportunityScores(timeframe = '1d') {
  return useQuery({
    queryKey: ['opportunity-scores', timeframe],
    queryFn: async (): Promise<Record<string, OpportunityScore>> => {
      const { data, error } = await supabase
        .from('opportunity_scores')
        .select('*')
        .eq('timeframe', timeframe)
        .order('total_score', { ascending: false });

      if (error) throw error;
      const map: Record<string, OpportunityScore> = {};
      for (const row of (data || [])) {
        map[row.symbol] = row as unknown as OpportunityScore;
      }
      return map;
    },
    staleTime: 120_000,
  });
}

export function useRunOpportunityScoring() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (symbols?: string[]) => {
      const { data, error } = await supabase.functions.invoke('opportunity-score', {
        body: { symbols: symbols || [], user_id: user?.id },
      });
      if (error) throw new Error(error.message);
      return data as { scores: OpportunityScore[]; count: number; weights: Record<string, number> };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opportunity-scores'] });
    },
  });
}
