import { useState, useEffect } from "react";
import { LayoutGrid, TrendingUp, Shield, Target, BookOpen, Bot, Briefcase, Zap, AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserSettings } from "@/hooks/useUserSettings";
import { useMarketData } from "@/hooks/useMarketData";
import { cn } from "@/lib/utils";
import { formatCurrency, formatNumber } from "@/lib/mockData";
import MetricCard from "@/components/shared/MetricCard";
import StatusBadge from "@/components/shared/StatusBadge";

interface Position {
  symbol: string;
  direction: string;
  quantity: number;
  avg_entry: number;
  stop_loss: number | null;
  strategy: string | null;
  asset_type: string;
}

interface Signal {
  symbol: string;
  direction: string;
  confidence: number;
  status: string;
  strategy: string;
  opportunity_score: number | null;
}

interface JournalStats {
  totalTrades: number;
  wins: number;
  totalPnl: number;
  avgR: number;
}

interface TopOpp {
  symbol: string;
  total_score: number;
  direction: string | null;
  strategy_family: string | null;
}

export default function ControlCenter() {
  const { user } = useAuth();
  const { settings } = useUserSettings();
  const { data: marketAssets } = useMarketData();
  const [loading, setLoading] = useState(true);
  const [positions, setPositions] = useState<Position[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [journalStats, setJournalStats] = useState<JournalStats>({ totalTrades: 0, wins: 0, totalPnl: 0, avgR: 0 });
  const [topOpps, setTopOpps] = useState<TopOpp[]>([]);
  const [alerts, setAlerts] = useState<string[]>([]);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("positions").select("symbol, direction, quantity, avg_entry, stop_loss, strategy, asset_type").eq("user_id", user.id).eq("status", "open"),
      supabase.from("trade_signals").select("symbol, direction, confidence, status, strategy, opportunity_score").eq("user_id", user.id).eq("status", "pending").order("created_at", { ascending: false }).limit(5),
      supabase.from("trade_journal").select("pnl, r_multiple").eq("user_id", user.id),
      supabase.from("opportunity_scores").select("symbol, total_score, direction, strategy_family").eq("timeframe", "1d").order("total_score", { ascending: false }).limit(5),
    ]).then(([posRes, sigRes, journalRes, oppRes]) => {
      if (posRes.data) setPositions(posRes.data as Position[]);
      if (sigRes.data) setSignals(sigRes.data as Signal[]);
      if (journalRes.data) {
        const trades = journalRes.data as { pnl: number | null; r_multiple: number | null }[];
        const wins = trades.filter(t => (t.pnl || 0) > 0);
        const rTrades = trades.filter(t => t.r_multiple != null);
        setJournalStats({
          totalTrades: trades.length,
          wins: wins.length,
          totalPnl: trades.reduce((s, t) => s + (t.pnl || 0), 0),
          avgR: rTrades.length > 0 ? rTrades.reduce((s, t) => s + (t.r_multiple || 0), 0) / rTrades.length : 0,
        });
      }
      if (oppRes.data) setTopOpps(oppRes.data as TopOpp[]);
      setLoading(false);
    });
  }, [user]);

  // Generate alerts
  useEffect(() => {
    const a: string[] = [];
    if (positions.length >= settings.max_positions) a.push(`Max positions reached (${positions.length}/${settings.max_positions})`);
    const noSL = positions.filter(p => !p.stop_loss);
    if (noSL.length > 0 && settings.stop_loss_required) a.push(`${noSL.length} position(s) without stop loss!`);
    const exposure = positions.reduce((s, p) => s + p.quantity * p.avg_entry, 0);
    const expPct = settings.current_capital > 0 ? (exposure / settings.current_capital) * 100 : 0;
    if (expPct > 100) a.push(`Exposure at ${expPct.toFixed(0)}% — exceeds capital`);
    const drawdown = settings.initial_capital > 0 ? ((settings.initial_capital - settings.current_capital) / settings.initial_capital) * 100 : 0;
    if (drawdown > settings.max_drawdown * 0.8) a.push(`Drawdown at ${drawdown.toFixed(1)}% — approaching ${settings.max_drawdown}% limit`);
    setAlerts(a);
  }, [positions, settings]);

  const winRate = journalStats.totalTrades > 0 ? (journalStats.wins / journalStats.totalTrades) * 100 : 0;
  const exposure = positions.reduce((s, p) => s + p.quantity * p.avg_entry, 0);
  const expPct = settings.current_capital > 0 ? (exposure / settings.current_capital) * 100 : 0;

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
          <LayoutGrid className="h-6 w-6 text-primary" /> Control Center
        </h1>
        <p className="text-sm text-muted-foreground font-mono">Unified command view • All systems at a glance</p>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="bg-loss/10 border border-loss/30 rounded-lg p-3 space-y-1">
          {alerts.map((a, i) => (
            <div key={i} className="flex items-center gap-2 text-xs font-mono text-loss">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>{a}</span>
            </div>
          ))}
        </div>
      )}

      {/* Key Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <MetricCard label="Capital" value={formatCurrency(settings.current_capital)} icon={TrendingUp} />
        <MetricCard label="Positions" value={`${positions.length}/${settings.max_positions}`} icon={Briefcase}
          changeType={positions.length >= settings.max_positions ? "negative" : "positive"} />
        <MetricCard label="Exposure" value={`${expPct.toFixed(0)}%`} icon={Shield}
          changeType={expPct > 100 ? "negative" : "positive"} />
        <MetricCard label="Win Rate" value={journalStats.totalTrades > 0 ? `${winRate.toFixed(0)}%` : "—"} icon={Target}
          change={`${journalStats.totalTrades} trades`} changeType={winRate >= 50 ? "positive" : "negative"} />
        <MetricCard label="Total PnL" value={`${journalStats.totalPnl >= 0 ? '+' : ''}${formatCurrency(journalStats.totalPnl)}`} icon={TrendingUp}
          changeType={journalStats.totalPnl >= 0 ? "positive" : "negative"} />
        <MetricCard label="Avg R" value={journalStats.avgR !== 0 ? `${journalStats.avgR >= 0 ? '+' : ''}${journalStats.avgR.toFixed(2)}R` : "—"} icon={Target}
          changeType={journalStats.avgR >= 0 ? "positive" : "negative"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Open Positions Summary */}
        <div className="terminal-border rounded-lg p-4">
          <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-primary" /> Open Positions
          </h2>
          {positions.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No open positions</p>
          ) : (
            <div className="space-y-2">
              {positions.map((p, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-foreground">{p.symbol}</span>
                    <StatusBadge variant={p.direction === "long" ? "profit" : "loss"}>
                      {p.direction.toUpperCase()}
                    </StatusBadge>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-mono">
                    <span className="text-muted-foreground">{formatCurrency(p.avg_entry)}</span>
                    {p.stop_loss ? (
                      <span className="text-loss">SL {formatCurrency(p.stop_loss)}</span>
                    ) : (
                      <span className="text-loss/50">No SL</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Opportunities */}
        <div className="terminal-border rounded-lg p-4">
          <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <Zap className="h-4 w-4 text-terminal-gold" /> Top Opportunities
          </h2>
          {topOpps.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No scores computed. Run Data Intelligence.</p>
          ) : (
            <div className="space-y-2">
              {topOpps.map((o, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className={cn("text-lg font-mono font-bold",
                      o.total_score >= 65 ? "text-profit" : o.total_score >= 45 ? "text-primary" : "text-terminal-gold"
                    )}>{o.total_score.toFixed(0)}</span>
                    <div>
                      <span className="text-xs font-mono font-bold text-foreground">{o.symbol}</span>
                      <div className="text-[10px] text-muted-foreground font-mono">{o.strategy_family || "—"}</div>
                    </div>
                  </div>
                  <StatusBadge variant={o.direction === "long" ? "profit" : o.direction === "short" ? "loss" : "info"}>
                    {(o.direction || "neutral").toUpperCase()}
                  </StatusBadge>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pending Signals */}
        <div className="terminal-border rounded-lg p-4">
          <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" /> Pending Signals
          </h2>
          {signals.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No pending signals. Run AI Agents.</p>
          ) : (
            <div className="space-y-2">
              {signals.map((s, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-foreground">{s.symbol}</span>
                    <StatusBadge variant={s.direction === "long" ? "profit" : "loss"}>
                      {s.direction.toUpperCase()}
                    </StatusBadge>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.opportunity_score != null && (
                      <span className={cn("text-[10px] font-mono font-bold px-1.5 py-0.5 rounded",
                        s.opportunity_score >= 65 ? "bg-profit/10 text-profit" : "bg-primary/10 text-primary"
                      )}>{s.opportunity_score.toFixed(0)}</span>
                    )}
                    <span className="text-[10px] font-mono text-muted-foreground">{s.confidence}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* System Status */}
      <div className="terminal-border rounded-lg p-4">
        <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
          <LayoutGrid className="h-4 w-4 text-primary" /> System Status
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {[
            { label: "Market Data", status: (marketAssets?.length || 0) > 0, detail: `${marketAssets?.length || 0} assets` },
            { label: "Indicators", status: topOpps.length > 0, detail: topOpps.length > 0 ? "Computed" : "Pending" },
            { label: "Scores", status: topOpps.length > 0, detail: `${topOpps.length} scored` },
            { label: "Positions", status: true, detail: `${positions.length} open` },
            { label: "Signals", status: true, detail: `${signals.length} pending` },
            { label: "Journal", status: true, detail: `${journalStats.totalTrades} entries` },
          ].map((sys, i) => (
            <div key={i} className="flex items-center gap-2 bg-accent/30 rounded-md px-3 py-2">
              <div className={cn("h-2 w-2 rounded-full", sys.status ? "bg-profit animate-pulse" : "bg-loss")} />
              <div>
                <div className="text-[10px] font-mono text-muted-foreground">{sys.label}</div>
                <div className="text-xs font-mono text-foreground font-medium">{sys.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
