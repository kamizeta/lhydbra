import { useState, useEffect } from "react";
import { Brain, Play, Pause, ChevronDown, ChevronUp, Target, Clock, TrendingUp, AlertTriangle } from "lucide-react";
import { type Strategy, formatCurrency, formatNumber } from "@/lib/mockData";
import StatusBadge from "@/components/shared/StatusBadge";
import MetricCard from "@/components/shared/MetricCard";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

// Strategy templates — rules are static config, but stats come from real trades
const STRATEGY_TEMPLATES: Strategy[] = [
  {
    id: 'trend-following', name: 'Trend Following', description: 'Identifies and rides established market trends using moving averages and trend indicators.',
    type: 'Directional', riskLevel: 'medium', timeHorizon: '1-4 weeks', winRate: 0, profitFactor: 0, totalTrades: 0, active: true, capitalAllocated: 0, pnl: 0, maxDrawdown: 0,
    entryRules: ['Price above 50 & 200 EMA', 'ADX > 25', 'Volume confirmation', 'RSI not overbought'],
    exitRules: ['Price closes below 20 EMA', 'Trailing stop 2 ATR', 'Take profit at 3:1 R/R'],
    idealConditions: ['Trending markets', 'Low chopiness', 'Clear directional bias'],
  },
  {
    id: 'momentum', name: 'Momentum', description: 'Captures strong directional moves in assets showing relative strength.',
    type: 'Directional', riskLevel: 'high', timeHorizon: '3-10 days', winRate: 0, profitFactor: 0, totalTrades: 0, active: true, capitalAllocated: 0, pnl: 0, maxDrawdown: 0,
    entryRules: ['RS rank top 20%', 'Volume spike > 2x avg', 'Price breakout above resistance', 'Momentum oscillator positive'],
    exitRules: ['RS drops below 50%', 'Volume dry-up', 'Fixed stop 1.5 ATR'],
    idealConditions: ['Strong market momentum', 'Risk-on environment', 'Sector rotation favorable'],
  },
  {
    id: 'continuacion-de-tendencia', name: 'Continuación de tendencia', description: 'Entra en continuaciones de tendencia tras consolidaciones.',
    type: 'Directional', riskLevel: 'medium', timeHorizon: '3-14 days', winRate: 0, profitFactor: 0, totalTrades: 0, active: true, capitalAllocated: 0, pnl: 0, maxDrawdown: 0,
    entryRules: ['Tendencia alcista confirmada', 'Consolidación > 3 días', 'Breakout con volumen', 'Momentum positivo'],
    exitRules: ['Trailing stop 2 ATR', 'Quiebre de estructura', 'Take profit 2:1 R/R'],
    idealConditions: ['Mercados en tendencia', 'Baja volatilidad en consolidación', 'Confirmación de momentum'],
  },
  {
    id: 'swing-trading', name: 'Swing Trading', description: 'Captures medium-term price swings within established trends.',
    type: 'Directional', riskLevel: 'medium', timeHorizon: '3-14 days', winRate: 0, profitFactor: 0, totalTrades: 0, active: true, capitalAllocated: 0, pnl: 0, maxDrawdown: 0,
    entryRules: ['Pullback to support/MA', 'RSI oversold bounce', 'Bullish candlestick pattern', 'Volume increasing'],
    exitRules: ['Target previous high', 'Stop below swing low', 'Time stop 14 days'],
    idealConditions: ['Trending with pullbacks', 'Clear support/resistance', 'Moderate volatility'],
  },
  {
    id: 'mean-reversion', name: 'Mean Reversion', description: 'Exploits overextended price moves that revert to the mean.',
    type: 'Counter-trend', riskLevel: 'medium', timeHorizon: '1-5 days', winRate: 0, profitFactor: 0, totalTrades: 0, active: false, capitalAllocated: 0, pnl: 0, maxDrawdown: 0,
    entryRules: ['Price > 2 std dev from mean', 'RSI extreme (>80 or <20)', 'Bollinger Band touch', 'Volume exhaustion'],
    exitRules: ['Return to 20 EMA', 'Opposite BB band', 'Max hold 5 days'],
    idealConditions: ['Range-bound markets', 'High mean-reversion tendency', 'Low trend strength'],
  },
  {
    id: 'breakout', name: 'Breakout', description: 'Captures explosive moves when price breaks key levels.',
    type: 'Directional', riskLevel: 'high', timeHorizon: '1-7 days', winRate: 0, profitFactor: 0, totalTrades: 0, active: true, capitalAllocated: 0, pnl: 0, maxDrawdown: 0,
    entryRules: ['Break above resistance with volume', 'Consolidation > 10 days', 'Increasing volume on breakout', 'ATR expansion'],
    exitRules: ['Failed breakout retest', 'Trailing stop 2.5 ATR', 'Take profit 4:1 R/R'],
    idealConditions: ['After consolidation', 'Increasing volatility', 'Catalyst present'],
  },
  {
    id: 'buy-limit', name: 'Buy Limit', description: 'Coloca órdenes limit en niveles de soporte predefinidos.',
    type: 'Directional', riskLevel: 'medium', timeHorizon: '1-7 days', winRate: 0, profitFactor: 0, totalTrades: 0, active: true, capitalAllocated: 0, pnl: 0, maxDrawdown: 0,
    entryRules: ['Nivel de soporte identificado', 'Orden limit en zona de demanda', 'Confirmación de estructura', 'Volumen en zona'],
    exitRules: ['Take profit en resistencia', 'Stop loss debajo de soporte', 'Cancelar si no ejecuta en 48h'],
    idealConditions: ['Mercado en pullback', 'Zonas de demanda claras', 'Tendencia principal alcista'],
  },
  {
    id: 'fuerza-relativa', name: 'Fuerza Relativa', description: 'Selecciona activos con mayor fuerza relativa vs benchmark.',
    type: 'Directional', riskLevel: 'medium', timeHorizon: '1-4 weeks', winRate: 0, profitFactor: 0, totalTrades: 0, active: true, capitalAllocated: 0, pnl: 0, maxDrawdown: 0,
    entryRules: ['RS rank top 20%', 'Tendencia alcista', 'Momentum > 55', 'Superando benchmark'],
    exitRules: ['RS cae debajo del 50%', 'Momentum negativo', 'Trailing stop 2 ATR'],
    idealConditions: ['Mercado alcista', 'Dispersión de rendimientos', 'Rotación sectorial activa'],
  },
  {
    id: 'defensive', name: 'Defensive', description: 'Capital preservation strategy for uncertain markets.',
    type: 'Protective', riskLevel: 'low', timeHorizon: '4-12 weeks', winRate: 0, profitFactor: 0, totalTrades: 0, active: true, capitalAllocated: 0, pnl: 0, maxDrawdown: 0,
    entryRules: ['VIX > 20', 'Market downtrend', 'Flight to safety confirmed', 'Gold/bonds strength'],
    exitRules: ['VIX < 15', 'Market reversal confirmed', 'Risk-on signals'],
    idealConditions: ['Bear markets', 'High uncertainty', 'Geopolitical risk'],
  },
  {
    id: 'dca', name: 'Dollar Cost Averaging', description: 'Systematic periodic buying to average entry prices.',
    type: 'Systematic', riskLevel: 'low', timeHorizon: 'Ongoing', winRate: 0, profitFactor: 0, totalTrades: 0, active: true, capitalAllocated: 0, pnl: 0, maxDrawdown: 0,
    entryRules: ['Fixed schedule (weekly/monthly)', 'Fixed dollar amount', 'Core holdings only', 'Increase on dips > 10%'],
    exitRules: ['Rebalance quarterly', 'Reduce on > 30% gain', 'Never full exit core'],
    idealConditions: ['All market conditions', 'Best in volatile markets', 'Long-term holdings'],
  },
];

export default function Strategies() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [strategies, setStrategies] = useState<Strategy[]>(STRATEGY_TEMPLATES);

  // Fetch real trade stats by strategy from closed positions + trade signals
  useEffect(() => {
    if (!user) return;

    Promise.all([
      supabase
        .from('positions')
        .select('strategy, pnl, avg_entry, quantity')
        .eq('user_id', user.id)
        .eq('status', 'closed'),
      supabase
        .from('positions')
        .select('strategy, avg_entry, quantity')
        .eq('user_id', user.id)
        .eq('status', 'open'),
    ]).then(([closedRes, openRes]) => {
      const closedByStrategy: Record<string, { wins: number; losses: number; totalPnl: number; grossProfit: number; grossLoss: number }> = {};
      const openByStrategy: Record<string, number> = {};

      for (const pos of (closedRes.data || [])) {
        const strat = (pos.strategy || 'Unknown').toLowerCase().replace(/\s+/g, '-');
        if (!closedByStrategy[strat]) closedByStrategy[strat] = { wins: 0, losses: 0, totalPnl: 0, grossProfit: 0, grossLoss: 0 };
        const pnl = pos.pnl || 0;
        closedByStrategy[strat].totalPnl += pnl;
        if (pnl >= 0) {
          closedByStrategy[strat].wins++;
          closedByStrategy[strat].grossProfit += pnl;
        } else {
          closedByStrategy[strat].losses++;
          closedByStrategy[strat].grossLoss += Math.abs(pnl);
        }
      }

      for (const pos of (openRes.data || [])) {
        const strat = (pos.strategy || 'Unknown').toLowerCase().replace(/\s+/g, '-');
        const exposure = (pos.avg_entry || 0) * (pos.quantity || 0);
        openByStrategy[strat] = (openByStrategy[strat] || 0) + exposure;
      }

      setStrategies(prev => prev.map(s => {
        // Try to match strategy by id or similar name
        const matchKey = Object.keys(closedByStrategy).find(k => 
          s.id.includes(k) || k.includes(s.id) || 
          s.name.toLowerCase().replace(/\s+/g, '-').includes(k) || k.includes(s.name.toLowerCase().replace(/\s+/g, '-'))
        );
        const stats = matchKey ? closedByStrategy[matchKey] : null;
        const openKey = Object.keys(openByStrategy).find(k =>
          s.id.includes(k) || k.includes(s.id) ||
          s.name.toLowerCase().replace(/\s+/g, '-').includes(k) || k.includes(s.name.toLowerCase().replace(/\s+/g, '-'))
        );

        const totalTrades = stats ? stats.wins + stats.losses : 0;
        const winRate = totalTrades > 0 ? (stats!.wins / totalTrades) * 100 : 0;
        const profitFactor = stats && stats.grossLoss > 0 ? stats.grossProfit / stats.grossLoss : 0;

        return {
          ...s,
          totalTrades,
          winRate,
          profitFactor,
          pnl: stats?.totalPnl || 0,
          capitalAllocated: openKey ? openByStrategy[openKey] : 0,
        };
      }));
    });
  }, [user]);

  const activeStrategies = strategies.filter(s => s.active);
  const totalCapital = activeStrategies.reduce((s, st) => s + st.capitalAllocated, 0);
  const totalPnl = strategies.reduce((s, st) => s + st.pnl, 0);
  const totalTrades = strategies.reduce((s, st) => s + st.totalTrades, 0);
  const avgWinRate = strategies.filter(s => s.totalTrades > 0).length > 0
    ? strategies.filter(s => s.totalTrades > 0).reduce((s, st) => s + st.winRate, 0) / strategies.filter(s => s.totalTrades > 0).length
    : 0;

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
        <MetricCard label={t.strategies.capitalAllocated} value={formatCurrency(totalCapital)} icon={Target} subtitle={totalCapital > 0 ? 'En posiciones abiertas' : 'Sin exposición'} />
        <MetricCard
          label={t.strategies.totalStrategyPnl}
          value={totalPnl !== 0 ? `${totalPnl >= 0 ? '+' : ''}${formatCurrency(totalPnl)}` : '$0.00'}
          changeType={totalPnl >= 0 ? "positive" : "negative"}
          change={`${totalTrades} trades cerrados`}
          icon={TrendingUp}
        />
        <MetricCard label={t.strategies.avgWinRate} value={avgWinRate > 0 ? `${formatNumber(avgWinRate)}%` : '—'} icon={Target} subtitle={totalTrades > 0 ? `${totalTrades} trades` : 'Sin historial'} />
      </div>

      <div className="space-y-3">
        {strategies.map(strategy => (
          <div key={strategy.id} className="terminal-border rounded-lg overflow-hidden">
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
                  <div className="text-sm font-mono text-foreground">{strategy.totalTrades > 0 ? `WR ${formatNumber(strategy.winRate)}%` : 'WR —'}</div>
                  <div className="text-xs text-muted-foreground">{strategy.totalTrades > 0 ? `PF ${formatNumber(strategy.profitFactor)}` : 'PF —'}</div>
                </div>
                <div className="text-right hidden md:block">
                  <div className={cn("text-sm font-mono font-medium", strategy.pnl > 0 ? "text-profit" : strategy.pnl < 0 ? "text-loss" : "text-muted-foreground")}>
                    {strategy.pnl !== 0 ? `${strategy.pnl >= 0 ? '+' : ''}${formatCurrency(strategy.pnl)}` : '—'}
                  </div>
                  <div className="text-xs text-muted-foreground">{strategy.totalTrades} {t.common.trades}</div>
                </div>
                {expanded === strategy.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </div>
            </div>

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
                      <div className="text-xs text-muted-foreground">{t.strategies.capital}: <span className="text-foreground font-mono">{strategy.capitalAllocated > 0 ? formatCurrency(strategy.capitalAllocated) : '—'}</span></div>
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
