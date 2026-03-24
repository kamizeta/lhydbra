import { supabase } from '@/integrations/supabase/client';

// ─── Types ───

export interface NormalizedQuote {
  symbol: string;
  name: string;
  asset_type: string;
  price: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  change: number;
  change_percent: number;
  previous_close: number;
  is_market_open: boolean;
  source: string;
  timestamp: string;
}

export interface OHLCVBar {
  symbol: string;
  timeframe: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: string;
  source: string;
  asset_type: string;
}

export interface MarketFeatures {
  symbol: string;
  timeframe: string;
  asset_type: string;
  sma_20: number | null;
  sma_50: number | null;
  sma_200: number | null;
  ema_12: number | null;
  ema_26: number | null;
  rsi_14: number | null;
  macd: number | null;
  macd_signal: number | null;
  macd_histogram: number | null;
  momentum_score: number;
  atr_14: number | null;
  bollinger_upper: number | null;
  bollinger_lower: number | null;
  volatility_regime: string;
  trend_direction: string;
  trend_strength: number;
  support_level: number | null;
  resistance_level: number | null;
  market_regime: string;
  regime_confidence: number;
  computed_at: string;
}

// ─── Request deduplication ───
const inflightRequests = new Map<string, Promise<Record<string, NormalizedQuote>>>();

// ─── Central Orchestrator: ALL market data goes through here ───

export async function fetchNormalizedQuotes(symbols: string[]): Promise<Record<string, NormalizedQuote>> {
  const key = `quotes:${symbols.sort().join(',')}`;

  // Deduplicate: if this exact request is already in-flight, wait for it
  const existing = inflightRequests.get(key);
  if (existing) return existing;

  // Safety valve: prevent unbounded growth from leaked entries
  if (inflightRequests.size > 100) {
    inflightRequests.clear();
  }

  const promise = (async () => {
    const { data, error } = await supabase.functions.invoke('market-data-normalized', {
      body: { action: 'quotes', symbols },
    });
    if (error) throw new Error(`Normalized quotes error: ${error.message}`);
    return (data || {}) as Record<string, NormalizedQuote>;
  })().finally(() => {
    inflightRequests.delete(key);
  });

  inflightRequests.set(key, promise);
  return promise;
}

export async function fetchOHLCV(symbol: string, timeframe = '1d', outputsize = 50): Promise<OHLCVBar[]> {
  const { data, error } = await supabase.functions.invoke('market-data-normalized', {
    body: { action: 'ohlcv', symbols: [symbol], timeframe, outputsize },
  });
  if (error) throw new Error(`OHLCV error: ${error.message}`);
  return data?.bars || [];
}

export async function fetchMarketFeatures(symbols: string[], timeframe = '1d'): Promise<Record<string, MarketFeatures>> {
  const { data, error } = await supabase.functions.invoke('market-data-normalized', {
    body: { action: 'features', symbols, timeframe },
  });
  if (error) throw new Error(`Features error: ${error.message}`);
  return data?.features || {};
}

export async function computeIndicators(symbols: string[], timeframe = '1d'): Promise<Record<string, MarketFeatures>> {
  const { data, error } = await supabase.functions.invoke('compute-indicators', {
    body: { symbols, timeframe },
  });
  if (error) throw new Error(`Compute indicators error: ${error.message}`);
  return data?.features || {};
}

// ─── Realtime subscription for market_cache updates ───
export function subscribeToMarketCache(
  onUpdate: (payload: { symbol: string; price: number; change_percent: number }) => void
) {
  const channel = supabase
    .channel('market-cache-updates')
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'market_cache' },
      (payload) => {
        const row = payload.new as Record<string, unknown>;
        if (row.symbol && row.price) {
          onUpdate({
            symbol: row.symbol as string,
            price: Number(row.price),
            change_percent: Number(row.change_percent || 0),
          });
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
