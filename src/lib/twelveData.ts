import { supabase } from './supabase';
import type { Asset, AssetType } from './mockData';

// Symbol definitions for each market
export const MARKET_SYMBOLS: Record<AssetType, { symbol: string; name: string; tdSymbol: string }[]> = {
  crypto: [
    { symbol: 'BTC/USD', name: 'Bitcoin', tdSymbol: 'BTC/USD' },
    { symbol: 'ETH/USD', name: 'Ethereum', tdSymbol: 'ETH/USD' },
    { symbol: 'SOL/USD', name: 'Solana', tdSymbol: 'SOL/USD' },
    { symbol: 'BNB/USD', name: 'BNB', tdSymbol: 'BNB/USD' },
    { symbol: 'ADA/USD', name: 'Cardano', tdSymbol: 'ADA/USD' },
    { symbol: 'XRP/USD', name: 'Ripple', tdSymbol: 'XRP/USD' },
  ],
  stock: [
    { symbol: 'AAPL', name: 'Apple Inc.', tdSymbol: 'AAPL' },
    { symbol: 'MSFT', name: 'Microsoft Corp.', tdSymbol: 'MSFT' },
    { symbol: 'NVDA', name: 'NVIDIA Corp.', tdSymbol: 'NVDA' },
    { symbol: 'TSLA', name: 'Tesla Inc.', tdSymbol: 'TSLA' },
    { symbol: 'AMZN', name: 'Amazon.com', tdSymbol: 'AMZN' },
    { symbol: 'GOOGL', name: 'Alphabet Inc.', tdSymbol: 'GOOGL' },
    { symbol: 'META', name: 'Meta Platforms', tdSymbol: 'META' },
  ],
  etf: [
    { symbol: 'SPY', name: 'S&P 500 ETF', tdSymbol: 'SPY' },
    { symbol: 'QQQ', name: 'Nasdaq 100 ETF', tdSymbol: 'QQQ' },
    { symbol: 'VTI', name: 'Total Stock Market', tdSymbol: 'VTI' },
    { symbol: 'ARKK', name: 'ARK Innovation', tdSymbol: 'ARKK' },
    { symbol: 'XLE', name: 'Energy Select', tdSymbol: 'XLE' },
    { symbol: 'XLK', name: 'Technology Select', tdSymbol: 'XLK' },
  ],
  commodity: [
    { symbol: 'XAU/USD', name: 'Gold', tdSymbol: 'XAU/USD' },
    { symbol: 'XAG/USD', name: 'Silver', tdSymbol: 'XAG/USD' },
    { symbol: 'CL', name: 'Crude Oil', tdSymbol: 'CL' },
    { symbol: 'NG', name: 'Natural Gas', tdSymbol: 'NG' },
    { symbol: 'HG', name: 'Copper', tdSymbol: 'HG' },
  ],
};

export const ALL_SYMBOLS = Object.entries(MARKET_SYMBOLS).flatMap(([type, symbols]) =>
  symbols.map(s => ({ ...s, type: type as AssetType }))
);

// Call edge function
async function callTwelveData(action: string, params: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('twelve-data', {
    body: { action, params },
  });

  if (error) throw new Error(`Edge function error: ${error.message}`);
  if (data?.error) throw new Error(`Twelve Data: ${data.error}`);
  return data;
}

// Fetch quotes for multiple symbols (batched)
export async function fetchQuotes(symbols: string[]): Promise<Record<string, TwelveDataQuote>> {
  // Twelve Data allows up to 8 symbols per request on free plan
  const batchSize = 8;
  const results: Record<string, TwelveDataQuote> = {};

  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const data = await callTwelveData('quote', { symbols: batch });

    // Single symbol returns object directly, multiple returns keyed object
    if (batch.length === 1) {
      results[batch[0]] = data;
    } else {
      Object.assign(results, data);
    }
  }

  return results;
}

// Fetch RSI for a symbol
export async function fetchRSI(symbol: string, interval = '1day', timePeriod = 14) {
  return callTwelveData('rsi', { symbol, interval, time_period: timePeriod });
}

// Fetch MACD for a symbol
export async function fetchMACD(symbol: string, interval = '1day') {
  return callTwelveData('macd', { symbol, interval });
}

// Fetch time series
export async function fetchTimeSeries(symbol: string, interval = '1day', outputsize = 30) {
  return callTwelveData('time_series', { symbol, interval, outputsize });
}

// Fetch ATR
export async function fetchATR(symbol: string, interval = '1day', timePeriod = 14) {
  return callTwelveData('atr', { symbol, interval, time_period: timePeriod });
}

export interface TwelveDataQuote {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  previous_close: string;
  change: string;
  percent_change: string;
  fifty_two_week?: {
    low: string;
    high: string;
  };
  is_market_open: boolean;
}

// Transform Twelve Data quote to our Asset format
export function quoteToAsset(
  quote: TwelveDataQuote,
  symbolInfo: { symbol: string; name: string; type: AssetType },
  rsiValue?: number,
  macdValue?: { macd: number; signal: number }
): Asset {
  const price = parseFloat(quote.close);
  const open = parseFloat(quote.open);
  const change = parseFloat(quote.change);
  const changePct = parseFloat(quote.percent_change);
  const high = parseFloat(quote.high);
  const low = parseFloat(quote.low);
  const volume = parseInt(quote.volume) || 0;

  // Derive trend from price vs open and change
  let trend: 'uptrend' | 'downtrend' | 'sideways' = 'sideways';
  if (changePct > 1) trend = 'uptrend';
  else if (changePct < -1) trend = 'downtrend';

  // MACD signal
  let macdSignal: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  if (macdValue) {
    if (macdValue.macd > macdValue.signal) macdSignal = 'bullish';
    else if (macdValue.macd < macdValue.signal) macdSignal = 'bearish';
  }

  // Derive volatility from high-low range
  const volatility = price > 0 ? ((high - low) / price) * 100 : 0;

  // Simple momentum from change percent
  const momentum = Math.max(0, Math.min(100, 50 + changePct * 5));

  // Relative strength from RSI (simplified)
  const rsi = rsiValue || 50;
  const relativeStrength = Math.max(0, Math.min(100, rsi + changePct * 2));

  return {
    symbol: symbolInfo.symbol,
    name: symbolInfo.name || quote.name,
    type: symbolInfo.type,
    price,
    change24h: change,
    changePercent: changePct,
    volume,
    high24h: high,
    low24h: low,
    open,
    rsi,
    macdSignal,
    trend,
    volatility: parseFloat(volatility.toFixed(2)),
    momentum: Math.round(momentum),
    relativeStrength: Math.round(relativeStrength),
  };
}
