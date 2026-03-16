import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { MarketFeatures } from '@/lib/marketDataLayer';

export function useMarketFeaturesDB(timeframe = '1d') {
  return useQuery({
    queryKey: ['market-features-db', timeframe],
    queryFn: async (): Promise<Record<string, MarketFeatures>> => {
      const { data, error } = await supabase
        .from('market_features')
        .select('*')
        .eq('timeframe', timeframe);

      if (error) throw error;
      const map: Record<string, MarketFeatures> = {};
      for (const row of (data || [])) {
        map[row.symbol] = row as unknown as MarketFeatures;
      }
      return map;
    },
    staleTime: 120_000,
  });
}

export function useRunDataIntelligence() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (symbols: string[]) => {
      const { data, error } = await supabase.functions.invoke('data-intelligence', {
        body: { symbols, timeframe: '1d' },
      });
      if (error) throw new Error(error.message);
      return data as { features: Record<string, unknown>; processed: number; total: number; errors?: string[] };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['market-features-db'] });
    },
  });
}
