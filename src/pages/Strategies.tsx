import { useState } from "react";
import { Brain, Play, Pause, ChevronDown, ChevronUp, Target, Clock, TrendingUp, AlertTriangle } from "lucide-react";
import { mockStrategies, Strategy, formatCurrency, formatNumber } from "@/lib/mockData";
import StatusBadge from "@/components/shared/StatusBadge";
import MetricCard from "@/components/shared/MetricCard";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

export default function Strategies() {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [strategies, setStrategies] = useState(mockStrategies);

  const activeStrategies = strategies.filter(s => s.active);
  const totalCapital = activeStrategies.reduce((s, st) => s + st.capitalAllocated, 0);
  const totalPnl = strategies.reduce((s, st) => s + st.pnl, 0);
  const avgWinRate = strategies.reduce((s, st) => s + st.winRate, 0) / strategies.length;

  const toggleActive = (id: string) => {
    setStrategies(prev => prev.map(s => s.id === id ? { ...s, active: !s.active } : s));
  };

  const riskLabel = (level: string) => {
    if (level === 'high') return t.strategies.highRisk;
    if (level === 'medium') return t.strategies.mediumRisk;
    return t.strategies.lowRisk;
  };

  return (
    <div className="p-6 space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t.strategies.title}</h1>
        <p className="text-sm text-muted-foreground font-mono">{strategies.length} {t.strategies.subtitle} • {activeStrategies.length} {t.common.active.toLowerCase()}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard label={t.strategies.activeStrategies} value={`${activeStrategies.length}`} icon={Brain} subtitle={`${t.strategies.ofTotal} ${strategies.length}`} />
        <MetricCard label={t.strategies.capitalAllocated} value={formatCurrency(totalCapital)} icon={Target} />
        <MetricCard label={t.strategies.totalStrategyPnl} value={`+${formatCurrency(totalPnl)}`} changeType="positive" change={t.strategies.allTime} icon={TrendingUp} />
        <MetricCard label={t.strategies.avgWinRate} value={`${formatNumber(avgWinRate)}%`} icon={Target} />
      </div>

      <div className="space-y-3">
        {strategies.map(strategy => (
          <div key={strategy.id} className="terminal-border rounded-lg overflow-hidden">
            {/* Header */}
            <div
              className="flex items-center justify-between p-4 cursor-pointer hover:bg-accent/30 transition-colors"
              onClick={() => setExpanded(expanded === strategy.id ? null : strategy.id)}
            >
              <div className="flex items-center gap-4">
                <button
                  onClick={(e) => { e.stopPropagation(); toggleActive(strategy.id); }}
                  className={cn(
                    "rounded-md p-2 transition-colors",
                    strategy.active ? "bg-profit/15 text-profit" : "bg-muted text-muted-foreground"
                  )}
                >
                  {strategy.active ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                </button>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-foreground">{strategy.name}</h3>
                    <StatusBadge variant={strategy.active ? 'profit' : 'neutral'} dot>
                      {strategy.active ? t.common.active : t.common.inactive}
                    </StatusBadge>
                    <StatusBadge variant={strategy.riskLevel === 'high' ? 'loss' : strategy.riskLevel === 'medium' ? 'warning' : 'profit'}>
                      {riskLabel(strategy.riskLevel)}
                    </StatusBadge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{strategy.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right hidden md:block">
                  <div className="text-sm font-mono text-foreground">WR {strategy.winRate}%</div>
                  <div className="text-xs text-muted-foreground">PF {formatNumber(strategy.profitFactor)}</div>
                </div>
                <div className="text-right hidden md:block">
                  <div className={cn("text-sm font-mono font-medium", strategy.pnl >= 0 ? "text-profit" : "text-loss")}>
                    {strategy.pnl >= 0 ? '+' : ''}{formatCurrency(strategy.pnl)}
                  </div>
                  <div className="text-xs text-muted-foreground">{strategy.totalTrades} {t.common.trades}</div>
                </div>
                {expanded === strategy.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </div>
            </div>

            {/* Expanded */}
            {expanded === strategy.id && (
              <div className="border-t border-border p-4 bg-accent/20 animate-slide-in">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <h4 className="text-xs font-bold text-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                      <Target className="h-3 w-3 text-profit" /> {t.strategies.entryRules}
                    </h4>
                    <ul className="space-y-1">
                      {strategy.entryRules.map((rule, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                          <span className="text-profit mt-0.5">•</span> {rule}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3 text-loss" /> {t.strategies.exitRules}
                    </h4>
                    <ul className="space-y-1">
                      {strategy.exitRules.map((rule, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                          <span className="text-loss mt-0.5">•</span> {rule}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                      <Clock className="h-3 w-3 text-primary" /> {t.strategies.conditions}
                    </h4>
                    <ul className="space-y-1">
                      {strategy.idealConditions.map((cond, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                          <span className="text-primary mt-0.5">•</span> {cond}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3 space-y-1">
                      <div className="text-xs text-muted-foreground">{t.strategies.timeHorizon}: <span className="text-foreground font-mono">{strategy.timeHorizon}</span></div>
                      <div className="text-xs text-muted-foreground">{t.strategies.maxDrawdown}: <span className="text-loss font-mono">{strategy.maxDrawdown}%</span></div>
                      <div className="text-xs text-muted-foreground">{t.strategies.capital}: <span className="text-foreground font-mono">{formatCurrency(strategy.capitalAllocated)}</span></div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
