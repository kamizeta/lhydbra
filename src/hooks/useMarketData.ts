import { useQuery } from '@tanstack/react-query';
import { fetchQuotes, ALL_SYMBOLS, quoteToAsset, type TwelveDataQuote } from '@/lib/twelveData';
import { mockAssets, type Asset, type AssetType } from '@/lib/mockData';

// Priority symbols to fetch live (max 8 for free plan)
const PRIORITY_SYMBOLS = [
  'BTC/USD', 'ETH/USD', 'SOL/USD', 'AAPL', 'NVDA', 'XRP/USD', 'XAU/USD', 'TSLA'
];

// Fetch market data: live for priority symbols, mock for the rest
export function useMarketData() {
  return useQuery({
    queryKey: ['market-data'],
    queryFn: async (): Promise<Asset[]> => {
      // Only fetch priority symbols to stay within 8 credits/min
      const quotes = await fetchQuotes(PRIORITY_SYMBOLS);

      const assets: Asset[] = [];
      const liveSymbols = new Set<string>();

      // Add live data for fetched symbols
      for (const symbolInfo of ALL_SYMBOLS) {
        const quote = quotes[symbolInfo.tdSymbol] as TwelveDataQuote | undefined;
        if (quote && quote.close) {
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
    staleTime: 90_000,
    refetchInterval: 180_000, // 3 minutes to stay safe on rate limits
    retry: 1,
  });
}

// Quick quotes - same approach, single batch only
export function useQuickQuotes(assetTypes?: AssetType[]) {
  return useQuery({
    queryKey: ['quick-quotes', assetTypes],
    queryFn: async (): Promise<Asset[]> => {
      const filtered = assetTypes
        ? ALL_SYMBOLS.filter(s => assetTypes.includes(s.type))
        : ALL_SYMBOLS;

      const symbols = filtered.slice(0, 4).map(s => s.tdSymbol);
      const quotes = await fetchQuotes(symbols);

      const assets: Asset[] = [];
      const liveSymbols = new Set<string>();

      for (const symbolInfo of filtered) {
        const quote = quotes[symbolInfo.tdSymbol] as TwelveDataQuote | undefined;
        if (quote && quote.close) {
          assets.push(quoteToAsset(quote, symbolInfo));
          liveSymbols.add(symbolInfo.symbol);
        }
      }

      // Fill with mock data
      for (const mock of mockAssets) {
        if (!liveSymbols.has(mock.symbol) && (!assetTypes || assetTypes.includes(mock.type))) {
          assets.push(mock);
        }
      }

      return assets;
    },
    staleTime: 90_000,
    refetchInterval: 180_000,
    retry: 1,
  });
}
