import { useState, useEffect, useMemo } from "react";
import { Brain, TrendingUp, Target, BarChart3, Activity, Loader2, RefreshCw, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { formatCurrency, formatNumber } from "@/lib/utils";
import MetricCard from "@/components/shared/MetricCard";
import StatusBadge from "@/components/shared/StatusBadge";
import { toast } from "sonner";
import { useI18n } from "@/i18n";

interface ScoreAdjustment {
  id: string;
  adjustment_type: string;
  previous_weights: Record<string, number>;
  new_weights: Record<string, number>;
  reason: string | null;
  metrics: { correlations?: Record<string, number>; outcomes_count?: number; total_delta?: number } | null;
  created_at: string;
}

interface RegimePerf {
  strategy_family: string;
  market_regime: string;
  total_trades: number;
  winning_trades: number;
  total_pnl: number;
  win_rate: number;
  profit_factor: number;
  optimal_weight_modifier: number;
}

interface SignalOutcome {
  symbol: string;
  predicted_score: number;
  actual_pnl: number;
  actual_r_multiple: number;
  outcome: string;
  strategy_family: string | null;
  market_regime: string | null;
  created_at: string;
}

export default function LearningDashboard() {
  const { user } = useAuth();
  const [adjustments, setAdjustments] = useState<ScoreAdjustment[]>([]);
  const [regimePerf, setRegimePerf] = useState<RegimePerf[]>([]);
  const [outcomes, setOutcomes] = useState<SignalOutcome[]>([]);
  const [loading, setLoading] = useState(true);
  const [adapting, setAdapting] = useState(false);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("score_adjustments").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
      supabase.from("regime_performance").select("*").eq("user_id", user.id),
      supabase.from("signal_outcomes").select("symbol, predicted_score, actual_pnl, actual_r_multiple, outcome, strategy_family, market_regime, created_at")
        .eq("user_id", user.id).order("created_at", { ascending: false }).limit(100),
    ]).then(([adjRes, regRes, outRes]) => {
      if (adjRes.data) setAdjustments(adjRes.data as unknown as ScoreAdjustment[]);
      if (regRes.data) setRegimePerf(regRes.data as unknown as RegimePerf[]);
      if (outRes.data) setOutcomes(outRes.data as unknown as SignalOutcome[]);
      setLoading(false);
    });
  }, [user]);

  const runAdaptation = async () => {
    if (!user) return;
    setAdapting(true);
    try {
      const { data, error } = await supabase.functions.invoke("adaptive-scoring", {
        body: { user_id: user.id, window_days: 30 },
      });
      if (error) throw new Error(error.message);
      if (data.adjusted) {
        toast.success(`Weights adapted! Delta: ${data.total_delta.toFixed(1)} from ${data.outcomes_analyzed} outcomes`);
        // Refresh
        const { data: adjRes } = await supabase.from("score_adjustments").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20);
        if (adjRes) setAdjustments(adjRes as unknown as ScoreAdjustment[]);
      } else {
        toast.info(data.message || "No significant adjustment needed");
      }
    } catch (e: any) {
      toast.error(e.message || "Adaptation failed");
    }
    setAdapting(false);
  };

  // Score calibration from outcomes
  const calibration = useMemo(() => {
    const ranges = [
      { label: "80+", min: 80, max: 100 },
      { label: "65-79", min: 65, max: 79 },
      { label: "45-64", min: 45, max: 64 },
      { label: "<45", min: 0, max: 44 },
    ];
    return ranges.map(r => {
      const trades = outcomes.filter(o => o.predicted_score >= r.min && o.predicted_score <= r.max);
      const wins = trades.filter(o => o.outcome === "win");
      return {
        ...r,
        count: trades.length,
        winRate: trades.length > 0 ? (wins.length / trades.length) * 100 : 0,
        avgPnl: trades.length > 0 ? trades.reduce((s, o) => s + o.actual_pnl, 0) / trades.length : 0,
        avgR: trades.length > 0 ? trades.reduce((s, o) => s + o.actual_r_multiple, 0) / trades.length : 0,
      };
    });
  }, [outcomes]);

  const totalOutcomes = outcomes.length;
  const winCount = outcomes.filter(o => o.outcome === "win").length;
  const overallAccuracy = totalOutcomes > 0 ? (winCount / totalOutcomes) * 100 : 0;
  const totalAdaptations = adjustments.length;

  if (loading) return <div className="p-6 flex items-center justify-center min-h-[400px]"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="p-6 space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Brain className="h-6 w-6 text-primary" /> {t.learning.title}
          </h1>
          <p className="text-sm text-muted-foreground font-mono">{t.learning.subtitle}</p>
        </div>
        <button onClick={runAdaptation} disabled={adapting}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
          {adapting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {adapting ? t.common.adapting : t.learning.runAdaptation}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard label="Signal Outcomes" value={`${totalOutcomes}`} icon={Target} />
        <MetricCard label="Win Rate" value={`${formatNumber(overallAccuracy)}%`} changeType={overallAccuracy >= 50 ? "positive" : "negative"} icon={TrendingUp} />
        <MetricCard label="Adaptations" value={`${totalAdaptations}`} icon={Brain} />
        <MetricCard label="Score Accuracy" value={overallAccuracy > 0 ? `${formatNumber(overallAccuracy)}%` : "—"} icon={Activity} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Score Calibration */}
        <div className="terminal-border rounded-lg p-4">
          <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" /> Score Calibration
          </h2>
          <p className="text-[10px] text-muted-foreground font-mono mb-3">Predicted score vs actual outcome correlation</p>
          <div className="space-y-3">
            {calibration.map(c => (
              <div key={c.label} className="space-y-1">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-foreground font-bold">Score {c.label}</span>
                  <span className="text-muted-foreground">{c.count} outcomes</span>
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
                  <span className={cn("w-14 text-right", c.avgR >= 0 ? "text-profit" : "text-loss")}>
                    {c.count > 0 ? `${c.avgR >= 0 ? '+' : ''}${c.avgR.toFixed(2)}R` : "—"}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {outcomes.length === 0 && <p className="text-[10px] text-muted-foreground font-mono mt-3 text-center">Close more trades to build calibration data</p>}
        </div>

        {/* Regime Performance */}
        <div className="terminal-border rounded-lg p-4">
          <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" /> Regime × Strategy Performance
          </h2>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {regimePerf.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">No regime performance data yet</p>
            ) : regimePerf.sort((a, b) => b.profit_factor - a.profit_factor).map((rp, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                <div>
                  <div className="text-xs font-bold text-foreground capitalize">{rp.strategy_family}</div>
                  <div className="text-[10px] text-muted-foreground capitalize">{rp.market_regime}</div>
                </div>
                <div className="flex items-center gap-3 text-xs font-mono">
                  <span className="text-muted-foreground">{rp.total_trades}t</span>
                  <span className={cn("font-bold", rp.win_rate >= 50 ? "text-profit" : "text-loss")}>{rp.win_rate.toFixed(0)}%</span>
                  <span className={cn("font-bold", rp.profit_factor >= 1 ? "text-profit" : "text-loss")}>PF:{rp.profit_factor.toFixed(1)}</span>
                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded",
                    rp.optimal_weight_modifier >= 1.1 ? "bg-profit/10 text-profit" : rp.optimal_weight_modifier >= 0.9 ? "bg-primary/10 text-primary" : "bg-loss/10 text-loss"
                  )}>×{rp.optimal_weight_modifier.toFixed(1)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Adaptation History */}
        <div className="terminal-border rounded-lg p-4">
          <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" /> Adaptation History
          </h2>
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {adjustments.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">No adaptations yet. Run adaptation when you have enough signal outcomes.</p>
            ) : adjustments.map(adj => (
              <div key={adj.id} className="rounded-md bg-accent/30 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <StatusBadge variant={adj.adjustment_type === "auto" ? "info" : "warning"}>
                    {adj.adjustment_type.toUpperCase()}
                  </StatusBadge>
                  <span className="text-[10px] font-mono text-muted-foreground">{new Date(adj.created_at).toLocaleDateString()}</span>
                </div>
                {adj.reason && <p className="text-[10px] text-foreground/80 font-mono">{adj.reason}</p>}
                {adj.metrics?.correlations && (
                  <div className="grid grid-cols-2 gap-1 text-[10px] font-mono">
                    {Object.entries(adj.metrics.correlations).slice(0, 4).map(([k, v]) => (
                      <div key={k} className="flex justify-between">
                        <span className="text-muted-foreground capitalize">{k.replace('_score', '')}</span>
                        <span className={cn("font-bold", Number(v) > 0 ? "text-profit" : "text-loss")}>{(Number(v) * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
