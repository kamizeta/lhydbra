import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useCallback, useRef } from 'react';
import { fetchNormalizedQuotes, subscribeToMarketCache, type NormalizedQuote } from '@/lib/marketDataLayer';
import { ALL_SYMBOLS } from '@/lib/twelveData';
import { mockAssets, type Asset, type AssetType } from '@/lib/mockData';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';

const ALL_SYMBOL_IDS = ALL_SYMBOLS.map(s => s.tdSymbol);

// Convert NormalizedQuote → Asset
function normalizedToAsset(q: NormalizedQuote, info: { symbol: string; name: string; type: AssetType }): Asset {
  const changePct = q.change_percent;
  let trend: 'uptrend' | 'downtrend' | 'sideways' = 'sideways';
  if (changePct > 1) trend = 'uptrend';
  else if (changePct < -1) trend = 'downtrend';

  const volatility = q.price > 0 ? ((q.high - q.low) / q.price) * 100 : 0;
  const momentum = Math.max(0, Math.min(100, 50 + changePct * 5));

  return {
    symbol: info.symbol,
    name: q.name || info.name,
    type: info.type,
    price: q.price,
    change24h: q.change,
    changePercent: changePct,
    volume: q.volume,
    high24h: q.high,
    low24h: q.low,
    open: q.open,
    rsi: 50,
    macdSignal: 'neutral',
    trend,
    volatility: parseFloat(volatility.toFixed(2)),
    momentum: Math.round(momentum),
    relativeStrength: Math.round(Math.max(0, Math.min(100, 50 + changePct * 2))),
    source: q.source,
  };
}

export function useMarketData() {
  const autoRefreshEnabled = useAutoRefresh((s) => s.enabled);
  const queryClient = useQueryClient();
  const unsubRef = useRef<(() => void) | null>(null);

  // Subscribe to Realtime updates from market_cache
  useEffect(() => {
    const unsub = subscribeToMarketCache((update) => {
      // Patch the cached query data with realtime price updates
      queryClient.setQueryData<Asset[]>(['market-data'], (old) => {
        if (!old) return old;
        return old.map(asset => {
          if (asset.symbol === update.symbol || asset.symbol.replace('/', '') === update.symbol) {
            return { ...asset, price: update.price, changePercent: update.change_percent };
          }
          return asset;
        });
      });
    });
    unsubRef.current = unsub;
    return () => unsub();
  }, [queryClient]);

  return useQuery({
    queryKey: ['market-data'],
    queryFn: async (): Promise<Asset[]> => {
      // Single pipeline: ALL data goes through market-data-normalized
      // which handles: mem-cache → DB cache → API fallbacks
      const quotes = await fetchNormalizedQuotes(ALL_SYMBOL_IDS);
      const assets: Asset[] = [];
      const liveSymbols = new Set<string>();

      for (const symbolInfo of ALL_SYMBOLS) {
        const q = quotes[symbolInfo.tdSymbol] || quotes[symbolInfo.symbol];
        if (q && q.price > 0) {
          assets.push(normalizedToAsset(q, symbolInfo));
          liveSymbols.add(symbolInfo.symbol);
        }
      }

      // Fill remaining with mock data
      for (const mock of mockAssets) {
        if (!liveSymbols.has(mock.symbol)) {
          assets.push({ ...mock, isMock: true });
        }
      }

      return assets;
    },
    staleTime: 60_000,
    refetchInterval: autoRefreshEnabled ? 90_000 : false, // Increased from 60s → 90s (cache handles freshness)
    retry: 2,
  });
}

export function useQuickQuotes(assetTypes?: AssetType[]) {
  const autoRefreshEnabled = useAutoRefresh((s) => s.enabled);
  return useQuery({
    queryKey: ['quick-quotes', assetTypes],
    queryFn: async (): Promise<Asset[]> => {
      const filtered = assetTypes
        ? ALL_SYMBOLS.filter(s => assetTypes.includes(s.type))
        : ALL_SYMBOLS;

      const symbols = filtered.map(s => s.tdSymbol);
      const quotes = await fetchNormalizedQuotes(symbols);
      const assets: Asset[] = [];
      const liveSymbols = new Set<string>();

      for (const symbolInfo of filtered) {
        const q = quotes[symbolInfo.tdSymbol] || quotes[symbolInfo.symbol];
        if (q && q.price > 0) {
          assets.push(normalizedToAsset(q, symbolInfo));
          liveSymbols.add(symbolInfo.symbol);
        }
      }

      for (const mock of mockAssets) {
        if (!liveSymbols.has(mock.symbol) && (!assetTypes || assetTypes.includes(mock.type))) {
          assets.push({ ...mock, isMock: true });
        }
      }

      return assets;
    },
    staleTime: 60_000,
    refetchInterval: autoRefreshEnabled ? 90_000 : false,
    retry: 2,
  });
}
