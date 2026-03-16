import { useQuery } from '@tanstack/react-query';
import { fetchNormalizedQuotes, type NormalizedQuote } from '@/lib/marketDataLayer';
import { fetchQuotes, ALL_SYMBOLS, quoteToAsset, type TwelveDataQuote } from '@/lib/twelveData';
import { mockAssets, type Asset, type AssetType } from '@/lib/mockData';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';

const ALL_SYMBOL_IDS = ALL_SYMBOLS.map(s => s.tdSymbol);

// Convert NormalizedQuote → Asset (new pipeline)
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
  return useQuery({
    queryKey: ['market-data'],
    queryFn: async (): Promise<Asset[]> => {
      // Try new normalized pipeline first
      try {
        const quotes = await fetchNormalizedQuotes(ALL_SYMBOL_IDS);
        if (Object.keys(quotes).length > 0) {
          const assets: Asset[] = [];
          const liveSymbols = new Set<string>();

          for (const symbolInfo of ALL_SYMBOLS) {
            const q = quotes[symbolInfo.tdSymbol] || quotes[symbolInfo.symbol];
            if (q && q.price > 0) {
              assets.push(normalizedToAsset(q, symbolInfo));
              liveSymbols.add(symbolInfo.symbol);
            }
          }

          for (const mock of mockAssets) {
            if (!liveSymbols.has(mock.symbol)) {
              assets.push({ ...mock, isMock: true });
            }
          }

          return assets;
        }
      } catch (e) {
        console.warn('Normalized pipeline failed, falling back to legacy:', e);
      }

      // Fallback: legacy hybrid pipeline
      const quotes = await fetchQuotes(ALL_SYMBOL_IDS);
      const assets: Asset[] = [];
      const liveSymbols = new Set<string>();

      for (const symbolInfo of ALL_SYMBOLS) {
        const quote = (quotes[symbolInfo.tdSymbol] || quotes[symbolInfo.symbol]) as TwelveDataQuote | undefined;
        if (quote && quote.close && parseFloat(quote.close) > 0) {
          assets.push(quoteToAsset(quote, symbolInfo));
          liveSymbols.add(symbolInfo.symbol);
        }
      }

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

export function useQuickQuotes(assetTypes?: AssetType[]) {
  const autoRefreshEnabled = useAutoRefresh((s) => s.enabled);
  return useQuery({
    queryKey: ['quick-quotes', assetTypes],
    queryFn: async (): Promise<Asset[]> => {
      const filtered = assetTypes
        ? ALL_SYMBOLS.filter(s => assetTypes.includes(s.type))
        : ALL_SYMBOLS;

      const symbols = filtered.map(s => s.tdSymbol);

      // Try normalized first
      try {
        const quotes = await fetchNormalizedQuotes(symbols);
        if (Object.keys(quotes).length > 0) {
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
        }
      } catch (e) {
        console.warn('Normalized quick-quotes failed, fallback:', e);
      }

      // Fallback: legacy
      const quotes = await fetchQuotes(symbols);
      const assets: Asset[] = [];
      const liveSymbols = new Set<string>();

      for (const symbolInfo of filtered) {
        const quote = (quotes[symbolInfo.tdSymbol] || quotes[symbolInfo.symbol]) as TwelveDataQuote | undefined;
        if (quote && quote.close && parseFloat(quote.close) > 0) {
          assets.push(quoteToAsset(quote, symbolInfo));
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
    refetchInterval: autoRefreshEnabled ? 60_000 : false,
    retry: 2,
  });
}
