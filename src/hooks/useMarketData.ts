import { useQuery } from '@tanstack/react-query';
import { fetchQuotes, ALL_SYMBOLS, quoteToAsset, type TwelveDataQuote } from '@/lib/twelveData';
import { mockAssets, type Asset, type AssetType } from '@/lib/mockData';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';

// With hybrid approach we can fetch ALL symbols - no rate limit on FreeCryptoAPI
const ALL_SYMBOL_IDS = ALL_SYMBOLS.map(s => s.tdSymbol);

export function useMarketData() {
  const autoRefreshEnabled = useAutoRefresh((s) => s.enabled);
  return useQuery({
    queryKey: ['market-data'],
    queryFn: async (): Promise<Asset[]> => {
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

      // Fill remaining with mock data
      for (const mock of mockAssets) {
        if (!liveSymbols.has(mock.symbol)) {
          assets.push(mock);
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
  return useQuery({
    queryKey: ['quick-quotes', assetTypes],
    queryFn: async (): Promise<Asset[]> => {
      const filtered = assetTypes
        ? ALL_SYMBOLS.filter(s => assetTypes.includes(s.type))
        : ALL_SYMBOLS;

      const symbols = filtered.map(s => s.tdSymbol);
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
          assets.push(mock);
        }
      }

      return assets;
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 2,
  });
}
