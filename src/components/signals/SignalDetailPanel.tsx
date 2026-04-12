import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Signal } from "@/hooks/useSignalEngine";
import { useInvalidateSignal } from "@/hooks/useSignalEngine";
import StatusBadge from "@/components/shared/StatusBadge";
import { Zap, Target, TrendingUp, TrendingDown, Info, Send, XCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface Props {
  signal: Signal | null;
  onSignalSent?: () => void;
}

export default function SignalDetailPanel({ signal, onSignalSent }: Props) {
  const { user } = useAuth();
  const invalidateMutation = useInvalidateSignal();
  const [sending, setSending] = useState(false);
  if (!signal) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-12 text-center">
        <Zap className="h-10 w-10 text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">Select a signal to see details</p>
      </div>
    );
  }

  const explanation = signal.explanation;
  const modifiers = signal.modifiers_applied;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground font-mono">{signal.asset}</h2>
        <div className="flex gap-2">
          <StatusBadge variant={signal.direction === "long" ? "profit" : "loss"}>
            {signal.direction === "long" ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
            {signal.direction.toUpperCase()}
          </StatusBadge>
          <StatusBadge variant={signal.status === "active" ? "info" : signal.status === "invalidated" ? "loss" : "neutral"} dot>
            {signal.status.toUpperCase()}
          </StatusBadge>
        </div>
      </div>

      {/* Scores */}
      <div className="grid grid-cols-2 gap-3">
        <div className="terminal-border rounded-lg p-3 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Opportunity Score</p>
          <p className={cn("text-2xl font-mono font-bold", signal.opportunity_score >= 75 ? "text-profit" : signal.opportunity_score >= 60 ? "text-primary" : "text-loss")}>
            {signal.opportunity_score.toFixed(1)}
          </p>
        </div>
        <div className="terminal-border rounded-lg p-3 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Confidence</p>
          <p className={cn("text-2xl font-mono font-bold", signal.confidence_score >= 70 ? "text-profit" : signal.confidence_score >= 50 ? "text-primary" : "text-loss")}>
            {signal.confidence_score.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Trade Setup */}
      <div className="space-y-1.5">
        <h3 className="text-xs font-bold text-muted-foreground uppercase">Trade Setup</h3>
        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
          <div className="flex justify-between"><span className="text-muted-foreground">Entry</span><span className="text-foreground">${signal.entry_price.toFixed(2)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Stop Loss</span><span className="text-loss">${signal.stop_loss.toFixed(2)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Expected R</span><span className="text-primary">{signal.expected_r_multiple.toFixed(2)}:1</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Regime</span><span className="capitalize">{signal.market_regime}</span></div>
        </div>
        {signal.targets && signal.targets.length > 0 && (
          <div className="space-y-1 pt-1">
            <span className="text-[10px] text-muted-foreground uppercase">Targets</span>
            <div className="flex gap-2">
              {signal.targets.map((t: number, i: number) => (
                <span key={i} className="px-2 py-1 rounded bg-profit/10 text-profit text-xs font-mono border border-profit/20">
                  <Target className="h-3 w-3 inline mr-1" />TP{i + 1}: ${t.toFixed(2)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Score Breakdown */}
      {signal.score_breakdown && Object.keys(signal.score_breakdown).length > 0 && (
        <div className="space-y-2 pt-2 border-t border-border">
          <h3 className="text-xs font-bold text-muted-foreground uppercase">Score Breakdown</h3>
          {Object.entries(signal.score_breakdown)
            .sort(([, a], [, b]) => Number(b) - Number(a))
            .map(([key, val]) => {
              const weight = signal.weight_profile_used?.[key];
              return (
                <div key={key} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground font-mono capitalize">{key.replace(/_/g, " ")}</span>
                    <div className="flex items-center gap-2">
                      {weight !== undefined && <span className="text-muted-foreground/60 text-[10px]">{(Number(weight) * 100).toFixed(0)}%w</span>}
                      <span className={cn("font-mono font-bold", Number(val) >= 65 ? "text-profit" : Number(val) >= 45 ? "text-primary" : "text-loss")}>
                        {Number(val).toFixed(0)}
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-accent rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all", Number(val) >= 65 ? "bg-profit" : Number(val) >= 45 ? "bg-primary" : "bg-loss")}
                      style={{ width: `${Math.min(100, Number(val))}%` }}
                    />
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {/* Modifiers */}
      {modifiers && (
        <div className="pt-2 border-t border-border space-y-1.5">
          <h3 className="text-xs font-bold text-muted-foreground uppercase">Applied Modifiers</h3>
          {Object.entries(modifiers).map(([key, val]) => (
            <div key={key} className="flex items-center justify-between text-xs font-mono">
              <span className="text-muted-foreground capitalize">{key}</span>
              <span className={cn("font-bold", Number(val) > 0 ? "text-profit" : Number(val) < 0 ? "text-loss" : "text-muted-foreground")}>
                {Number(val) > 0 ? "+" : ""}{Number(val).toFixed(1)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Explainability */}
      {explanation && (
        <div className="pt-2 border-t border-border space-y-2">
          <h3 className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1">
            <Info className="h-3 w-3" /> Why This Score
          </h3>
          {explanation.top_contributors && (
            <div className="space-y-1">
              <span className="text-[10px] text-muted-foreground">Top Contributors</span>
              {explanation.top_contributors.map((c, i) => (
                <div key={i} className="flex justify-between text-xs font-mono">
                  <span className="text-foreground/80 capitalize">{c.factor.replace(/_/g, " ")}</span>
                  <span className="text-profit font-bold">{c.score}</span>
                </div>
              ))}
            </div>
          )}
          {explanation.summary && (
            <p className="text-xs text-foreground/70 leading-relaxed">{explanation.summary}</p>
          )}
        </div>
      )}

      {/* Strategy & Meta */}
      <div className="pt-2 border-t border-border grid grid-cols-2 gap-2 text-xs font-mono">
        <div className="flex justify-between"><span className="text-muted-foreground">Strategy</span><span className="capitalize">{signal.strategy_family}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Asset Class</span><span className="capitalize">{signal.asset_class}</span></div>
      </div>

      <div className="text-[10px] text-muted-foreground font-mono">
        Created: {new Date(signal.created_at).toLocaleString()}
      </div>

      {/* Actions */}
      {signal.status === "active" && (
        <div className="pt-3 border-t border-border space-y-2">
          <button
            disabled={sending}
            onClick={async () => {
              if (!user) return;
              setSending(true);
              try {
                // Update this signal's status to 'pending' so Trade Ideas picks it up
                const { error } = await supabase.from("signals")
                  .update({ status: "pending", updated_at: new Date().toISOString() } as Record<string, unknown>)
                  .eq("id", signal.id);
                if (error) throw error;

                toast.success(`Señal enviada a Trade Ideas: ${signal.asset}`);
                onSignalSent?.();
              } catch (err) {
                toast.error(`Error: ${(err as Error).message}`);
              } finally {
                setSending(false);
              }
            }}
            className={cn(
              "w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-mono font-medium transition-all",
              "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            )}
          >
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Enviar a Trade Ideas
          </button>
          <button
            onClick={() => {
              invalidateMutation.mutate({ signalId: signal.id, reason: "Manual invalidation" });
              toast.info("Señal invalidada");
            }}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-mono font-medium transition-all bg-loss/10 text-loss hover:bg-loss/20 border border-loss/20"
          >
            <XCircle className="h-3.5 w-3.5" /> Invalidar Señal
          </button>
        </div>
      )}
    </div>
  );
}
