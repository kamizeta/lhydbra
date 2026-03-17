import { useState, useEffect, useMemo } from "react";
import { PieChart, TrendingUp, Shield, Briefcase, Loader2, DollarSign, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserSettings } from "@/hooks/useUserSettings";
import { cn } from "@/lib/utils";
import { formatCurrency, formatNumber } from "@/lib/mockData";
import MetricCard from "@/components/shared/MetricCard";
import StatusBadge from "@/components/shared/StatusBadge";

interface Position {
  symbol: string;
  asset_type: string;
  direction: string;
  quantity: number;
  avg_entry: number;
  stop_loss: number | null;
  pnl: number | null;
  strategy_family: string | null;
}

interface OpScore {
  symbol: string;
  total_score: number;
  direction: string | null;
  strategy_family: string | null;
}

export default function PortfolioAllocation() {
  const { user } = useAuth();
  const { settings } = useUserSettings();
  const [positions, setPositions] = useState<Position[]>([]);
  const [scores, setScores] = useState<OpScore[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("positions").select("symbol, asset_type, direction, quantity, avg_entry, stop_loss, pnl, strategy_family")
        .eq("user_id", user.id).eq("status", "open"),
      supabase.from("opportunity_scores").select("symbol, total_score, direction, strategy_family")
        .eq("timeframe", "1d").order("total_score", { ascending: false }),
    ]).then(([posRes, scoreRes]) => {
      if (posRes.data) setPositions(posRes.data as Position[]);
      if (scoreRes.data) setScores(scoreRes.data as unknown as OpScore[]);
      setLoading(false);
    });
  }, [user]);

  const totalCapital = settings.current_capital;
  const investedCapital = positions.reduce((s, p) => s + p.quantity * p.avg_entry, 0);
  const freeCapital = totalCapital - investedCapital;
  const utilizationPct = totalCapital > 0 ? (investedCapital / totalCapital) * 100 : 0;

  // Allocation by asset type
  const allocationByType = useMemo(() => {
    const map: Record<string, { invested: number; count: number; pnl: number }> = {};
    positions.forEach(p => {
      const val = p.quantity * p.avg_entry;
      if (!map[p.asset_type]) map[p.asset_type] = { invested: 0, count: 0, pnl: 0 };
      map[p.asset_type].invested += val;
      map[p.asset_type].count += 1;
      map[p.asset_type].pnl += p.pnl || 0;
    });
    return map;
  }, [positions]);

  // Allocation by strategy
  const allocationByStrategy = useMemo(() => {
    const map: Record<string, { invested: number; count: number; pnl: number }> = {};
    positions.forEach(p => {
      const family = p.strategy_family || "unclassified";
      const val = p.quantity * p.avg_entry;
      if (!map[family]) map[family] = { invested: 0, count: 0, pnl: 0 };
      map[family].invested += val;
      map[family].count += 1;
      map[family].pnl += p.pnl || 0;
    });
    return map;
  }, [positions]);

  // Suggested allocations from top scores
  const suggestions = useMemo(() => {
    const existing = new Set(positions.map(p => p.symbol));
    return scores
      .filter(s => !existing.has(s.symbol) && s.total_score >= 55 && s.direction !== "neutral")
      .slice(0, 5)
      .map(s => {
        const riskBudget = totalCapital * (settings.risk_per_trade / 100);
        const maxAllocation = totalCapital * (settings.max_single_asset / 100);
        const suggestedAlloc = Math.min(riskBudget * 3, maxAllocation, freeCapital * 0.25);
        return { ...s, suggested_allocation: suggestedAlloc };
      });
  }, [scores, positions, totalCapital, freeCapital, settings]);

  // Risk budget
  const totalRiskDollars = positions.reduce((s, p) => {
    if (!p.stop_loss) return s;
    return s + Math.abs(p.avg_entry - p.stop_loss) * p.quantity;
  }, 0);
  const riskBudgetUsed = totalCapital > 0 ? (totalRiskDollars / totalCapital) * 100 : 0;
  const riskBudgetRemaining = settings.max_daily_risk - riskBudgetUsed;

  const typeColors: Record<string, string> = {
    crypto: "bg-chart-1", stock: "bg-chart-2", etf: "bg-chart-3",
    forex: "bg-chart-4", commodity: "bg-chart-5",
  };

  if (loading) return <div className="p-6 flex items-center justify-center min-h-[400px]"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="p-6 space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <PieChart className="h-6 w-6 text-primary" /> Portfolio Allocation
        </h1>
        <p className="text-sm text-muted-foreground font-mono">Capital distribution • Risk budget • Allocation suggestions</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard label="Total Capital" value={formatCurrency(totalCapital)} icon={DollarSign} />
        <MetricCard label="Invested" value={formatCurrency(investedCapital)} change={`${formatNumber(utilizationPct)}% utilized`} icon={Briefcase} />
        <MetricCard label="Free Capital" value={formatCurrency(freeCapital)} changeType={freeCapital > 0 ? "positive" : "negative"} icon={TrendingUp} />
        <MetricCard label="Risk Budget" value={`${formatNumber(riskBudgetUsed)}% used`}
          change={`${formatNumber(Math.max(0, riskBudgetRemaining))}% remaining`}
          changeType={riskBudgetRemaining > 0 ? "positive" : "negative"} icon={Shield} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* By Asset Type */}
        <div className="terminal-border rounded-lg p-4">
          <h2 className="text-sm font-bold text-foreground mb-4">Allocation by Asset Type</h2>
          {Object.keys(allocationByType).length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">No open positions</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(allocationByType).sort((a, b) => b[1].invested - a[1].invested).map(([type, data]) => {
                const pct = totalCapital > 0 ? (data.invested / totalCapital) * 100 : 0;
                const overLimit = pct > settings.max_single_asset;
                return (
                  <div key={type} className="space-y-1">
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-foreground font-bold capitalize">{type}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{data.count} pos</span>
                        <span className={cn("font-bold", overLimit ? "text-loss" : "text-foreground")}>{formatNumber(pct)}%</span>
                      </div>
                    </div>
                    <div className="h-2 bg-accent rounded-full overflow-hidden">
                      <div className={cn("h-full rounded-full", overLimit ? "bg-loss" : typeColors[type] || "bg-primary")}
                        style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                      <span>{formatCurrency(data.invested)}</span>
                      <span className={cn(data.pnl >= 0 ? "text-profit" : "text-loss")}>{data.pnl >= 0 ? '+' : ''}{formatCurrency(data.pnl)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* By Strategy */}
        <div className="terminal-border rounded-lg p-4">
          <h2 className="text-sm font-bold text-foreground mb-4">Allocation by Strategy</h2>
          {Object.keys(allocationByStrategy).length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">No open positions</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(allocationByStrategy).sort((a, b) => b[1].invested - a[1].invested).map(([family, data]) => {
                const pct = totalCapital > 0 ? (data.invested / totalCapital) * 100 : 0;
                return (
                  <div key={family} className="space-y-1">
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-foreground font-bold capitalize">{family.replace(/_/g, ' ')}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{data.count} pos</span>
                        <span className="font-bold">{formatNumber(pct)}%</span>
                      </div>
                    </div>
                    <div className="h-2 bg-accent rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                      <span>{formatCurrency(data.invested)}</span>
                      <span className={cn(data.pnl >= 0 ? "text-profit" : "text-loss")}>{data.pnl >= 0 ? '+' : ''}{formatCurrency(data.pnl)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Suggested Allocations */}
        <div className="terminal-border rounded-lg p-4">
          <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" /> Allocation Suggestions
          </h2>
          <p className="text-[10px] text-muted-foreground font-mono mb-3">Based on Opportunity Score, risk limits and free capital</p>
          {suggestions.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              {freeCapital <= 0 ? "No free capital available" : "No high-score opportunities available"}
            </p>
          ) : (
            <div className="space-y-2">
              {suggestions.map(s => (
                <div key={s.symbol} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-foreground font-mono">{s.symbol}</span>
                      <StatusBadge variant={s.direction === "long" ? "profit" : "loss"}>
                        {(s.direction || "").toUpperCase()}
                      </StatusBadge>
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono capitalize">{s.strategy_family || "—"}</div>
                  </div>
                  <div className="text-right">
                    <div className={cn("text-xs font-mono font-bold", s.total_score >= 65 ? "text-profit" : "text-primary")}>
                      Score: {s.total_score.toFixed(0)}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      Max: {formatCurrency(s.suggested_allocation)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Risk warnings */}
          {riskBudgetRemaining <= 0 && (
            <div className="mt-3 rounded-md bg-loss/10 border border-loss/20 p-2">
              <p className="text-[10px] text-loss flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Risk budget exhausted. Close positions before allocating more.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
