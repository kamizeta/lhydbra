import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useMarketData } from '@/hooks/useMarketData';
import { useUserSettings } from '@/hooks/useUserSettings';

/**
 * Monitors open positions for risk threshold breaches.
 * SL/TP execution must be confirmed by broker sync/order state, not inferred from quote touches.
 */
export function usePositionAlerts() {
  const { user } = useAuth();
  const { data: marketAssets } = useMarketData();
  const { settings } = useUserSettings();
  const riskAlertedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user || !marketAssets) return;

    const checkAlerts = async () => {
      const { data: positions } = await supabase
        .from('positions')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'open');

      if (!positions || positions.length === 0) return;

      const priceMap = new Map<string, number>();
      for (const a of marketAssets) {
        priceMap.set(a.symbol, a.price);
        priceMap.set(a.symbol.replace('/', ''), a.price);
      }

      let totalPnl = 0;

      for (const pos of positions) {
        const price = priceMap.get(pos.symbol) || priceMap.get(pos.symbol.replace('/', ''));
        if (!price) continue;

        const diff = pos.direction === 'long' ? price - pos.avg_entry : pos.avg_entry - price;
        const pnl = diff * Math.abs(pos.quantity);
        totalPnl += pnl;
      }

      // Risk threshold checks
      if (settings.current_capital > 0) {
        const drawdownPercent = (totalPnl / settings.current_capital) * -100;
        
        // Max drawdown alert
        if (drawdownPercent >= settings.max_drawdown && !riskAlertedRef.current.has('max_drawdown')) {
          riskAlertedRef.current.add('max_drawdown');
          await supabase.from('notifications').insert({
            user_id: user.id,
            type: 'critical',
            title: '🚨 Drawdown máximo excedido',
            message: `Tu drawdown actual (${drawdownPercent.toFixed(1)}%) ha superado el límite de ${settings.max_drawdown}%. Considera reducir exposición.`,
            category: 'risk',
            severity: 'critical',
            metadata: { drawdown: drawdownPercent, limit: settings.max_drawdown },
          });
        }

        // Max positions alert
        if (positions.length >= settings.max_positions && !riskAlertedRef.current.has('max_positions')) {
          riskAlertedRef.current.add('max_positions');
          await supabase.from('notifications').insert({
            user_id: user.id,
            type: 'warning',
            title: '⚠️ Máximo de posiciones alcanzado',
            message: `Tienes ${positions.length} posiciones abiertas (límite: ${settings.max_positions}). No abras nuevas posiciones.`,
            category: 'risk',
            severity: 'warning',
            metadata: { count: positions.length, limit: settings.max_positions },
          });
        }
      }
    };

    checkAlerts();
    const interval = setInterval(checkAlerts, 30000); // every 30s
    return () => clearInterval(interval);
  }, [user, marketAssets, settings]);
}
