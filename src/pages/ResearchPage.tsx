import { useState, useEffect, useMemo } from "react";
import {
  Brain, FlaskConical, Play, Loader2, TrendingUp, BarChart3, Target,
  Award, Plus, Beaker, RefreshCw, Zap, Activity, FileSpreadsheet,
} from "lucide-react";
import BacktestCharts from "@/components/strategy/BacktestCharts";
import StatusBadge from "@/components/shared/StatusBadge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { formatCurrency, formatNumber } from "@/lib/utils";
import MetricCard from "@/components/shared/MetricCard";
import { toast } from "sonner";

// ─── Types ───

interface StrategyTemplate {
  id: string; name: string; strategy_family: string; description: string | null;
  entry_logic: Record<string, unknown>; exit_logic: Record<string, unknown>;
  risk_model: Record<string, unknown>; preferred_regime: string[];
}

interface BacktestResult {
  id: string; symbol: string; strategy_id: string | null;
  total_trades: number; winning_trades: number; win_rate: number; total_pnl: number;
  expectancy: number; profit_factor: number; max_drawdown: number;
  sharpe_estimate: number; avg_r_multiple: number;
  period_start: string | null; period_end: string | null; computed_at: string;
  trade_log: Array<{ entry_price: number; exit_price: number; pnl: number; r_multiple: number; direction: string; entry_reason: string; exit_reason: string }>;
}

interface UserStrategy {
  id: string; name: string; strategy_family: string; description: string | null;
  status: string; historical_win_rate: number; historical_expectancy: number; total_trades: number;
}

interface ScoreAdjustment {
  id: string; adjustment_type: string;
  previous_weights: Record<string, number>; new_weights: Record<string, number>;
  reason: string | null;
  metrics: { correlations?: Record<string, number>; outcomes_count?: number; total_delta?: number } | null;
  created_at: string;
}

interface RegimePerf {
  strategy_family: string; market_regime: string; total_trades: number;
  winning_trades: number; total_pnl: number; win_rate: number;
  profit_factor: number; optimal_weight_modifier: number;
}

interface SignalOutcome {
  symbol: string; predicted_score: number; actual_pnl: number;
  actual_r_multiple: number; outcome: string; strategy_family: string | null;
  market_regime: string | null; created_at: string;
}

interface SignalBacktestResult {
  symbol: string; bars_available: number; signals_generated: number;
  wins: number; losses: number; timeouts: number;
  win_rate: number; profit_factor: number; avg_r: number;
  max_drawdown_pct: number; gross_profit_pct: number; gross_loss_pct: number;
  trade_log: Array<{ date: string; direction: string; score: number; entry: number; sl: number; tp: number; r_planned: number; exit_price: number; pnl_pct: number; r_actual: number; outcome: string }>;
}

type Tab = "backtest" | "learning" | "sim6m";

export default function ResearchPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("backtest");

  // ─── Sim 6M state ───
  const [simConfig, setSimConfig] = useState({
    min_score: 65,
    min_r: 1.5,
    risk_pct: 1,
    initial_capital: 10000,
    max_concurrent_trades: 3,
    date_from: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    date_to: new Date().toISOString().split('T')[0],
  });
  const [simLoading, setSimLoading] = useState(false);
  const [simResults, setSimResults] = useState<any>(null);
  const [simError, setSimError] = useState<string | null>(null);

  // ─── Backtest state ───
  const [templates, setTemplates] = useState<StrategyTemplate[]>([]);
  const [strategies, setStrategies] = useState<UserStrategy[]>([]);
  const [backtests, setBacktests] = useState<BacktestResult[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<StrategyTemplate | null>(null);
  const [backtestSymbol, setBacktestSymbol] = useState("AAPL");
  const [selectedBacktest, setSelectedBacktest] = useState<BacktestResult | null>(null);
  const [btTab, setBtTab] = useState<"templates" | "strategies" | "backtests">("templates");
  const [running, setRunning] = useState(false);

  // Signal engine backtest state
  const [seSymbol, setSeSymbol] = useState("AAPL");
  const [seLookback, setSeLookback] = useState(180);
  const [seRunning, setSeRunning] = useState(false);
  const [seResult, setSeResult] = useState<SignalBacktestResult | null>(null);

  // ─── Learning state ───
  const [adjustments, setAdjustments] = useState<ScoreAdjustment[]>([]);
  const [regimePerf, setRegimePerf] = useState<RegimePerf[]>([]);
  const [outcomes, setOutcomes] = useState<SignalOutcome[]>([]);
  const [adapting, setAdapting] = useState(false);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("strategy_templates").select("*").order("strategy_family"),
      supabase.from("strategies").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("backtest_results").select("*").eq("user_id", user.id).order("computed_at", { ascending: false }).limit(50),
      supabase.from("score_adjustments").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
      supabase.from("regime_performance").select("*").eq("user_id", user.id),
      supabase.from("signal_outcomes").select("symbol, predicted_score, actual_pnl, actual_r_multiple, outcome, strategy_family, market_regime, created_at")
        .eq("user_id", user.id).order("created_at", { ascending: false }).limit(100),
    ]).then(([tRes, sRes, bRes, adjRes, regRes, outRes]) => {
      if (tRes.data) setTemplates(tRes.data as unknown as StrategyTemplate[]);
      if (sRes.data) setStrategies(sRes.data as unknown as UserStrategy[]);
      if (bRes.data) setBacktests(bRes.data as unknown as BacktestResult[]);
      if (adjRes.data) setAdjustments(adjRes.data as unknown as ScoreAdjustment[]);
      if (regRes.data) setRegimePerf(regRes.data as unknown as RegimePerf[]);
      if (outRes.data) setOutcomes(outRes.data as unknown as SignalOutcome[]);
      setLoading(false);
    });
  }, [user]);

  // ─── Backtest handlers ───
  const adoptTemplate = async (tmpl: StrategyTemplate) => {
    if (!user) return;
    const { error } = await supabase.from("strategies").insert([{
      user_id: user.id, name: tmpl.name, strategy_family: tmpl.strategy_family,
      description: tmpl.description, entry_logic: tmpl.entry_logic as any,
      exit_logic: tmpl.exit_logic as any, risk_model: tmpl.risk_model as any,
      preferred_regime: tmpl.preferred_regime, status: "active",
    }]);
    if (error) { toast.error("Error adopting strategy"); return; }
    toast.success(`Strategy "${tmpl.name}" adopted ✓`);
    const { data } = await supabase.from("strategies").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    if (data) setStrategies(data as unknown as UserStrategy[]);
  };

  const runBacktest = async () => {
    if (!user || !selectedTemplate) return;
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("strategy-backtest", {
        body: { user_id: user.id, symbol: backtestSymbol, strategy_family: selectedTemplate.strategy_family, parameters: selectedTemplate.risk_model },
      });
      if (error) throw new Error(error.message);
      toast.success(`Backtest complete: ${data.trades} trades, PnL: ${data.total_pnl?.toFixed(2)}`);
      const { data: bRes } = await supabase.from("backtest_results").select("*").eq("user_id", user.id).order("computed_at", { ascending: false }).limit(50);
      if (bRes) setBacktests(bRes as unknown as BacktestResult[]);
    } catch (e: any) { toast.error(e.message || "Backtest failed"); }
    setRunning(false);
  };

  const runSignalEngineBacktest = async () => {
    setSeRunning(true);
    setSeResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("signal-engine-backtest", {
        body: { symbol: seSymbol, lookback_days: seLookback, min_score: 65, min_r: 1.5 },
      });
      if (error) throw new Error(error.message);
      if (data.error) throw new Error(data.error);
      setSeResult(data as SignalBacktestResult);
      toast.success(`Signal backtest: ${data.signals_generated} signals, ${data.win_rate}% WR`);
    } catch (e: any) { toast.error(e.message || "Signal backtest failed"); }
    setSeRunning(false);
  };

  // ─── Sim 6M handlers ───
  const runSimulation = async () => {
    setSimLoading(true);
    setSimError(null);
    setSimResults(null);
    try {
      const { data, error } = await supabase.functions.invoke('run-backtest-simulation', {
        body: simConfig,
      });
      if (error) throw new Error(error.message);
      setSimResults(data);
    } catch (e: any) {
      setSimError(e.message || 'Simulation failed');
    }
    setSimLoading(false);
  };

  const downloadExcel = async () => {
    if (!simResults) return;
    const XLSX = (await import('https://cdn.sheetjs.com/xlsx-0.20.0/package/xlsx.mjs' as any)) as any;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([simResults.summary]), 'Summary');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(simResults.by_symbol), 'By Symbol');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(simResults.monthly || []), 'Monthly PnL');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(simResults.trade_log), 'Trade Log');
    const checklist = [
      { Metric: 'Win Rate %', Target: '≥ 45%', Actual: `${simResults.summary.win_rate}%`, Pass: simResults.summary.win_rate >= 45 ? 'YES' : 'NO' },
      { Metric: 'Profit Factor', Target: '≥ 1.3', Actual: simResults.summary.profit_factor, Pass: simResults.summary.profit_factor >= 1.3 ? 'YES' : 'NO' },
      { Metric: 'Avg R', Target: '≥ 1.1', Actual: simResults.summary.avg_r, Pass: simResults.summary.avg_r >= 1.1 ? 'YES' : 'NO' },
      { Metric: 'Max Drawdown %', Target: '< 8%', Actual: `${simResults.summary.max_drawdown_pct}%`, Pass: simResults.summary.max_drawdown_pct < 8 ? 'YES' : 'NO' },
      { Metric: 'Total Trades', Target: '≥ 30', Actual: simResults.summary.total_trades, Pass: simResults.summary.total_trades >= 30 ? 'YES' : 'NO' },
      { Metric: 'Avg Monthly PnL', Target: '≥ $500', Actual: `$${simResults.summary.avg_monthly_pnl}`, Pass: simResults.summary.avg_monthly_pnl >= 500 ? 'YES' : 'NO' },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(checklist), 'Fase 9 Checklist');
    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `LHYDBRA_Sim6M_${today}.xlsx`);
  };


  const runAdaptation = async () => {
    if (!user) return;
    setAdapting(true);
    try {
      const { data, error } = await supabase.functions.invoke("adaptive-scoring", { body: { user_id: user.id, window_days: 30 } });
      if (error) throw new Error(error.message);
      if (data.adjusted) {
        toast.success(`Weights adapted! Delta: ${data.total_delta.toFixed(1)} from ${data.outcomes_analyzed} outcomes`);
        const { data: adjRes } = await supabase.from("score_adjustments").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20);
        if (adjRes) setAdjustments(adjRes as unknown as ScoreAdjustment[]);
      } else { toast.info(data.message || "No significant adjustment needed"); }
    } catch (e: any) { toast.error(e.message || "Adaptation failed"); }
    setAdapting(false);
  };

  const calibration = useMemo(() => {
    const ranges = [{ label: "80+", min: 80, max: 100 }, { label: "65-79", min: 65, max: 79 }, { label: "45-64", min: 45, max: 64 }, { label: "<45", min: 0, max: 44 }];
    return ranges.map(r => {
      const trades = outcomes.filter(o => o.predicted_score >= r.min && o.predicted_score <= r.max);
      const wins = trades.filter(o => o.outcome === "win");
      return { ...r, count: trades.length, winRate: trades.length > 0 ? (wins.length / trades.length) * 100 : 0, avgPnl: trades.length > 0 ? trades.reduce((s, o) => s + o.actual_pnl, 0) / trades.length : 0, avgR: trades.length > 0 ? trades.reduce((s, o) => s + o.actual_r_multiple, 0) / trades.length : 0 };
    });
  }, [outcomes]);

  const totalOutcomes = outcomes.length;
  const winCount = outcomes.filter(o => o.outcome === "win").length;
  const overallAccuracy = totalOutcomes > 0 ? (winCount / totalOutcomes) * 100 : 0;

  const totalBacktests = backtests.length;
  const bestBacktest = backtests.length > 0 ? backtests.reduce((best, b) => b.sharpe_estimate > best.sharpe_estimate ? b : best, backtests[0]) : null;

  if (loading) return <div className="p-6 flex items-center justify-center min-h-[400px]"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="p-6 space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Brain className="h-6 w-6 text-primary" /> Research & Learning
        </h1>
        <p className="text-sm text-muted-foreground font-mono">Strategy backtesting • Signal engine validation • Adaptive learning</p>
      </div>

      {/* Main Tabs */}
      <div className="flex gap-1 border-b border-border">
        {([["backtest", "Backtest"], ["learning", "Learning"], ["sim6m", "Sim 6M"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn("px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px",
              tab === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            )}>{label}</button>
        ))}
      </div>

      {/* ─── Backtest Tab ─── */}
      {tab === "backtest" && (
        <div className="space-y-6">
          {/* Signal Engine Backtest Section */}
          <div className="terminal-border rounded-lg p-4 space-y-4">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" /> Signal Engine Backtest
            </h2>
            <p className="text-[10px] text-muted-foreground font-mono">Walk-forward test of the real scoring logic against historical OHLCV data</p>
            <div className="flex gap-3 items-end flex-wrap">
              <div>
                <label className="text-[10px] text-muted-foreground font-mono block mb-1">Symbol</label>
                <input type="text" value={seSymbol} onChange={e => setSeSymbol(e.target.value.toUpperCase())}
                  className="px-3 py-1.5 bg-background border border-border rounded-md text-sm font-mono w-28 focus:ring-1 focus:ring-primary focus:outline-none" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground font-mono block mb-1">Lookback</label>
                <select value={seLookback} onChange={e => setSeLookback(Number(e.target.value))}
                  className="px-3 py-1.5 bg-background border border-border rounded-md text-sm font-mono focus:ring-1 focus:ring-primary focus:outline-none">
                  <option value={90}>90 days</option>
                  <option value={180}>180 days</option>
                  <option value={365}>365 days</option>
                </select>
              </div>
              <button onClick={runSignalEngineBacktest} disabled={seRunning}
                className="flex items-center gap-2 px-4 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
                {seRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {seRunning ? "Running..." : "Run"}
              </button>
            </div>

            {seResult && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="bg-accent/30 rounded-md p-2.5 text-center">
                    <div className="text-[10px] text-muted-foreground font-mono">Signals</div>
                    <div className="text-sm font-bold text-foreground">{seResult.signals_generated}</div>
                  </div>
                  <div className="bg-accent/30 rounded-md p-2.5 text-center">
                    <div className="text-[10px] text-muted-foreground font-mono">Win Rate</div>
                    <div className={cn("text-sm font-bold", seResult.win_rate >= 50 ? "text-profit" : "text-loss")}>{seResult.win_rate}%</div>
                  </div>
                  <div className="bg-accent/30 rounded-md p-2.5 text-center">
                    <div className="text-[10px] text-muted-foreground font-mono">Profit Factor</div>
                    <div className={cn("text-sm font-bold", seResult.profit_factor >= 1 ? "text-profit" : "text-loss")}>{seResult.profit_factor}</div>
                  </div>
                  <div className="bg-accent/30 rounded-md p-2.5 text-center">
                    <div className="text-[10px] text-muted-foreground font-mono">Avg R</div>
                    <div className={cn("text-sm font-bold", seResult.avg_r >= 0 ? "text-profit" : "text-loss")}>{seResult.avg_r}</div>
                  </div>
                  <div className="bg-accent/30 rounded-md p-2.5 text-center">
                    <div className="text-[10px] text-muted-foreground font-mono">Max DD</div>
                    <div className="text-sm font-bold text-loss">{seResult.max_drawdown_pct}%</div>
                  </div>
                </div>

                {seResult.trade_log.length > 0 && (
                  <div className="overflow-x-auto max-h-[200px] overflow-y-auto">
                    <table className="w-full text-[10px] font-mono">
                      <thead>
                        <tr className="text-muted-foreground uppercase tracking-wider border-b border-border">
                          <th className="text-left p-1.5">Date</th>
                          <th className="text-left p-1.5">Dir</th>
                          <th className="text-right p-1.5">Score</th>
                          <th className="text-right p-1.5">Entry</th>
                          <th className="text-right p-1.5">Exit</th>
                          <th className="text-right p-1.5">PnL%</th>
                          <th className="text-right p-1.5">R</th>
                          <th className="text-left p-1.5">Result</th>
                        </tr>
                      </thead>
                      <tbody>
                        {seResult.trade_log.slice(0, 30).map((t, i) => (
                          <tr key={i} className="border-b border-border/50">
                            <td className="p-1.5 text-muted-foreground">{t.date}</td>
                            <td className={cn("p-1.5", t.direction === "long" ? "text-profit" : "text-loss")}>{t.direction.toUpperCase()}</td>
                            <td className="p-1.5 text-right text-primary">{t.score}</td>
                            <td className="p-1.5 text-right text-foreground">{t.entry}</td>
                            <td className="p-1.5 text-right text-foreground">{t.exit_price}</td>
                            <td className={cn("p-1.5 text-right font-bold", t.pnl_pct >= 0 ? "text-profit" : "text-loss")}>{t.pnl_pct >= 0 ? '+' : ''}{t.pnl_pct}%</td>
                            <td className={cn("p-1.5 text-right font-bold", t.r_actual >= 0 ? "text-profit" : "text-loss")}>{t.r_actual}R</td>
                            <td className="p-1.5">
                              <StatusBadge variant={t.outcome === "take_profit" ? "profit" : t.outcome === "stop_loss" ? "loss" : "info"}>
                                {t.outcome === "take_profit" ? "TP" : t.outcome === "stop_loss" ? "SL" : "TO"}
                              </StatusBadge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Strategy Research Lab content */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <MetricCard label="Templates" value={`${templates.length}`} icon={Beaker} />
            <MetricCard label="My Strategies" value={`${strategies.length}`} icon={FlaskConical} />
            <MetricCard label="Backtests Run" value={`${totalBacktests}`} icon={BarChart3} />
            <MetricCard label="Best Sharpe" value={bestBacktest ? bestBacktest.sharpe_estimate.toFixed(2) : "—"} icon={Award} changeType={bestBacktest && bestBacktest.sharpe_estimate > 1 ? "positive" : "negative"} />
          </div>

          <div className="flex gap-1 border-b border-border">
            {([["templates", "Templates"], ["strategies", "My Strategies"], ["backtests", "Backtest Results"]] as const).map(([key, label]) => (
              <button key={key} onClick={() => setBtTab(key)}
                className={cn("px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px",
                  btTab === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                )}>{label}</button>
            ))}
          </div>

          {btTab === "templates" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                {templates.map(t => (
                  <div key={t.id} onClick={() => setSelectedTemplate(t)}
                    className={cn("terminal-border rounded-lg p-4 cursor-pointer transition-all", selectedTemplate?.id === t.id ? "border-primary/50 bg-primary/5" : "hover:bg-accent/30")}>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-bold text-foreground">{t.name}</h3>
                      <StatusBadge variant="info">{t.strategy_family}</StatusBadge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{t.description}</p>
                    <div className="flex gap-1 flex-wrap">
                      {t.preferred_regime.map(r => <span key={r} className="text-[10px] font-mono px-1.5 py-0.5 bg-accent rounded text-muted-foreground capitalize">{r}</span>)}
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button onClick={(e) => { e.stopPropagation(); adoptTemplate(t); }}
                        className="flex items-center gap-1 px-2 py-1 text-[10px] bg-primary/10 text-primary rounded border border-primary/30 hover:bg-primary/20 transition-colors">
                        <Plus className="h-3 w-3" /> Adopt
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="terminal-border rounded-lg p-4 space-y-4">
                <h2 className="text-sm font-bold text-foreground">Quick Backtest</h2>
                {selectedTemplate ? (
                  <>
                    <div className="text-xs text-muted-foreground font-mono">Strategy: <span className="text-primary">{selectedTemplate.name}</span></div>
                    <div>
                      <label className="text-xs text-muted-foreground font-mono">Symbol</label>
                      <input type="text" value={backtestSymbol} onChange={e => setBacktestSymbol(e.target.value.toUpperCase())}
                        className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm font-mono focus:ring-1 focus:ring-primary focus:outline-none" />
                    </div>
                    <button onClick={runBacktest} disabled={running}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
                      {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                      {running ? "Running..." : "Run Backtest"}
                    </button>
                    <div className="space-y-2 pt-2 border-t border-border">
                      <h3 className="text-xs font-bold text-muted-foreground uppercase">Entry Logic</h3>
                      <div className="text-[10px] font-mono text-foreground/80 space-y-0.5">
                        {(selectedTemplate.entry_logic as any)?.conditions?.map((c: string, i: number) => <div key={i}>• {c}</div>) || <div>—</div>}
                      </div>
                      <h3 className="text-xs font-bold text-muted-foreground uppercase">Exit Logic</h3>
                      <div className="text-[10px] font-mono text-foreground/80 space-y-0.5">
                        {(selectedTemplate.exit_logic as any)?.conditions?.map((c: string, i: number) => <div key={i}>• {c}</div>) || <div>—</div>}
                      </div>
                      <h3 className="text-xs font-bold text-muted-foreground uppercase">Risk Model</h3>
                      <div className="text-[10px] font-mono text-foreground/80">
                        {Object.entries(selectedTemplate.risk_model).map(([k, v]) => <div key={k}>{k}: {String(v)}</div>)}
                      </div>
                    </div>
                  </>
                ) : <p className="text-xs text-muted-foreground text-center py-6">Select a template to run backtests</p>}
              </div>
            </div>
          )}

          {btTab === "strategies" && (
            <div className="space-y-3">
              {strategies.length === 0 ? (
                <div className="terminal-border rounded-lg p-8 text-center text-muted-foreground text-sm">No strategies yet. Adopt a template to get started.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {strategies.map(s => (
                    <div key={s.id} className="terminal-border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-bold text-foreground">{s.name}</h3>
                        <StatusBadge variant={s.status === "active" ? "profit" : "loss"}>{s.status.toUpperCase()}</StatusBadge>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs font-mono mt-3">
                        <div><div className="text-muted-foreground">Win Rate</div><div className="text-foreground font-bold">{formatNumber(s.historical_win_rate)}%</div></div>
                        <div><div className="text-muted-foreground">Expectancy</div><div className="text-foreground font-bold">{formatCurrency(s.historical_expectancy)}</div></div>
                        <div><div className="text-muted-foreground">Trades</div><div className="text-foreground font-bold">{s.total_trades}</div></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {btTab === "backtests" && (
            <div className="space-y-3">
              {backtests.length === 0 ? (
                <div className="terminal-border rounded-lg p-8 text-center text-muted-foreground text-sm">No backtest results yet. Run a backtest from the Templates tab.</div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {backtests.map(b => (
                    <div key={b.id} onClick={() => setSelectedBacktest(selectedBacktest?.id === b.id ? null : b)}
                      className={cn("terminal-border rounded-lg p-4 cursor-pointer transition-all", selectedBacktest?.id === b.id ? "border-primary/50 bg-primary/5" : "hover:bg-accent/30")}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold text-foreground font-mono">{b.symbol}</span>
                          <span className="text-xs text-muted-foreground">{b.total_trades} trades</span>
                        </div>
                        <div className="flex items-center gap-4 text-xs font-mono">
                          <div><span className="text-muted-foreground">WR:</span> <span className={cn("font-bold", b.win_rate >= 50 ? "text-profit" : "text-loss")}>{b.win_rate.toFixed(0)}%</span></div>
                          <div><span className="text-muted-foreground">PnL:</span> <span className={cn("font-bold", b.total_pnl >= 0 ? "text-profit" : "text-loss")}>{b.total_pnl >= 0 ? '+' : ''}{b.total_pnl.toFixed(2)}</span></div>
                          <div><span className="text-muted-foreground">PF:</span> <span className="font-bold text-foreground">{b.profit_factor.toFixed(2)}</span></div>
                          <div><span className="text-muted-foreground">Sharpe:</span> <span className={cn("font-bold", b.sharpe_estimate > 1 ? "text-profit" : "text-foreground")}>{b.sharpe_estimate.toFixed(2)}</span></div>
                        </div>
                      </div>
                      {selectedBacktest?.id === b.id && b.trade_log && b.trade_log.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-border space-y-4">
                          <BacktestCharts tradeLog={b.trade_log} symbol={b.symbol} />
                          <div className="terminal-border rounded-lg p-3 space-y-1 max-h-[200px] overflow-y-auto">
                            <h4 className="text-xs font-bold text-muted-foreground uppercase mb-2">Trade Log</h4>
                            <div className="grid grid-cols-6 gap-2 text-[10px] text-muted-foreground font-mono uppercase">
                              <div>Entry</div><div>Exit</div><div>Dir</div><div>PnL</div><div>R</div><div>Exit Reason</div>
                            </div>
                            {b.trade_log.slice(0, 20).map((t, i) => (
                              <div key={i} className="grid grid-cols-6 gap-2 text-[10px] font-mono">
                                <div className="text-foreground">{t.entry_price.toFixed(2)}</div>
                                <div className="text-foreground">{t.exit_price.toFixed(2)}</div>
                                <div className={t.direction === "long" ? "text-profit" : "text-loss"}>{t.direction.toUpperCase()}</div>
                                <div className={cn(t.pnl >= 0 ? "text-profit" : "text-loss")}>{t.pnl >= 0 ? '+' : ''}{t.pnl.toFixed(2)}</div>
                                <div className={cn(t.r_multiple >= 0 ? "text-profit" : "text-loss")}>{t.r_multiple.toFixed(2)}R</div>
                                <div className="text-muted-foreground truncate">{t.exit_reason}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── Learning Tab ─── */}
      {tab === "learning" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div />
            <button onClick={runAdaptation} disabled={adapting}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
              {adapting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {adapting ? "Adapting..." : "Run Adaptation"}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <MetricCard label="Signal Outcomes" value={`${totalOutcomes}`} icon={Target} />
            <MetricCard label="Win Rate" value={`${formatNumber(overallAccuracy)}%`} changeType={overallAccuracy >= 50 ? "positive" : "negative"} icon={TrendingUp} />
            <MetricCard label="Adaptations" value={`${adjustments.length}`} icon={Brain} />
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
                          <div className={cn("h-full rounded-full", c.winRate >= 60 ? "bg-profit" : c.winRate >= 40 ? "bg-primary" : "bg-loss")} style={{ width: `${Math.min(100, c.winRate)}%` }} />
                        </div>
                      </div>
                      <span className={cn("w-12 text-right font-bold", c.winRate >= 50 ? "text-profit" : "text-loss")}>{c.count > 0 ? `${c.winRate.toFixed(0)}%` : "—"}</span>
                      <span className={cn("w-14 text-right", c.avgR >= 0 ? "text-profit" : "text-loss")}>{c.count > 0 ? `${c.avgR >= 0 ? '+' : ''}${c.avgR.toFixed(2)}R` : "—"}</span>
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
                      <StatusBadge variant={adj.adjustment_type === "auto" ? "info" : "warning"}>{adj.adjustment_type.toUpperCase()}</StatusBadge>
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
      )}

      {/* ─── Sim 6M Tab ─── */}
      {tab === "sim6m" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-foreground">6-Month Signal Engine Simulation</h2>
              <p className="text-[10px] text-muted-foreground font-mono mt-1">
                Walk-forward backtest on 12 symbols using real TwelveData prices. Takes ~2 minutes due to API rate limits.
              </p>
            </div>
          </div>

          {/* Config */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Min Score", key: "min_score", step: 1 },
              { label: "Min R", key: "min_r", step: 0.1 },
              { label: "Risk per Trade %", key: "risk_pct", step: 0.1 },
              { label: "Initial Capital $", key: "initial_capital", step: 1000 },
            ].map(({ label, key, step }) => (
              <div key={key}>
                <label className="text-[10px] text-muted-foreground font-mono block mb-1">{label}</label>
                <input
                  type="number"
                  step={step}
                  value={(simConfig as any)[key]}
                  onChange={e => setSimConfig(prev => ({ ...prev, [key]: parseFloat(e.target.value) }))}
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm font-mono focus:ring-1 focus:ring-primary focus:outline-none"
                />
              </div>
            ))}
          </div>

          <button onClick={runSimulation} disabled={simLoading}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
            {simLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {simLoading ? "Running simulation (~2 min)..." : "Run 6-Month Simulation"}
          </button>

          {simError && (
            <div className="terminal-border rounded-lg p-4 text-loss text-sm font-mono">{simError}</div>
          )}

          {simResults && (
            <div className="space-y-6">
              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  { label: "Final Capital", value: `$${simResults.summary.final_capital.toLocaleString()}`, positive: simResults.summary.total_pnl >= 0 },
                  { label: "Total Return", value: `${simResults.summary.total_return_pct}%`, positive: simResults.summary.total_return_pct >= 0 },
                  { label: "Total Trades", value: simResults.summary.total_trades, positive: true },
                  { label: "Win Rate", value: `${simResults.summary.win_rate}%`, positive: simResults.summary.win_rate >= 45 },
                  { label: "Profit Factor", value: simResults.summary.profit_factor, positive: simResults.summary.profit_factor >= 1.3 },
                  { label: "Max Drawdown", value: `${simResults.summary.max_drawdown_pct}%`, positive: simResults.summary.max_drawdown_pct < 8 },
                ].map(({ label, value, positive }) => (
                  <div key={label} className="terminal-border rounded-lg p-3 text-center">
                    <div className="text-[10px] text-muted-foreground font-mono uppercase">{label}</div>
                    <div className={cn("text-lg font-bold font-mono mt-1", positive ? "text-profit" : "text-loss")}>{value}</div>
                  </div>
                ))}
              </div>

              {/* By symbol table */}
              <div className="terminal-border rounded-lg p-4">
                <h3 className="text-sm font-bold text-foreground mb-3">By Symbol</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="text-muted-foreground uppercase tracking-wider border-b border-border">
                        <th className="text-left p-2">Symbol</th>
                        <th className="text-right p-2">Trades</th>
                        <th className="text-right p-2">Win Rate</th>
                        <th className="text-right p-2">PF</th>
                        <th className="text-right p-2">Avg R</th>
                        <th className="text-right p-2">PnL ($)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...simResults.by_symbol].sort((a: any, b: any) => b.total_pnl - a.total_pnl).map((s: any) => (
                        <tr key={s.symbol} className="border-b border-border/50">
                          <td className="p-2 font-bold text-foreground">{s.symbol}</td>
                          <td className="p-2 text-right text-foreground">{s.trades}</td>
                          <td className={cn("p-2 text-right font-bold", s.win_rate >= 45 ? "text-profit" : "text-loss")}>{s.win_rate}%</td>
                          <td className={cn("p-2 text-right font-bold", s.profit_factor >= 1.3 ? "text-profit" : "text-loss")}>{s.profit_factor}</td>
                          <td className={cn("p-2 text-right font-bold", s.avg_r >= 1.1 ? "text-profit" : "text-loss")}>{s.avg_r}R</td>
                          <td className={cn("p-2 text-right font-bold", s.total_pnl >= 0 ? "text-profit" : "text-loss")}>${s.total_pnl.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Trade log */}
              <div className="terminal-border rounded-lg p-4">
                <h3 className="text-sm font-bold text-foreground mb-3">
                  Trade Log ({simResults.trade_log.length} trades)
                </h3>
                <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                  <table className="w-full text-[10px] font-mono">
                    <thead>
                      <tr className="text-muted-foreground uppercase tracking-wider border-b border-border">
                        <th className="text-left p-1.5">Entry Date</th>
                        <th className="text-left p-1.5">Symbol</th>
                        <th className="text-left p-1.5">Dir</th>
                        <th className="text-right p-1.5">Score</th>
                        <th className="text-right p-1.5">Entry</th>
                        <th className="text-right p-1.5">Exit</th>
                        <th className="text-right p-1.5">R</th>
                        <th className="text-right p-1.5">PnL ($)</th>
                        <th className="text-left p-1.5">Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {simResults.trade_log.map((t: any, i: number) => (
                        <tr key={i} className="border-b border-border/50">
                          <td className="p-1.5 text-muted-foreground">{t.date_entry}</td>
                          <td className="p-1.5 font-bold text-foreground">{t.symbol}</td>
                          <td className={cn("p-1.5", t.direction === "long" ? "text-profit" : "text-loss")}>{t.direction}</td>
                          <td className="p-1.5 text-right text-primary">{t.score}</td>
                          <td className="p-1.5 text-right text-foreground">{t.entry_price}</td>
                          <td className="p-1.5 text-right text-foreground">{t.exit_price}</td>
                          <td className={cn("p-1.5 text-right font-bold", t.r_actual >= 0 ? "text-profit" : "text-loss")}>{t.r_actual}R</td>
                          <td className={cn("p-1.5 text-right font-bold", t.pnl_dollars >= 0 ? "text-profit" : "text-loss")}>${t.pnl_dollars}</td>
                          <td className="p-1.5">
                            <StatusBadge variant={t.outcome === "take_profit" ? "profit" : "loss"}>
                              {t.outcome === "take_profit" ? "✓ TP" : "✗ SL"}
                            </StatusBadge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Download button */}
              <button onClick={downloadExcel}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary/90 transition-colors">
                <FileSpreadsheet className="h-4 w-4" />
                Download Excel — Fase 9 Checklist
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
