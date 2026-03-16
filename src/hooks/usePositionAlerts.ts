import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useMarketData } from '@/hooks/useMarketData';
import { useUserSettings } from '@/hooks/useUserSettings';
import { toast } from 'sonner';

/**
 * Monitors open positions for SL/TP hits and risk threshold breaches.
 * Creates notifications in the DB (which triggers realtime + sound via useNotifications).
 */
export function usePositionAlerts() {
  const { user } = useAuth();
  const { data: marketAssets } = useMarketData();
  const { settings } = useUserSettings();
  const alertedRef = useRef<Set<string>>(new Set());
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
      let totalCapital = 0;

      for (const pos of positions) {
        const price = priceMap.get(pos.symbol) || priceMap.get(pos.symbol.replace('/', ''));
        if (!price) continue;

        const diff = pos.direction === 'long' ? price - pos.avg_entry : pos.avg_entry - price;
        const pnl = diff * pos.quantity;
        totalPnl += pnl;
        totalCapital += pos.quantity * pos.avg_entry;

        // SL/TP check
        const slKey = `sl_${pos.id}`;
        const tpKey = `tp_${pos.id}`;

        if (pos.stop_loss != null && !alertedRef.current.has(slKey)) {
          const hitSl = pos.direction === 'long' ? price <= Number(pos.stop_loss) : price >= Number(pos.stop_loss);
          if (hitSl) {
            alertedRef.current.add(slKey);
            await supabase.from('notifications').insert({
              user_id: user.id,
              type: 'critical',
              title: `⛔ Stop Loss alcanzado: ${pos.symbol}`,
              message: `${pos.symbol} tocó el Stop Loss en $${Number(pos.stop_loss).toFixed(2)}. Precio actual: $${price.toFixed(2)}. PnL: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`,
              category: 'sl_tp',
              severity: 'critical',
              metadata: { position_id: pos.id, symbol: pos.symbol, price, sl: pos.stop_loss },
            });
          }
        }

        if (pos.take_profit != null && !alertedRef.current.has(tpKey)) {
          const hitTp = pos.direction === 'long' ? price >= Number(pos.take_profit) : price <= Number(pos.take_profit);
          if (hitTp) {
            alertedRef.current.add(tpKey);
            await supabase.from('notifications').insert({
              user_id: user.id,
              type: 'critical',
              title: `🎯 Take Profit alcanzado: ${pos.symbol}`,
              message: `${pos.symbol} alcanzó el Take Profit en $${Number(pos.take_profit).toFixed(2)}. Precio actual: $${price.toFixed(2)}. PnL: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`,
              category: 'sl_tp',
              severity: 'critical',
              metadata: { position_id: pos.id, symbol: pos.symbol, price, tp: pos.take_profit },
            });
          }
        }
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
