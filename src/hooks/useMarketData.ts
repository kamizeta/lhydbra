import { useQuery } from '@tanstack/react-query';
import { fetchQuotes, fetchRSI, fetchMACD, ALL_SYMBOLS, quoteToAsset, type TwelveDataQuote } from '@/lib/twelveData';
import type { Asset, AssetType } from '@/lib/mockData';

// Fetch all market data with quotes + indicators
export function useMarketData() {
  return useQuery({
    queryKey: ['market-data'],
    queryFn: async (): Promise<Asset[]> => {
      const symbols = ALL_SYMBOLS.map(s => s.tdSymbol);

      // Fetch quotes in batches
      const quotes = await fetchQuotes(symbols);

      // For each symbol, try to get RSI and MACD (best effort, don't fail if rate limited)
      const assets: Asset[] = [];

      for (const symbolInfo of ALL_SYMBOLS) {
        const quote = quotes[symbolInfo.tdSymbol] as TwelveDataQuote | undefined;
        if (!quote || !quote.close) continue;

        let rsiValue: number | undefined;
        let macdValue: { macd: number; signal: number } | undefined;

        try {
          const rsiData = await fetchRSI(symbolInfo.tdSymbol);
          if (rsiData?.values?.[0]?.rsi) {
            rsiValue = parseFloat(rsiData.values[0].rsi);
          }
        } catch {
          // Rate limited or error, use default
        }

        try {
          const macdData = await fetchMACD(symbolInfo.tdSymbol);
          if (macdData?.values?.[0]) {
            macdValue = {
              macd: parseFloat(macdData.values[0].macd),
              signal: parseFloat(macdData.values[0].macd_signal),
            };
          }
        } catch {
          // Rate limited or error, use default
        }

        assets.push(quoteToAsset(quote, symbolInfo, rsiValue, macdValue));
      }

      return assets;
    },
    staleTime: 60_000, // 1 minute
    refetchInterval: 60_000, // Auto-refresh every minute
    retry: 2,
  });
}

// Fetch quotes only (faster, no indicators)
export function useQuickQuotes(assetTypes?: AssetType[]) {
  return useQuery({
    queryKey: ['quick-quotes', assetTypes],
    queryFn: async (): Promise<Asset[]> => {
      const filtered = assetTypes
        ? ALL_SYMBOLS.filter(s => assetTypes.includes(s.type))
        : ALL_SYMBOLS;

      const symbols = filtered.map(s => s.tdSymbol);
      const quotes = await fetchQuotes(symbols);

      return filtered
        .map(symbolInfo => {
          const quote = quotes[symbolInfo.tdSymbol] as TwelveDataQuote | undefined;
          if (!quote || !quote.close) return null;
          return quoteToAsset(quote, symbolInfo);
        })
        .filter(Boolean) as Asset[];
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 2,
  });
}
