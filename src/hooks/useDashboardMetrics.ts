import { useMemo } from "react";
import type { OperatorStatus } from "@/hooks/useOperatorMode";

interface Position {
  id: string;
  symbol: string;
  direction: string;
  quantity: number;
  avg_entry: number;
  stop_loss: number | null;
  take_profit: number | null;
  strategy: string | null;
  pnl: number | null;
  opened_at: string;
}

interface JournalStats {
  total: number;
  wins: number;
  avgR: number;
}

interface Settings {
  current_capital: number;
  initial_capital: number;
  max_daily_risk: number;
  max_trades_per_day: number;
}

interface UseDashboardMetricsParams {
  positions: Position[];
  closedPnl: number;
  journalStats: JournalStats;
  settings: Settings;
  priceMap: Map<string, number>;
  operatorStatus: OperatorStatus | null;
}

export function useDashboardMetrics({
  positions,
  closedPnl,
  journalStats,
  settings,
  priceMap,
  operatorStatus,
}: UseDashboardMetricsParams) {
  const unrealizedPnl = useMemo(() => {
    let total = 0;
    for (const pos of positions) {
      const currentPrice = priceMap.get(pos.symbol) || priceMap.get(pos.symbol.replace("/", ""));
      if (currentPrice) {
        const qty = Math.abs(pos.quantity);
        const diff = pos.direction === "long" ? currentPrice - pos.avg_entry : pos.avg_entry - currentPrice;
        total += diff * qty;
        continue;
      }
      if (pos.pnl != null) {
        total += pos.pnl;
      }
    }
    return total;
  }, [positions, priceMap]);

  // current_capital from Alpaca IS equity (cash + unrealized PnL) — don't add unrealizedPnl again
  const portfolioValue = useMemo(
    () => settings.current_capital,
    [settings.current_capital],
  );

  const totalExposure = useMemo(
    () => positions.reduce((sum, p) => sum + Math.abs(p.quantity) * p.avg_entry, 0),
    [positions],
  );

  const exposurePct = useMemo(
    () => (portfolioValue > 0 ? (totalExposure / portfolioValue) * 100 : 0),
    [totalExposure, portfolioValue],
  );

  const winRate = useMemo(
    () => (journalStats.total > 0 ? (journalStats.wins / journalStats.total) * 100 : 0),
    [journalStats.total, journalStats.wins],
  );

  const drawdownPct = useMemo(
    () =>
      settings.initial_capital > 0
        ? Math.max(0, ((settings.initial_capital - portfolioValue) / settings.initial_capital) * 100)
        : 0,
    [settings.initial_capital, portfolioValue],
  );

  const openRiskPct = useMemo(() => {
    const capitalBase =
      Number(settings.current_capital) > 0
        ? Number(settings.current_capital)
        : portfolioValue > 0
          ? portfolioValue
          : 0;

    if (!positions.length || capitalBase <= 0) return 0;

    const totalRisk = positions.reduce((sum, pos) => {
      const entry = Number(pos.avg_entry);
      const stopLoss = pos.stop_loss == null ? null : Number(pos.stop_loss);
      const quantity = Math.abs(Number(pos.quantity));

      if (!Number.isFinite(entry) || !Number.isFinite(quantity) || !stopLoss || !Number.isFinite(stopLoss)) {
        return sum;
      }

      return sum + Math.abs(entry - stopLoss) * quantity;
    }, 0);

    return totalRisk > 0 ? (totalRisk / capitalBase) * 100 : 0;
  }, [positions, settings.current_capital, portfolioValue]);

  const operatorRiskUsed = Number(operatorStatus?.daily_risk_used ?? 0);
  const displayRiskUsed = useMemo(
    () =>
      Math.max(
        Number.isFinite(operatorRiskUsed) ? operatorRiskUsed : 0,
        Number.isFinite(openRiskPct) ? openRiskPct : 0,
      ),
    [operatorRiskUsed, openRiskPct],
  );

  const displayMaxRisk = operatorStatus?.max_daily_risk ?? settings.max_daily_risk ?? 3;

  const cooldownActive = operatorStatus?.cooldown_active || false;
  const maxTradesPerDay = operatorStatus?.max_trades_per_day ?? settings.max_trades_per_day ?? 3;
  const tradesToday = operatorStatus?.trades_today ?? 0;
  const dailyCapReached = tradesToday >= maxTradesPerDay;

  const phase = useMemo(() => {
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    if (isWeekend) return "post_market" as const;
    if (hour < 9) return "pre_market" as const;
    if (hour < 16) return "market_open" as const;
    return "post_market" as const;
  }, []);

  const tradingDaysPassed = useMemo(() => Math.floor(new Date().getDate() * 22 / 30), []);

  return {
    unrealizedPnl,
    portfolioValue,
    totalExposure,
    exposurePct,
    winRate,
    drawdownPct,
    openRiskPct,
    displayRiskUsed,
    displayMaxRisk,
    cooldownActive,
    maxTradesPerDay,
    tradesToday,
    dailyCapReached,
    phase,
    tradingDaysPassed,
  };
}
