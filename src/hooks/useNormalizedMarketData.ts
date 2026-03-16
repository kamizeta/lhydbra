import { useQuery } from '@tanstack/react-query';
import { fetchNormalizedQuotes, fetchMarketFeatures, computeIndicators, type NormalizedQuote, type MarketFeatures } from '@/lib/marketDataLayer';
import { ALL_SYMBOLS } from '@/lib/twelveData';
import { type Asset, type AssetType, mockAssets } from '@/lib/mockData';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';

// Convert NormalizedQuote to Asset (backward compatible)
function normalizedToAsset(q: NormalizedQuote, symbolInfo: { symbol: string; name: string; type: AssetType }, features?: MarketFeatures): Asset {
  const changePct = q.change_percent;
  let trend: 'uptrend' | 'downtrend' | 'sideways' = 'sideways';
  if (features?.trend_direction) {
    trend = features.trend_direction as 'uptrend' | 'downtrend' | 'sideways';
  } else if (changePct > 1) trend = 'uptrend';
  else if (changePct < -1) trend = 'downtrend';

  let macdSignal: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  if (features?.macd != null && features?.macd_signal != null) {
    macdSignal = features.macd > features.macd_signal ? 'bullish' : 'bearish';
  }

  const rsiVal = features?.rsi_14 ?? 50;
  const volatility = q.price > 0 ? ((q.high - q.low) / q.price) * 100 : 0;
  const momentum = features?.momentum_score ?? Math.max(0, Math.min(100, 50 + changePct * 5));

  return {
    symbol: symbolInfo.symbol,
    name: q.name || symbolInfo.name,
    type: symbolInfo.type,
    price: q.price,
    change24h: q.change,
    changePercent: changePct,
    volume: q.volume,
    high24h: q.high,
    low24h: q.low,
    open: q.open,
    rsi: rsiVal,
    macdSignal,
    trend,
    volatility: parseFloat(volatility.toFixed(2)),
    momentum: Math.round(momentum),
    relativeStrength: Math.round(Math.max(0, Math.min(100, rsiVal + changePct * 2))),
  };
}

const ALL_SYMBOL_IDS = ALL_SYMBOLS.map(s => s.tdSymbol);

export function useNormalizedMarketData() {
  const autoRefreshEnabled = useAutoRefresh((s) => s.enabled);

  return useQuery({
    queryKey: ['normalized-market-data'],
    queryFn: async (): Promise<Asset[]> => {
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

      // Fill with mock for missing
      for (const mock of mockAssets) {
        if (!liveSymbols.has(mock.symbol)) {
          assets.push({ ...mock, isMock: true });
        }
      }

      return assets;
    },
    staleTime: 60_000,
    refetchInterval: autoRefreshEnabled ? 60_000 : false,
    retry: 2,
  });
}

export function useMarketFeatures(symbols: string[], timeframe = '1d') {
  return useQuery({
    queryKey: ['market-features', symbols, timeframe],
    queryFn: () => fetchMarketFeatures(symbols, timeframe),
    staleTime: 120_000,
    enabled: symbols.length > 0,
  });
}

export function useComputeIndicators(symbols: string[], timeframe = '1d') {
  return useQuery({
    queryKey: ['compute-indicators', symbols, timeframe],
    queryFn: () => computeIndicators(symbols, timeframe),
    staleTime: 300_000,
    enabled: symbols.length > 0,
  });
}
