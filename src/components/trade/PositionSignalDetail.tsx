import { useState, useEffect } from "react";
import { X, Lightbulb, Target, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/i18n";
import { formatCurrency } from "@/lib/utils";
import StatusBadge from "@/components/shared/StatusBadge";
import { cn } from "@/lib/utils";

interface Props {
  signalId: string;
  onClose: () => void;
}

interface TradeSignal {
  id: string;
  symbol: string;
  name: string;
  direction: string;
  strategy: string;
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  risk_reward: number;
  confidence: number;
  status: string;
  reasoning: string | null;
  agent_analysis: string | null;
  created_at: string;
}

export default function PositionSignalDetail({ signalId, onClose }: Props) {
  const [signal, setSignal] = useState<TradeSignal | null>(null);
  const [loading, setLoading] = useState(true);
  const { t } = useI18n();

  useEffect(() => {
    supabase
      .from('signals')
      .select('*')
      .eq('id', signalId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          // Map signals table fields to TradeSignal interface
          const mapped: TradeSignal = {
            id: data.id,
            symbol: data.asset,
            name: data.strategy_family || data.asset,
            direction: data.direction,
            strategy: data.strategy_family || 'hybrid',
            entry_price: data.entry_price,
            stop_loss: data.stop_loss,
            take_profit: Array.isArray(data.targets) && data.targets.length > 0 ? Number(data.targets[0]) : data.entry_price,
            risk_reward: data.expected_r_multiple,
            confidence: data.confidence_score,
            status: data.status,
            reasoning: data.reasoning,
            agent_analysis: null,
            created_at: data.created_at,
          };
          setSignal(mapped);
        } else {
          setSignal(null);
        }
        setLoading(false);
      });
  }, [signalId]);

  if (loading) return null;
  if (!signal) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-lg p-6 w-full max-w-sm text-center" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm text-muted-foreground">{t.signalDetail.signalNotFound}</p>
        <button onClick={onClose} className="mt-3 text-xs text-primary hover:underline">{t.common.close}</button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-lg p-6 w-full max-w-md space-y-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold text-foreground">{t.signalDetail.originalTradeIdea}</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono text-lg font-bold text-foreground">{signal.symbol}</span>
          <StatusBadge variant={signal.direction === 'long' ? 'profit' : 'loss'}>
            {signal.direction === 'long' ? t.common.long : t.common.short}
          </StatusBadge>
          <StatusBadge variant={
            signal.status === 'approved' ? 'profit' :
            signal.status === 'rejected' ? 'loss' : 'warning'
          }>
            {signal.status.toUpperCase()}
          </StatusBadge>
        </div>

        <div className="rounded-md bg-accent/50 p-3 space-y-2 text-xs font-mono">
          {[
            [t.common.entry, formatCurrency(signal.entry_price), ''],
            [t.common.stopLoss, formatCurrency(signal.stop_loss), 'text-loss'],
            [t.common.takeProfit, formatCurrency(signal.take_profit), 'text-profit'],
            [t.tradeIdeas.rrRatio, signal.risk_reward.toFixed(2), ''],
            [t.common.confidence, `${signal.confidence}%`, signal.confidence > 70 ? 'text-profit' : ''],
            [t.common.strategy, signal.strategy, 'text-primary'],
          ].map(([label, value, color]) => (
            <div key={label as string} className="flex justify-between">
              <span className="text-muted-foreground">{label}</span>
              <span className={cn("text-foreground", color)}>{value}</span>
            </div>
          ))}
        </div>

        {signal.reasoning && (
          <div>
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
              <Target className="h-3 w-3" /> {t.signalDetail.reasoning}
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">{signal.reasoning}</p>
          </div>
        )}

        {signal.agent_analysis && (
          <div>
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
              <Shield className="h-3 w-3" /> {t.signalDetail.agentAnalysis}
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">{signal.agent_analysis}</p>
          </div>
        )}

        <div className="text-[10px] font-mono text-muted-foreground">
          {t.signalDetail.created}: {new Date(signal.created_at).toLocaleString()}
        </div>
      </div>
    </div>
  );
}