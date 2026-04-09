import { supabase } from '@/integrations/supabase/client';
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
    { symbol: 'DOGE/USD', name: 'Dogecoin', tdSymbol: 'DOGE/USD' },
    { symbol: 'AVAX/USD', name: 'Avalanche', tdSymbol: 'AVAX/USD' },
    { symbol: 'DOT/USD', name: 'Polkadot', tdSymbol: 'DOT/USD' },
    { symbol: 'LINK/USD', name: 'Chainlink', tdSymbol: 'LINK/USD' },
    { symbol: 'MATIC/USD', name: 'Polygon', tdSymbol: 'MATIC/USD' },
    { symbol: 'SHIB/USD', name: 'Shiba Inu', tdSymbol: 'SHIB/USD' },
    { symbol: 'UNI/USD', name: 'Uniswap', tdSymbol: 'UNI/USD' },
    { symbol: 'ATOM/USD', name: 'Cosmos', tdSymbol: 'ATOM/USD' },
    { symbol: 'LTC/USD', name: 'Litecoin', tdSymbol: 'LTC/USD' },
    { symbol: 'NEAR/USD', name: 'NEAR Protocol', tdSymbol: 'NEAR/USD' },
    { symbol: 'SUI/USD', name: 'Sui', tdSymbol: 'SUI/USD' },
    { symbol: 'APT/USD', name: 'Aptos', tdSymbol: 'APT/USD' },
    { symbol: 'ARB/USD', name: 'Arbitrum', tdSymbol: 'ARB/USD' },
    { symbol: 'OP/USD', name: 'Optimism', tdSymbol: 'OP/USD' },
    { symbol: 'PEPE/USD', name: 'Pepe', tdSymbol: 'PEPE/USD' },
    { symbol: 'FET/USD', name: 'Fetch.ai', tdSymbol: 'FET/USD' },
    { symbol: 'RENDER/USD', name: 'Render', tdSymbol: 'RENDER/USD' },
    { symbol: 'INJ/USD', name: 'Injective', tdSymbol: 'INJ/USD' },
    { symbol: 'TIA/USD', name: 'Celestia', tdSymbol: 'TIA/USD' },
    { symbol: 'SEI/USD', name: 'Sei', tdSymbol: 'SEI/USD' },
    { symbol: 'JUP/USD', name: 'Jupiter', tdSymbol: 'JUP/USD' },
    { symbol: 'WIF/USD', name: 'Dogwifhat', tdSymbol: 'WIF/USD' },
  ],
  stock: [
    { symbol: 'AAPL', name: 'Apple Inc.', tdSymbol: 'AAPL' },
    { symbol: 'MSFT', name: 'Microsoft Corp.', tdSymbol: 'MSFT' },
    { symbol: 'NVDA', name: 'NVIDIA Corp.', tdSymbol: 'NVDA' },
    { symbol: 'TSLA', name: 'Tesla Inc.', tdSymbol: 'TSLA' },
    { symbol: 'AMZN', name: 'Amazon.com', tdSymbol: 'AMZN' },
    { symbol: 'GOOGL', name: 'Alphabet Inc.', tdSymbol: 'GOOGL' },
    { symbol: 'META', name: 'Meta Platforms', tdSymbol: 'META' },
    { symbol: 'AMD', name: 'AMD Inc.', tdSymbol: 'AMD' },
    { symbol: 'NFLX', name: 'Netflix Inc.', tdSymbol: 'NFLX' },
    { symbol: 'CRM', name: 'Salesforce Inc.', tdSymbol: 'CRM' },
    { symbol: 'JPM', name: 'JPMorgan Chase', tdSymbol: 'JPM' },
    { symbol: 'V', name: 'Visa Inc.', tdSymbol: 'V' },
    { symbol: 'MA', name: 'Mastercard Inc.', tdSymbol: 'MA' },
    { symbol: 'WMT', name: 'Walmart Inc.', tdSymbol: 'WMT' },
    { symbol: 'DIS', name: 'Walt Disney Co.', tdSymbol: 'DIS' },
    { symbol: 'BA', name: 'Boeing Co.', tdSymbol: 'BA' },
    { symbol: 'INTC', name: 'Intel Corp.', tdSymbol: 'INTC' },
    { symbol: 'KO', name: 'Coca-Cola Co.', tdSymbol: 'KO' },
    { symbol: 'PFE', name: 'Pfizer Inc.', tdSymbol: 'PFE' },
    { symbol: 'PYPL', name: 'PayPal Holdings', tdSymbol: 'PYPL' },
    { symbol: 'UBER', name: 'Uber Technologies', tdSymbol: 'UBER' },
    { symbol: 'COIN', name: 'Coinbase Global', tdSymbol: 'COIN' },
    { symbol: 'PLTR', name: 'Palantir Tech.', tdSymbol: 'PLTR' },
    { symbol: 'SNOW', name: 'Snowflake Inc.', tdSymbol: 'SNOW' },
    { symbol: 'AVGO', name: 'Broadcom Inc.', tdSymbol: 'AVGO' },
    { symbol: 'LLY', name: 'Eli Lilly & Co.', tdSymbol: 'LLY' },
    { symbol: 'COST', name: 'Costco Wholesale', tdSymbol: 'COST' },
    { symbol: 'ABBV', name: 'AbbVie Inc.', tdSymbol: 'ABBV' },
    { symbol: 'MRK', name: 'Merck & Co.', tdSymbol: 'MRK' },
    { symbol: 'PEP', name: 'PepsiCo Inc.', tdSymbol: 'PEP' },
    { symbol: 'ADBE', name: 'Adobe Inc.', tdSymbol: 'ADBE' },
    { symbol: 'ORCL', name: 'Oracle Corp.', tdSymbol: 'ORCL' },
    // AI Infrastructure & Energy Supercycle — Tier 1
    { symbol: 'GEV', name: 'GE Vernova', tdSymbol: 'GEV' },
    { symbol: 'VRT', name: 'Vertiv Holdings', tdSymbol: 'VRT' },
    { symbol: 'ETN', name: 'Eaton Corp', tdSymbol: 'ETN' },
    { symbol: 'CEG', name: 'Constellation Energy', tdSymbol: 'CEG' },
    { symbol: 'VST', name: 'Vistra Corp', tdSymbol: 'VST' },
    // Tier 2
    { symbol: 'PWR', name: 'Quanta Services', tdSymbol: 'PWR' },
    { symbol: 'NEE', name: 'NextEra Energy', tdSymbol: 'NEE' },
    { symbol: 'MTZ', name: 'MasTec', tdSymbol: 'MTZ' },
    { symbol: 'BE', name: 'Bloom Energy', tdSymbol: 'BE' },
    { symbol: 'TLN', name: 'Talen Energy', tdSymbol: 'TLN' },
    // Tier 3 — Midstream Gas
    { symbol: 'WMB', name: 'Williams Companies', tdSymbol: 'WMB' },
    { symbol: 'EQT', name: 'EQT Corporation', tdSymbol: 'EQT' },
    // Additional thematic
    { symbol: 'DUK', name: 'Duke Energy', tdSymbol: 'DUK' },
    { symbol: 'SO', name: 'Southern Company', tdSymbol: 'SO' },
    { symbol: 'EMR', name: 'Emerson Electric', tdSymbol: 'EMR' },
    { symbol: 'EQIX', name: 'Equinix', tdSymbol: 'EQIX' },
    { symbol: 'DLR', name: 'Digital Realty', tdSymbol: 'DLR' },
    { symbol: 'CCJ', name: 'Cameco Corp', tdSymbol: 'CCJ' },
    { symbol: 'FCX', name: 'Freeport-McMoRan', tdSymbol: 'FCX' },
  ],
  etf: [
    { symbol: 'SPY', name: 'S&P 500 ETF', tdSymbol: 'SPY' },
    { symbol: 'QQQ', name: 'Nasdaq 100 ETF', tdSymbol: 'QQQ' },
    { symbol: 'VTI', name: 'Total Stock Market', tdSymbol: 'VTI' },
    { symbol: 'ARKK', name: 'ARK Innovation', tdSymbol: 'ARKK' },
    { symbol: 'XLE', name: 'Energy Select', tdSymbol: 'XLE' },
    { symbol: 'XLK', name: 'Technology Select', tdSymbol: 'XLK' },
    { symbol: 'IWM', name: 'Russell 2000 ETF', tdSymbol: 'IWM' },
    { symbol: 'EEM', name: 'Emerging Markets', tdSymbol: 'EEM' },
    { symbol: 'GLD', name: 'Gold ETF (SPDR)', tdSymbol: 'GLD' },
    { symbol: 'TLT', name: 'Treasury Bond 20Y+', tdSymbol: 'TLT' },
    { symbol: 'DIA', name: 'Dow Jones ETF', tdSymbol: 'DIA' },
    { symbol: 'XLF', name: 'Financial Select', tdSymbol: 'XLF' },
    { symbol: 'XLV', name: 'Healthcare Select', tdSymbol: 'XLV' },
    { symbol: 'SOXX', name: 'Semiconductor ETF', tdSymbol: 'SOXX' },
    { symbol: 'VOO', name: 'Vanguard S&P 500', tdSymbol: 'VOO' },
    { symbol: 'KWEB', name: 'China Internet ETF', tdSymbol: 'KWEB' },
    { symbol: 'SMH', name: 'VanEck Semiconductor', tdSymbol: 'SMH' },
    { symbol: 'XBI', name: 'Biotech ETF', tdSymbol: 'XBI' },
    { symbol: 'IBIT', name: 'iShares Bitcoin ETF', tdSymbol: 'IBIT' },
    { symbol: 'BITO', name: 'ProShares Bitcoin', tdSymbol: 'BITO' },
  ],
  commodity: [
    { symbol: 'XAU/USD', name: 'Gold', tdSymbol: 'XAU/USD' },
    { symbol: 'XAG/USD', name: 'Silver', tdSymbol: 'XAG/USD' },
    { symbol: 'CL', name: 'Crude Oil', tdSymbol: 'CL' },
    { symbol: 'NG', name: 'Natural Gas', tdSymbol: 'NG' },
    { symbol: 'HG', name: 'Copper', tdSymbol: 'HG' },
  ],
  forex: [
    { symbol: 'EUR/USD', name: 'Euro/Dollar', tdSymbol: 'EUR/USD' },
    { symbol: 'GBP/USD', name: 'Pound/Dollar', tdSymbol: 'GBP/USD' },
    { symbol: 'USD/JPY', name: 'Dollar/Yen', tdSymbol: 'USD/JPY' },
    { symbol: 'AUD/USD', name: 'Aussie/Dollar', tdSymbol: 'AUD/USD' },
    { symbol: 'USD/CAD', name: 'Dollar/CAD', tdSymbol: 'USD/CAD' },
    { symbol: 'USD/CHF', name: 'Dollar/Swiss', tdSymbol: 'USD/CHF' },
    { symbol: 'NZD/USD', name: 'Kiwi/Dollar', tdSymbol: 'NZD/USD' },
    { symbol: 'EUR/GBP', name: 'Euro/Pound', tdSymbol: 'EUR/GBP' },
    { symbol: 'EUR/JPY', name: 'Euro/Yen', tdSymbol: 'EUR/JPY' },
    { symbol: 'GBP/JPY', name: 'Pound/Yen', tdSymbol: 'GBP/JPY' },
    { symbol: 'USD/MXN', name: 'Dollar/Peso MX', tdSymbol: 'USD/MXN' },
    { symbol: 'EUR/CHF', name: 'Euro/Swiss', tdSymbol: 'EUR/CHF' },
    { symbol: 'AUD/JPY', name: 'Aussie/Yen', tdSymbol: 'AUD/JPY' },
  ],
};

export const ALL_SYMBOLS = Object.entries(MARKET_SYMBOLS).flatMap(([type, symbols]) =>
  symbols.map(s => ({ ...s, type: type as AssetType }))
);

// Call the hybrid edge function - routes to FreeCryptoAPI / FCS API / Twelve Data
async function callHybridMarketData(params: {
  cryptoSymbols?: string[];
  stockSymbols?: string[];
  etfSymbols?: string[];
  commoditySymbols?: string[];
  forexSymbols?: string[];
}): Promise<Record<string, TwelveDataQuote>> {
  const { data, error } = await supabase.functions.invoke('market-data-hybrid', {
    body: params,
  });

  if (error) throw new Error(`Hybrid market data error: ${error.message}`);
  if (data?.error) throw new Error(`Market data: ${data.error}`);
  
  if (data?.errors?.length) {
    console.warn('Partial market data errors:', data.errors);
  }

  return (data?.data || {}) as Record<string, TwelveDataQuote>;
}

// Legacy Twelve Data edge function call (for technical indicators)
async function callTwelveData(action: string, params: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('twelve-data', {
    body: { action, params },
  });

  if (error) throw new Error(`Edge function error: ${error.message}`);
  if (data?.error) throw new Error(`Twelve Data: ${data.error}`);
  return data;
}

// Fetch all quotes using hybrid approach - NO rate limit issues
export async function fetchQuotes(symbols: string[]): Promise<Record<string, TwelveDataQuote>> {
  // Group symbols by type
  const cryptoSymbols: string[] = [];
  const stockSymbols: string[] = [];
  const etfSymbols: string[] = [];
  const commoditySymbols: string[] = [];
  const forexSymbols: string[] = [];

  // Forex pairs that go via FCS forex endpoint
  const forexPairs = new Set(['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD', 'USD/CHF', 'NZD/USD', 'EUR/GBP', 'EUR/JPY', 'GBP/JPY']);

  for (const symbol of symbols) {
    const info = ALL_SYMBOLS.find(s => s.tdSymbol === symbol || s.symbol === symbol);
    if (!info) continue;
    
    switch (info.type) {
      case 'crypto': cryptoSymbols.push(info.tdSymbol); break;
      case 'stock': stockSymbols.push(info.tdSymbol); break;
      case 'etf': etfSymbols.push(info.tdSymbol); break;
      case 'commodity': commoditySymbols.push(info.tdSymbol); break;
      case 'forex': forexSymbols.push(info.tdSymbol); break;
    }
  }

  try {
    return await callHybridMarketData({ cryptoSymbols, stockSymbols, etfSymbols, commoditySymbols, forexSymbols });
  } catch (e) {
    console.warn('Hybrid fetch failed, trying legacy Twelve Data:', e);
    try {
      const batchSize = 8;
      const batch = symbols.slice(0, batchSize);
      const data = await callTwelveData('quote', { symbols: batch });
      if (batch.length === 1) {
        return { [batch[0]]: data };
      }
      return data;
    } catch (fallbackError) {
      console.warn('Legacy fallback also failed:', fallbackError);
      return {};
    }
  }
}

// Fetch RSI for a symbol (still uses Twelve Data for technical indicators)
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
  _source?: string;
}

// Transform quote to our Asset format
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

  let trend: 'uptrend' | 'downtrend' | 'sideways' = 'sideways';
  if (changePct > 1) trend = 'uptrend';
  else if (changePct < -1) trend = 'downtrend';

  let macdSignal: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  if (macdValue) {
    if (macdValue.macd > macdValue.signal) macdSignal = 'bullish';
    else if (macdValue.macd < macdValue.signal) macdSignal = 'bearish';
  }

  const volatility = price > 0 ? ((high - low) / price) * 100 : 0;
  const momentum = Math.max(0, Math.min(100, 50 + changePct * 5));
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
