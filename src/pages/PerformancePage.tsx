import { useState, useEffect, useMemo } from "react";
import {
  BarChart3, TrendingUp, TrendingDown, Award, Target, Loader2,
  AlertTriangle, CheckCircle2, XCircle, Activity,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, Cell, LineChart, Line, Legend, ReferenceLine,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { formatCurrency, formatNumber } from "@/lib/utils";
import MetricCard from "@/components/shared/MetricCard";
import StatusBadge from "@/components/shared/StatusBadge";
import { useI18n } from "@/i18n";

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
  entry_price: number;
  exit_price: number | null;
  exit_reasoning: string | null;
}

const SCORE_RANGES = [
  { label: "80-100", min: 80, max: 100, color: "hsl(var(--profit))" },
  { label: "65-79", min: 65, max: 79, color: "hsl(var(--primary))" },
  { label: "50-64", min: 50, max: 64, color: "hsl(142 71% 45%)" },
  { label: "35-49", min: 35, max: 49, color: "hsl(var(--terminal-gold))" },
  { label: "0-34", min: 0, max: 34, color: "hsl(var(--loss))" },
];

type Tab = "strategy" | "score" | "log";

export default function PerformancePage() {
  const { user } = useAuth();
  const [perf, setPerf] = useState<StratPerf[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("strategy");
  const [selectedStrategy, setSelectedStrategy] = useState<string | null>(null);
  const [filterStrategy, setFilterStrategy] = useState<string>("all");
  const [filterOutcome, setFilterOutcome] = useState<string>("all");

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("strategy_performance").select("*").eq("user_id", user.id),
      supabase.from("trade_journal")
        .select("symbol, direction, pnl, r_multiple, strategy_family, market_regime, opportunity_score, exited_at, entry_price, exit_price, exit_reasoning")
        .eq("user_id", user.id).order("exited_at", { ascending: false }).limit(200),
    ]).then(([perfRes, journalRes]) => {
      if (perfRes.data) setPerf(perfRes.data as StratPerf[]);
      if (journalRes.data) setJournal(journalRes.data as JournalEntry[]);
      setLoading(false);
    });
  }, [user]);

  // ─── Strategy tab data ───
  const strategies = useMemo(() => {
    const map = new Map<string, { trades: number; wins: number; pnl: number; avgR: number; regimes: Map<string, { trades: number; wins: number; pnl: number }> }>();
    perf.forEach(p => {
      const existing = map.get(p.strategy_family) || { trades: 0, wins: 0, pnl: 0, avgR: 0, regimes: new Map() };
      existing.trades += p.total_trades;
      existing.wins += p.winning_trades;
      existing.pnl += p.total_pnl || 0;
      existing.regimes.set(p.market_regime, { trades: p.total_trades, wins: p.winning_trades, pnl: p.total_pnl || 0 });
      map.set(p.strategy_family, existing);
    });
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

  // ─── Score tab data ───
  const scored = useMemo(() => journal.filter(t => t.opportunity_score != null), [journal]);

  const calibrationScore = useMemo(() => {
    return SCORE_RANGES.map(r => {
      const group = scored.filter(t => t.opportunity_score! >= r.min && t.opportunity_score! <= r.max);
      const wins = group.filter(t => (t.pnl || 0) > 0);
      const totalPnl = group.reduce((s, t) => s + (t.pnl || 0), 0);
      const avgPnl = group.length > 0 ? totalPnl / group.length : 0;
      const avgR = group.filter(t => t.r_multiple != null).length > 0
        ? group.filter(t => t.r_multiple != null).reduce((s, t) => s + (t.r_multiple || 0), 0) / group.filter(t => t.r_multiple != null).length
        : 0;
      return { range: r.label, color: r.color, trades: group.length, winRate: group.length > 0 ? (wins.length / group.length) * 100 : 0, avgPnl, totalPnl, avgR };
    });
  }, [scored]);

  const scatterData = useMemo(() => scored.map(t => ({ score: t.opportunity_score!, pnl: t.pnl || 0, r: t.r_multiple || 0, symbol: t.symbol, win: (t.pnl || 0) > 0 })), [scored]);

  const cumulativeByTier = useMemo(() => {
    const cumulate = (arr: JournalEntry[]) => { let cum = 0; return arr.map((t, i) => { cum += t.pnl || 0; return { index: i + 1, pnl: cum }; }); };
    return {
      high: cumulate(scored.filter(t => t.opportunity_score! >= 65)),
      mid: cumulate(scored.filter(t => t.opportunity_score! >= 45 && t.opportunity_score! < 65)),
      low: cumulate(scored.filter(t => t.opportunity_score! < 45)),
    };
  }, [scored]);

  const totalScored = scored.length;
  const highScoreWR = (() => { const high = scored.filter(t => t.opportunity_score! >= 65); return high.length > 0 ? (high.filter(t => (t.pnl || 0) > 0).length / high.length) * 100 : 0; })();
  const lowScoreWR = (() => { const low = scored.filter(t => t.opportunity_score! < 45); return low.length > 0 ? (low.filter(t => (t.pnl || 0) > 0).length / low.length) * 100 : 0; })();
  const calibrationQuality = highScoreWR > lowScoreWR ? "CALIBRATED" : totalScored < 5 ? "INSUFFICIENT DATA" : "MISCALIBRATED";

  // ─── Trade log tab data ───
  const stratFamilies = useMemo(() => [...new Set(journal.map(j => j.strategy_family).filter(Boolean))], [journal]);
  const filteredLog = useMemo(() => {
    return journal.filter(j => {
      if (filterStrategy !== "all" && j.strategy_family !== filterStrategy) return false;
      if (filterOutcome === "win" && (j.pnl || 0) <= 0) return false;
      if (filterOutcome === "loss" && (j.pnl || 0) > 0) return false;
      return true;
    }).slice(0, 50);
  }, [journal, filterStrategy, filterOutcome]);

  const selectedData = selectedStrategy ? strategies.get(selectedStrategy) : null;
  const selectedJournal = selectedStrategy ? journal.filter(j => j.strategy_family === selectedStrategy) : [];

  if (loading) return <div className="p-6 flex items-center justify-center min-h-[400px]"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  const chartFg = "hsl(var(--muted-foreground))";
  const chartGrid = "hsl(var(--border))";

  return (
    <div className="p-6 space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" /> Performance Analysis
        </h1>
        <p className="text-sm text-muted-foreground font-mono">Strategy performance • Score calibration • Trade log</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard label="Total Trades" value={`${totalTrades}`} icon={BarChart3} />
        <MetricCard label="Overall Win Rate" value={`${formatNumber(overallWinRate)}%`} changeType={overallWinRate >= 50 ? "positive" : "negative"} icon={Award} />
        <MetricCard label="Total PnL" value={`${totalPnl >= 0 ? '+' : ''}${formatCurrency(totalPnl)}`} changeType={totalPnl >= 0 ? "positive" : "negative"} icon={TrendingUp} />
        <MetricCard label="Best Strategy" value={bestStrategy ? bestStrategy[0] : "—"} change={bestStrategy ? `+${formatCurrency(bestStrategy[1].pnl)}` : ""} icon={Target} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {([["strategy", "By Strategy"], ["score", "Score Analysis"], ["log", "Trade Log"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn("px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px",
              tab === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            )}>{label}</button>
        ))}
      </div>

      {/* ─── Tab 1: By Strategy ─── */}
      {tab === "strategy" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-3">
            <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">Strategy Performance Matrix</h2>
            {strategies.size === 0 ? (
              <div className="terminal-border rounded-lg p-8 text-center text-muted-foreground text-sm">No strategy performance data yet. Close positions to populate.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[...strategies.entries()].sort((a, b) => b[1].pnl - a[1].pnl).map(([name, data]) => {
                  const wr = data.trades > 0 ? (data.wins / data.trades) * 100 : 0;
                  const isSelected = selectedStrategy === name;
                  return (
                    <div key={name} onClick={() => setSelectedStrategy(isSelected ? null : name)}
                      className={cn("terminal-border rounded-lg p-4 cursor-pointer transition-all", isSelected ? "border-primary/50 bg-primary/5" : "hover:bg-accent/30")}>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-bold text-foreground">{name}</h3>
                        <span className={cn("text-lg font-mono font-bold", data.pnl >= 0 ? "text-profit" : "text-loss")}>{data.pnl >= 0 ? '+' : ''}{formatCurrency(data.pnl)}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                        <div><div className="text-muted-foreground">Trades</div><div className="text-foreground font-bold">{data.trades}</div></div>
                        <div><div className="text-muted-foreground">Win Rate</div><div className={cn("font-bold", wr >= 50 ? "text-profit" : "text-loss")}>{wr.toFixed(0)}%</div></div>
                        <div><div className="text-muted-foreground">Avg R</div><div className={cn("font-bold", data.avgR >= 0 ? "text-profit" : "text-loss")}>{data.avgR !== 0 ? `${data.avgR >= 0 ? '+' : ''}${data.avgR.toFixed(2)}R` : '—'}</div></div>
                      </div>
                      {data.regimes.size > 0 && (
                        <div className="mt-3 pt-2 border-t border-border/50 space-y-1">
                          {[...data.regimes.entries()].map(([regime, rd]) => (
                            <div key={regime} className="flex items-center justify-between text-[10px] font-mono">
                              <span className="text-muted-foreground capitalize">{regime}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">{rd.trades}t</span>
                                <span className={cn(rd.pnl >= 0 ? "text-profit" : "text-loss")}>{rd.pnl >= 0 ? '+' : ''}{formatCurrency(rd.pnl)}</span>
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

          <div className="space-y-4">
            <div className="terminal-border rounded-lg p-4">
              <h2 className="text-sm font-bold text-foreground mb-3">Score Calibration</h2>
              <p className="text-[10px] text-muted-foreground font-mono mb-3">Do higher opportunity scores predict better outcomes?</p>
              <div className="space-y-3">
                {calibrationScore.map(c => (
                  <div key={c.range} className="space-y-1">
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-foreground font-bold">Score {c.range}</span>
                      <span className="text-muted-foreground">{c.trades} trades</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs font-mono">
                      <div className="flex-1">
                        <div className="h-2 bg-accent rounded-full overflow-hidden">
                          <div className={cn("h-full rounded-full", c.winRate >= 60 ? "bg-profit" : c.winRate >= 40 ? "bg-primary" : "bg-loss")} style={{ width: `${Math.min(100, c.winRate)}%` }} />
                        </div>
                      </div>
                      <span className={cn("w-12 text-right font-bold", c.winRate >= 50 ? "text-profit" : "text-loss")}>{c.trades > 0 ? `${c.winRate.toFixed(0)}%` : "—"}</span>
                      <span className={cn("w-16 text-right", c.avgPnl >= 0 ? "text-profit" : "text-loss")}>{c.trades > 0 ? `${c.avgPnl >= 0 ? '+' : ''}${formatCurrency(c.avgPnl)}` : "—"}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {selectedData && (
              <div className="terminal-border rounded-lg p-4">
                <h2 className="text-sm font-bold text-foreground mb-3">{selectedStrategy} — Recent Trades</h2>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {selectedJournal.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">No journal entries for this strategy</p>
                  ) : selectedJournal.slice(0, 10).map((j, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0 text-xs font-mono">
                      <div className="flex items-center gap-2">
                        <span className="text-foreground font-bold">{j.symbol}</span>
                        <StatusBadge variant={j.direction === "long" ? "profit" : "loss"}>{j.direction.toUpperCase()}</StatusBadge>
                      </div>
                      <div className="flex items-center gap-3">
                        {j.r_multiple != null && <span className={cn("font-bold", j.r_multiple >= 0 ? "text-profit" : "text-loss")}>{j.r_multiple >= 0 ? '+' : ''}{j.r_multiple.toFixed(2)}R</span>}
                        <span className={cn("font-bold", (j.pnl || 0) >= 0 ? "text-profit" : "text-loss")}>{(j.pnl || 0) >= 0 ? '+' : ''}{formatCurrency(j.pnl || 0)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Tab 2: Score Analysis ─── */}
      {tab === "score" && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <MetricCard label="Scored Trades" value={`${totalScored}`} change={`${journal.length} total`} icon={BarChart3} />
            <MetricCard label="High Score WR (65+)" value={`${formatNumber(highScoreWR)}%`} changeType={highScoreWR >= 50 ? "positive" : "negative"} icon={TrendingUp} />
            <MetricCard label="Low Score WR (<45)" value={`${formatNumber(lowScoreWR)}%`} changeType={lowScoreWR < 50 ? "negative" : "positive"} icon={TrendingDown} />
            <MetricCard label="Calibration" value={calibrationQuality}
              icon={calibrationQuality === "CALIBRATED" ? CheckCircle2 : calibrationQuality === "MISCALIBRATED" ? XCircle : AlertTriangle}
              changeType={calibrationQuality === "CALIBRATED" ? "positive" : calibrationQuality === "MISCALIBRATED" ? "negative" : undefined} />
          </div>

          {totalScored === 0 ? (
            <div className="terminal-border rounded-lg p-12 text-center space-y-3">
              <AlertTriangle className="h-10 w-10 text-muted-foreground/30 mx-auto" />
              <p className="text-sm text-muted-foreground">No scored trades yet. Close positions from scored signals to see calibration data.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="terminal-border rounded-lg p-4">
                  <h2 className="text-sm font-bold text-foreground mb-1">Win Rate by Score Range</h2>
                  <p className="text-[10px] text-muted-foreground font-mono mb-3">Higher scores should predict higher win rates</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={calibrationScore} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
                      <XAxis dataKey="range" tick={{ fill: chartFg, fontSize: 10 }} />
                      <YAxis tick={{ fill: chartFg, fontSize: 10 }} domain={[0, 100]} unit="%" />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                        formatter={(value: number, name: string) => [name === "winRate" ? `${value.toFixed(1)}%` : formatCurrency(value), name === "winRate" ? "Win Rate" : "Avg PnL"]} />
                      <Bar dataKey="winRate" name="winRate" radius={[4, 4, 0, 0]}>
                        {calibrationScore.map((entry, i) => <Cell key={i} fill={entry.color} opacity={entry.trades > 0 ? 1 : 0.2} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="terminal-border rounded-lg p-4">
                  <h2 className="text-sm font-bold text-foreground mb-1">Score vs PnL (per trade)</h2>
                  <p className="text-[10px] text-muted-foreground font-mono mb-3">Each dot is a closed trade</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <ScatterChart margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
                      <XAxis type="number" dataKey="score" name="Score" tick={{ fill: chartFg, fontSize: 10 }} domain={[0, 100]} />
                      <YAxis type="number" dataKey="pnl" name="PnL" tick={{ fill: chartFg, fontSize: 10 }} />
                      <ReferenceLine y={0} stroke={chartGrid} strokeWidth={2} />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                        formatter={(value: number, name: string) => [name === "PnL" ? formatCurrency(value) : value.toFixed(0), name]} labelFormatter={(label) => `Score: ${label}`} />
                      <Scatter data={scatterData}>
                        {scatterData.map((entry, i) => <Cell key={i} fill={entry.win ? "hsl(var(--profit))" : "hsl(var(--loss))"} opacity={0.8} />)}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="terminal-border rounded-lg p-4">
                  <h2 className="text-sm font-bold text-foreground mb-1">Cumulative PnL by Score Tier</h2>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
                      <XAxis dataKey="index" tick={{ fill: chartFg, fontSize: 10 }} />
                      <YAxis tick={{ fill: chartFg, fontSize: 10 }} />
                      <ReferenceLine y={0} stroke={chartGrid} strokeWidth={2} />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }} formatter={(value: number) => [formatCurrency(value), ""]} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      {cumulativeByTier.high.length > 0 && <Line data={cumulativeByTier.high} type="monotone" dataKey="pnl" name="Score ≥65" stroke="hsl(var(--profit))" strokeWidth={2} dot={false} />}
                      {cumulativeByTier.mid.length > 0 && <Line data={cumulativeByTier.mid} type="monotone" dataKey="pnl" name="Score 45-64" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />}
                      {cumulativeByTier.low.length > 0 && <Line data={cumulativeByTier.low} type="monotone" dataKey="pnl" name="Score <45" stroke="hsl(var(--loss))" strokeWidth={2} dot={false} />}
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="terminal-border rounded-lg p-4">
                  <h2 className="text-sm font-bold text-foreground mb-1">Avg PnL & R-Multiple by Score</h2>
                  <div className="space-y-3">
                    {calibrationScore.map(c => (
                      <div key={c.range} className="space-y-1">
                        <div className="flex items-center justify-between text-xs font-mono">
                          <span className="text-foreground font-bold">Score {c.range}</span>
                          <div className="flex items-center gap-4">
                            <span className="text-muted-foreground">{c.trades} trades</span>
                            <span className={cn("font-bold", c.winRate >= 50 ? "text-profit" : "text-loss")}>{c.trades > 0 ? `${c.winRate.toFixed(0)}% WR` : "—"}</span>
                            <span className={cn("font-bold", c.avgPnl >= 0 ? "text-profit" : "text-loss")}>{c.trades > 0 ? `${c.avgPnl >= 0 ? '+' : ''}${formatCurrency(c.avgPnl)}` : "—"}</span>
                            <span className={cn("font-bold", c.avgR >= 0 ? "text-profit" : "text-loss")}>{c.trades > 0 && c.avgR !== 0 ? `${c.avgR >= 0 ? '+' : ''}${c.avgR.toFixed(2)}R` : "—"}</span>
                          </div>
                        </div>
                        <div className="h-2 bg-accent rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, c.winRate)}%`, backgroundColor: c.color }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className={cn("terminal-border rounded-lg p-4", calibrationQuality === "CALIBRATED" ? "border-profit/30" : calibrationQuality === "MISCALIBRATED" ? "border-loss/30" : "")}>
                <h2 className="text-sm font-bold text-foreground mb-2 flex items-center gap-2">
                  {calibrationQuality === "CALIBRATED" ? <CheckCircle2 className="h-4 w-4 text-profit" /> : calibrationQuality === "MISCALIBRATED" ? <XCircle className="h-4 w-4 text-loss" /> : <AlertTriangle className="h-4 w-4 text-terminal-gold" />}
                  Calibration Verdict: {calibrationQuality}
                </h2>
                <p className="text-xs text-muted-foreground font-mono">
                  {calibrationQuality === "CALIBRATED"
                    ? `Scoring is calibrated: high-score trades (≥65) have ${highScoreWR.toFixed(0)}% WR vs ${lowScoreWR.toFixed(0)}% for low scores (<45).`
                    : calibrationQuality === "MISCALIBRATED"
                    ? `⚠️ High-score trades (≥65) have ${highScoreWR.toFixed(0)}% WR vs ${lowScoreWR.toFixed(0)}% for low scores. Review scoring weights.`
                    : `Need more scored trades to evaluate calibration. Currently: ${totalScored} scored trades.`}
                </p>
              </div>
            </>
          )}
        </>
      )}

      {/* ─── Tab 3: Trade Log ─── */}
      {tab === "log" && (
        <div className="space-y-4">
          <div className="flex gap-3 items-center flex-wrap">
            <select value={filterStrategy} onChange={e => setFilterStrategy(e.target.value)}
              className="px-3 py-1.5 bg-background border border-border rounded-md text-xs font-mono focus:ring-1 focus:ring-primary focus:outline-none">
              <option value="all">{t.reports.allStrategies}</option>
              {stratFamilies.map(s => <option key={s} value={s!}>{s}</option>)}
            </select>
            <select value={filterOutcome} onChange={e => setFilterOutcome(e.target.value)}
              className="px-3 py-1.5 bg-background border border-border rounded-md text-xs font-mono focus:ring-1 focus:ring-primary focus:outline-none">
              <option value="all">{t.reports.allOutcomes}</option>
              <option value="win">{t.common.win}</option>
              <option value="loss">{t.common.loss}</option>
            </select>
            <span className="text-xs text-muted-foreground font-mono">{filteredLog.length} trades</span>
          </div>

          <div className="terminal-border rounded-lg overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="text-muted-foreground uppercase tracking-wider border-b border-border bg-accent/30">
                  <th className="text-left p-2.5">Date</th>
                  <th className="text-left p-2.5">Symbol</th>
                  <th className="text-left p-2.5">Dir</th>
                  <th className="text-left p-2.5">Strategy</th>
                  <th className="text-left p-2.5">Regime</th>
                  <th className="text-right p-2.5">PnL</th>
                  <th className="text-right p-2.5">R</th>
                  <th className="text-left p-2.5">Exit</th>
                </tr>
              </thead>
              <tbody>
                {filteredLog.length === 0 ? (
                  <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No trades match the current filters</td></tr>
                ) : filteredLog.map((j, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-accent/20">
                    <td className="p-2.5 text-muted-foreground">{j.exited_at ? new Date(j.exited_at).toLocaleDateString() : "—"}</td>
                    <td className="p-2.5 text-foreground font-bold">{j.symbol}</td>
                    <td className="p-2.5"><StatusBadge variant={j.direction === "long" ? "profit" : "loss"}>{j.direction.toUpperCase()}</StatusBadge></td>
                    <td className="p-2.5 text-muted-foreground capitalize">{j.strategy_family || "—"}</td>
                    <td className="p-2.5 text-muted-foreground capitalize">{j.market_regime || "—"}</td>
                    <td className={cn("p-2.5 text-right font-bold", (j.pnl || 0) >= 0 ? "text-profit" : "text-loss")}>{(j.pnl || 0) >= 0 ? '+' : ''}{formatCurrency(j.pnl || 0)}</td>
                    <td className={cn("p-2.5 text-right font-bold", (j.r_multiple || 0) >= 0 ? "text-profit" : "text-loss")}>{j.r_multiple != null ? `${j.r_multiple.toFixed(2)}R` : "—"}</td>
                    <td className="p-2.5 text-muted-foreground truncate max-w-[100px]">{j.exit_reasoning || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
