import { useState, useEffect } from "react";
import { Lightbulb, Check, X, ArrowRight, Target, Shield, TrendingUp, Trash2, Loader2 } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/utils";
import StatusBadge from "@/components/shared/StatusBadge";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import ApproveToPositionDialog from "@/components/trade/ApproveToPositionDialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface TradeSignal {
  id: string;
  asset: string;
  asset_class: string;
  direction: string;
  strategy_family: string | null;
  entry_price: number;
  stop_loss: number;
  targets: number[];
  expected_r_multiple: number;
  opportunity_score: number;
  confidence_score: number;
  status: string;
  reasoning: string | null;
  market_regime: string | null;
  created_at: string;
}

export default function TradeIdeas() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [signals, setSignals] = useState<TradeSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSignal, setSelectedSignal] = useState<TradeSignal | null>(null);
  const [approveSignal, setApproveSignal] = useState<TradeSignal | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  const loadSignals = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('signals')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['active'])
      .order('opportunity_score', { ascending: false });

    if (!error && data) {
      setSignals(data as unknown as TradeSignal[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadSignals();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('signals_trade_ideas')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'signals',
        filter: `user_id=eq.${user.id}`,
      }, () => {
        loadSignals();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const handleApprove = (signal: TradeSignal) => {
    setApproveSignal(signal);
  };

  const handleReject = async (signalId: string) => {
    await supabase
      .from('signals')
      .update({
        status: 'rejected',
        invalidation_reason: 'Manually rejected by user',
        updated_at: new Date().toISOString(),
      } as Record<string, unknown>)
      .eq('id', signalId)
      .eq('user_id', user?.id);
    loadSignals();
  };

  const deleteSignal = async (id: string) => {
    const { error } = await supabase
      .from('signals')
      .delete()
      .eq('id', id);

    if (!error) {
      setSignals(prev => prev.filter(s => s.id !== id));
      if (selectedSignal?.id === id) setSelectedSignal(null);
      toast.success('Signal deleted');
    }
  };

  const deleteAllSignals = async () => {
    if (!user) return;
    const { error } = await supabase
      .from('signals')
      .delete()
      .eq('user_id', user.id);
    if (!error) {
      setSignals([]);
      setSelectedSignal(null);
      toast.success('Todas las señales eliminadas');
    }
    setConfirmDeleteAll(false);
  };

  const handlePositionCreated = async (signalId: string) => {
    setApproveSignal(null);
    await supabase
      .from('signals')
      .update({
        status: 'approved',
        updated_at: new Date().toISOString(),
      } as Record<string, unknown>)
      .eq('id', signalId)
      .eq('user_id', user?.id);
    loadSignals();
  };

  const getTakeProfit = (sig: TradeSignal) =>
    sig.targets && sig.targets.length > 0 ? sig.targets[0] : sig.entry_price;

  const getRiskReward = (sig: TradeSignal) => sig.expected_r_multiple || 0;

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t.tradeIdeas.title}</h1>
          <p className="text-sm text-muted-foreground font-mono">{t.tradeIdeas.subtitle}</p>
        </div>
        {signals.length > 0 && (
          <button
            onClick={() => setConfirmDeleteAll(true)}
            className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/20 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Borrar todas
          </button>
        )}
      </div>

      {/* Investment Flow */}
      <div className="terminal-border rounded-lg p-4">
        <h2 className="text-xs font-bold text-foreground uppercase tracking-wider mb-3">{t.tradeIdeas.investmentFlow}</h2>
        <div className="flex items-center gap-1 overflow-x-auto pb-2">
          {t.tradeIdeas.steps.map((step, i) => (
            <div key={step} className="flex items-center gap-1 shrink-0">
              <div className="flex items-center gap-1.5 rounded-md bg-accent/50 border border-border px-3 py-1.5">
                <span className="text-[10px] font-mono text-primary font-bold">{i + 1}</span>
                <span className="text-xs text-muted-foreground">{step}</span>
              </div>
              {i < t.tradeIdeas.steps.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />}
            </div>
          ))}
        </div>
      </div>

      {signals.length === 0 ? (
        <div className="terminal-border rounded-lg p-12 flex flex-col items-center justify-center text-center">
          <Lightbulb className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <h3 className="text-sm font-medium text-muted-foreground">No hay señales</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
            Ejecuta el Signal Engine para generar señales automáticamente.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Ideas List */}
          <div className="lg:col-span-2 space-y-3">
            {signals.map(signal => {
              const isApproved = signal.status === 'approved';
              const isRejected = signal.status === 'rejected';
              const isInvalidated = signal.status === 'invalidated';
              return (
              <div
                key={signal.id}
                className={cn(
                  "terminal-border rounded-lg p-4 cursor-pointer transition-all relative overflow-hidden",
                  selectedSignal?.id === signal.id && "ring-1 ring-primary glow-primary",
                  isApproved && "border-profit/40",
                  (isRejected || isInvalidated) && "border-loss/40",
                )}
                onClick={() => setSelectedSignal(signal)}
              >
                {/* Status indicator bar */}
                {(isApproved || isRejected || isInvalidated) && (
                  <div className={cn(
                    "absolute left-0 top-0 bottom-0 w-1",
                    isApproved ? "bg-profit" : "bg-loss"
                  )} />
                )}

                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn("rounded-md p-2", signal.direction === 'long' ? "bg-profit/15" : "bg-loss/15")}>
                      <TrendingUp className={cn("h-4 w-4", signal.direction === 'long' ? "text-profit" : "text-loss rotate-180")} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-foreground">{signal.asset}</span>
                        <StatusBadge variant={signal.direction === 'long' ? 'profit' : 'loss'}>
                          {signal.direction.toUpperCase()}
                        </StatusBadge>
                        <StatusBadge variant={
                          signal.status === 'active' ? 'warning' :
                          signal.status === 'approved' ? 'profit' :
                          signal.status === 'rejected' || signal.status === 'invalidated' ? 'loss' :
                          signal.status === 'closed' ? 'info' : 'neutral'
                        } dot>
                          {signal.status.toUpperCase()}
                        </StatusBadge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{signal.strategy_family || '—'} • {signal.market_regime || '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    <div className="hidden md:block">
                      <div className="text-xs text-muted-foreground">R:R</div>
                      <div className="font-mono font-bold text-foreground">{formatNumber(getRiskReward(signal))}</div>
                    </div>
                    <div className="hidden md:block">
                      <div className="text-xs text-muted-foreground">{t.common.confidence}</div>
                      <div className={cn("font-mono font-bold", signal.confidence_score > 75 ? "text-profit" : signal.confidence_score > 60 ? "text-warning" : "text-muted-foreground")}>
                        {signal.confidence_score}%
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {signal.status === 'active' && (
                        <>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleApprove(signal); }}
                            className="rounded-md bg-profit/15 p-2 text-profit hover:bg-profit/25 transition-colors"
                            title="Aprobar y abrir posición"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleReject(signal.id); }}
                            className="rounded-md bg-loss/15 p-2 text-loss hover:bg-loss/25 transition-colors"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteSignal(signal.id); }}
                        className="rounded-md bg-muted p-2 text-muted-foreground hover:bg-destructive/15 hover:text-destructive transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-3">
                  <div className="flex gap-4 text-xs font-mono flex-wrap">
                    <span className="text-muted-foreground">{t.common.entry}: <span className="text-foreground">{formatCurrency(signal.entry_price)}</span></span>
                    <span className="text-muted-foreground">SL: <span className="text-loss">{formatCurrency(signal.stop_loss)}</span></span>
                    <span className="text-muted-foreground">TP: <span className="text-profit">{formatCurrency(getTakeProfit(signal))}</span></span>
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground shrink-0 ml-2">
                    {new Date(signal.created_at).toLocaleDateString()} {new Date(signal.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
              );
            })}
          </div>

          {/* Detail panel */}
          <div className="terminal-border rounded-lg p-4">
            {selectedSignal ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-bold text-foreground">{t.tradeIdeas.tradeDetail}</h2>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-lg font-bold text-foreground">{selectedSignal.asset}</span>
                    <StatusBadge variant={selectedSignal.direction === 'long' ? 'profit' : 'loss'}>
                      {selectedSignal.direction.toUpperCase()}
                    </StatusBadge>
                  </div>

                  <div className="rounded-md bg-accent/50 p-3 space-y-2">
                    {[
                      [t.common.entry, formatCurrency(selectedSignal.entry_price), ''],
                      [t.common.stopLoss, formatCurrency(selectedSignal.stop_loss), 'text-loss'],
                      [t.common.takeProfit, formatCurrency(getTakeProfit(selectedSignal)), 'text-profit'],
                      [t.tradeIdeas.rrRatio, formatNumber(getRiskReward(selectedSignal)), ''],
                      [t.common.confidence, `${selectedSignal.confidence_score}%`, selectedSignal.confidence_score > 70 ? 'text-profit' : ''],
                      [t.common.strategy, selectedSignal.strategy_family || '—', 'text-primary'],
                    ].map(([label, value, color]) => (
                      <div key={label as string} className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{label}</span>
                        <span className={cn("font-mono text-foreground", color)}>{value}</span>
                      </div>
                    ))}
                  </div>

                  {selectedSignal.reasoning && (
                    <div>
                      <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
                        <Target className="h-3 w-3" /> {t.tradeIdeas.reasoning}
                      </h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">{selectedSignal.reasoning}</p>
                    </div>
                  )}

                  <div className="text-[10px] font-mono text-muted-foreground">
                    {new Date(selectedSignal.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-48 text-center">
                <Lightbulb className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">{t.tradeIdeas.selectTradeIdea}</p>
                <p className="text-xs text-muted-foreground">{t.tradeIdeas.toSeeDetails}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Approve → Open Position Dialog */}
      {approveSignal && (
        <ApproveToPositionDialog
          signal={{
            ...approveSignal,
            asset_type: approveSignal.asset_class,
            strategy: approveSignal.strategy_family || 'signal-engine',
          }}
          onClose={() => setApproveSignal(null)}
          onConfirm={handlePositionCreated}
        />
      )}
      <AlertDialog open={confirmDeleteAll} onOpenChange={setConfirmDeleteAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.signals.deleteAllTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.signals.deleteAllDesc}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={deleteAllSignals} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t.signals.deleteAllConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
