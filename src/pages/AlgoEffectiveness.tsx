import { useState, useEffect, useMemo } from "react";
import {
  Activity, Target, TrendingUp, TrendingDown, BarChart3, Award,
  Loader2, AlertTriangle, CheckCircle2, XCircle, Minus,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, Cell, LineChart, Line, Legend, ReferenceLine,
  PieChart, Pie,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { formatCurrency, formatNumber } from "@/lib/mockData";
import MetricCard from "@/components/shared/MetricCard";
import StatusBadge from "@/components/shared/StatusBadge";

interface JournalTrade {
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
}

const SCORE_RANGES = [
  { label: "80-100", min: 80, max: 100, color: "hsl(var(--profit))" },
  { label: "65-79", min: 65, max: 79, color: "hsl(var(--primary))" },
  { label: "50-64", min: 50, max: 64, color: "hsl(142 71% 45%)" },
  { label: "35-49", min: 35, max: 49, color: "hsl(var(--terminal-gold))" },
  { label: "0-34", min: 0, max: 34, color: "hsl(var(--loss))" },
];

export default function AlgoEffectiveness() {
  const { user } = useAuth();
  const [trades, setTrades] = useState<JournalTrade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("trade_journal")
      .select("symbol, direction, pnl, r_multiple, strategy_family, market_regime, opportunity_score, exited_at, entry_price, exit_price")
      .eq("user_id", user.id)
      .order("exited_at", { ascending: true })
      .then(({ data }) => {
        if (data) setTrades(data as JournalTrade[]);
        setLoading(false);
      });
  }, [user]);

  const scored = useMemo(() => trades.filter(t => t.opportunity_score != null), [trades]);

  // ─── Calibration by Score Range ───
  const calibration = useMemo(() => {
    return SCORE_RANGES.map(r => {
      const group = scored.filter(t => t.opportunity_score! >= r.min && t.opportunity_score! <= r.max);
      const wins = group.filter(t => (t.pnl || 0) > 0);
      const totalPnl = group.reduce((s, t) => s + (t.pnl || 0), 0);
      const avgPnl = group.length > 0 ? totalPnl / group.length : 0;
      const avgR = group.filter(t => t.r_multiple != null).length > 0
        ? group.filter(t => t.r_multiple != null).reduce((s, t) => s + (t.r_multiple || 0), 0) / group.filter(t => t.r_multiple != null).length
        : 0;
      return {
        range: r.label,
        color: r.color,
        trades: group.length,
        winRate: group.length > 0 ? (wins.length / group.length) * 100 : 0,
        avgPnl,
        totalPnl,
        avgR,
        expectedWinRate: r.min + (r.max - r.min) / 2, // naive expectation
      };
    });
  }, [scored]);

  // ─── Scatter: Score vs PnL per trade ───
  const scatterData = useMemo(() => {
    return scored.map(t => ({
      score: t.opportunity_score!,
      pnl: t.pnl || 0,
      r: t.r_multiple || 0,
      symbol: t.symbol,
      win: (t.pnl || 0) > 0,
    }));
  }, [scored]);

  // ─── Cumulative PnL by score tier ───
  const cumulativeByTier = useMemo(() => {
    const high = scored.filter(t => t.opportunity_score! >= 65);
    const mid = scored.filter(t => t.opportunity_score! >= 45 && t.opportunity_score! < 65);
    const low = scored.filter(t => t.opportunity_score! < 45);

    const cumulate = (arr: JournalTrade[]) => {
      let cum = 0;
      return arr.map((t, i) => {
        cum += t.pnl || 0;
        return { index: i + 1, pnl: cum };
      });
    };

    return { high: cumulate(high), mid: cumulate(mid), low: cumulate(low) };
  }, [scored]);

  // ─── Strategy effectiveness ───
  const strategyEff = useMemo(() => {
    const map = new Map<string, { trades: number; wins: number; pnl: number; avgScore: number }>();
    scored.forEach(t => {
      const key = t.strategy_family || "Unknown";
      const existing = map.get(key) || { trades: 0, wins: 0, pnl: 0, avgScore: 0 };
      existing.trades++;
      if ((t.pnl || 0) > 0) existing.wins++;
      existing.pnl += t.pnl || 0;
      existing.avgScore = ((existing.avgScore * (existing.trades - 1)) + (t.opportunity_score || 0)) / existing.trades;
      map.set(key, existing);
    });
    return [...map.entries()].map(([name, d]) => ({
      name,
      ...d,
      winRate: d.trades > 0 ? (d.wins / d.trades) * 100 : 0,
    })).sort((a, b) => b.pnl - a.pnl);
  }, [scored]);

  // ─── Regime effectiveness ───
  const regimeEff = useMemo(() => {
    const map = new Map<string, { trades: number; wins: number; pnl: number; avgScore: number }>();
    scored.forEach(t => {
      const key = t.market_regime || "unknown";
      const existing = map.get(key) || { trades: 0, wins: 0, pnl: 0, avgScore: 0 };
      existing.trades++;
      if ((t.pnl || 0) > 0) existing.wins++;
      existing.pnl += t.pnl || 0;
      existing.avgScore = ((existing.avgScore * (existing.trades - 1)) + (t.opportunity_score || 0)) / existing.trades;
      map.set(key, existing);
    });
    return [...map.entries()].map(([name, d]) => ({
      name,
      ...d,
      winRate: d.trades > 0 ? (d.wins / d.trades) * 100 : 0,
    })).sort((a, b) => b.pnl - a.pnl);
  }, [scored]);

  // ─── Summary metrics ───
  const totalScored = scored.length;
  const scoredWins = scored.filter(t => (t.pnl || 0) > 0).length;
  const overallWR = totalScored > 0 ? (scoredWins / totalScored) * 100 : 0;
  const totalPnl = scored.reduce((s, t) => s + (t.pnl || 0), 0);
  const highScoreWR = (() => {
    const high = scored.filter(t => t.opportunity_score! >= 65);
    return high.length > 0 ? (high.filter(t => (t.pnl || 0) > 0).length / high.length) * 100 : 0;
  })();
  const lowScoreWR = (() => {
    const low = scored.filter(t => t.opportunity_score! < 45);
    return low.length > 0 ? (low.filter(t => (t.pnl || 0) > 0).length / low.length) * 100 : 0;
  })();
  const calibrationQuality = highScoreWR > lowScoreWR ? "CALIBRATED" : totalScored < 5 ? "INSUFFICIENT DATA" : "MISCALIBRATED";

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const chartFg = "hsl(var(--muted-foreground))";
  const chartGrid = "hsl(var(--border))";

  return (
    <div className="p-6 space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Activity className="h-6 w-6 text-primary" /> Algorithm Effectiveness
        </h1>
        <p className="text-sm text-muted-foreground font-mono">
          Score calibration • Predictive accuracy • Strategy & regime analysis
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <MetricCard label="Scored Trades" value={`${totalScored}`} change={`${trades.length} total`} icon={BarChart3} />
        <MetricCard label="Overall Win Rate" value={`${formatNumber(overallWR)}%`} changeType={overallWR >= 50 ? "positive" : "negative"} icon={Award} />
        <MetricCard label="High Score WR (65+)" value={`${formatNumber(highScoreWR)}%`} changeType={highScoreWR >= 50 ? "positive" : "negative"} icon={TrendingUp} />
        <MetricCard label="Low Score WR (<45)" value={`${formatNumber(lowScoreWR)}%`} changeType={lowScoreWR < 50 ? "negative" : "positive"} icon={TrendingDown} />
        <MetricCard label="Calibration" value={calibrationQuality}
          icon={calibrationQuality === "CALIBRATED" ? CheckCircle2 : calibrationQuality === "MISCALIBRATED" ? XCircle : AlertTriangle}
          changeType={calibrationQuality === "CALIBRATED" ? "positive" : calibrationQuality === "MISCALIBRATED" ? "negative" : undefined} />
      </div>

      {totalScored === 0 ? (
        <div className="terminal-border rounded-lg p-12 text-center space-y-3">
          <AlertTriangle className="h-10 w-10 text-muted-foreground/30 mx-auto" />
          <p className="text-sm text-muted-foreground">
            No hay trades con opportunity_score registrados aún.
          </p>
          <p className="text-xs text-muted-foreground font-mono">
            Cierra posiciones que hayan sido aprobadas desde señales con score para ver los datos de calibración.
          </p>
        </div>
      ) : (
        <>
          {/* Row 1: Calibration Bar + Scatter */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Calibration: Win Rate by Score Range */}
            <div className="terminal-border rounded-lg p-4">
              <h2 className="text-sm font-bold text-foreground mb-1">Win Rate by Score Range</h2>
              <p className="text-[10px] text-muted-foreground font-mono mb-3">Higher scores should predict higher win rates</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={calibration} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
                  <XAxis dataKey="range" tick={{ fill: chartFg, fontSize: 10 }} />
                  <YAxis tick={{ fill: chartFg, fontSize: 10 }} domain={[0, 100]} unit="%" />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                    formatter={(value: number, name: string) => [
                      name === "winRate" ? `${value.toFixed(1)}%` : name === "avgPnl" ? formatCurrency(value) : value,
                      name === "winRate" ? "Win Rate" : name === "avgPnl" ? "Avg PnL" : name,
                    ]}
                  />
                  <Bar dataKey="winRate" name="winRate" radius={[4, 4, 0, 0]}>
                    {calibration.map((entry, i) => (
                      <Cell key={i} fill={entry.color} opacity={entry.trades > 0 ? 1 : 0.2} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-4 mt-2">
                {calibration.map(c => (
                  <div key={c.range} className="text-center">
                    <div className="text-[9px] font-mono text-muted-foreground">{c.range}</div>
                    <div className="text-[10px] font-mono font-bold text-foreground">{c.trades}t</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Scatter: Score vs PnL */}
            <div className="terminal-border rounded-lg p-4">
              <h2 className="text-sm font-bold text-foreground mb-1">Score vs PnL (per trade)</h2>
              <p className="text-[10px] text-muted-foreground font-mono mb-3">Each dot is a closed trade</p>
              <ResponsiveContainer width="100%" height={220}>
                <ScatterChart margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
                  <XAxis type="number" dataKey="score" name="Score" tick={{ fill: chartFg, fontSize: 10 }} domain={[0, 100]} />
                  <YAxis type="number" dataKey="pnl" name="PnL" tick={{ fill: chartFg, fontSize: 10 }} />
                  <ReferenceLine y={0} stroke={chartGrid} strokeWidth={2} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                    formatter={(value: number, name: string) => [
                      name === "PnL" ? formatCurrency(value) : value.toFixed(0),
                      name,
                    ]}
                    labelFormatter={(label) => `Score: ${label}`}
                  />
                  <Scatter data={scatterData}>
                    {scatterData.map((entry, i) => (
                      <Cell key={i} fill={entry.win ? "hsl(var(--profit))" : "hsl(var(--loss))"} opacity={0.8} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Row 2: Cumulative PnL by Tier + Avg PnL by Score */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Cumulative PnL by Score Tier */}
            <div className="terminal-border rounded-lg p-4">
              <h2 className="text-sm font-bold text-foreground mb-1">Cumulative PnL by Score Tier</h2>
              <p className="text-[10px] text-muted-foreground font-mono mb-3">High-score trades should accumulate more profit</p>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
                  <XAxis dataKey="index" tick={{ fill: chartFg, fontSize: 10 }} label={{ value: "Trade #", position: "insideBottom", offset: -2, fill: chartFg, fontSize: 10 }} />
                  <YAxis tick={{ fill: chartFg, fontSize: 10 }} />
                  <ReferenceLine y={0} stroke={chartGrid} strokeWidth={2} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                    formatter={(value: number) => [formatCurrency(value), ""]} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  {cumulativeByTier.high.length > 0 && (
                    <Line data={cumulativeByTier.high} type="monotone" dataKey="pnl" name="Score ≥65" stroke="hsl(var(--profit))" strokeWidth={2} dot={false} />
                  )}
                  {cumulativeByTier.mid.length > 0 && (
                    <Line data={cumulativeByTier.mid} type="monotone" dataKey="pnl" name="Score 45-64" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  )}
                  {cumulativeByTier.low.length > 0 && (
                    <Line data={cumulativeByTier.low} type="monotone" dataKey="pnl" name="Score <45" stroke="hsl(var(--loss))" strokeWidth={2} dot={false} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Avg PnL per Score Range */}
            <div className="terminal-border rounded-lg p-4">
              <h2 className="text-sm font-bold text-foreground mb-1">Avg PnL & R-Multiple by Score</h2>
              <p className="text-[10px] text-muted-foreground font-mono mb-3">Expected value per score tier</p>
              <div className="space-y-3">
                {calibration.map(c => (
                  <div key={c.range} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-foreground font-bold">Score {c.range}</span>
                      <div className="flex items-center gap-4">
                        <span className="text-muted-foreground">{c.trades} trades</span>
                        <span className={cn("font-bold", c.winRate >= 50 ? "text-profit" : "text-loss")}>
                          {c.trades > 0 ? `${c.winRate.toFixed(0)}% WR` : "—"}
                        </span>
                        <span className={cn("font-bold", c.avgPnl >= 0 ? "text-profit" : "text-loss")}>
                          {c.trades > 0 ? `${c.avgPnl >= 0 ? '+' : ''}${formatCurrency(c.avgPnl)}` : "—"}
                        </span>
                        <span className={cn("font-bold", c.avgR >= 0 ? "text-profit" : "text-loss")}>
                          {c.trades > 0 && c.avgR !== 0 ? `${c.avgR >= 0 ? '+' : ''}${c.avgR.toFixed(2)}R` : "—"}
                        </span>
                      </div>
                    </div>
                    <div className="h-2 bg-accent rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{
                        width: `${Math.min(100, c.winRate)}%`,
                        backgroundColor: c.color,
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Row 3: Strategy & Regime Analysis */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Strategy Effectiveness */}
            <div className="terminal-border rounded-lg p-4">
              <h2 className="text-sm font-bold text-foreground mb-3">Effectiveness by Strategy</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="text-muted-foreground uppercase tracking-wider border-b border-border">
                      <th className="text-left p-2">Strategy</th>
                      <th className="text-right p-2">Trades</th>
                      <th className="text-right p-2">WR</th>
                      <th className="text-right p-2">Avg Score</th>
                      <th className="text-right p-2">PnL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {strategyEff.map(s => (
                      <tr key={s.name} className="border-b border-border/50 hover:bg-accent/30">
                        <td className="p-2 text-foreground font-bold">{s.name}</td>
                        <td className="p-2 text-right text-muted-foreground">{s.trades}</td>
                        <td className={cn("p-2 text-right font-bold", s.winRate >= 50 ? "text-profit" : "text-loss")}>
                          {s.winRate.toFixed(0)}%
                        </td>
                        <td className="p-2 text-right text-primary">{s.avgScore.toFixed(0)}</td>
                        <td className={cn("p-2 text-right font-bold", s.pnl >= 0 ? "text-profit" : "text-loss")}>
                          {s.pnl >= 0 ? '+' : ''}{formatCurrency(s.pnl)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Regime Effectiveness */}
            <div className="terminal-border rounded-lg p-4">
              <h2 className="text-sm font-bold text-foreground mb-3">Effectiveness by Market Regime</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="text-muted-foreground uppercase tracking-wider border-b border-border">
                      <th className="text-left p-2">Regime</th>
                      <th className="text-right p-2">Trades</th>
                      <th className="text-right p-2">WR</th>
                      <th className="text-right p-2">Avg Score</th>
                      <th className="text-right p-2">PnL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {regimeEff.map(r => (
                      <tr key={r.name} className="border-b border-border/50 hover:bg-accent/30">
                        <td className="p-2 text-foreground font-bold capitalize">{r.name}</td>
                        <td className="p-2 text-right text-muted-foreground">{r.trades}</td>
                        <td className={cn("p-2 text-right font-bold", r.winRate >= 50 ? "text-profit" : "text-loss")}>
                          {r.winRate.toFixed(0)}%
                        </td>
                        <td className="p-2 text-right text-primary">{r.avgScore.toFixed(0)}</td>
                        <td className={cn("p-2 text-right font-bold", r.pnl >= 0 ? "text-profit" : "text-loss")}>
                          {r.pnl >= 0 ? '+' : ''}{formatCurrency(r.pnl)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Verdict */}
          <div className={cn("terminal-border rounded-lg p-4",
            calibrationQuality === "CALIBRATED" ? "border-profit/30" : calibrationQuality === "MISCALIBRATED" ? "border-loss/30" : ""
          )}>
            <h2 className="text-sm font-bold text-foreground mb-2 flex items-center gap-2">
              {calibrationQuality === "CALIBRATED" ? <CheckCircle2 className="h-4 w-4 text-profit" /> :
               calibrationQuality === "MISCALIBRATED" ? <XCircle className="h-4 w-4 text-loss" /> :
               <AlertTriangle className="h-4 w-4 text-terminal-gold" />}
              Calibration Verdict: {calibrationQuality}
            </h2>
            <p className="text-xs text-muted-foreground font-mono">
              {calibrationQuality === "CALIBRATED"
                ? `El algoritmo está correctamente calibrado: los trades con score alto (≥65) tienen un win rate de ${highScoreWR.toFixed(0)}%, superior al de scores bajos (<45) con ${lowScoreWR.toFixed(0)}%. Los scores predicen resultados reales.`
                : calibrationQuality === "MISCALIBRATED"
                ? `⚠️ Atención: los trades con score alto (≥65) tienen ${highScoreWR.toFixed(0)}% WR vs ${lowScoreWR.toFixed(0)}% para scores bajos. Revisa los pesos de scoring o la calidad de datos.`
                : `Se necesitan más trades con opportunity_score para evaluar la calibración. Actualmente: ${totalScored} trades scored.`
              }
            </p>
          </div>
        </>
      )}
    </div>
  );
}
