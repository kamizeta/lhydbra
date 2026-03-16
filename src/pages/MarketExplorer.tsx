import { useState, useEffect, useRef } from "react";
import { Search, ArrowUpDown, TrendingUp, TrendingDown, Minus, Loader2, RefreshCw, Timer, TimerOff, X, AlertTriangle, Brain, Zap, Activity, BarChart3, Shield, Target } from "lucide-react";
import { mockAssets, Asset, AssetType, formatCurrency, formatNumber, formatVolume } from "@/lib/mockData";
import { useQuickQuotes } from "@/hooks/useMarketData";
import { useMarketFeaturesDB, useRunDataIntelligence } from "@/hooks/useDataIntelligence";
import { useOpportunityScores, useRunOpportunityScoring } from "@/hooks/useOpportunityScores";
import { ALL_SYMBOLS } from "@/lib/twelveData";
import StatusBadge from "@/components/shared/StatusBadge";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { toast } from "@/hooks/use-toast";

type SortKey = 'symbol' | 'price' | 'changePercent' | 'volume' | 'rsi' | 'momentum' | 'relativeStrength' | 'score';

// ─── Regime Badge Component ───
function RegimeBadge({ regime, confidence }: { regime: string; confidence: number }) {
  const config: Record<string, { label: string; variant: 'profit' | 'loss' | 'warning' | 'info' | 'neutral' | 'primary' }> = {
    trending_bullish: { label: '🐂 Bull Trend', variant: 'profit' },
    trending_bearish: { label: '🐻 Bear Trend', variant: 'loss' },
    bull_market: { label: '🟢 Bull Market', variant: 'profit' },
    bear_market: { label: '🔴 Bear Market', variant: 'loss' },
    ranging: { label: '↔ Ranging', variant: 'neutral' },
    volatile: { label: '⚡ Volatile', variant: 'warning' },
    pre_breakout: { label: '💥 Pre-Breakout', variant: 'info' },
    compression: { label: '🔋 Compression', variant: 'info' },
    overbought: { label: '🔥 Overbought', variant: 'warning' },
    oversold: { label: '❄️ Oversold', variant: 'info' },
    capitulation: { label: '💀 Capitulation', variant: 'loss' },
    euphoria: { label: '🎉 Euphoria', variant: 'warning' },
    undefined: { label: '—', variant: 'neutral' },
  };

  const c = config[regime] || config.undefined;
  return (
    <div className="flex items-center gap-1">
      <StatusBadge variant={c.variant}>{c.label}</StatusBadge>
      {confidence > 0 && (
        <span className="text-[10px] font-mono text-muted-foreground">{Math.round(confidence)}%</span>
      )}
    </div>
  );
}

function VolatilityBadge({ regime }: { regime: string }) {
  const config: Record<string, { label: string; color: string }> = {
    high: { label: 'HIGH', color: 'text-loss' },
    elevated: { label: 'ELEV', color: 'text-warning' },
    normal: { label: 'NORM', color: 'text-muted-foreground' },
    low: { label: 'LOW', color: 'text-profit' },
    compressed: { label: 'COMP', color: 'text-info' },
  };
  const c = config[regime] || config.normal;
  return <span className={cn("font-mono text-xs font-medium", c.color)}>{c.label}</span>;
}

export default function MarketExplorer() {
  const { t } = useI18n();
  const autoRefresh = useAutoRefresh();
  const [countdown, setCountdown] = useState(60);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (autoRefresh.enabled) {
      setCountdown(60);
      countdownRef.current = setInterval(() => {
        setCountdown(prev => prev <= 1 ? 60 : prev - 1);
      }, 1000);
    }
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [autoRefresh.enabled]);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<AssetType | 'all'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('relativeStrength');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [showFeatures, setShowFeatures] = useState(true);

  const typeFilters: { label: string; value: AssetType | 'all' }[] = [
    { label: t.common.all, value: 'all' },
    { label: t.common.crypto, value: 'crypto' },
    { label: t.common.stocks, value: 'stock' },
    { label: t.common.etfs, value: 'etf' },
    { label: t.common.forex, value: 'forex' },
    { label: t.common.commodities, value: 'commodity' },
  ];

  const typeLabels: Record<string, string> = {
    crypto: t.common.crypto,
    stock: t.common.stocks,
    etf: t.common.etfs,
    forex: t.common.forex,
    commodity: t.common.commodities,
  };

  const { data: liveAssets, isLoading, refetch } = useQuickQuotes();
  const { data: featuresMap } = useMarketFeaturesDB();
  const { data: scoresMap } = useOpportunityScores();
  const runIntelligence = useRunDataIntelligence();
  const runScoring = useRunOpportunityScoring();

  const assets = liveAssets && liveAssets.length > 0 ? liveAssets : mockAssets.map(a => ({ ...a, isMock: true }));
  const mockCount = assets.filter(a => a.isMock).length;
  const featuresCount = featuresMap ? Object.keys(featuresMap).length : 0;
  const scoresCount = scoresMap ? Object.keys(scoresMap).length : 0;

  const filtered = assets
    .filter(a => typeFilter === 'all' || a.type === typeFilter)
    .filter(a => a.symbol.toLowerCase().includes(search.toLowerCase()) || a.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const mul = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'symbol') return mul * a.symbol.localeCompare(b.symbol);
      if (sortKey === 'score') {
        const sa = scoresMap?.[a.symbol]?.total_score ?? 0;
        const sb = scoresMap?.[b.symbol]?.total_score ?? 0;
        return mul * (sa - sb);
      }
      return mul * ((a[sortKey] as number) - (b[sortKey] as number));
    });

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const handleRunIntelligence = () => {
    // Get symbols for the current filter
    const symbolsToAnalyze = typeFilter === 'all'
      ? ALL_SYMBOLS.slice(0, 8).map(s => s.tdSymbol) // Limit to 8 due to rate limits
      : ALL_SYMBOLS.filter(s => s.type === typeFilter).slice(0, 8).map(s => s.tdSymbol);

    toast({ title: "🧠 Data Intelligence", description: `Analizando ${symbolsToAnalyze.length} activos... Esto puede tomar ~${Math.ceil(symbolsToAnalyze.length / 4) * 15}s` });

    runIntelligence.mutate(symbolsToAnalyze, {
      onSuccess: (data) => {
        toast({
          title: "✅ Análisis completado",
          description: `${data.processed}/${data.total} activos procesados${data.errors ? ` (${data.errors.length} errores)` : ''}`,
        });
      },
      onError: (err) => {
        toast({ title: "❌ Error", description: err.message, variant: "destructive" });
      },
    });
  };

  const TrendIcon = ({ trend }: { trend: string }) => {
    if (trend === 'uptrend') return <TrendingUp className="h-3.5 w-3.5 text-profit" />;
    if (trend === 'downtrend') return <TrendingDown className="h-3.5 w-3.5 text-loss" />;
    return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
  };

  const SortHeader = ({ label, sortKey: key }: { label: string; sortKey: SortKey }) => (
    <th
      className="text-right p-3 cursor-pointer hover:text-foreground transition-colors select-none"
      onClick={() => handleSort(key)}
    >
      <div className="flex items-center justify-end gap-1">
        {label}
        <ArrowUpDown className="h-3 w-3" />
      </div>
    </th>
  );

  return (
    <div className="p-6 space-y-6 animate-slide-in">
      {mockCount > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-purple-500/30 bg-purple-500/10 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-purple-400 shrink-0" />
          <p className="text-sm text-purple-300">
            <span className="font-bold">{mockCount} activos</span> muestran datos <span className="font-bold uppercase">no reales</span> (mock/demo).
          </p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t.market.title}</h1>
          <p className="text-sm text-muted-foreground font-mono">{t.market.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {isLoading && (
            <StatusBadge variant="info" dot>
              <Loader2 className="h-3 w-3 animate-spin mr-1" />{t.common.loadingLiveData}
            </StatusBadge>
          )}
          {!isLoading && liveAssets && liveAssets.length > 0 && (
            <StatusBadge variant="profit" dot>{t.common.live}</StatusBadge>
          )}
          {featuresCount > 0 && (
            <StatusBadge variant="info" dot>
              <Brain className="h-3 w-3 mr-1" />{featuresCount} features
            </StatusBadge>
          )}
          {scoresCount > 0 && (
            <StatusBadge variant="warning" dot>
              <Target className="h-3 w-3 mr-1" />{scoresCount} scores
            </StatusBadge>
          )}
          <button
            onClick={() => autoRefresh.toggle()}
            className={cn(
              "rounded-md px-3 py-2 text-xs font-medium flex items-center gap-1.5 transition-colors",
              autoRefresh.enabled
                ? "bg-profit/15 text-profit border border-profit/30 hover:bg-profit/25"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            )}
            title={autoRefresh.enabled ? `Auto-refresh: ${countdown}s` : 'Auto-refresh off'}
          >
            {autoRefresh.enabled ? <Timer className="h-3.5 w-3.5" /> : <TimerOff className="h-3.5 w-3.5" />}
            {autoRefresh.enabled ? `${countdown}s` : 'Off'}
          </button>
          <button onClick={() => { refetch(); setCountdown(60); }} className="rounded-md bg-secondary p-2 text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Data Intelligence Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleRunIntelligence}
          disabled={runIntelligence.isPending}
          className={cn(
            "rounded-lg px-4 py-2.5 text-sm font-medium flex items-center gap-2 transition-all",
            "bg-gradient-to-r from-primary/80 to-primary text-primary-foreground",
            "hover:from-primary hover:to-primary/90 hover:shadow-lg hover:shadow-primary/20",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          {runIntelligence.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Brain className="h-4 w-4" />
          )}
          {runIntelligence.isPending ? 'Analizando...' : '🧠 Run Data Intelligence'}
        </button>

        <button
          onClick={() => setShowFeatures(!showFeatures)}
          className={cn(
            "rounded-md px-3 py-2 text-xs font-medium flex items-center gap-1.5 transition-colors",
            showFeatures
              ? "bg-info/15 text-info border border-info/30"
              : "bg-secondary text-muted-foreground hover:text-foreground"
          )}
        >
          <Activity className="h-3.5 w-3.5" />
          {showFeatures ? 'Features ON' : 'Features OFF'}
        </button>

        <button
          onClick={() => {
            toast({ title: "🎯 Opportunity Scoring", description: "Calculando scores para todos los activos con features..." });
            runScoring.mutate(undefined, {
              onSuccess: (data) => {
                toast({ title: "✅ Scores calculados", description: `${data.count} activos puntuados` });
              },
              onError: (err) => {
                toast({ title: "❌ Error", description: err.message, variant: "destructive" });
              },
            });
          }}
          disabled={runScoring.isPending || featuresCount === 0}
          className={cn(
            "rounded-lg px-4 py-2.5 text-sm font-medium flex items-center gap-2 transition-all",
            "bg-gradient-to-r from-warning/80 to-warning text-warning-foreground",
            "hover:from-warning hover:to-warning/90 hover:shadow-lg hover:shadow-warning/20",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          {runScoring.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
          {runScoring.isPending ? 'Scoring...' : '🎯 Run Opportunity Score'}
        </button>

        {runIntelligence.isPending && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="h-1.5 w-24 rounded-full bg-secondary overflow-hidden">
              <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: '60%' }} />
            </div>
            <span className="font-mono">Fetching OHLCV + Computing indicators...</span>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder={t.common.searchAssets}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex gap-1">
          {typeFilters.map(f => (
            <button
              key={f.value}
              onClick={() => setTypeFilter(f.value)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                typeFilter === f.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-accent"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Market Regime Summary */}
      {featuresMap && featuresCount > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {(() => {
            const regimes: Record<string, number> = {};
            Object.values(featuresMap).forEach(f => {
              const r = f.market_regime || 'undefined';
              regimes[r] = (regimes[r] || 0) + 1;
            });
            return Object.entries(regimes)
              .sort((a, b) => b[1] - a[1])
              .map(([regime, count]) => (
                <div key={regime} className="terminal-border rounded-lg p-3 flex items-center justify-between">
                  <RegimeBadge regime={regime} confidence={0} />
                  <span className="text-sm font-mono font-bold text-foreground">{count}</span>
                </div>
              ));
          })()}
        </div>
      )}

      {/* Market stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {(['crypto', 'stock', 'etf', 'forex', 'commodity'] as AssetType[]).map(type => {
          const typeAssets = assets.filter(a => a.type === type);
          const avgChange = typeAssets.length > 0 ? typeAssets.reduce((s, a) => s + a.changePercent, 0) / typeAssets.length : 0;
          return (
            <div key={type} className="terminal-border rounded-lg p-3">
              <p className="text-xs uppercase text-muted-foreground tracking-wider">{typeLabels[type]}</p>
              <p className={cn("text-lg font-bold font-mono mt-1", avgChange >= 0 ? "text-profit" : "text-loss")}>
                {avgChange >= 0 ? '+' : ''}{formatNumber(avgChange)}%
              </p>
              <p className="text-xs text-muted-foreground">{typeAssets.length} {t.common.assets}</p>
            </div>
          );
        })}
      </div>

      {/* Table */}
      <div className="terminal-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                <th className="text-left p-3">{t.common.asset}</th>
                <SortHeader label={t.common.price} sortKey="price" />
                <SortHeader label="24h %" sortKey="changePercent" />
                <th className="text-center p-3">{t.market.trend}</th>
                <SortHeader label="RSI" sortKey="rsi" />
                <th className="text-center p-3">MACD</th>
                <SortHeader label={t.market.momentum} sortKey="momentum" />
                {showFeatures && (
                  <>
                    <th className="text-center p-3">
                      <div className="flex items-center justify-center gap-1">
                        <Brain className="h-3 w-3" /> Regime
                      </div>
                    </th>
                    <th className="text-center p-3">
                      <div className="flex items-center justify-center gap-1">
                        <Zap className="h-3 w-3" /> Vol
                      </div>
                    </th>
                    <th className="text-center p-3">
                      <div className="flex items-center justify-center gap-1">
                        <Shield className="h-3 w-3" /> S/R
                      </div>
                    </th>
                  </>
                )}
                <SortHeader label="RS" sortKey="relativeStrength" />
                <SortHeader label="Score" sortKey="score" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(asset => {
                const features = featuresMap?.[asset.symbol];
                const score = scoresMap?.[asset.symbol];
                return (
                  <tr key={asset.symbol} className={cn(
                    "border-b border-border/50 transition-colors group",
                    asset.isMock
                      ? "hover:bg-accent/20"
                      : features ? "hover:bg-accent/30" : "hover:bg-accent/20"
                  )}>
                      ? "bg-purple-500/5 hover:bg-purple-500/10 border-l-2 border-l-purple-500/50"
                      : features ? "hover:bg-accent/30" : "hover:bg-accent/20"
                  )}>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {asset.isMock && (
                          <span className="shrink-0 rounded bg-purple-500/20 text-purple-400 text-[10px] font-bold px-1.5 py-0.5 uppercase tracking-wider border border-purple-500/30">
                            NO REAL
                          </span>
                        )}
                        <StatusBadge variant={
                          asset.type === 'crypto' ? 'info' :
                          asset.type === 'stock' ? 'primary' :
                          asset.type === 'etf' ? 'neutral' :
                          asset.type === 'forex' ? 'profit' : 'warning'
                        }>
                          {asset.type === 'commodity' ? 'CMD' : asset.type === 'forex' ? 'FX' : asset.type.toUpperCase()}
                        </StatusBadge>
                        <div>
                          <div className={cn("font-mono font-medium", asset.isMock ? "text-purple-400" : "text-foreground")}>{asset.symbol}</div>
                          <div className="text-xs text-muted-foreground">{asset.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="text-right p-3 font-mono text-foreground">{formatCurrency(asset.price, asset.price < 1 ? 4 : 2)}</td>
                    <td className="text-right p-3">
                      <span className={cn("font-mono font-medium", asset.changePercent >= 0 ? "text-profit" : "text-loss")}>
                        {asset.changePercent >= 0 ? '+' : ''}{formatNumber(asset.changePercent)}%
                      </span>
                    </td>
                    <td className="text-center p-3">
                      {features ? (
                        <div className="flex items-center justify-center gap-1">
                          <TrendIcon trend={features.trend_direction} />
                          <span className="text-[10px] font-mono text-muted-foreground">{Math.round(features.trend_strength)}</span>
                        </div>
                      ) : (
                        <TrendIcon trend={asset.trend} />
                      )}
                    </td>
                    <td className="text-right p-3">
                      <span className={cn("font-mono",
                        (features?.rsi_14 ?? asset.rsi) > 70 ? "text-loss" :
                        (features?.rsi_14 ?? asset.rsi) < 30 ? "text-profit" : "text-foreground"
                      )}>
                        {features?.rsi_14 != null ? Math.round(features.rsi_14) : asset.rsi}
                      </span>
                    </td>
                    <td className="text-center p-3">
                      {features?.macd != null && features?.macd_signal != null ? (
                        <StatusBadge variant={features.macd > features.macd_signal ? 'profit' : 'loss'}>
                          {features.macd > features.macd_signal ? '▲' : '▼'}
                        </StatusBadge>
                      ) : (
                        <StatusBadge variant={asset.macdSignal === 'bullish' ? 'profit' : asset.macdSignal === 'bearish' ? 'loss' : 'neutral'}>
                          {asset.macdSignal === 'bullish' ? '▲' : asset.macdSignal === 'bearish' ? '▼' : '—'}
                        </StatusBadge>
                      )}
                    </td>
                    <td className="text-right p-3 font-mono text-foreground">
                      {features?.momentum_score != null ? Math.round(features.momentum_score) : asset.momentum}
                    </td>
                    {showFeatures && (
                      <>
                        <td className="text-center p-3">
                          {features ? (
                            <RegimeBadge regime={features.market_regime} confidence={features.regime_confidence} />
                          ) : (
                            <span className="text-xs text-muted-foreground/50">—</span>
                          )}
                        </td>
                        <td className="text-center p-3">
                          {features ? (
                            <VolatilityBadge regime={features.volatility_regime} />
                          ) : (
                            <span className={cn("font-mono text-xs", asset.volatility > 5 ? "text-loss" : asset.volatility > 3 ? "text-warning" : "text-muted-foreground")}>
                              {formatNumber(asset.volatility)}
                            </span>
                          )}
                        </td>
                        <td className="text-center p-3">
                          {features?.support_level && features?.resistance_level ? (
                            <div className="text-[10px] font-mono leading-tight">
                              <span className="text-profit">R:{formatCurrency(features.resistance_level, features.resistance_level < 10 ? 4 : 0)}</span>
                              <br />
                              <span className="text-loss">S:{formatCurrency(features.support_level, features.support_level < 10 ? 4 : 0)}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground/50">—</span>
                          )}
                        </td>
                      </>
                    )}
                    <td className="text-right p-3">
                      <span className={cn("font-mono font-medium", asset.relativeStrength > 70 ? "text-profit" : asset.relativeStrength < 40 ? "text-loss" : "text-foreground")}>
                        {asset.relativeStrength}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
