import { useState, useEffect, useRef } from "react";
import { Search, Filter, ArrowUpDown, TrendingUp, TrendingDown, Minus, Loader2, RefreshCw, Timer, TimerOff } from "lucide-react";
import { mockAssets, Asset, AssetType, formatCurrency, formatNumber, formatVolume, formatMarketCap } from "@/lib/mockData";
import { useQuickQuotes } from "@/hooks/useMarketData";
import StatusBadge from "@/components/shared/StatusBadge";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";

type SortKey = 'symbol' | 'price' | 'changePercent' | 'volume' | 'rsi' | 'momentum' | 'relativeStrength';

export default function MarketExplorer() {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<AssetType | 'all'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('relativeStrength');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const typeFilters: { label: string; value: AssetType | 'all' }[] = [
    { label: t.common.all, value: 'all' },
    { label: t.common.crypto, value: 'crypto' },
    { label: t.common.stocks, value: 'stock' },
    { label: t.common.etfs, value: 'etf' },
    { label: t.common.commodities, value: 'commodity' },
  ];

  const typeLabels: Record<string, string> = {
    crypto: t.common.crypto,
    stock: t.common.stocks,
    etf: t.common.etfs,
    commodity: t.common.commodities,
  };

  const { data: liveAssets, isLoading, isError, refetch } = useQuickQuotes();
  const assets = liveAssets && liveAssets.length > 0 ? liveAssets : mockAssets;

  const filtered = assets
    .filter(a => typeFilter === 'all' || a.type === typeFilter)
    .filter(a => a.symbol.toLowerCase().includes(search.toLowerCase()) || a.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const mul = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'symbol') return mul * a.symbol.localeCompare(b.symbol);
      return mul * ((a[sortKey] as number) - (b[sortKey] as number));
    });

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
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
          {!isLoading && (!liveAssets || liveAssets.length === 0) && (
            <StatusBadge variant="warning" dot>{t.common.mockData}</StatusBadge>
          )}
          <button onClick={() => refetch()} className="rounded-md bg-secondary p-2 text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
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
            className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
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

      {/* Market stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(['crypto', 'stock', 'etf', 'commodity'] as AssetType[]).map(type => {
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
                <SortHeader label={t.market.volume} sortKey="volume" />
                <th className="text-center p-3">{t.market.trend}</th>
                <SortHeader label="RSI" sortKey="rsi" />
                <th className="text-center p-3">MACD</th>
                <SortHeader label={t.market.momentum} sortKey="momentum" />
                <SortHeader label="RS" sortKey="relativeStrength" />
                <th className="text-center p-3">{t.market.volatility}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(asset => (
                <tr key={asset.symbol} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <StatusBadge variant={
                        asset.type === 'crypto' ? 'info' :
                        asset.type === 'stock' ? 'primary' :
                        asset.type === 'etf' ? 'neutral' : 'warning'
                      }>
                        {asset.type === 'commodity' ? 'CMD' : asset.type.toUpperCase()}
                      </StatusBadge>
                      <div>
                        <div className="font-mono font-medium text-foreground">{asset.symbol}</div>
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
                  <td className="text-right p-3 font-mono text-muted-foreground">{formatVolume(asset.volume)}</td>
                  <td className="text-center p-3"><TrendIcon trend={asset.trend} /></td>
                  <td className="text-right p-3">
                    <span className={cn("font-mono", asset.rsi > 70 ? "text-loss" : asset.rsi < 30 ? "text-profit" : "text-foreground")}>
                      {asset.rsi}
                    </span>
                  </td>
                  <td className="text-center p-3">
                    <StatusBadge variant={asset.macdSignal === 'bullish' ? 'profit' : asset.macdSignal === 'bearish' ? 'loss' : 'neutral'}>
                      {asset.macdSignal === 'bullish' ? '▲' : asset.macdSignal === 'bearish' ? '▼' : '—'}
                    </StatusBadge>
                  </td>
                  <td className="text-right p-3 font-mono text-foreground">{asset.momentum}</td>
                  <td className="text-right p-3">
                    <span className={cn("font-mono font-medium", asset.relativeStrength > 70 ? "text-profit" : asset.relativeStrength < 40 ? "text-loss" : "text-foreground")}>
                      {asset.relativeStrength}
                    </span>
                  </td>
                  <td className="text-center p-3">
                    <span className={cn("font-mono text-xs", asset.volatility > 5 ? "text-loss" : asset.volatility > 3 ? "text-warning" : "text-muted-foreground")}>
                      {formatNumber(asset.volatility)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
