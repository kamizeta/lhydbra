import { useState, useEffect } from "react";
import { PieChart, TrendingUp, TrendingDown, ArrowRight, RefreshCw, Loader2, Shield, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserSettings } from "@/hooks/useUserSettings";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";
import StatusBadge from "@/components/shared/StatusBadge";
import { useI18n } from "@/i18n";

interface Position {
  id: string;
  symbol: string;
  asset_type: string;
  direction: string;
  quantity: number;
  avg_entry: number;
  stop_loss: number | null;
  take_profit: number | null;
  strategy: string | null;
  strategy_family: string | null;
  regime_at_entry: string | null;
}

interface OpportunityScore {
  symbol: string;
  total_score: number;
  direction: string | null;
  strategy_family: string | null;
  momentum_score: number | null;
  structure_score: number | null;
}

interface Recommendation {
  type: 'close' | 'reduce' | 'hold' | 'add';
  symbol: string;
  reason: string;
  score?: number;
  direction?: string;
  urgency: 'high' | 'medium' | 'low';
}

export default function PortfolioEngine() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { settings } = useUserSettings();
  const [positions, setPositions] = useState<Position[]>([]);
  const [scores, setScores] = useState<OpportunityScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [posRes, scoreRes] = await Promise.all([
        supabase.from('positions').select('*').eq('user_id', user.id).eq('status', 'open'),
        supabase.from('opportunity_scores').select('*').eq('timeframe', '1d').order('total_score', { ascending: false }),
      ]);
      if (posRes.data) setPositions(posRes.data);
      if (scoreRes.data) setScores(scoreRes.data);
      setLoading(false);
    };
    load();
  }, [user]);

  // Generate recommendations when data loads
  useEffect(() => {
    if (loading || positions.length === 0) return;
    const recs: Recommendation[] = [];
    const capital = settings.current_capital;
    const scoreMap = new Map(scores.map(s => [s.symbol, s]));

    // Analyze each position
    positions.forEach(pos => {
      const score = scoreMap.get(pos.symbol);

      // No score data
      if (!score) {
        recs.push({
          type: 'hold',
          symbol: pos.symbol,
          reason: 'Sin datos de opportunity score — mantener y monitorear',
          urgency: 'low',
        });
        return;
      }

      // Direction mismatch: position direction vs current score direction
      if (score.direction && score.direction !== 'neutral' && score.direction !== pos.direction) {
        recs.push({
          type: 'close',
          symbol: pos.symbol,
          reason: `Dirección opuesta: posición ${pos.direction.toUpperCase()} pero score indica ${score.direction.toUpperCase()}`,
          score: score.total_score,
          urgency: 'high',
        });
        return;
      }

      // Low score: consider closing
      if (score.total_score < 35) {
        recs.push({
          type: 'close',
          symbol: pos.symbol,
          reason: `Score muy bajo (${score.total_score}/100) — considerar cerrar`,
          score: score.total_score,
          urgency: 'medium',
        });
        return;
      }

      // Medium-low score: reduce
      if (score.total_score < 42) {
        recs.push({
          type: 'reduce',
          symbol: pos.symbol,
          reason: `Score bajo (${score.total_score}/100) — considerar reducir exposición`,
          score: score.total_score,
          urgency: 'low',
        });
        return;
      }

      // No SL
      if (!pos.stop_loss && settings.stop_loss_required) {
        recs.push({
          type: 'hold',
          symbol: pos.symbol,
          reason: '⚠ Sin Stop Loss — agregar inmediatamente',
          score: score.total_score,
          urgency: 'high',
        });
        return;
      }

      // Good position
      recs.push({
        type: 'hold',
        symbol: pos.symbol,
        reason: `Score ${score.total_score}/100 — mantener posición`,
        score: score.total_score,
        urgency: 'low',
      });
    });

    // Find new opportunities not in portfolio
    const positionSymbols = new Set(positions.map(p => p.symbol));
    const openSlots = settings.max_positions - positions.length;

    scores
      .filter(s => !positionSymbols.has(s.symbol) && s.total_score >= 50)
      .slice(0, Math.max(openSlots, 3))
      .forEach(s => {
        recs.push({
          type: 'add',
          symbol: s.symbol,
          reason: `Score alto (${s.total_score}/100) — ${s.direction || 'neutral'} via ${s.strategy_family || 'N/A'}`,
          score: s.total_score,
          direction: s.direction || 'neutral',
          urgency: s.total_score >= 60 ? 'high' : 'medium',
        });
      });

    // Sort: high urgency first, then by type priority
    const typePriority = { close: 0, reduce: 1, add: 2, hold: 3 };
    const urgencyPriority = { high: 0, medium: 1, low: 2 };
    recs.sort((a, b) => urgencyPriority[a.urgency] - urgencyPriority[b.urgency] || typePriority[a.type] - typePriority[b.type]);

    setRecommendations(recs);
  }, [loading, positions, scores, settings]);

  // Portfolio metrics
  const capital = settings.current_capital;
  const totalExposure = positions.reduce((s, p) => s + Math.abs(p.quantity) * p.avg_entry, 0);
  const exposurePct = capital > 0 ? (totalExposure / capital) * 100 : 0;
  
  const byType: Record<string, number> = {};
  const byDirection: Record<string, number> = { long: 0, short: 0 };
  const byStrategy: Record<string, number> = {};
  positions.forEach(p => {
    const val = Math.abs(p.quantity) * p.avg_entry;
    byType[p.asset_type] = (byType[p.asset_type] || 0) + val;
    byDirection[p.direction] = (byDirection[p.direction] || 0) + val;
    const sf = p.strategy_family || p.strategy || 'other';
    byStrategy[sf] = (byStrategy[sf] || 0) + val;
  });

  // Diversification score
  const typeCount = Object.keys(byType).length;
  const strategyCount = Object.keys(byStrategy).length;
  const directionBalance = totalExposure > 0 ? 1 - Math.abs((byDirection.long - byDirection.short) / totalExposure) : 0;
  const diversificationScore = positions.length === 0 ? 0 : Math.round(
    (Math.min(typeCount / 3, 1) * 30) +
    (Math.min(strategyCount / 3, 1) * 30) +
    (directionBalance * 20) +
    (Math.min(positions.length / settings.max_positions, 1) * 20)
  );

  const cashReserve = capital > 0 ? ((capital - totalExposure) / capital) * 100 : 100;

  const typeColors: Record<string, string> = {
    close: 'text-loss',
    reduce: 'text-warning',
    hold: 'text-foreground',
    add: 'text-profit',
  };
  const typeIcons: Record<string, typeof TrendingUp> = {
    close: TrendingDown,
    reduce: TrendingDown,
    hold: Shield,
    add: TrendingUp,
  };
  const typeLabels: Record<string, string> = {
    close: 'CERRAR',
    reduce: 'REDUCIR',
    hold: 'MANTENER',
    add: 'AGREGAR',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Portfolio Health */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-md bg-accent/50 p-3 text-center">
          <p className="text-[10px] text-muted-foreground uppercase">Diversificación</p>
          <p className={cn("text-lg font-bold font-mono", diversificationScore >= 60 ? "text-profit" : diversificationScore >= 40 ? "text-warning" : "text-loss")}>
            {diversificationScore}/100
          </p>
        </div>
        <div className="rounded-md bg-accent/50 p-3 text-center">
          <p className="text-[10px] text-muted-foreground uppercase">Exposición</p>
          <p className="text-lg font-bold font-mono text-foreground">{formatNumber(exposurePct)}%</p>
        </div>
        <div className="rounded-md bg-accent/50 p-3 text-center">
          <p className="text-[10px] text-muted-foreground uppercase">Cash Reserva</p>
          <p className={cn("text-lg font-bold font-mono", cashReserve > 30 ? "text-profit" : cashReserve > 10 ? "text-warning" : "text-loss")}>
            {formatNumber(Math.max(cashReserve, 0))}%
          </p>
        </div>
        <div className="rounded-md bg-accent/50 p-3 text-center">
          <p className="text-[10px] text-muted-foreground uppercase">Posiciones</p>
          <p className="text-lg font-bold font-mono text-foreground">{positions.length}/{settings.max_positions}</p>
        </div>
      </div>

      {/* Allocation breakdown */}
      {positions.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-md bg-accent/30 p-3">
            <p className="text-[10px] text-muted-foreground uppercase font-bold mb-2">Por Tipo</p>
            {Object.entries(byType).map(([type, val]) => (
              <div key={type} className="flex justify-between text-xs py-0.5">
                <span className="text-muted-foreground capitalize">{type}</span>
                <span className="font-mono text-foreground">{formatNumber(totalExposure > 0 ? (val / totalExposure) * 100 : 0)}%</span>
              </div>
            ))}
          </div>
          <div className="rounded-md bg-accent/30 p-3">
            <p className="text-[10px] text-muted-foreground uppercase font-bold mb-2">Por Dirección</p>
            <div className="flex justify-between text-xs py-0.5">
              <span className="text-profit">Long</span>
              <span className="font-mono text-foreground">{formatNumber(totalExposure > 0 ? (byDirection.long / totalExposure) * 100 : 0)}%</span>
            </div>
            <div className="flex justify-between text-xs py-0.5">
              <span className="text-loss">Short</span>
              <span className="font-mono text-foreground">{formatNumber(totalExposure > 0 ? (byDirection.short / totalExposure) * 100 : 0)}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Recommendations */}
      <div>
        <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <PieChart className="h-3.5 w-3.5 text-primary" /> Recomendaciones de Rebalanceo
        </h3>
        {recommendations.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">Sin recomendaciones — ejecuta Opportunity Score primero</p>
        ) : (
          <div className="space-y-2">
            {recommendations.map((rec, i) => {
              const Icon = typeIcons[rec.type];
              return (
                <div key={i} className={cn(
                  "flex items-center gap-3 rounded-md border p-2.5 transition-colors",
                  rec.type === 'close' ? "border-loss/20 bg-loss/5" :
                  rec.type === 'add' ? "border-profit/20 bg-profit/5" :
                  rec.type === 'reduce' ? "border-warning/20 bg-warning/5" :
                  "border-border bg-accent/20"
                )}>
                  <Icon className={cn("h-4 w-4 shrink-0", typeColors[rec.type])} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs text-foreground">{rec.symbol}</span>
                      <StatusBadge variant={rec.type === 'close' || rec.type === 'reduce' ? 'loss' : rec.type === 'add' ? 'profit' : 'neutral'}>
                        {typeLabels[rec.type]}
                      </StatusBadge>
                      {rec.urgency === 'high' && (
                        <StatusBadge variant="loss" dot>URGENTE</StatusBadge>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{rec.reason}</p>
                  </div>
                  {rec.score != null && (
                    <span className={cn("text-xs font-mono font-bold shrink-0", rec.score >= 50 ? "text-profit" : rec.score >= 40 ? "text-warning" : "text-loss")}>
                      {rec.score}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
