import { useState, useEffect, useMemo } from "react";
import { Zap, Target, BarChart3, Shield, Loader2, CheckCircle, XCircle, Clock, Play, TrendingUp, TrendingDown, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/mockData";
import MetricCard from "@/components/shared/MetricCard";
import StatusBadge from "@/components/shared/StatusBadge";
import SignalDetailPanel from "@/components/signals/SignalDetailPanel";
import { useSignals, useGenerateSignals, type Signal } from "@/hooks/useSignalEngine";
import { toast } from "sonner";

export default function SignalCenter() {
  const { user } = useAuth();
  const [selected, setSelected] = useState<Signal | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dirFilter, setDirFilter] = useState<string>("all");

  const { data: signals = [], isLoading: loading, refetch } = useSignals();
  const generateMutation = useGenerateSignals();

  // Realtime subscription
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("signal-center-v2")
      .on("postgres_changes", { event: "*", schema: "public", table: "signals", filter: `user_id=eq.${user.id}` }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, refetch]);

  const filtered = useMemo(() => {
    return signals.filter((s: Signal) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (dirFilter !== "all" && s.direction !== dirFilter) return false;
      return true;
    });
  }, [signals, statusFilter, dirFilter]);

  const activeCount = signals.filter((s: Signal) => s.status === "active").length;
  const avgScore = signals.length > 0 ? signals.reduce((sum: number, s: Signal) => sum + s.opportunity_score, 0) / signals.length : 0;
  const avgConfidence = signals.length > 0 ? signals.reduce((sum: number, s: Signal) => sum + s.confidence_score, 0) / signals.length : 0;
  const avgR = signals.filter((s: Signal) => s.expected_r_multiple > 0).length > 0
    ? signals.filter((s: Signal) => s.expected_r_multiple > 0).reduce((sum: number, s: Signal) => sum + s.expected_r_multiple, 0) / signals.filter((s: Signal) => s.expected_r_multiple > 0).length : 0;

  const handleGenerate = async () => {
    try {
      const result = await generateMutation.mutateAsync({});
      toast.success(`Generated ${result.count} signals (${result.rejected} rejected)`);
    } catch (err) {
      toast.error(`Error: ${(err as Error).message}`);
    }
  };

  const [sending, setSending] = useState(false);

  const handleSendAllToTradeIdeas = async () => {
    if (!user) return;
    const activeSignals = signals.filter((s: Signal) => s.status === "active");
    if (activeSignals.length === 0) {
      toast.warning("No hay señales activas para enviar");
      return;
    }

    setSending(true);
    let sent = 0;
    let skipped = 0;

    for (const sig of activeSignals) {
      // Check if already exists in trade_signals
      const { data: existing } = await supabase
        .from("trade_signals")
        .select("id")
        .eq("user_id", user.id)
        .eq("symbol", sig.asset)
        .eq("direction", sig.direction)
        .eq("status", "pending")
        .maybeSingle();

      if (existing) {
        skipped++;
        continue;
      }

      const targets = Array.isArray(sig.targets) ? sig.targets : [];
      const tp = targets.length > 0 ? targets[targets.length - 1] : sig.entry_price * (sig.direction === "long" ? 1.05 : 0.95);

      const { error } = await supabase.from("trade_signals").insert({
        user_id: user.id,
        symbol: sig.asset,
        name: `${sig.asset} ${sig.direction.toUpperCase()} — ${sig.strategy_family}`,
        asset_type: sig.asset_class,
        direction: sig.direction,
        entry_price: sig.entry_price,
        stop_loss: sig.stop_loss,
        take_profit: tp,
        risk_reward: sig.expected_r_multiple,
        confidence: Math.round(sig.confidence_score),
        strategy: sig.strategy_family || "signal-engine",
        strategy_family: sig.strategy_family,
        market_regime: sig.market_regime,
        opportunity_score: sig.opportunity_score,
        score_breakdown: sig.score_breakdown || {},
        reasoning: sig.reasoning || sig.explanation?.summary || null,
        status: "pending",
      });

      if (!error) sent++;
    }

    setSending(false);
    if (sent > 0) toast.success(`${sent} señales enviadas a Trade Ideas${skipped > 0 ? ` (${skipped} duplicadas omitidas)` : ""}`);
    else if (skipped > 0) toast.info(`${skipped} señales ya existen en Trade Ideas`);
    else toast.error("No se pudieron enviar las señales");
  };

  if (loading) return <div className="p-6 flex items-center justify-center min-h-[400px]"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="p-6 space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Zap className="h-6 w-6 text-primary" /> Signal Engine
          </h1>
          <p className="text-sm text-muted-foreground font-mono">Quantitative signal generation • Adaptive scoring • Explainable AI</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSendAllToTradeIdeas}
            disabled={sending || signals.filter((s: Signal) => s.status === "active").length === 0}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-sm font-medium transition-all border",
              "border-primary/30 text-primary hover:bg-primary/10 disabled:opacity-50"
            )}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send All to Trade Ideas
          </button>
          <button
            onClick={handleGenerate}
            disabled={generateMutation.isPending}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-sm font-medium transition-all",
              "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            )}
          >
            {generateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Generate Signals
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {["all", "active", "invalidated", "closed"].map(s => (
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
                  <th className="text-left p-3">Asset</th>
                  <th className="text-center p-3">Dir</th>
                  <th className="text-right p-3">Entry</th>
                  <th className="text-right p-3">SL</th>
                  <th className="text-center p-3">Targets</th>
                  <th className="text-center p-3">R:R</th>
                  <th className="text-center p-3">Score</th>
                  <th className="text-center p-3">Conf</th>
                  <th className="text-center p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s: Signal) => (
                  <tr key={s.id} onClick={() => setSelected(s)}
                    className={cn("border-b border-border/50 cursor-pointer transition-colors",
                      selected?.id === s.id ? "bg-primary/10" : "hover:bg-accent/30"
                    )}>
                    <td className="p-3">
                      <div className="font-mono font-bold text-foreground">{s.asset}</div>
                      <div className="text-[10px] text-muted-foreground capitalize">{s.strategy_family} • {s.market_regime}</div>
                    </td>
                    <td className="text-center p-3">
                      {s.direction === "long"
                        ? <span className="text-profit text-xs font-bold flex items-center justify-center gap-0.5"><TrendingUp className="h-3 w-3" />LONG</span>
                        : <span className="text-loss text-xs font-bold flex items-center justify-center gap-0.5"><TrendingDown className="h-3 w-3" />SHORT</span>
                      }
                    </td>
                    <td className="text-right p-3 font-mono text-foreground">${s.entry_price.toFixed(2)}</td>
                    <td className="text-right p-3 font-mono text-loss">${s.stop_loss.toFixed(2)}</td>
                    <td className="text-center p-3 font-mono text-xs text-profit">{s.targets?.length || 0} TPs</td>
                    <td className="text-center p-3">
                      <span className={cn("font-mono font-bold text-xs", s.expected_r_multiple >= 2 ? "text-profit" : s.expected_r_multiple >= 1.5 ? "text-primary" : "text-loss")}>
                        {s.expected_r_multiple.toFixed(1)}:1
                      </span>
                    </td>
                    <td className="text-center p-3">
                      <span className={cn("font-mono font-bold", s.opportunity_score >= 75 ? "text-profit" : s.opportunity_score >= 60 ? "text-primary" : "text-loss")}>
                        {s.opportunity_score.toFixed(0)}
                      </span>
                    </td>
                    <td className="text-center p-3">
                      <span className={cn("font-mono text-xs", s.confidence_score >= 70 ? "text-profit" : s.confidence_score >= 50 ? "text-primary" : "text-loss")}>
                        {s.confidence_score.toFixed(0)}%
                      </span>
                    </td>
                    <td className="text-center p-3">
                      <StatusBadge variant={s.status === "active" ? "info" : s.status === "closed" ? "profit" : "loss"} dot>
                        {s.status.toUpperCase()}
                      </StatusBadge>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">
                    {signals.length === 0
                      ? "No signals yet. Click 'Generate Signals' to run the engine."
                      : "No signals match the current filters"}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detail Panel */}
        <div className="terminal-border rounded-lg p-4 max-h-[700px] overflow-y-auto">
          <SignalDetailPanel signal={selected} onSignalSent={() => { refetch(); setSelected(null); }} />
        </div>
      </div>
    </div>
  );
}
