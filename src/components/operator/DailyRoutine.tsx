import { Clock, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

interface Props {
  phase: 'pre_market' | 'market_open' | 'post_market';
  tradesToday: number;
  maxTrades: number;
  riskUsed: number;
  maxRisk: number;
  cooldownActive: boolean;
  className?: string;
}

export default function DailyRoutine({ phase, tradesToday, maxTrades, riskUsed, maxRisk, cooldownActive, className }: Props) {
  const { t } = useI18n();

  const steps = [
    {
      id: 'pre_market',
      label: t.routine.preMarket,
      desc: t.routine.preMarketDesc,
      status: phase === 'pre_market' ? 'active' : 'completed',
    },
    {
      id: 'market_open',
      label: t.routine.marketOpen,
      desc: `${tradesToday}/${maxTrades} ${t.common.trades} • ${riskUsed.toFixed(1)}%/${maxRisk}% ${t.common.risk.toLowerCase()}`,
      status: phase === 'market_open' ? 'active' : phase === 'post_market' ? 'completed' : 'pending',
    },
    {
      id: 'post_market',
      label: t.routine.postMarket,
      desc: t.routine.postMarketDesc,
      status: phase === 'post_market' ? 'active' : 'pending',
    },
  ];

  return (
    <div className={cn("terminal-border rounded-lg p-4", className)}>
      <h2 className="text-xs font-bold text-foreground flex items-center gap-2 mb-3">
        <Clock className="h-3.5 w-3.5 text-primary" /> {t.routine.title}
      </h2>

      {cooldownActive && (
        <div className="mb-3 bg-loss/10 border border-loss/20 rounded-md p-2 text-[10px] font-mono text-loss flex items-center gap-1.5">
          <AlertCircle className="h-3 w-3 shrink-0" />
          {t.routine.cooldownActive}
        </div>
      )}

      <div className="space-y-2">
        {steps.map((step) => (
          <div key={step.id} className="flex items-start gap-2.5">
            <div className="mt-0.5">
              {step.status === 'completed' ? (
                <CheckCircle className="h-4 w-4 text-profit" />
              ) : step.status === 'active' ? (
                <Loader2 className="h-4 w-4 text-primary animate-spin" />
              ) : (
                <div className="h-4 w-4 rounded-full border border-border" />
              )}
            </div>
            <div className="flex-1">
              <div className={cn(
                "text-xs font-medium",
                step.status === 'completed' ? "text-muted-foreground line-through" :
                step.status === 'active' ? "text-foreground" :
                "text-muted-foreground"
              )}>
                {step.label}
              </div>
              <div className="text-[10px] font-mono text-muted-foreground">{step.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}