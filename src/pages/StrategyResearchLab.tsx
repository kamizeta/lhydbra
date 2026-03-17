import { useState, useEffect } from "react";
import { FlaskConical, Play, Loader2, TrendingUp, BarChart3, Target, Award, Plus, Beaker } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { formatCurrency, formatNumber } from "@/lib/mockData";
import MetricCard from "@/components/shared/MetricCard";
import StatusBadge from "@/components/shared/StatusBadge";
import { toast } from "sonner";

interface StrategyTemplate {
  id: string;
  name: string;
  strategy_family: string;
  description: string | null;
  entry_logic: Record<string, unknown>;
  exit_logic: Record<string, unknown>;
  risk_model: Record<string, unknown>;
  preferred_regime: string[];
}

interface BacktestResult {
  id: string;
  symbol: string;
  strategy_id: string | null;
  total_trades: number;
  winning_trades: number;
  win_rate: number;
  total_pnl: number;
  expectancy: number;
  profit_factor: number;
  max_drawdown: number;
  sharpe_estimate: number;
  avg_r_multiple: number;
  period_start: string | null;
  period_end: string | null;
  computed_at: string;
  trade_log: Array<{ entry_price: number; exit_price: number; pnl: number; r_multiple: number; direction: string; entry_reason: string; exit_reason: string }>;
}

interface UserStrategy {
  id: string;
  name: string;
  strategy_family: string;
  description: string | null;
  status: string;
  historical_win_rate: number;
  historical_expectancy: number;
  total_trades: number;
}

export default function StrategyResearchLab() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<StrategyTemplate[]>([]);
  const [strategies, setStrategies] = useState<UserStrategy[]>([]);
  const [backtests, setBacktests] = useState<BacktestResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<StrategyTemplate | null>(null);
  const [backtestSymbol, setBacktestSymbol] = useState("AAPL");
  const [selectedBacktest, setSelectedBacktest] = useState<BacktestResult | null>(null);
  const [tab, setTab] = useState<"templates" | "strategies" | "backtests">("templates");

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("strategy_templates").select("*").order("strategy_family"),
      supabase.from("strategies").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("backtest_results").select("*").eq("user_id", user.id).order("computed_at", { ascending: false }).limit(50),
    ]).then(([tRes, sRes, bRes]) => {
      if (tRes.data) setTemplates(tRes.data as unknown as StrategyTemplate[]);
      if (sRes.data) setStrategies(sRes.data as unknown as UserStrategy[]);
      if (bRes.data) setBacktests(bRes.data as unknown as BacktestResult[]);
      setLoading(false);
    });
  }, [user]);

  const adoptTemplate = async (tmpl: StrategyTemplate) => {
    if (!user) return;
    const { error } = await supabase.from("strategies").insert({
      user_id: user.id,
      name: tmpl.name,
      strategy_family: tmpl.strategy_family,
      description: tmpl.description,
      entry_logic: tmpl.entry_logic,
      exit_logic: tmpl.exit_logic,
      risk_model: tmpl.risk_model,
      preferred_regime: tmpl.preferred_regime,
      status: "active",
    });
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
        body: {
          user_id: user.id,
          symbol: backtestSymbol,
          strategy_family: selectedTemplate.strategy_family,
          parameters: selectedTemplate.risk_model,
        },
      });
      if (error) throw new Error(error.message);
      toast.success(`Backtest complete: ${data.trades} trades, PnL: ${data.total_pnl?.toFixed(2)}`);
      // Refresh backtests
      const { data: bRes } = await supabase.from("backtest_results").select("*").eq("user_id", user.id).order("computed_at", { ascending: false }).limit(50);
      if (bRes) setBacktests(bRes as unknown as BacktestResult[]);
    } catch (e: any) {
      toast.error(e.message || "Backtest failed");
    }
    setRunning(false);
  };

  const totalBacktests = backtests.length;
  const avgWinRate = backtests.length > 0 ? backtests.reduce((s, b) => s + b.win_rate, 0) / backtests.length : 0;
  const bestBacktest = backtests.length > 0 ? backtests.reduce((best, b) => b.sharpe_estimate > best.sharpe_estimate ? b : best, backtests[0]) : null;

  if (loading) return <div className="p-6 flex items-center justify-center min-h-[400px]"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="p-6 space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <FlaskConical className="h-6 w-6 text-primary" /> Strategy Research Lab
        </h1>
        <p className="text-sm text-muted-foreground font-mono">Strategy templates • Backtesting engine • Robustness analysis</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard label="Templates" value={`${templates.length}`} icon={Beaker} />
        <MetricCard label="My Strategies" value={`${strategies.length}`} icon={FlaskConical} />
        <MetricCard label="Backtests Run" value={`${totalBacktests}`} icon={BarChart3} />
        <MetricCard label="Best Sharpe" value={bestBacktest ? bestBacktest.sharpe_estimate.toFixed(2) : "—"} icon={Award} changeType={bestBacktest && bestBacktest.sharpe_estimate > 1 ? "positive" : "negative"} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {([["templates", "Templates"], ["strategies", "My Strategies"], ["backtests", "Backtest Results"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn("px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px",
              tab === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            )}>{label}</button>
        ))}
      </div>

      {/* Templates Tab */}
      {tab === "templates" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3">
            {templates.map(t => (
              <div key={t.id} onClick={() => setSelectedTemplate(t)}
                className={cn("terminal-border rounded-lg p-4 cursor-pointer transition-all",
                  selectedTemplate?.id === t.id ? "border-primary/50 bg-primary/5" : "hover:bg-accent/30"
                )}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-foreground">{t.name}</h3>
                  <StatusBadge variant="info">{t.strategy_family}</StatusBadge>
                </div>
                <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{t.description}</p>
                <div className="flex gap-1 flex-wrap">
                  {t.preferred_regime.map(r => (
                    <span key={r} className="text-[10px] font-mono px-1.5 py-0.5 bg-accent rounded text-muted-foreground capitalize">{r}</span>
                  ))}
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

          {/* Backtest Panel */}
          <div className="terminal-border rounded-lg p-4 space-y-4">
            <h2 className="text-sm font-bold text-foreground">Quick Backtest</h2>
            {selectedTemplate ? (
              <>
                <div className="text-xs text-muted-foreground font-mono">
                  Strategy: <span className="text-primary">{selectedTemplate.name}</span>
                </div>
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

                {/* Strategy details */}
                <div className="space-y-2 pt-2 border-t border-border">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase">Entry Logic</h3>
                  <div className="text-[10px] font-mono text-foreground/80 space-y-0.5">
                    {(selectedTemplate.entry_logic as any)?.conditions?.map((c: string, i: number) => (
                      <div key={i}>• {c}</div>
                    )) || <div>—</div>}
                  </div>
                  <h3 className="text-xs font-bold text-muted-foreground uppercase">Exit Logic</h3>
                  <div className="text-[10px] font-mono text-foreground/80 space-y-0.5">
                    {(selectedTemplate.exit_logic as any)?.conditions?.map((c: string, i: number) => (
                      <div key={i}>• {c}</div>
                    )) || <div>—</div>}
                  </div>
                  <h3 className="text-xs font-bold text-muted-foreground uppercase">Risk Model</h3>
                  <div className="text-[10px] font-mono text-foreground/80">
                    {Object.entries(selectedTemplate.risk_model).map(([k, v]) => (
                      <div key={k}>{k}: {String(v)}</div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-6">Select a template to run backtests</p>
            )}
          </div>
        </div>
      )}

      {/* My Strategies Tab */}
      {tab === "strategies" && (
        <div className="space-y-3">
          {strategies.length === 0 ? (
            <div className="terminal-border rounded-lg p-8 text-center text-muted-foreground text-sm">
              No strategies yet. Adopt a template to get started.
            </div>
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

      {/* Backtests Tab */}
      {tab === "backtests" && (
        <div className="space-y-3">
          {backtests.length === 0 ? (
            <div className="terminal-border rounded-lg p-8 text-center text-muted-foreground text-sm">
              No backtest results yet. Run a backtest from the Templates tab.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {backtests.map(b => (
                <div key={b.id} onClick={() => setSelectedBacktest(selectedBacktest?.id === b.id ? null : b)}
                  className={cn("terminal-border rounded-lg p-4 cursor-pointer transition-all",
                    selectedBacktest?.id === b.id ? "border-primary/50 bg-primary/5" : "hover:bg-accent/30"
                  )}>
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
                    <div className="mt-3 pt-3 border-t border-border space-y-1 max-h-[200px] overflow-y-auto">
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
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
