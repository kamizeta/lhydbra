import { useState, useEffect, useMemo } from "react";
import { Zap, TrendingUp, TrendingDown, Minus, Filter, Target, BarChart3, Shield, Loader2, CheckCircle, XCircle, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { formatCurrency, formatNumber } from "@/lib/mockData";
import MetricCard from "@/components/shared/MetricCard";
import StatusBadge from "@/components/shared/StatusBadge";

interface Signal {
  id: string;
  symbol: string;
  name: string;
  direction: string;
  strategy: string;
  strategy_family: string | null;
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  risk_reward: number;
  confidence: number;
  opportunity_score: number | null;
  market_regime: string | null;
  status: string;
  reasoning: string | null;
  score_breakdown: Record<string, number> | null;
  created_at: string;
}

const STATUS_MAP: Record<string, { color: string; icon: typeof CheckCircle }> = {
  pending: { color: "text-primary", icon: Clock },
  approved: { color: "text-profit", icon: CheckCircle },
  rejected: { color: "text-loss", icon: XCircle },
  expired: { color: "text-muted-foreground", icon: XCircle },
};

export default function SignalCenter() {
  const { user } = useAuth();
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Signal | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dirFilter, setDirFilter] = useState<string>("all");

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const { data } = await supabase
        .from("trade_signals")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (data) setSignals(data as unknown as Signal[]);
      setLoading(false);
    };
    fetch();

    const channel = supabase
      .channel("signal-center")
      .on("postgres_changes", { event: "*", schema: "public", table: "trade_signals", filter: `user_id=eq.${user.id}` }, () => fetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const filtered = useMemo(() => {
    return signals.filter(s => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (dirFilter !== "all" && s.direction !== dirFilter) return false;
      return true;
    });
  }, [signals, statusFilter, dirFilter]);

  const pendingCount = signals.filter(s => s.status === "pending").length;
  const approvedCount = signals.filter(s => s.status === "approved").length;
  const avgConfidence = signals.length > 0 ? signals.reduce((s, sg) => s + sg.confidence, 0) / signals.length : 0;
  const avgScore = signals.filter(s => s.opportunity_score).length > 0
    ? signals.filter(s => s.opportunity_score).reduce((s, sg) => s + (sg.opportunity_score || 0), 0) / signals.filter(s => s.opportunity_score).length : 0;

  if (loading) return <div className="p-6 flex items-center justify-center min-h-[400px]"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="p-6 space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Zap className="h-6 w-6 text-primary" /> Signal Center
        </h1>
        <p className="text-sm text-muted-foreground font-mono">Structured trade signals • Scoring breakdown • Risk validation</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard label="Pending Signals" value={`${pendingCount}`} icon={Clock} />
        <MetricCard label="Approved" value={`${approvedCount}`} icon={CheckCircle} changeType="positive" />
        <MetricCard label="Avg Confidence" value={`${formatNumber(avgConfidence)}%`} icon={Target} changeType={avgConfidence >= 60 ? "positive" : "negative"} />
        <MetricCard label="Avg Opp. Score" value={`${formatNumber(avgScore)}`} icon={BarChart3} changeType={avgScore >= 55 ? "positive" : "negative"} />
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {["all", "pending", "approved", "rejected", "expired"].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={cn("px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-colors border",
              statusFilter === s ? "bg-primary/20 text-primary border-primary/30" : "bg-accent/50 text-muted-foreground border-border hover:border-primary/30"
            )}>{s === "all" ? "All Status" : s.charAt(0).toUpperCase() + s.slice(1)}</button>
        ))}
        <div className="w-px bg-border mx-1" />
        {["all", "long", "short"].map(d => (
          <button key={d} onClick={() => setDirFilter(d)}
            className={cn("px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-colors border",
              dirFilter === d ? "bg-primary/20 text-primary border-primary/30" : "bg-accent/50 text-muted-foreground border-border hover:border-primary/30"
            )}>{d === "all" ? "All Dir" : d === "long" ? "↑ LONG" : "↓ SHORT"}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Signal List */}
        <div className="lg:col-span-2 terminal-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="text-left p-3">Symbol</th>
                  <th className="text-center p-3">Dir</th>
                  <th className="text-right p-3">Entry</th>
                  <th className="text-right p-3">SL</th>
                  <th className="text-right p-3">TP</th>
                  <th className="text-center p-3">R:R</th>
                  <th className="text-center p-3">Score</th>
                  <th className="text-center p-3">Conf</th>
                  <th className="text-center p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => {
                  const stInfo = STATUS_MAP[s.status] || STATUS_MAP.pending;
                  return (
                    <tr key={s.id} onClick={() => setSelected(s)}
                      className={cn("border-b border-border/50 cursor-pointer transition-colors",
                        selected?.id === s.id ? "bg-primary/10" : "hover:bg-accent/30"
                      )}>
                      <td className="p-3">
                        <div className="font-mono font-bold text-foreground">{s.symbol}</div>
                        <div className="text-[10px] text-muted-foreground">{s.strategy_family || s.strategy}</div>
                      </td>
                      <td className="text-center p-3">
                        {s.direction === "long" ? <span className="text-profit text-xs font-bold">↑ LONG</span>
                          : <span className="text-loss text-xs font-bold">↓ SHORT</span>}
                      </td>
                      <td className="text-right p-3 font-mono text-foreground">{formatCurrency(s.entry_price)}</td>
                      <td className="text-right p-3 font-mono text-loss">{formatCurrency(s.stop_loss)}</td>
                      <td className="text-right p-3 font-mono text-profit">{formatCurrency(s.take_profit)}</td>
                      <td className="text-center p-3">
                        <span className={cn("font-mono font-bold text-xs", s.risk_reward >= 2 ? "text-profit" : s.risk_reward >= 1 ? "text-primary" : "text-loss")}>
                          {s.risk_reward.toFixed(1)}:1
                        </span>
                      </td>
                      <td className="text-center p-3">
                        <span className={cn("font-mono font-bold", (s.opportunity_score || 0) >= 65 ? "text-profit" : (s.opportunity_score || 0) >= 45 ? "text-primary" : "text-loss")}>
                          {s.opportunity_score?.toFixed(0) || "—"}
                        </span>
                      </td>
                      <td className="text-center p-3">
                        <span className={cn("font-mono text-xs", s.confidence >= 70 ? "text-profit" : s.confidence >= 50 ? "text-primary" : "text-loss")}>
                          {s.confidence}%
                        </span>
                      </td>
                      <td className="text-center p-3">
                        <StatusBadge variant={s.status === "approved" ? "profit" : s.status === "pending" ? "info" : "loss"} dot>
                          {s.status.toUpperCase()}
                        </StatusBadge>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">No signals match the current filters</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detail Panel */}
        <div className="terminal-border rounded-lg p-4 space-y-4">
          {selected ? (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-foreground font-mono">{selected.symbol}</h2>
                <StatusBadge variant={selected.direction === "long" ? "profit" : "loss"}>
                  {selected.direction.toUpperCase()}
                </StatusBadge>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="flex justify-between"><span className="text-muted-foreground">Entry</span><span className="text-foreground">{formatCurrency(selected.entry_price)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Stop Loss</span><span className="text-loss">{formatCurrency(selected.stop_loss)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Take Profit</span><span className="text-profit">{formatCurrency(selected.take_profit)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">R:R</span><span className="text-primary">{selected.risk_reward.toFixed(2)}:1</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Confidence</span><span>{selected.confidence}%</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Regime</span><span className="capitalize">{selected.market_regime || "—"}</span></div>
              </div>

              {/* Score Breakdown */}
              {selected.score_breakdown && Object.keys(selected.score_breakdown).length > 0 && (
                <div className="space-y-2 pt-2 border-t border-border">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase">Score Breakdown</h3>
                  {Object.entries(selected.score_breakdown).map(([key, val]) => (
                    <div key={key} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground font-mono capitalize">{key.replace(/_/g, ' ')}</span>
                        <span className={cn("font-mono font-bold", Number(val) >= 65 ? "text-profit" : Number(val) >= 45 ? "text-primary" : "text-loss")}>{Number(val).toFixed(0)}</span>
                      </div>
                      <div className="h-1.5 bg-accent rounded-full overflow-hidden">
                        <div className={cn("h-full rounded-full", Number(val) >= 65 ? "bg-profit" : Number(val) >= 45 ? "bg-primary" : "bg-loss")}
                          style={{ width: `${Math.min(100, Number(val))}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Reasoning */}
              {selected.reasoning && (
                <div className="pt-2 border-t border-border">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase mb-1">Reasoning</h3>
                  <p className="text-xs text-foreground/80 leading-relaxed">{selected.reasoning}</p>
                </div>
              )}

              <div className="text-[10px] text-muted-foreground font-mono">
                Created: {new Date(selected.created_at).toLocaleString()}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full py-12 text-center">
              <Zap className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">Select a signal to see details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
