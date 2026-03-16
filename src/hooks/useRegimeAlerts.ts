import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

interface RegimeChange {
  id: string;
  symbol: string;
  asset_type: string;
  previous_regime: string;
  new_regime: string;
  regime_confidence: number;
  detected_at: string;
  seen_by_user: boolean;
}

const REGIME_LABELS: Record<string, string> = {
  trending_bullish: '📈 Tendencia Alcista',
  trending_bearish: '📉 Tendencia Bajista',
  bull_market: '🐂 Bull Market',
  bear_market: '🐻 Bear Market',
  pre_breakout: '🔥 Pre-Breakout',
  volatile: '⚡ Volátil',
  ranging: '↔️ Lateral',
  overbought: '🔴 Sobrecomprado',
  oversold: '🟢 Sobrevendido',
  euphoria: '🎆 Euforia',
  capitulation: '💥 Capitulación',
  compression: '🔧 Compresión',
  undefined: '❓ Sin definir',
};

function regimeLabel(regime: string) {
  return REGIME_LABELS[regime] || regime;
}

export function useRegimeAlerts() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const shownIds = useRef(new Set<string>());

  const { data: changes } = useQuery({
    queryKey: ['regime-changes-unseen'],
    queryFn: async (): Promise<RegimeChange[]> => {
      const { data, error } = await supabase
        .from('regime_changes')
        .select('*')
        .eq('seen_by_user', false)
        .order('detected_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as unknown as RegimeChange[];
    },
    enabled: !!user,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  useEffect(() => {
    if (!changes || changes.length === 0) return;

    const newChanges = changes.filter(c => !shownIds.current.has(c.id));
    if (newChanges.length === 0) return;

    // Show up to 5 most recent
    const toShow = newChanges.slice(0, 5);
    
    for (const c of toShow) {
      shownIds.current.add(c.id);
      toast({
        title: `${c.symbol} cambió de régimen`,
        description: `${regimeLabel(c.previous_regime)} → ${regimeLabel(c.new_regime)}`,
        duration: 8000,
      });
    }

    if (newChanges.length > 5) {
      toast({
        title: `+${newChanges.length - 5} cambios de régimen más`,
        description: 'Revisa el Mercado para ver todos los detalles.',
        duration: 6000,
      });
    }

    // Mark as seen
    const ids = newChanges.map(c => c.id);
    supabase
      .from('regime_changes')
      .update({ seen_by_user: true })
      .in('id', ids)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['regime-changes-unseen'] });
      });
  }, [changes, queryClient]);
}
