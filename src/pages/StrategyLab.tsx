import { useState, useEffect, useMemo } from "react";
import { FlaskConical, TrendingUp, Award, BarChart3, Target, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { formatCurrency, formatNumber } from "@/lib/utils";
import MetricCard from "@/components/shared/MetricCard";
import StatusBadge from "@/components/shared/StatusBadge";

interface StratPerf {
  strategy_family: string;
  market_regime: string;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  total_pnl: number | null;
  win_rate: number | null;
  avg_r_multiple: number | null;
  sharpe_ratio: number | null;
  max_drawdown: number | null;
}

interface JournalEntry {
  symbol: string;
  direction: string;
  pnl: number | null;
  r_multiple: number | null;
  strategy_family: string | null;
  market_regime: string | null;
  opportunity_score: number | null;
  exited_at: string | null;
}

export default function StrategyLab() {
  const { user } = useAuth();
  const [perf, setPerf] = useState<StratPerf[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStrategy, setSelectedStrategy] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("strategy_performance").select("*").eq("user_id", user.id),
      supabase.from("trade_journal").select("symbol, direction, pnl, r_multiple, strategy_family, market_regime, opportunity_score, exited_at")
        .eq("user_id", user.id).order("exited_at", { ascending: false }),
    ]).then(([perfRes, journalRes]) => {
      if (perfRes.data) setPerf(perfRes.data as StratPerf[]);
      if (journalRes.data) setJournal(journalRes.data as JournalEntry[]);
      setLoading(false);
    });
  }, [user]);

  const strategies = useMemo(() => {
    const map = new Map<string, { trades: number; wins: number; pnl: number; avgR: number; regimes: Map<string, { trades: number; wins: number; pnl: number }> }>();
    perf.forEach(p => {
      const existing = map.get(p.strategy_family) || { trades: 0, wins: 0, pnl: 0, avgR: 0, regimes: new Map() };
      existing.trades += p.total_trades;
      existing.wins += p.winning_trades;
      existing.pnl += p.total_pnl || 0;
      existing.regimes.set(p.market_regime, {
        trades: p.total_trades,
        wins: p.winning_trades,
        pnl: p.total_pnl || 0,
      });
      map.set(p.strategy_family, existing);
    });
    // Compute avg R from journal
    map.forEach((val, key) => {
      const stratJournal = journal.filter(j => j.strategy_family === key && j.r_multiple != null);
      val.avgR = stratJournal.length > 0 ? stratJournal.reduce((s, j) => s + (j.r_multiple || 0), 0) / stratJournal.length : 0;
    });
    return map;
  }, [perf, journal]);

  const totalTrades = [...strategies.values()].reduce((s, v) => s + v.trades, 0);
  const totalPnl = [...strategies.values()].reduce((s, v) => s + v.pnl, 0);
  const bestStrategy = [...strategies.entries()].sort((a, b) => b[1].pnl - a[1].pnl)[0];
  const overallWinRate = totalTrades > 0 ? ([...strategies.values()].reduce((s, v) => s + v.wins, 0) / totalTrades) * 100 : 0;

  // Score calibration: group journal by opportunity_score ranges
  const calibration = useMemo(() => {
    const ranges = [
      { label: "80+", min: 80, max: 100 },
      { label: "65-79", min: 65, max: 79 },
      { label: "45-64", min: 45, max: 64 },
      { label: "<45", min: 0, max: 44 },
    ];
    return ranges.map(r => {
      const trades = journal.filter(j => j.opportunity_score != null && j.opportunity_score >= r.min && j.opportunity_score <= r.max);
      const wins = trades.filter(j => (j.pnl || 0) > 0);
      return {
        ...r,
        count: trades.length,
        winRate: trades.length > 0 ? (wins.length / trades.length) * 100 : 0,
        avgPnl: trades.length > 0 ? trades.reduce((s, j) => s + (j.pnl || 0), 0) / trades.length : 0,
      };
    });
  }, [journal]);

  const selectedData = selectedStrategy ? strategies.get(selectedStrategy) : null;
  const selectedJournal = selectedStrategy ? journal.filter(j => j.strategy_family === selectedStrategy) : [];

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <FlaskConical className="h-6 w-6 text-primary" /> Strategy Lab
        </h1>
        <p className="text-sm text-muted-foreground font-mono">Performance analysis by strategy family • Score calibration</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard label="Total Trades" value={`${totalTrades}`} icon={BarChart3} />
        <MetricCard label="Overall Win Rate" value={`${formatNumber(overallWinRate)}%`} changeType={overallWinRate >= 50 ? "positive" : "negative"} icon={Award} />
        <MetricCard label="Total PnL" value={`${totalPnl >= 0 ? '+' : ''}${formatCurrency(totalPnl)}`} changeType={totalPnl >= 0 ? "positive" : "negative"} icon={TrendingUp} />
        <MetricCard label="Best Strategy" value={bestStrategy ? bestStrategy[0] : "—"} change={bestStrategy ? `+${formatCurrency(bestStrategy[1].pnl)}` : ""} icon={Target} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Strategy Cards */}
        <div className="lg:col-span-2 space-y-3">
          <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">Strategy Performance Matrix</h2>
          {strategies.size === 0 ? (
            <div className="terminal-border rounded-lg p-8 text-center text-muted-foreground text-sm">
              No strategy performance data yet. Close positions to populate.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[...strategies.entries()].sort((a, b) => b[1].pnl - a[1].pnl).map(([name, data]) => {
                const wr = data.trades > 0 ? (data.wins / data.trades) * 100 : 0;
                const isSelected = selectedStrategy === name;
                return (
                  <div key={name}
                    onClick={() => setSelectedStrategy(isSelected ? null : name)}
                    className={cn(
                      "terminal-border rounded-lg p-4 cursor-pointer transition-all",
                      isSelected ? "border-primary/50 bg-primary/5" : "hover:bg-accent/30"
                    )}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-bold text-foreground">{name}</h3>
                      <span className={cn("text-lg font-mono font-bold", data.pnl >= 0 ? "text-profit" : "text-loss")}>
                        {data.pnl >= 0 ? '+' : ''}{formatCurrency(data.pnl)}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                      <div>
                        <div className="text-muted-foreground">Trades</div>
                        <div className="text-foreground font-bold">{data.trades}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Win Rate</div>
                        <div className={cn("font-bold", wr >= 50 ? "text-profit" : "text-loss")}>{wr.toFixed(0)}%</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Avg R</div>
                        <div className={cn("font-bold", data.avgR >= 0 ? "text-profit" : "text-loss")}>
                          {data.avgR !== 0 ? `${data.avgR >= 0 ? '+' : ''}${data.avgR.toFixed(2)}R` : '—'}
                        </div>
                      </div>
                    </div>

                    {/* Regime breakdown */}
                    {data.regimes.size > 0 && (
                      <div className="mt-3 pt-2 border-t border-border/50 space-y-1">
                        {[...data.regimes.entries()].map(([regime, rd]) => (
                          <div key={regime} className="flex items-center justify-between text-[10px] font-mono">
                            <span className="text-muted-foreground capitalize">{regime}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">{rd.trades}t</span>
                              <span className={cn(rd.pnl >= 0 ? "text-profit" : "text-loss")}>
                                {rd.pnl >= 0 ? '+' : ''}{formatCurrency(rd.pnl)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Side Panel: Score Calibration + Selected Strategy Detail */}
        <div className="space-y-4">
          {/* Score Calibration */}
          <div className="terminal-border rounded-lg p-4">
            <h2 className="text-sm font-bold text-foreground mb-3">Score Calibration</h2>
            <p className="text-[10px] text-muted-foreground font-mono mb-3">Do higher opportunity scores predict better outcomes?</p>
            <div className="space-y-3">
              {calibration.map(c => (
                <div key={c.label} className="space-y-1">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-foreground font-bold">Score {c.label}</span>
                    <span className="text-muted-foreground">{c.count} trades</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-mono">
                    <div className="flex-1">
                      <div className="h-2 bg-accent rounded-full overflow-hidden">
                        <div className={cn("h-full rounded-full", c.winRate >= 60 ? "bg-profit" : c.winRate >= 40 ? "bg-primary" : "bg-loss")}
                          style={{ width: `${Math.min(100, c.winRate)}%` }} />
                      </div>
                    </div>
                    <span className={cn("w-12 text-right font-bold", c.winRate >= 50 ? "text-profit" : "text-loss")}>
                      {c.count > 0 ? `${c.winRate.toFixed(0)}%` : "—"}
                    </span>
                    <span className={cn("w-16 text-right", c.avgPnl >= 0 ? "text-profit" : "text-loss")}>
                      {c.count > 0 ? `${c.avgPnl >= 0 ? '+' : ''}${formatCurrency(c.avgPnl)}` : "—"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            {journal.length === 0 && (
              <p className="text-[10px] text-muted-foreground font-mono mt-3 text-center">Close more trades to see calibration data</p>
            )}
          </div>

          {/* Selected Strategy Trades */}
          {selectedData && (
            <div className="terminal-border rounded-lg p-4">
              <h2 className="text-sm font-bold text-foreground mb-3">
                {selectedStrategy} — Recent Trades
              </h2>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {selectedJournal.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">No journal entries for this strategy</p>
                ) : selectedJournal.slice(0, 10).map((j, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0 text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <span className="text-foreground font-bold">{j.symbol}</span>
                      <StatusBadge variant={j.direction === "long" ? "profit" : "loss"}>
                        {j.direction.toUpperCase()}
                      </StatusBadge>
                    </div>
                    <div className="flex items-center gap-3">
                      {j.r_multiple != null && (
                        <span className={cn("font-bold", j.r_multiple >= 0 ? "text-profit" : "text-loss")}>
                          {j.r_multiple >= 0 ? '+' : ''}{j.r_multiple.toFixed(2)}R
                        </span>
                      )}
                      <span className={cn("font-bold", (j.pnl || 0) >= 0 ? "text-profit" : "text-loss")}>
                        {(j.pnl || 0) >= 0 ? '+' : ''}{formatCurrency(j.pnl || 0)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
