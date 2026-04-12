import { useState, useEffect, useMemo } from "react";
import { Radar, TrendingUp, TrendingDown, Minus, RefreshCw, Loader2, Zap, Target, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/utils";
import StatusBadge from "@/components/shared/StatusBadge";
import MetricCard from "@/components/shared/MetricCard";
import { useI18n } from "@/i18n";

interface OpScore {
  asset: string;
  asset_class: string;
  opportunity_score: number;
  direction: string | null;
  strategy_family: string | null;
  score_breakdown: Record<string, number>;
  confidence_score: number;
  created_at: string;
}

interface MarketFeature {
  symbol: string;
  market_regime: string | null;
  trend_direction: string | null;
  trend_strength: number | null;
  rsi_14: number | null;
  momentum_score: number | null;
  volatility_regime: string | null;
}

const SCORE_TIERS = [
  { min: 75, label: "STRONG", color: "text-profit", bg: "bg-profit/10", border: "border-profit/30" },
  { min: 55, label: "MODERATE", color: "text-primary", bg: "bg-primary/10", border: "border-primary/30" },
  { min: 40, label: "WEAK", color: "text-terminal-gold", bg: "bg-terminal-gold/10", border: "border-terminal-gold/30" },
  { min: 0, label: "AVOID", color: "text-loss", bg: "bg-loss/10", border: "border-loss/30" },
];

function getTier(score: number) {
  return SCORE_TIERS.find(t => score >= t.min) || SCORE_TIERS[SCORE_TIERS.length - 1];
}

const SUB_SCORE_LABELS: { key: string; labelKey: string }[] = [
  { key: "structure_score", labelKey: "structure" },
  { key: "momentum_score", labelKey: "momentum" },
  { key: "volatility_score", labelKey: "volatility" },
  { key: "strategy_score", labelKey: "strategy" },
  { key: "rr_score", labelKey: "riskReward" },
  { key: "macro_score", labelKey: "macro" },
  { key: "sentiment_score", labelKey: "sentiment" },
  { key: "historical_score", labelKey: "historical" },
];

export default function OpportunityRadar() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [scores, setScores] = useState<OpScore[]>([]);
  const [features, setFeatures] = useState<MarketFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "long" | "short">("all");

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("signals").select("*").eq("user_id", user.id).eq("status", "active").order("opportunity_score", { ascending: false }),
      supabase.from("market_features").select("symbol, market_regime, trend_direction, trend_strength, rsi_14, momentum_score, volatility_regime").eq("timeframe", "1d"),
    ]).then(([scoresRes, featRes]) => {
      if (scoresRes.data) setScores(scoresRes.data as unknown as OpScore[]);
      if (featRes.data) setFeatures(featRes.data as MarketFeature[]);
      setLoading(false);
    });
  }, [user]);

  const featureMap = useMemo(() => {
    const m = new Map<string, MarketFeature>();
    features.forEach(f => m.set(f.symbol, f));
    return m;
  }, [features]);

  const filtered = useMemo(() => {
    if (filter === "all") return scores;
    return scores.filter(s => s.direction === filter);
  }, [scores, filter]);

  // Helper to get sub-score from breakdown
  const getSubScore = (s: OpScore, key: string) => (s.score_breakdown || {})[key] || 0;

  const selected = selectedSymbol ? scores.find(s => s.asset === selectedSymbol) : null;
  const selectedFeature = selectedSymbol ? featureMap.get(selectedSymbol) : null;

  const avgScore = scores.length > 0 ? scores.reduce((s, o) => s + o.opportunity_score, 0) / scores.length : 0;
  const topOpp = scores.length > 0 ? scores[0] : null;
  const longCount = scores.filter(s => s.direction === "long").length;
  const shortCount = scores.filter(s => s.direction === "short").length;

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Radar className="h-6 w-6 text-primary" /> Opportunity Radar
        </h1>
        <p className="text-sm text-muted-foreground font-mono">Visual scoring of all assets • Real-time opportunity detection</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard label="Avg Score" value={formatNumber(avgScore)} icon={Target} changeType={avgScore >= 55 ? "positive" : "negative"} />
        <MetricCard label="Top Opportunity" value={topOpp ? `${topOpp.asset} (${topOpp.opportunity_score.toFixed(0)})` : "—"} icon={Zap} />
        <MetricCard label="Direction Bias" value={`${longCount}L / ${shortCount}S`} change={longCount > shortCount ? "Bullish bias" : shortCount > longCount ? "Bearish bias" : "Neutral"} icon={TrendingUp} />
        <MetricCard label="Assets Scanned" value={`${scores.length}`} icon={Radar} />
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {(["all", "long", "short"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn("px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-colors border",
              filter === f ? "bg-primary/20 text-primary border-primary/30" : "bg-accent/50 text-muted-foreground border-border hover:border-primary/30"
            )}>
            {f === "all" ? "All" : f === "long" ? "↑ LONG" : "↓ SHORT"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Asset List - Heatmap Style */}
        <div className="lg:col-span-2 terminal-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="text-left p-3">Asset</th>
                  <th className="text-center p-3">Dir</th>
                  <th className="text-center p-3">Score</th>
                  <th className="text-center p-3">Tier</th>
                  <th className="text-left p-3">Strategy</th>
                  <th className="text-center p-3">Regime</th>
                  {/* Sub-score mini bars */}
                  <th className="text-center p-3">Breakdown</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => {
                  const tier = getTier(s.opportunity_score);
                  const feat = featureMap.get(s.asset);
                  const isSelected = selectedSymbol === s.asset;
                  return (
                    <tr key={s.asset}
                      onClick={() => setSelectedSymbol(isSelected ? null : s.asset)}
                      className={cn(
                        "border-b border-border/50 cursor-pointer transition-colors",
                        isSelected ? "bg-primary/10" : "hover:bg-accent/30"
                      )}>
                      <td className="p-3 font-mono font-bold text-foreground">{s.asset}</td>
                      <td className="text-center p-3">
                        {s.direction === "long" ? (
                          <span className="text-profit flex items-center justify-center gap-1"><ArrowUpRight className="h-3.5 w-3.5" /> LONG</span>
                        ) : s.direction === "short" ? (
                          <span className="text-loss flex items-center justify-center gap-1"><ArrowDownRight className="h-3.5 w-3.5" /> SHORT</span>
                        ) : (
                          <span className="text-muted-foreground flex items-center justify-center gap-1"><Minus className="h-3.5 w-3.5" /> —</span>
                        )}
                      </td>
                      <td className="text-center p-3">
                        <span className={cn("text-lg font-mono font-bold", tier.color)}>{s.opportunity_score.toFixed(0)}</span>
                      </td>
                      <td className="text-center p-3">
                        <span className={cn("text-[10px] font-mono font-bold px-2 py-0.5 rounded border", tier.bg, tier.color, tier.border)}>
                          {tier.label}
                        </span>
                      </td>
                      <td className="p-3">
                        <StatusBadge variant="info">{s.strategy_family || "—"}</StatusBadge>
                      </td>
                      <td className="text-center p-3">
                        <span className="text-[10px] font-mono text-muted-foreground capitalize">{feat?.market_regime || "—"}</span>
                      </td>
                      <td className="p-3">
                        <div className="flex gap-0.5 items-end h-5">
                          {SUB_SCORE_LABELS.map(({ key }) => {
                            const val = getSubScore(s, key.replace('_score', ''));
                            const h = Math.max(2, (val / 100) * 20);
                            return (
                              <div key={key} className={cn("w-2 rounded-sm transition-all",
                                val >= 65 ? "bg-profit" : val >= 45 ? "bg-primary" : val >= 30 ? "bg-terminal-gold" : "bg-loss"
                              )} style={{ height: `${h}px` }} title={`${key}: ${val.toFixed(0)}`} />
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="p-8 text-center text-muted-foreground text-sm">No opportunities computed yet. Run Data Intelligence first.</td></tr>
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
                <h2 className="text-lg font-bold text-foreground font-mono">{selected.asset}</h2>
                <span className={cn("text-2xl font-mono font-bold", getTier(selected.opportunity_score).color)}>
                  {selected.opportunity_score.toFixed(0)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <StatusBadge variant={selected.direction === "long" ? "profit" : selected.direction === "short" ? "loss" : "info"}>
                  {(selected.direction || "neutral").toUpperCase()}
                </StatusBadge>
                <StatusBadge variant="info">{selected.strategy_family || "—"}</StatusBadge>
                <span className={cn("text-[10px] font-mono px-2 py-0.5 rounded border",
                  getTier(selected.opportunity_score).bg, getTier(selected.opportunity_score).color, getTier(selected.opportunity_score).border
                )}>
                  {getTier(selected.opportunity_score).label}
                </span>
              </div>

              {/* Sub-scores detail */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Score Breakdown</h3>
                {SUB_SCORE_LABELS.map(({ key, labelKey }) => {
                  const val = getSubScore(selected, key.replace('_score', ''));
                  return (
                    <div key={key} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground font-mono">{t.radar[labelKey as keyof typeof t.radar] || labelKey}</span>
                        <span className={cn("font-mono font-bold", val >= 65 ? "text-profit" : val >= 45 ? "text-primary" : val >= 30 ? "text-terminal-gold" : "text-loss")}>
                          {val.toFixed(0)}
                        </span>
                      </div>
                      <div className="h-1.5 bg-accent rounded-full overflow-hidden">
                        <div className={cn("h-full rounded-full transition-all",
                          val >= 65 ? "bg-profit" : val >= 45 ? "bg-primary" : val >= 30 ? "bg-terminal-gold" : "bg-loss"
                        )} style={{ width: `${Math.min(100, val)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Market Features */}
              {selectedFeature && (
                <div className="space-y-2 pt-2 border-t border-border">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Market Context</h3>
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Regime</span>
                      <span className="text-foreground capitalize">{selectedFeature.market_regime || "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Trend</span>
                      <span className="text-foreground capitalize">{selectedFeature.trend_direction || "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">RSI</span>
                      <span className={cn(
                        (selectedFeature.rsi_14 || 50) > 70 ? "text-loss" : (selectedFeature.rsi_14 || 50) < 30 ? "text-profit" : "text-foreground"
                      )}>{selectedFeature.rsi_14?.toFixed(1) || "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Vol Regime</span>
                      <span className="text-foreground capitalize">{selectedFeature.volatility_regime || "—"}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="text-[10px] text-muted-foreground font-mono pt-2">
                Computed: {new Date(selected.created_at).toLocaleString()}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full py-12 text-center">
              <Radar className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">Select an asset to see detailed breakdown</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
