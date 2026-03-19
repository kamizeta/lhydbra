import { useState, useEffect } from "react";
import { Lightbulb, Check, X, ArrowRight, Target, Shield, TrendingUp, Trash2, Loader2 } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/mockData";
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
  symbol: string;
  name: string;
  asset_type: string;
  direction: string;
  strategy: string;
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  risk_reward: number;
  position_size: number | null;
  risk_percent: number | null;
  confidence: number;
  status: string;
  reasoning: string | null;
  agent_analysis: string | null;
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
      .from('trade_signals')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setSignals(data as TradeSignal[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadSignals();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('trade_signals_changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'trade_signals',
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

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase
      .from('trade_signals')
      .update({ status })
      .eq('id', id);

    if (!error) {
      setSignals(prev => prev.map(s => s.id === id ? { ...s, status } : s));
    }
  };

  const deleteSignal = async (id: string) => {
    const { error } = await supabase
      .from('trade_signals')
      .delete()
      .eq('id', id);

    if (!error) {
      setSignals(prev => prev.filter(s => s.id !== id));
      if (selectedSignal?.id === id) setSelectedSignal(null);
      toast.success('Trade signal deleted');
    }
  };

  const handlePositionCreated = async (signalId: string) => {
    await updateStatus(signalId, 'approved');
    setApproveSignal(null);
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t.tradeIdeas.title}</h1>
        <p className="text-sm text-muted-foreground font-mono">{t.tradeIdeas.subtitle}</p>
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
          <h3 className="text-sm font-medium text-muted-foreground">No hay ideas de trade</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
            Ejecuta los agentes de AI para generar ideas de trade automáticamente.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Ideas List */}
          <div className="lg:col-span-2 space-y-3">
            {signals.map(signal => {
              const isApproved = signal.status === 'approved';
              const isRejected = signal.status === 'rejected';
              return (
              <div
                key={signal.id}
                className={cn(
                  "terminal-border rounded-lg p-4 cursor-pointer transition-all relative overflow-hidden",
                  selectedSignal?.id === signal.id && "ring-1 ring-primary glow-primary",
                  isApproved && "border-profit/40",
                  isRejected && "border-loss/40",
                )}
                onClick={() => setSelectedSignal(signal)}
              >
                {/* Status indicator bar */}
                {(isApproved || isRejected) && (
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
                        <span className="font-mono font-bold text-foreground">{signal.symbol}</span>
                        <StatusBadge variant={signal.direction === 'long' ? 'profit' : 'loss'}>
                          {signal.direction.toUpperCase()}
                        </StatusBadge>
                        <StatusBadge variant={
                          signal.status === 'pending' ? 'warning' :
                          signal.status === 'approved' ? 'profit' :
                          signal.status === 'rejected' ? 'loss' : 'neutral'
                        } dot>
                          {signal.status.toUpperCase()}
                        </StatusBadge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{signal.name} • {signal.strategy}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    <div className="hidden md:block">
                      <div className="text-xs text-muted-foreground">R/R</div>
                      <div className="font-mono font-bold text-foreground">{formatNumber(signal.risk_reward)}</div>
                    </div>
                    <div className="hidden md:block">
                      <div className="text-xs text-muted-foreground">{t.common.confidence}</div>
                      <div className={cn("font-mono font-bold", signal.confidence > 75 ? "text-profit" : signal.confidence > 60 ? "text-warning" : "text-muted-foreground")}>
                        {signal.confidence}%
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {signal.status === 'pending' && (
                        <>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleApprove(signal); }}
                            className="rounded-md bg-profit/15 p-2 text-profit hover:bg-profit/25 transition-colors"
                            title="Aprobar y abrir posición"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); updateStatus(signal.id, 'rejected'); }}
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

                <div className="flex gap-4 mt-3 text-xs font-mono">
                  <span className="text-muted-foreground">{t.common.entry}: <span className="text-foreground">{formatCurrency(signal.entry_price)}</span></span>
                  <span className="text-muted-foreground">SL: <span className="text-loss">{formatCurrency(signal.stop_loss)}</span></span>
                  <span className="text-muted-foreground">TP: <span className="text-profit">{formatCurrency(signal.take_profit)}</span></span>
                  {signal.position_size && <span className="text-muted-foreground">{t.common.size}: <span className="text-foreground">{signal.position_size}</span></span>}
                  {signal.risk_percent && <span className="text-muted-foreground">{t.common.risk}: <span className="text-warning">{signal.risk_percent}%</span></span>}
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
                    <span className="font-mono text-lg font-bold text-foreground">{selectedSignal.symbol}</span>
                    <StatusBadge variant={selectedSignal.direction === 'long' ? 'profit' : 'loss'}>
                      {selectedSignal.direction.toUpperCase()}
                    </StatusBadge>
                  </div>

                  <div className="rounded-md bg-accent/50 p-3 space-y-2">
                    {[
                      [t.common.entry, formatCurrency(selectedSignal.entry_price), ''],
                      [t.common.stopLoss, formatCurrency(selectedSignal.stop_loss), 'text-loss'],
                      [t.common.takeProfit, formatCurrency(selectedSignal.take_profit), 'text-profit'],
                      [t.tradeIdeas.rrRatio, formatNumber(selectedSignal.risk_reward), ''],
                      ...(selectedSignal.position_size ? [[t.common.size, `${selectedSignal.position_size}`, '']] : []),
                      ...(selectedSignal.risk_percent ? [[t.common.risk, `${selectedSignal.risk_percent}%`, 'text-warning']] : []),
                      [t.common.confidence, `${selectedSignal.confidence}%`, selectedSignal.confidence > 70 ? 'text-profit' : ''],
                      [t.common.strategy, selectedSignal.strategy, 'text-primary'],
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

                  {selectedSignal.agent_analysis && (
                    <div>
                      <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
                        <Shield className="h-3 w-3" /> {t.tradeIdeas.agentAnalysis}
                      </h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">{selectedSignal.agent_analysis}</p>
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
          signal={approveSignal}
          onClose={() => setApproveSignal(null)}
          onConfirm={handlePositionCreated}
        />
      )}
    </div>
  );
}
