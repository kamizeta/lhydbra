import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface Signal {
  id: string;
  user_id: string;
  asset: string;
  asset_class: string;
  strategy_id: string | null;
  strategy_family: string;
  market_regime: string;
  direction: string;
  entry_price: number;
  stop_loss: number;
  targets: number[];
  expected_r_multiple: number;
  opportunity_score: number;
  confidence_score: number;
  score_breakdown: Record<string, number>;
  modifiers_applied: { strategy: number; regime: number; historical: number };
  weight_profile_used: Record<string, number>;
  reasoning: string | null;
  explanation: {
    top_contributors: { factor: string; score: number }[];
    modifiers: Record<string, { value: number; reason: string }>;
    summary: string;
  } | null;
  status: string;
  invalidation_reason: string | null;
  created_at: string;
  updated_at: string;
}

export function useSignals(status?: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['signals', user?.id, status],
    queryFn: async (): Promise<Signal[]> => {
      if (!user) return [];
      let query = supabase
        .from('signals')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(200);

      if (status && status !== 'all') {
        query = query.eq('status', status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as Signal[];
    },
    enabled: !!user,
    staleTime: 30_000,
  });
}

export function useGenerateSignals() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (params?: { symbols?: string[]; min_score?: number; min_r?: number }) => {
      const { data, error } = await supabase.functions.invoke('signal-engine', {
        body: {
          symbols: params?.symbols || [],
          user_id: user?.id,
          min_score: params?.min_score ?? 60,
          min_r: params?.min_r ?? 1.5,
        },
      });
      if (error) throw new Error(error.message);
      return data as { signals: Signal[]; count: number; rejected: number; rejections: { asset: string; reason: string }[] };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['signals'] });
    },
  });
}

export function useInvalidateSignal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ signalId, reason }: { signalId: string; reason: string }) => {
      const { error } = await supabase
        .from('signals')
        .update({ status: 'invalidated', invalidation_reason: reason, updated_at: new Date().toISOString() } as Record<string, unknown>)
        .eq('id', signalId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['signals'] });
    },
  });
}
