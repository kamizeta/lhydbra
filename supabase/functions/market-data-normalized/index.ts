import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// In-memory cache — match client staleTime (60s)
const memCache = new Map<string, { data: unknown; ts: number }>();
const MEM_TTL = 55_000; // 55s (just under client 60s staleTime)

function memGet(key: string) {
  const e = memCache.get(key);
  if (e && Date.now() - e.ts < MEM_TTL) return e.data;
  memCache.delete(key);
  return null;
}
function memSet(key: string, data: unknown) {
  memCache.set(key, { data, ts: Date.now() });
}

// ─── Request coalescing: prevent duplicate concurrent fetches ───
const inflightRequests = new Map<string, Promise<NormalizedQuote[]>>();

function coalesce(key: string, fn: () => Promise<NormalizedQuote[]>): Promise<NormalizedQuote[]> {
  const existing = inflightRequests.get(key);
  if (existing) return existing;
  const promise = fn().finally(() => inflightRequests.delete(key));
  inflightRequests.set(key, promise);
  return promise;
}

// ─── DB Cache Layer ───
async function getFromDBCache(symbols: string[], db: ReturnType<typeof createClient>): Promise<{ cached: NormalizedQuote[]; missing: string[] }> {
  if (!symbols.length) return { cached: [], missing: [] };
  const { data } = await db
    .from('market_cache')
    .select('*')
    .in('symbol', symbols)
    .gt('expires_at', new Date().toISOString());

  const cached: NormalizedQuote[] = [];
  const foundSymbols = new Set<string>();

  for (const row of (data || [])) {
    foundSymbols.add(row.symbol);
    cached.push({
      symbol: row.symbol,
      name: row.raw_data?.name || row.symbol,
      asset_type: row.asset_class,
      price: Number(row.price),
      open: Number(row.open_price || row.price),
      high: Number(row.high_price || row.price),
      low: Number(row.low_price || row.price),
      volume: Number(row.volume || 0),
      change: Number(row.change_val || 0),
      change_percent: Number(row.change_percent || 0),
      previous_close: Number(row.previous_close || row.price),
      is_market_open: row.is_market_open ?? true,
      source: `cache:${row.provider}`,
      timestamp: row.updated_at,
    });
  }

  const missing = symbols.filter(s => !foundSymbols.has(s));
  return { cached, missing };
}

async function persistToDBCache(quotes: NormalizedQuote[], db: ReturnType<typeof createClient>, ttlMinutes = 2) {
  if (!quotes.length) return;
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();
  const rows = quotes.filter(q => !q.source.startsWith('cache:')).map(q => ({
    symbol: q.symbol,
    asset_class: q.asset_type,
    provider: q.source,
    price: q.price,
    open_price: q.open,
    high_price: q.high,
    low_price: q.low,
    volume: q.volume,
    change_val: q.change,
    change_percent: q.change_percent,
    previous_close: q.previous_close,
    is_market_open: q.is_market_open,
    raw_data: { name: q.name },
    updated_at: new Date().toISOString(),
    expires_at: expiresAt,
    request_count: 1,
  }));

  if (rows.length > 0) {
    db.from('market_cache').upsert(rows, { onConflict: 'symbol' }).then(({ error }) => {
      if (error) console.error('market_cache upsert error:', error.message);
    });
  }
}

interface OHLCVBar {
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

interface NormalizedQuote {
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

// ─── Data Source Fetchers ───

async function fetchCryptoQuotes(symbols: string[], apiKey: string): Promise<NormalizedQuote[]> {
  const results: NormalizedQuote[] = [];
  const bases = symbols.map(s => s.replace('/USD', ''));

  await Promise.all(bases.map(async (base, i) => {
    try {
      const res = await fetch(`https://api.freecryptoapi.com/v1/getData?symbol=${base}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      for (const item of (data.symbols || [])) {
        const price = parseFloat(String(item.last || item.price || 0));
        if (price <= 0) continue;
        const changePct = parseFloat(String(item.daily_change_percentage || 0));
        const prevClose = price / (1 + changePct / 100);
        results.push({
          symbol: symbols[i],
          name: item.name || base,
          asset_type: 'crypto',
          price,
          open: prevClose,
          high: parseFloat(String(item.highest || item.high_24h || price)),
          low: parseFloat(String(item.lowest || item.low_24h || price)),
          volume: parseFloat(String(item.volume || 0)),
          change: price - prevClose,
          change_percent: changePct,
          previous_close: prevClose,
          is_market_open: true,
          source: 'freecryptoapi',
          timestamp: new Date().toISOString(),
        });
      }
    } catch (e) { console.error(`Crypto ${base}:`, e); }
  }));
  return results;
}

async function fetchFCSQuotes(symbols: string[], apiKey: string, endpoint: 'forex' | 'stock'): Promise<NormalizedQuote[]> {
  if (!symbols.length) return [];

  const results: NormalizedQuote[] = [];
  const seen = new Set<string>();
  const etfSet = new Set(['SPY','QQQ','VTI','ARKK','XLE','XLK','IWM','EEM','GLD','TLT','DIA','XLF','XLV','SOXX','VOO','KWEB','SMH','XBI','IBIT','BITO']);
  const requestUrls = endpoint === 'stock'
    ? [
        `https://fcsapi.com/api-v3/stock/latest?symbol=${encodeURIComponent(symbols.join(','))}&access_key=${apiKey}`,
        `https://fcsapi.com/api-v3/stock/latest?symbol=${encodeURIComponent(symbols.join(','))}&exchange=NASDAQ,NYSE,AMEX,ARCA,BATS&access_key=${apiKey}`,
      ]
    : [
        `https://fcsapi.com/api-v3/forex/latest?symbol=${encodeURIComponent(symbols.join(','))}&access_key=${apiKey}`,
      ];

  try {
    for (const url of requestUrls) {
      const res = await fetch(url);
      if (!res.ok) continue;

      const data = await res.json();
      if (!data.status || !Array.isArray(data.response) || data.response.length === 0) continue;

      for (const item of data.response) {
        const s = item.s || item.symbol;
        if (!s) continue;

        const matched = symbols.find(sym => s === sym || s.includes(sym) || sym.includes(s)) || s;
        if (seen.has(matched)) continue;

        const close = parseFloat(String(item.c || 0));
        if (close <= 0) continue;

        const isETF = endpoint === 'stock' && etfSet.has(matched);
        if (isETF && close < 5) continue;

        const change = parseFloat(String(item.ch || 0));

        let assetType: string;
        if (endpoint === 'stock') {
          assetType = isETF ? 'etf' : 'stock';
        } else {
          assetType = matched.includes('XAU') || matched.includes('XAG') || ['CL', 'NG', 'HG'].includes(matched) ? 'commodity' : 'forex';
        }

        results.push({
          symbol: matched,
          name: item.name || matched,
          asset_type: assetType,
          price: close,
          open: parseFloat(String(item.o || close)),
          high: parseFloat(String(item.h || close)),
          low: parseFloat(String(item.l || close)),
          volume: parseFloat(String(item.v || 0)),
          change,
          change_percent: parseFloat(String(item.cp || 0)),
          previous_close: close - change,
          is_market_open: true,
          source: 'fcsapi',
          timestamp: new Date().toISOString(),
        });
        seen.add(matched);
      }

      if (results.length > 0) break;
    }
  } catch (e) {
    console.error(`FCS ${endpoint}:`, e);
  }

  return results;
}

// Yahoo batch endpoint — single request for many symbols
async function fetchYahooBatch(symbols: string[]): Promise<NormalizedQuote[]> {
  if (!symbols.length) return [];
  const results: NormalizedQuote[] = [];

  try {
    // Use v6 quote endpoint (more reliable than v7)
    const url = `https://query1.finance.yahoo.com/v6/finance/quote?symbols=${encodeURIComponent(symbols.join(','))}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
    });

    if (res.ok) {
      const data = await res.json();
      for (const q of (data?.quoteResponse?.result || [])) {
        if (!q.symbol || !q.regularMarketPrice) continue;
        results.push({
          symbol: q.symbol,
          name: q.longName || q.shortName || q.symbol,
          asset_type: 'stock',
          price: q.regularMarketPrice,
          open: q.regularMarketOpen || q.regularMarketPrice,
          high: q.regularMarketDayHigh || q.regularMarketPrice,
          low: q.regularMarketDayLow || q.regularMarketPrice,
          volume: q.regularMarketVolume || 0,
          change: q.regularMarketChange || 0,
          change_percent: q.regularMarketChangePercent || 0,
          previous_close: q.regularMarketPreviousClose || q.regularMarketPrice,
          is_market_open: q.marketState === 'REGULAR',
          source: 'yahoo-batch',
          timestamp: new Date().toISOString(),
        });
      }
    }
  } catch (e) {
    console.error('Yahoo batch:', e);
  }

  return results;
}

// Yahoo chart API — parallel batches of 5 symbols
async function fetchYahooChartParallel(symbols: string[]): Promise<NormalizedQuote[]> {
  if (!symbols.length) return [];
  const results: NormalizedQuote[] = [];
  const BATCH = 5;

  for (let i = 0; i < symbols.length; i += BATCH) {
    const batch = symbols.slice(i, i + BATCH);

    const batchResults = await Promise.all(batch.map(async (symbol) => {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
          },
        });
        if (!res.ok) return null;

        const data = await res.json();
        const meta = data?.chart?.result?.[0]?.meta;
        if (!meta?.regularMarketPrice) return null;

        const price = Number(meta.regularMarketPrice);
        const previousClose = Number(meta.previousClose || meta.chartPreviousClose || price);
        const change = price - previousClose;
        const changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0;

        return {
          symbol,
          name: meta.shortName || meta.longName || symbol,
          asset_type: 'stock' as const,
          price,
          open: Number(meta.regularMarketOpen || price),
          high: Number(meta.regularMarketDayHigh || price),
          low: Number(meta.regularMarketDayLow || price),
          volume: Number(meta.regularMarketVolume || 0),
          change,
          change_percent: changePercent,
          previous_close: previousClose,
          is_market_open: meta.marketState === 'REGULAR',
          source: 'yahoo-chart',
          timestamp: new Date().toISOString(),
        } as NormalizedQuote;
      } catch (e) {
        console.error(`Yahoo chart ${symbol}:`, e);
        return null;
      }
    }));

    results.push(...batchResults.filter((r): r is NormalizedQuote => r !== null));

    // Small delay between batches to avoid rate limiting
    if (i + BATCH < symbols.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  return results;
}

// ─── DB cache fallback for stocks/ETFs ───
async function fetchFromDBCache(symbols: string[], db: ReturnType<typeof createClient>): Promise<NormalizedQuote[]> {
  if (!symbols.length) return [];
  const results: NormalizedQuote[] = [];
  const etfSet = new Set(['SPY','QQQ','VTI','ARKK','XLE','XLK','IWM','EEM','GLD','TLT','DIA','XLF','XLV','SOXX','VOO','KWEB','SMH','XBI','IBIT','BITO']);

  try {
    const { data } = await db
      .from('ohlcv_cache')
      .select('*')
      .in('symbol', symbols)
      .eq('timeframe', '1d')
      .order('timestamp', { ascending: false });

    if (!data) return [];

    // Get latest bar per symbol
    const latest = new Map<string, typeof data[0]>();
    for (const row of data) {
      if (!latest.has(row.symbol)) latest.set(row.symbol, row);
    }

    for (const [symbol, row] of latest) {
      // Only use if less than 48h old
      const age = Date.now() - new Date(row.fetched_at || row.timestamp).getTime();
      if (age > 48 * 60 * 60 * 1000) continue;

      results.push({
        symbol,
        name: symbol,
        asset_type: etfSet.has(symbol) ? 'etf' : (row.asset_type || 'stock'),
        price: row.close,
        open: row.open,
        high: row.high,
        low: row.low,
        volume: row.volume,
        change: row.close - row.open,
        change_percent: row.open > 0 ? ((row.close - row.open) / row.open) * 100 : 0,
        previous_close: row.open,
        is_market_open: false,
        source: 'db-cache',
        timestamp: row.timestamp,
      });
    }
  } catch (e) {
    console.error('DB cache fallback:', e);
  }

  return results;
}

// ─── Twelve Data Quote Fetcher (batch up to 8 symbols per request) ───
async function fetchTwelveDataQuotes(symbols: string[], apiKey: string): Promise<NormalizedQuote[]> {
  if (!symbols.length || !apiKey) return [];
  const results: NormalizedQuote[] = [];
  const etfSet = new Set(['SPY','QQQ','VTI','ARKK','XLE','XLK','IWM','EEM','GLD','TLT','DIA','XLF','XLV','SOXX','VOO','KWEB','SMH','XBI','IBIT','BITO']);
  const forexSet = new Set(['EUR/USD','GBP/USD','USD/JPY','AUD/USD','USD/CAD','USD/CHF','NZD/USD','EUR/GBP','EUR/JPY','GBP/JPY','USD/MXN','EUR/CHF','AUD/JPY']);
  const commoditySet = new Set(['XAU/USD','XAG/USD','CL','NG','HG']);

  // Twelve Data free plan: 8 credits/min, 1 credit per symbol in batch quote
  const BATCH = 8;
  for (let i = 0; i < symbols.length; i += BATCH) {
    const batch = symbols.slice(i, i + BATCH);
    try {
      const symbolStr = batch.join(',');
      const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbolStr)}&apikey=${apiKey}`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();

      // Single symbol returns object directly, multiple returns keyed object
      const entries = batch.length === 1 ? [[batch[0], data]] : Object.entries(data);

      for (const [sym, quote] of entries) {
        const q = quote as Record<string, unknown>;
        if (!q || q.status === 'error' || !q.close) continue;

        const price = parseFloat(String(q.close));
        if (price <= 0) continue;

        const prevClose = parseFloat(String(q.previous_close || q.open || price));
        const change = price - prevClose;
        const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;

        let assetType = 'stock';
        const s = String(sym);
        if (etfSet.has(s)) assetType = 'etf';
        else if (forexSet.has(s)) assetType = 'forex';
        else if (commoditySet.has(s)) assetType = 'commodity';

        results.push({
          symbol: s,
          name: String(q.name || s),
          asset_type: assetType,
          price,
          open: parseFloat(String(q.open || price)),
          high: parseFloat(String(q.high || price)),
          low: parseFloat(String(q.low || price)),
          volume: parseFloat(String(q.volume || 0)),
          change,
          change_percent: changePct,
          previous_close: prevClose,
          is_market_open: q.is_market_open === true,
          source: 'twelvedata',
          timestamp: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.error(`TwelveData batch ${i}:`, e);
    }

    // Delay between batches to respect rate limit
    if (i + BATCH < symbols.length) {
      await new Promise(resolve => setTimeout(resolve, 8000));
    }
  }

  return results;
}

// ─── Finnhub Quote Fetcher ───
async function fetchFinnhubQuotes(symbols: string[], apiKey: string): Promise<NormalizedQuote[]> {
  if (!symbols.length || !apiKey) return [];
  const results: NormalizedQuote[] = [];
  const etfSet = new Set(['SPY','QQQ','VTI','ARKK','XLE','XLK','IWM','EEM','GLD','TLT','DIA','XLF','XLV','SOXX','VOO','KWEB','SMH','XBI','IBIT','BITO']);

  // Finnhub free: 60 calls/min. Fetch in parallel batches of 10
  const BATCH = 10;
  for (let i = 0; i < symbols.length; i += BATCH) {
    const batch = symbols.slice(i, i + BATCH);
    const batchResults = await Promise.all(batch.map(async (symbol) => {
      try {
        const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const q = await res.json();
        if (!q.c || q.c <= 0) return null;

        const price = q.c;
        const prevClose = q.pc || price;
        const change = q.d || (price - prevClose);
        const changePct = q.dp || (prevClose > 0 ? (change / prevClose) * 100 : 0);

        return {
          symbol,
          name: symbol,
          asset_type: etfSet.has(symbol) ? 'etf' : 'stock',
          price,
          open: q.o || price,
          high: q.h || price,
          low: q.l || price,
          volume: 0,
          change,
          change_percent: changePct,
          previous_close: prevClose,
          is_market_open: true,
          source: 'finnhub',
          timestamp: new Date().toISOString(),
        } as NormalizedQuote;
      } catch (e) {
        console.error(`Finnhub ${symbol}:`, e);
        return null;
      }
    }));
    results.push(...batchResults.filter((r): r is NormalizedQuote => r !== null));
    if (i + BATCH < symbols.length) {
      await new Promise(resolve => setTimeout(resolve, 1200));
    }
  }
  return results;
}

// ─── Alpha Vantage Quote Fetcher ───
// Free: 25 requests/day. Premium: varies. 1 symbol per call (GLOBAL_QUOTE).
async function fetchAlphaVantageQuotes(symbols: string[], apiKey: string): Promise<NormalizedQuote[]> {
  if (!symbols.length || !apiKey) return [];
  const results: NormalizedQuote[] = [];
  const etfSet = new Set(['SPY','QQQ','VTI','ARKK','XLE','XLK','IWM','EEM','GLD','TLT','DIA','XLF','XLV','SOXX','VOO','KWEB','SMH','XBI','IBIT','BITO']);

  // Alpha Vantage free: 25 req/day, so limit to first 5 symbols max per call
  const batch = symbols.slice(0, 5);
  for (const symbol of batch) {
    try {
      const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      const gq = data?.['Global Quote'];
      if (!gq || !gq['05. price']) continue;

      const price = parseFloat(gq['05. price']);
      if (price <= 0) continue;
      const prevClose = parseFloat(gq['08. previous close'] || price);
      const change = parseFloat(gq['09. change'] || '0');
      const changePct = parseFloat((gq['10. change percent'] || '0').replace('%', ''));

      results.push({
        symbol,
        name: symbol,
        asset_type: etfSet.has(symbol) ? 'etf' : 'stock',
        price,
        open: parseFloat(gq['02. open'] || String(price)),
        high: parseFloat(gq['03. high'] || String(price)),
        low: parseFloat(gq['04. low'] || String(price)),
        volume: parseFloat(gq['06. volume'] || '0'),
        change,
        change_percent: changePct,
        previous_close: prevClose,
        is_market_open: true,
        source: 'alphavantage',
        timestamp: new Date().toISOString(),
      });
    } catch (e) {
      console.error(`AlphaVantage ${symbol}:`, e);
    }
    // Small delay between calls
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  return results;
}

// ─── ExchangeRate-API (FREE, no key needed) — forex only ───
// Updates once/day, no strict rate limit, returns all pairs in one call per base
async function fetchExchangeRateAPI(symbols: string[]): Promise<NormalizedQuote[]> {
  if (!symbols.length) return [];
  const results: NormalizedQuote[] = [];
  const baseMap = new Map<string, string[]>();
  for (const s of symbols) {
    const parts = s.split('/');
    if (parts.length !== 2) continue;
    const arr = baseMap.get(parts[0]) || [];
    arr.push(s);
    baseMap.set(parts[0], arr);
  }
  for (const [base, pairs] of baseMap) {
    try {
      const res = await fetch(`https://open.er-api.com/v6/latest/${base}`);
      if (!res.ok) continue;
      const data = await res.json();
      if (data.result !== 'success' || !data.rates) continue;
      for (const pair of pairs) {
        const quote = pair.split('/')[1];
        const rate = data.rates[quote];
        if (!rate || rate <= 0) continue;
        results.push({
          symbol: pair, name: pair, asset_type: 'forex',
          price: rate, open: rate, high: rate, low: rate, volume: 0,
          change: 0, change_percent: 0, previous_close: rate,
          is_market_open: true, source: 'exchangerate-api', timestamp: new Date().toISOString(),
        });
      }
    } catch (e) { console.error(`ExchangeRate-API ${base}:`, e); }
  }
  return results;
}

// ─── Alpha Vantage Forex/Commodity Fetcher ───
// CURRENCY_EXCHANGE_RATE: 1 pair/call, shares 25/day quota with stock quotes
async function fetchAlphaVantageForex(symbols: string[], apiKey: string): Promise<NormalizedQuote[]> {
  if (!symbols.length || !apiKey) return [];
  const results: NormalizedQuote[] = [];
  const batch = symbols.slice(0, 3);
  for (const pair of batch) {
    try {
      const [from, to] = pair.split('/');
      if (!from || !to) continue;
      const url = `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${from}&to_currency=${to}&apikey=${apiKey}`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      const rate = data?.['Realtime Currency Exchange Rate'];
      if (!rate) continue;
      const price = parseFloat(rate['5. Exchange Rate'] || '0');
      if (price <= 0) continue;
      const isCommodity = pair.includes('XAU') || pair.includes('XAG');
      results.push({
        symbol: pair, name: `${from}/${to}`,
        asset_type: isCommodity ? 'commodity' : 'forex',
        price, open: price,
        high: parseFloat(rate['9. Ask Price'] || String(price)),
        low: parseFloat(rate['8. Bid Price'] || String(price)),
        volume: 0, change: 0, change_percent: 0, previous_close: price,
        is_market_open: true, source: 'alphavantage', timestamp: new Date().toISOString(),
      });
    } catch (e) { console.error(`AV forex ${pair}:`, e); }
    await new Promise(r => setTimeout(r, 300));
  }
  return results;
}

// ─── Alpaca Markets Snapshot Fetcher ───
// Free tier: 200 req/min, 15min delayed. Batch endpoint for US stocks.
async function fetchAlpacaSnapshots(symbols: string[]): Promise<NormalizedQuote[]> {
  if (!symbols.length) return [];
  const apiKeyId = Deno.env.get("ALPACA_API_KEY_ID");
  const apiSecret = Deno.env.get("ALPACA_API_SECRET_KEY");
  if (!apiKeyId || !apiSecret) return [];

  const results: NormalizedQuote[] = [];
  const etfSet = new Set(['SPY','QQQ','VTI','ARKK','XLE','XLK','IWM','EEM','GLD','TLT','DIA','XLF','XLV','SOXX','VOO','KWEB','SMH','XBI','IBIT','BITO']);

  try {
    // Alpaca data API — snapshots endpoint (batch)
    const url = `https://data.alpaca.markets/v2/stocks/snapshots?symbols=${encodeURIComponent(symbols.join(','))}`;
    const res = await fetch(url, {
      headers: {
        'APCA-API-KEY-ID': apiKeyId,
        'APCA-API-SECRET-KEY': apiSecret,
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      console.error(`Alpaca snapshots HTTP ${res.status}: ${await res.text()}`);
      return [];
    }

    const data = await res.json();
    // Response is { "AAPL": { latestTrade, latestQuote, minuteBar, dailyBar, prevDailyBar }, ... }
    for (const [sym, snap] of Object.entries(data)) {
      const s = snap as Record<string, any>;
      const daily = s.dailyBar;
      const prev = s.prevDailyBar;
      const trade = s.latestTrade;
      if (!daily && !trade) continue;

      const price = trade?.p || daily?.c || 0;
      if (price <= 0) continue;

      const prevClose = prev?.c || price;
      const change = price - prevClose;
      const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;

      results.push({
        symbol: sym,
        name: sym,
        asset_type: etfSet.has(sym) ? 'etf' : 'stock',
        price,
        open: daily?.o || price,
        high: daily?.h || price,
        low: daily?.l || price,
        volume: daily?.v || 0,
        change,
        change_percent: changePct,
        previous_close: prevClose,
        is_market_open: true,
        source: 'alpaca',
        timestamp: trade?.t || new Date().toISOString(),
      });
    }
  } catch (e) {
    console.error('Alpaca snapshots:', e);
  }

  return results;
}

// ─── Alpaca Crypto Snapshot Fetcher ───
async function fetchAlpacaCryptoSnapshots(symbols: string[]): Promise<NormalizedQuote[]> {
  if (!symbols.length) return [];
  const apiKeyId = Deno.env.get("ALPACA_API_KEY_ID");
  const apiSecret = Deno.env.get("ALPACA_API_SECRET_KEY");
  if (!apiKeyId || !apiSecret) return [];

  const results: NormalizedQuote[] = [];

  try {
    // Convert symbols: BTC/USD → BTC/USD (Alpaca uses this format)
    const alpacaSymbols = symbols.map(s => s.replace('/', '%2F'));
    const url = `https://data.alpaca.markets/v1beta3/crypto/us/snapshots?symbols=${alpacaSymbols.join(',')}`;
    const res = await fetch(url, {
      headers: {
        'APCA-API-KEY-ID': apiKeyId,
        'APCA-API-SECRET-KEY': apiSecret,
        'Accept': 'application/json',
      },
    });

    if (!res.ok) return [];
    const data = await res.json();
    const snapshots = data?.snapshots || data;

    for (const [sym, snap] of Object.entries(snapshots)) {
      const s = snap as Record<string, any>;
      const daily = s.dailyBar;
      const trade = s.latestTrade;
      const price = trade?.p || daily?.c || 0;
      if (price <= 0) continue;

      const prevClose = daily?.c || price;
      const change = price - prevClose;

      results.push({
        symbol: sym,
        name: sym,
        asset_type: 'crypto',
        price,
        open: daily?.o || price,
        high: daily?.h || price,
        low: daily?.l || price,
        volume: daily?.v || 0,
        change,
        change_percent: prevClose > 0 ? (change / prevClose) * 100 : 0,
        previous_close: prevClose,
        is_market_open: true,
        source: 'alpaca',
        timestamp: trade?.t || new Date().toISOString(),
      });
    }
  } catch (e) {
    console.error('Alpaca crypto:', e);
  }

  return results;
}

// ─── API Usage Logger (fire-and-forget) ───
function logApiUsage(db: ReturnType<typeof createClient>, source: string, action: string, requested: number, returned: number, timeMs: number, error?: string) {
  db.from('api_usage_log').insert({
    source,
    action,
    symbols_requested: requested,
    symbols_returned: returned,
    response_time_ms: timeMs,
    error_message: error || null,
  }).then(({ error: e }) => {
    if (e) console.error('Usage log error:', e.message);
  });
}

// ─── OHLCV Historical Fetcher (Twelve Data) ───
async function fetchOHLCVHistory(symbol: string, timeframe: string, outputsize: number, apiKey: string): Promise<OHLCVBar[]> {
  const interval = timeframe === '1d' ? '1day' : timeframe === '1h' ? '1h' : timeframe === '4h' ? '4h' : '1day';
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=${outputsize}&apikey=${apiKey}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === 'error' || !data.values) return [];
    return data.values.map((v: Record<string, string>) => ({
      symbol,
      timeframe,
      open: parseFloat(v.open),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close),
      volume: parseFloat(v.volume || '0'),
      timestamp: v.datetime,
      source: 'twelvedata',
      asset_type: 'stock',
    }));
  } catch (e) {
    console.error(`OHLCV ${symbol}:`, e);
    return [];
  }
}

// ─── Main Handler ───
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, symbols, timeframe, outputsize } = await req.json();
    const freeCryptoKey = Deno.env.get("FREE_CRYPTO_API_KEY");
    const fcsKey = Deno.env.get("FCS_API_KEY");
    const twelveKey = Deno.env.get("TWELVE_DATA_API_KEY");
    const finnhubKey = Deno.env.get("FINNHUB_API_KEY");
    const alphaVantageKey = Deno.env.get("ALPHA_VANTAGE_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, supabaseKey);

    // ─── ACTION: quotes ───
    if (action === 'quotes') {
      const allSymbols = symbols as string[];
      const cacheKey = `nq:${allSymbols.sort().join(',')}`;
      const cached = memGet(cacheKey);
      if (cached) {
        logApiUsage(db, 'mem-cache', 'quote', allSymbols.length, allSymbols.length, 0);
        return jsonResponse(cached);
      }

      // ── STEP 1: Check DB cache for valid (non-expired) data ──
      const { cached: dbCached, missing: dbMissing } = await getFromDBCache(allSymbols, db);
      const cacheHits = dbCached.length;
      if (cacheHits > 0) {
        logApiUsage(db, 'db-cache-hit', 'quote', allSymbols.length, cacheHits, 0);
      }

      // If everything is cached, return immediately
      if (dbMissing.length === 0) {
        const quotesMap: Record<string, NormalizedQuote> = {};
        for (const q of dbCached) quotesMap[q.symbol] = q;
        memSet(cacheKey, quotesMap);
        return jsonResponse(quotesMap);
      }

      // ── STEP 2: Only fetch MISSING symbols from APIs (with coalescing) ──
      const freshQuotes = await coalesce(`fetch:${dbMissing.sort().join(',')}`, async () => {
        return await fetchMissingQuotes(dbMissing, { freeCryptoKey, fcsKey, twelveKey, finnhubKey, alphaVantageKey, db });
      });

      // Classify symbols
      const crypto: string[] = [], forex: string[] = [], commodity: string[] = [], stocks: string[] = [], etfs: string[] = [];
      const forexSet = new Set(['EUR/USD','GBP/USD','USD/JPY','AUD/USD','USD/CAD','USD/CHF','NZD/USD','EUR/GBP','EUR/JPY','GBP/JPY','USD/MXN','EUR/CHF','AUD/JPY']);
      const commoditySet = new Set(['XAU/USD','XAG/USD','CL','NG','HG']);
      const etfSet = new Set(['SPY','QQQ','VTI','ARKK','XLE','XLK','IWM','EEM','GLD','TLT','DIA','XLF','XLV','SOXX','VOO','KWEB','SMH','XBI','IBIT','BITO']);

      for (const s of (symbols as string[])) {
        if (s.includes('/USD') && !forexSet.has(s) && !commoditySet.has(s)) crypto.push(s);
        else if (forexSet.has(s)) forex.push(s);
        else if (commoditySet.has(s)) commodity.push(s);
        else if (etfSet.has(s)) etfs.push(s);
        else stocks.push(s);
      }

      // Fetch in parallel: crypto, forex/commodity, stocks+ETFs
      const allStockLike = [...stocks, ...etfs];
      const t0 = Date.now();
      const [cryptoQ, forexQ, stockQ] = await Promise.all([
        freeCryptoKey ? fetchCryptoQuotes(crypto, freeCryptoKey) : [],
        fcsKey ? fetchFCSQuotes([...forex, ...commodity], fcsKey, 'forex') : [],
        fcsKey ? fetchFCSQuotes(allStockLike, fcsKey, 'stock') : [],
      ]);
      const t1 = Date.now();

      // Log primary sources
      logApiUsage(db, 'freecryptoapi', 'quote', crypto.length, cryptoQ.length, t1 - t0);
      logApiUsage(db, 'fcsapi-forex', 'quote', forex.length + commodity.length, forexQ.length, t1 - t0);
      logApiUsage(db, 'fcsapi-stock', 'quote', allStockLike.length, stockQ.length, t1 - t0);

      const allQuotes = [...cryptoQ, ...forexQ, ...stockQ];
      const fetched = new Set(allQuotes.map(q => q.symbol));

      // Fallback 1: Twelve Data (batch of 8)
      const missingStockLike = allStockLike.filter(s => !fetched.has(s));
      const missingForex = [...forex, ...commodity].filter(s => !fetched.has(s));
      const missingForTwelve = [...missingStockLike, ...missingForex];
      if (twelveKey && missingForTwelve.length > 0) {
        const twelveSymbols = missingForTwelve.slice(0, 8);
        const t2 = Date.now();
        const tdQuotes = await fetchTwelveDataQuotes(twelveSymbols, twelveKey);
        logApiUsage(db, 'twelvedata', 'quote', twelveSymbols.length, tdQuotes.length, Date.now() - t2);
        for (const q of tdQuotes) fetched.add(q.symbol);
        allQuotes.push(...tdQuotes);
      }

      // Fallback 2: Alpaca snapshots for missing stocks/ETFs (200 req/min, batch)
      const missingForAlpaca = allStockLike.filter(s => !fetched.has(s));
      if (missingForAlpaca.length > 0) {
        const tAlp = Date.now();
        const alpQuotes = await fetchAlpacaSnapshots(missingForAlpaca);
        logApiUsage(db, 'alpaca', 'quote-stock', missingForAlpaca.length, alpQuotes.length, Date.now() - tAlp);
        for (const q of alpQuotes) {
          if (etfSet.has(q.symbol)) q.asset_type = 'etf';
          fetched.add(q.symbol);
        }
        allQuotes.push(...alpQuotes);
      }

      // Fallback 2b: Alpaca crypto for missing crypto
      const missingCrypto = crypto.filter(s => !fetched.has(s));
      if (missingCrypto.length > 0) {
        const tAlpC = Date.now();
        const alpCryptoQ = await fetchAlpacaCryptoSnapshots(missingCrypto);
        logApiUsage(db, 'alpaca', 'quote-crypto', missingCrypto.length, alpCryptoQ.length, Date.now() - tAlpC);
        for (const q of alpCryptoQ) fetched.add(q.symbol);
        allQuotes.push(...alpCryptoQ);
      }

      // Fallback 3: ExchangeRate-API for missing forex (FREE, no key)
      const missingForexAfterTD = [...forex].filter(s => !fetched.has(s));
      if (missingForexAfterTD.length > 0) {
        const t25 = Date.now();
        const erQuotes = await fetchExchangeRateAPI(missingForexAfterTD);
        logApiUsage(db, 'exchangerate-api', 'quote', missingForexAfterTD.length, erQuotes.length, Date.now() - t25);
        for (const q of erQuotes) fetched.add(q.symbol);
        allQuotes.push(...erQuotes);
      }

      // Fallback 4: Alpha Vantage forex/commodity for remaining pairs
      const missingFXCommodity = [...forex, ...commodity].filter(s => !fetched.has(s));
      if (alphaVantageKey && missingFXCommodity.length > 0) {
        const t26 = Date.now();
        const avFxQuotes = await fetchAlphaVantageForex(missingFXCommodity, alphaVantageKey);
        logApiUsage(db, 'alphavantage', 'quote-forex', missingFXCommodity.length, avFxQuotes.length, Date.now() - t26);
        for (const q of avFxQuotes) fetched.add(q.symbol);
        allQuotes.push(...avFxQuotes);
      }

      // Fallback 5: Finnhub for missing stocks/ETFs
      const missingForFinnhub = allStockLike.filter(s => !fetched.has(s));
      if (finnhubKey && missingForFinnhub.length > 0) {
        const t3 = Date.now();
        const fhQuotes = await fetchFinnhubQuotes(missingForFinnhub, finnhubKey);
        logApiUsage(db, 'finnhub', 'quote', missingForFinnhub.length, fhQuotes.length, Date.now() - t3);
        for (const q of fhQuotes) {
          if (etfSet.has(q.symbol)) q.asset_type = 'etf';
          fetched.add(q.symbol);
        }
        allQuotes.push(...fhQuotes);
      }

      // Fallback 5: Alpha Vantage stocks (max 5, 25/day limit shared)
      const missingForAV = allStockLike.filter(s => !fetched.has(s));
      if (alphaVantageKey && missingForAV.length > 0) {
        const t35 = Date.now();
        const avQuotes = await fetchAlphaVantageQuotes(missingForAV.slice(0, 5), alphaVantageKey);
        logApiUsage(db, 'alphavantage', 'quote-stock', Math.min(missingForAV.length, 5), avQuotes.length, Date.now() - t35);
        for (const q of avQuotes) {
          if (etfSet.has(q.symbol)) q.asset_type = 'etf';
          fetched.add(q.symbol);
        }
        allQuotes.push(...avQuotes);
      }

      // Fallback 6: Yahoo batch (single request)
      const stillMissingStocks = allStockLike.filter(s => !fetched.has(s));
      if (stillMissingStocks.length > 0) {
        const t4 = Date.now();
        const yBatch = await fetchYahooBatch(stillMissingStocks);
        logApiUsage(db, 'yahoo-batch', 'quote', stillMissingStocks.length, yBatch.length, Date.now() - t4);
        for (const q of yBatch) {
          if (etfSet.has(q.symbol)) q.asset_type = 'etf';
          fetched.add(q.symbol);
        }
        allQuotes.push(...yBatch);
      }

      // Fallback 7: Yahoo chart (parallel batches of 5)
      const stillMissing = allStockLike.filter(s => !fetched.has(s));
      if (stillMissing.length > 0) {
        const t5 = Date.now();
        const yChart = await fetchYahooChartParallel(stillMissing);
        logApiUsage(db, 'yahoo-chart', 'quote', stillMissing.length, yChart.length, Date.now() - t5);
        for (const q of yChart) {
          if (etfSet.has(q.symbol)) q.asset_type = 'etf';
          fetched.add(q.symbol);
        }
        allQuotes.push(...yChart);
      }

      // Fallback 8: DB cache for anything still missing
      const finalMissing = [...allStockLike, ...forex, ...commodity].filter(s => !fetched.has(s));
      if (finalMissing.length > 0) {
        const dbQuotes = await fetchFromDBCache(finalMissing, db);
        logApiUsage(db, 'db-cache', 'quote', finalMissing.length, dbQuotes.length, 0);
        allQuotes.push(...dbQuotes);
      }

      // Build map
      const quotesMap: Record<string, NormalizedQuote> = {};
      for (const q of allQuotes) quotesMap[q.symbol] = q;

      memSet(cacheKey, quotesMap);

      // Persist latest bars to ohlcv_cache (fire-and-forget)
      const bars = allQuotes.filter(q => q.source !== 'db-cache').map(q => ({
        symbol: q.symbol,
        timeframe: '1d',
        open: q.open,
        high: q.high,
        low: q.low,
        close: q.price,
        volume: q.volume,
        timestamp: new Date().toISOString().split('T')[0] + 'T00:00:00Z',
        source: q.source,
        asset_type: q.asset_type,
      }));

      if (bars.length > 0) {
        db.from('ohlcv_cache').upsert(bars, { onConflict: 'symbol,timeframe,timestamp' }).then(({ error }) => {
          if (error) console.error('OHLCV upsert error:', error.message);
        });
      }

      return jsonResponse(quotesMap);
    }

    // ─── ACTION: ohlcv ───
    if (action === 'ohlcv') {
      const symbol = (symbols as string[])[0];
      const tf = timeframe || '1d';
      const size = outputsize || 50;

      const { data: cached } = await db
        .from('ohlcv_cache')
        .select('*')
        .eq('symbol', symbol)
        .eq('timeframe', tf)
        .order('timestamp', { ascending: false })
        .limit(size);

      if (cached && cached.length >= size * 0.8) {
        return jsonResponse({ symbol, timeframe: tf, bars: cached });
      }

      if (twelveKey) {
        const bars = await fetchOHLCVHistory(symbol, tf, size, twelveKey);
        if (bars.length > 0) {
          db.from('ohlcv_cache').upsert(
            bars.map(b => ({ ...b, fetched_at: new Date().toISOString() })),
            { onConflict: 'symbol,timeframe,timestamp' }
          ).then(({ error }) => {
            if (error) console.error('OHLCV history upsert:', error.message);
          });
          return jsonResponse({ symbol, timeframe: tf, bars });
        }
      }

      return jsonResponse({ symbol, timeframe: tf, bars: cached || [] });
    }

    // ─── ACTION: features ───
    if (action === 'features') {
      const { data } = await db
        .from('market_features')
        .select('*')
        .in('symbol', symbols as string[])
        .eq('timeframe', timeframe || '1d');

      return jsonResponse({ features: data || [] });
    }

    return jsonResponse({ error: 'Unknown action. Use: quotes, ohlcv, features' }, 400);

  } catch (e) {
    console.error("market-data-normalized error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
