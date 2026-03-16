import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── In-memory cache ───
const memCache = new Map<string, { data: unknown; ts: number }>();
const MEM_TTL = 55_000;

function memGet(key: string) {
  const e = memCache.get(key);
  if (e && Date.now() - e.ts < MEM_TTL) return e.data;
  memCache.delete(key);
  return null;
}
function memSet(key: string, data: unknown) {
  memCache.set(key, { data, ts: Date.now() });
}

// ─── Request coalescing ───
const inflightRequests = new Map<string, Promise<NormalizedQuote[]>>();
function coalesce(key: string, fn: () => Promise<NormalizedQuote[]>): Promise<NormalizedQuote[]> {
  const existing = inflightRequests.get(key);
  if (existing) return existing;
  const promise = fn().finally(() => inflightRequests.delete(key));
  inflightRequests.set(key, promise);
  return promise;
}

// ─── Symbol Mapping Resolver ───
interface SymbolMapping {
  internal_symbol: string;
  display_name: string;
  asset_class: string;
  base_asset: string | null;
  quote_asset: string | null;
  alpaca_symbol: string | null;
  twelvedata_symbol: string | null;
  fcs_symbol: string | null;
  freecrypto_symbol: string | null;
  finnhub_symbol: string | null;
  yahoo_symbol: string | null;
  exchangerate_pair: string | null;
}

let symbolMappings: SymbolMapping[] = [];
let mappingsLoadedAt = 0;
const MAPPINGS_TTL = 5 * 60_000; // 5 min

async function loadMappings(db: ReturnType<typeof createClient>) {
  if (symbolMappings.length > 0 && Date.now() - mappingsLoadedAt < MAPPINGS_TTL) return;
  const { data, error } = await db
    .from('symbol_mapping')
    .select('*')
    .eq('is_active', true);
  if (!error && data) {
    symbolMappings = data as SymbolMapping[];
    mappingsLoadedAt = Date.now();
    console.log(`[SymbolResolver] Loaded ${symbolMappings.length} mappings`);
  }
}

function getMapping(internal: string): SymbolMapping | undefined {
  return symbolMappings.find(m => m.internal_symbol === internal);
}

function getAssetClass(sym: string): string {
  return getMapping(sym)?.asset_class || 'stock';
}

type ProviderKey = 'alpaca_symbol' | 'twelvedata_symbol' | 'fcs_symbol' | 'freecrypto_symbol' | 'finnhub_symbol' | 'yahoo_symbol' | 'exchangerate_pair';

/** Resolve internal symbols → provider symbols. Returns Map<providerSym, internalSym> */
function resolveForProvider(internals: string[], provider: ProviderKey): { providerSymbols: string[]; toInternal: Map<string, string> } {
  const providerSymbols: string[] = [];
  const toInternal = new Map<string, string>();

  for (const sym of internals) {
    const m = getMapping(sym);
    const resolved = m?.[provider] || sym;
    if (resolved) {
      providerSymbols.push(resolved);
      toInternal.set(resolved, sym);
    }
  }
  return { providerSymbols, toInternal };
}

/** Classify symbols by asset_class using mappings */
function classifySymbols(symbols: string[]): { crypto: string[]; forex: string[]; commodity: string[]; stocks: string[]; etfs: string[] } {
  const crypto: string[] = [], forex: string[] = [], commodity: string[] = [], stocks: string[] = [], etfs: string[] = [];
  for (const s of symbols) {
    const ac = getAssetClass(s);
    switch (ac) {
      case 'crypto': crypto.push(s); break;
      case 'forex': forex.push(s); break;
      case 'commodity': commodity.push(s); break;
      case 'etf': etfs.push(s); break;
      default: stocks.push(s); break;
    }
  }
  return { crypto, forex, commodity, stocks, etfs };
}

// ─── Types ───
interface OHLCVBar {
  symbol: string; timeframe: string; open: number; high: number; low: number;
  close: number; volume: number; timestamp: string; source: string; asset_type: string;
}

interface NormalizedQuote {
  symbol: string; name: string; asset_type: string; price: number; open: number;
  high: number; low: number; volume: number; change: number; change_percent: number;
  previous_close: number; is_market_open: boolean; source: string; timestamp: string;
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
      name: row.raw_data?.name || getMapping(row.symbol)?.display_name || row.symbol,
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

// ─── Data Source Fetchers ───
// Each fetcher now uses symbol_mapping to resolve provider-specific symbols

async function fetchCryptoQuotes(symbols: string[], apiKey: string): Promise<NormalizedQuote[]> {
  const results: NormalizedQuote[] = [];
  const { providerSymbols, toInternal } = resolveForProvider(symbols, 'freecrypto_symbol');

  await Promise.all(providerSymbols.map(async (provSym) => {
    const internalSym = toInternal.get(provSym) || provSym;
    try {
      const res = await fetch(`https://api.freecryptoapi.com/v1/getData?symbol=${provSym}`, {
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
          symbol: internalSym,
          name: item.name || getMapping(internalSym)?.display_name || provSym,
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
    } catch (e) { console.error(`Crypto ${provSym}:`, e); }
  }));
  return results;
}

async function fetchFCSQuotes(symbols: string[], apiKey: string, endpoint: 'forex' | 'stock'): Promise<NormalizedQuote[]> {
  if (!symbols.length) return [];
  const results: NormalizedQuote[] = [];
  const seen = new Set<string>();

  const { providerSymbols, toInternal } = resolveForProvider(symbols, 'fcs_symbol');

  const requestUrls = endpoint === 'stock'
    ? [
        `https://fcsapi.com/api-v3/stock/latest?symbol=${encodeURIComponent(providerSymbols.join(','))}&access_key=${apiKey}`,
        `https://fcsapi.com/api-v3/stock/latest?symbol=${encodeURIComponent(providerSymbols.join(','))}&exchange=NASDAQ,NYSE,AMEX,ARCA,BATS&access_key=${apiKey}`,
      ]
    : [
        `https://fcsapi.com/api-v3/forex/latest?symbol=${encodeURIComponent(providerSymbols.join(','))}&access_key=${apiKey}`,
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

        // Find matching provider symbol
        const matchedProvider = providerSymbols.find(ps => s === ps || s.includes(ps) || ps.includes(s)) || s;
        const internalSym = toInternal.get(matchedProvider) || matchedProvider;
        if (seen.has(internalSym)) continue;

        const close = parseFloat(String(item.c || 0));
        if (close <= 0) continue;

        const assetClass = getAssetClass(internalSym);
        if (assetClass === 'etf' && close < 5) continue;

        const change = parseFloat(String(item.ch || 0));
        results.push({
          symbol: internalSym,
          name: item.name || getMapping(internalSym)?.display_name || internalSym,
          asset_type: assetClass,
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
        seen.add(internalSym);
      }
      if (results.length > 0) break;
    }
  } catch (e) { console.error(`FCS ${endpoint}:`, e); }
  return results;
}

async function fetchYahooBatch(symbols: string[]): Promise<NormalizedQuote[]> {
  if (!symbols.length) return [];
  const results: NormalizedQuote[] = [];
  const { providerSymbols, toInternal } = resolveForProvider(symbols, 'yahoo_symbol');

  try {
    const url = `https://query1.finance.yahoo.com/v6/finance/quote?symbols=${encodeURIComponent(providerSymbols.join(','))}`;
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
        const internalSym = toInternal.get(q.symbol) || q.symbol;
        results.push({
          symbol: internalSym,
          name: q.longName || q.shortName || getMapping(internalSym)?.display_name || q.symbol,
          asset_type: getAssetClass(internalSym),
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
  } catch (e) { console.error('Yahoo batch:', e); }
  return results;
}

async function fetchYahooChartParallel(symbols: string[]): Promise<NormalizedQuote[]> {
  if (!symbols.length) return [];
  const results: NormalizedQuote[] = [];
  const { providerSymbols, toInternal } = resolveForProvider(symbols, 'yahoo_symbol');
  const BATCH = 5;

  for (let i = 0; i < providerSymbols.length; i += BATCH) {
    const batch = providerSymbols.slice(i, i + BATCH);
    const batchResults = await Promise.all(batch.map(async (provSym) => {
      const internalSym = toInternal.get(provSym) || provSym;
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(provSym)}?range=1d&interval=1d`;
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'application/json' },
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
          symbol: internalSym,
          name: meta.shortName || meta.longName || getMapping(internalSym)?.display_name || provSym,
          asset_type: getAssetClass(internalSym),
          price, open: Number(meta.regularMarketOpen || price),
          high: Number(meta.regularMarketDayHigh || price), low: Number(meta.regularMarketDayLow || price),
          volume: Number(meta.regularMarketVolume || 0), change, change_percent: changePercent,
          previous_close: previousClose, is_market_open: meta.marketState === 'REGULAR',
          source: 'yahoo-chart', timestamp: new Date().toISOString(),
        } as NormalizedQuote;
      } catch (e) { console.error(`Yahoo chart ${provSym}:`, e); return null; }
    }));
    results.push(...batchResults.filter((r): r is NormalizedQuote => r !== null));
    if (i + BATCH < providerSymbols.length) await new Promise(resolve => setTimeout(resolve, 200));
  }
  return results;
}

async function fetchFromDBCache(symbols: string[], db: ReturnType<typeof createClient>): Promise<NormalizedQuote[]> {
  if (!symbols.length) return [];
  const results: NormalizedQuote[] = [];
  try {
    const { data } = await db.from('ohlcv_cache').select('*').in('symbol', symbols).eq('timeframe', '1d').order('timestamp', { ascending: false });
    if (!data) return [];
    const latest = new Map<string, typeof data[0]>();
    for (const row of data) { if (!latest.has(row.symbol)) latest.set(row.symbol, row); }
    for (const [symbol, row] of latest) {
      const age = Date.now() - new Date(row.fetched_at || row.timestamp).getTime();
      if (age > 48 * 60 * 60 * 1000) continue;
      results.push({
        symbol, name: getMapping(symbol)?.display_name || symbol,
        asset_type: getAssetClass(symbol),
        price: row.close, open: row.open, high: row.high, low: row.low, volume: row.volume,
        change: row.close - row.open,
        change_percent: row.open > 0 ? ((row.close - row.open) / row.open) * 100 : 0,
        previous_close: row.open, is_market_open: false,
        source: 'db-cache', timestamp: row.timestamp,
      });
    }
  } catch (e) { console.error('DB cache fallback:', e); }
  return results;
}

async function fetchTwelveDataQuotes(symbols: string[], apiKey: string): Promise<NormalizedQuote[]> {
  if (!symbols.length || !apiKey) return [];
  const results: NormalizedQuote[] = [];
  const { providerSymbols, toInternal } = resolveForProvider(symbols, 'twelvedata_symbol');

  const BATCH = 8;
  for (let i = 0; i < providerSymbols.length; i += BATCH) {
    const batch = providerSymbols.slice(i, i + BATCH);
    try {
      const symbolStr = batch.join(',');
      const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbolStr)}&apikey=${apiKey}`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      const entries = batch.length === 1 ? [[batch[0], data]] : Object.entries(data);

      for (const [sym, quote] of entries) {
        const q = quote as Record<string, unknown>;
        if (!q || q.status === 'error' || !q.close) continue;
        const price = parseFloat(String(q.close));
        if (price <= 0) continue;
        const provSym = String(sym);
        const internalSym = toInternal.get(provSym) || provSym;
        const prevClose = parseFloat(String(q.previous_close || q.open || price));
        const change = price - prevClose;
        const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;

        results.push({
          symbol: internalSym,
          name: String(q.name || getMapping(internalSym)?.display_name || provSym),
          asset_type: getAssetClass(internalSym),
          price, open: parseFloat(String(q.open || price)),
          high: parseFloat(String(q.high || price)), low: parseFloat(String(q.low || price)),
          volume: parseFloat(String(q.volume || 0)), change, change_percent: changePct,
          previous_close: prevClose, is_market_open: q.is_market_open === true,
          source: 'twelvedata', timestamp: new Date().toISOString(),
        });
      }
    } catch (e) { console.error(`TwelveData batch ${i}:`, e); }
    if (i + BATCH < providerSymbols.length) await new Promise(resolve => setTimeout(resolve, 8000));
  }
  return results;
}

async function fetchFinnhubQuotes(symbols: string[], apiKey: string): Promise<NormalizedQuote[]> {
  if (!symbols.length || !apiKey) return [];
  const results: NormalizedQuote[] = [];
  const { providerSymbols, toInternal } = resolveForProvider(symbols, 'finnhub_symbol');

  const BATCH = 10;
  for (let i = 0; i < providerSymbols.length; i += BATCH) {
    const batch = providerSymbols.slice(i, i + BATCH);
    const batchResults = await Promise.all(batch.map(async (provSym) => {
      const internalSym = toInternal.get(provSym) || provSym;
      try {
        const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(provSym)}&token=${apiKey}`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const q = await res.json();
        if (!q.c || q.c <= 0) return null;
        const price = q.c;
        const prevClose = q.pc || price;
        const change = q.d || (price - prevClose);
        const changePct = q.dp || (prevClose > 0 ? (change / prevClose) * 100 : 0);
        return {
          symbol: internalSym,
          name: getMapping(internalSym)?.display_name || internalSym,
          asset_type: getAssetClass(internalSym),
          price, open: q.o || price, high: q.h || price, low: q.l || price,
          volume: 0, change, change_percent: changePct, previous_close: prevClose,
          is_market_open: true, source: 'finnhub', timestamp: new Date().toISOString(),
        } as NormalizedQuote;
      } catch (e) { console.error(`Finnhub ${provSym}:`, e); return null; }
    }));
    results.push(...batchResults.filter((r): r is NormalizedQuote => r !== null));
    if (i + BATCH < providerSymbols.length) await new Promise(resolve => setTimeout(resolve, 1200));
  }
  return results;
}

async function fetchAlphaVantageQuotes(symbols: string[], apiKey: string): Promise<NormalizedQuote[]> {
  if (!symbols.length || !apiKey) return [];
  const results: NormalizedQuote[] = [];
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
        symbol, name: getMapping(symbol)?.display_name || symbol,
        asset_type: getAssetClass(symbol),
        price, open: parseFloat(gq['02. open'] || String(price)),
        high: parseFloat(gq['03. high'] || String(price)), low: parseFloat(gq['04. low'] || String(price)),
        volume: parseFloat(gq['06. volume'] || '0'), change, change_percent: changePct,
        previous_close: prevClose, is_market_open: true,
        source: 'alphavantage', timestamp: new Date().toISOString(),
      });
    } catch (e) { console.error(`AlphaVantage ${symbol}:`, e); }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  return results;
}

async function fetchExchangeRateAPI(symbols: string[]): Promise<NormalizedQuote[]> {
  if (!symbols.length) return [];
  const results: NormalizedQuote[] = [];
  const baseMap = new Map<string, string[]>();
  for (const s of symbols) {
    const m = getMapping(s);
    const pair = m?.exchangerate_pair || s;
    const parts = pair.split('/');
    if (parts.length !== 2) continue;
    const arr = baseMap.get(parts[0]) || [];
    arr.push(s); // keep internal symbol
    baseMap.set(parts[0], arr);
  }
  for (const [base, internalSymbols] of baseMap) {
    try {
      const res = await fetch(`https://open.er-api.com/v6/latest/${base}`);
      if (!res.ok) continue;
      const data = await res.json();
      if (data.result !== 'success' || !data.rates) continue;
      for (const sym of internalSymbols) {
        const m = getMapping(sym);
        const pair = m?.exchangerate_pair || sym;
        const quote = pair.split('/')[1];
        const rate = data.rates[quote];
        if (!rate || rate <= 0) continue;
        results.push({
          symbol: sym, name: m?.display_name || sym, asset_type: getAssetClass(sym),
          price: rate, open: rate, high: rate, low: rate, volume: 0,
          change: 0, change_percent: 0, previous_close: rate,
          is_market_open: true, source: 'exchangerate-api', timestamp: new Date().toISOString(),
        });
      }
    } catch (e) { console.error(`ExchangeRate-API ${base}:`, e); }
  }
  return results;
}

async function fetchAlphaVantageForex(symbols: string[], apiKey: string): Promise<NormalizedQuote[]> {
  if (!symbols.length || !apiKey) return [];
  const results: NormalizedQuote[] = [];
  const batch = symbols.slice(0, 3);
  for (const sym of batch) {
    try {
      const m = getMapping(sym);
      const from = m?.base_asset || sym.split('/')[0];
      const to = m?.quote_asset || sym.split('/')[1];
      if (!from || !to) continue;
      const url = `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${from}&to_currency=${to}&apikey=${apiKey}`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      const rate = data?.['Realtime Currency Exchange Rate'];
      if (!rate) continue;
      const price = parseFloat(rate['5. Exchange Rate'] || '0');
      if (price <= 0) continue;
      results.push({
        symbol: sym, name: m?.display_name || `${from}/${to}`,
        asset_type: getAssetClass(sym),
        price, open: price,
        high: parseFloat(rate['9. Ask Price'] || String(price)),
        low: parseFloat(rate['8. Bid Price'] || String(price)),
        volume: 0, change: 0, change_percent: 0, previous_close: price,
        is_market_open: true, source: 'alphavantage', timestamp: new Date().toISOString(),
      });
    } catch (e) { console.error(`AV forex ${sym}:`, e); }
    await new Promise(r => setTimeout(r, 300));
  }
  return results;
}

async function fetchAlpacaSnapshots(symbols: string[]): Promise<NormalizedQuote[]> {
  if (!symbols.length) return [];
  const apiKeyId = Deno.env.get("ALPACA_API_KEY_ID");
  const apiSecret = Deno.env.get("ALPACA_API_SECRET_KEY");
  if (!apiKeyId || !apiSecret) return [];

  const results: NormalizedQuote[] = [];
  const { providerSymbols, toInternal } = resolveForProvider(symbols, 'alpaca_symbol');
  // Filter out nulls (symbols without alpaca mapping)
  const validSymbols = providerSymbols.filter(Boolean);
  if (!validSymbols.length) return [];

  try {
    const url = `https://data.alpaca.markets/v2/stocks/snapshots?symbols=${encodeURIComponent(validSymbols.join(','))}`;
    const res = await fetch(url, {
      headers: { 'APCA-API-KEY-ID': apiKeyId, 'APCA-API-SECRET-KEY': apiSecret, 'Accept': 'application/json' },
    });
    if (!res.ok) { console.error(`Alpaca snapshots HTTP ${res.status}: ${await res.text()}`); return []; }
    const data = await res.json();

    for (const [sym, snap] of Object.entries(data)) {
      const s = snap as Record<string, any>;
      const daily = s.dailyBar; const prev = s.prevDailyBar; const trade = s.latestTrade;
      if (!daily && !trade) continue;
      const price = trade?.p || daily?.c || 0;
      if (price <= 0) continue;
      const internalSym = toInternal.get(sym) || sym;
      const prevClose = prev?.c || price;
      const change = price - prevClose;
      const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;
      results.push({
        symbol: internalSym, name: getMapping(internalSym)?.display_name || sym,
        asset_type: getAssetClass(internalSym),
        price, open: daily?.o || price, high: daily?.h || price, low: daily?.l || price,
        volume: daily?.v || 0, change, change_percent: changePct, previous_close: prevClose,
        is_market_open: true, source: 'alpaca', timestamp: trade?.t || new Date().toISOString(),
      });
    }
  } catch (e) { console.error('Alpaca snapshots:', e); }
  return results;
}

async function fetchAlpacaCryptoSnapshots(symbols: string[]): Promise<NormalizedQuote[]> {
  if (!symbols.length) return [];
  const apiKeyId = Deno.env.get("ALPACA_API_KEY_ID");
  const apiSecret = Deno.env.get("ALPACA_API_SECRET_KEY");
  if (!apiKeyId || !apiSecret) return [];

  const results: NormalizedQuote[] = [];
  const { providerSymbols, toInternal } = resolveForProvider(symbols, 'alpaca_symbol');
  const validSymbols = providerSymbols.filter(Boolean);
  if (!validSymbols.length) return [];

  try {
    // Alpaca crypto uses format BTCUSD but URL-encode / if present
    const alpacaSymbols = validSymbols.map(s => s.replace('/', '%2F'));
    const url = `https://data.alpaca.markets/v1beta3/crypto/us/snapshots?symbols=${alpacaSymbols.join(',')}`;
    const res = await fetch(url, {
      headers: { 'APCA-API-KEY-ID': apiKeyId, 'APCA-API-SECRET-KEY': apiSecret, 'Accept': 'application/json' },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const snapshots = data?.snapshots || data;

    for (const [sym, snap] of Object.entries(snapshots)) {
      const s = snap as Record<string, any>;
      const daily = s.dailyBar; const trade = s.latestTrade;
      const price = trade?.p || daily?.c || 0;
      if (price <= 0) continue;
      // Alpaca may return BTCUSD or BTC/USD — find internal symbol
      const internalSym = toInternal.get(sym) || toInternal.get(sym.replace('/', '')) || sym;
      const prevClose = daily?.c || price;
      const change = price - prevClose;
      results.push({
        symbol: internalSym, name: getMapping(internalSym)?.display_name || sym,
        asset_type: 'crypto',
        price, open: daily?.o || price, high: daily?.h || price, low: daily?.l || price,
        volume: daily?.v || 0, change,
        change_percent: prevClose > 0 ? (change / prevClose) * 100 : 0,
        previous_close: prevClose, is_market_open: true,
        source: 'alpaca', timestamp: trade?.t || new Date().toISOString(),
      });
    }
  } catch (e) { console.error('Alpaca crypto:', e); }
  return results;
}

// ─── API Usage Logger ───
function logApiUsage(db: ReturnType<typeof createClient>, source: string, action: string, requested: number, returned: number, timeMs: number, error?: string) {
  db.from('api_usage_log').insert({
    source, action, symbols_requested: requested, symbols_returned: returned,
    response_time_ms: timeMs, error_message: error || null,
  }).then(({ error: e }) => { if (e) console.error('Usage log error:', e.message); });
}

// ─── OHLCV Historical Fetcher ───
async function fetchOHLCVHistory(symbol: string, timeframe: string, outputsize: number, apiKey: string): Promise<OHLCVBar[]> {
  const m = getMapping(symbol);
  const tdSymbol = m?.twelvedata_symbol || symbol;
  const interval = timeframe === '1d' ? '1day' : timeframe === '1h' ? '1h' : timeframe === '4h' ? '4h' : '1day';
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(tdSymbol)}&interval=${interval}&outputsize=${outputsize}&apikey=${apiKey}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === 'error' || !data.values) return [];
    return data.values.map((v: Record<string, string>) => ({
      symbol, timeframe,
      open: parseFloat(v.open), high: parseFloat(v.high), low: parseFloat(v.low),
      close: parseFloat(v.close), volume: parseFloat(v.volume || '0'),
      timestamp: v.datetime, source: 'twelvedata', asset_type: getAssetClass(symbol),
    }));
  } catch (e) { console.error(`OHLCV ${symbol}:`, e); return []; }
}

// ─── Fetch missing symbols from APIs ───
interface FetchKeys {
  freeCryptoKey: string | undefined;
  fcsKey: string | undefined;
  twelveKey: string | undefined;
  finnhubKey: string | undefined;
  alphaVantageKey: string | undefined;
  db: ReturnType<typeof createClient>;
}

async function fetchMissingQuotes(symbols: string[], keys: FetchKeys): Promise<NormalizedQuote[]> {
  const { freeCryptoKey, fcsKey, twelveKey, finnhubKey, alphaVantageKey, db } = keys;

  // Classify using symbol_mapping
  const { crypto, forex, commodity, stocks, etfs } = classifySymbols(symbols);
  const allStockLike = [...stocks, ...etfs];
  const t0 = Date.now();

  // Primary: parallel fetch
  const [cryptoQ, forexQ, stockQ] = await Promise.all([
    freeCryptoKey ? fetchCryptoQuotes(crypto, freeCryptoKey) : [],
    fcsKey ? fetchFCSQuotes([...forex, ...commodity], fcsKey, 'forex') : [],
    fcsKey ? fetchFCSQuotes(allStockLike, fcsKey, 'stock') : [],
  ]);
  const t1 = Date.now();

  logApiUsage(db, 'freecryptoapi', 'quote', crypto.length, cryptoQ.length, t1 - t0);
  logApiUsage(db, 'fcsapi-forex', 'quote', forex.length + commodity.length, forexQ.length, t1 - t0);
  logApiUsage(db, 'fcsapi-stock', 'quote', allStockLike.length, stockQ.length, t1 - t0);

  const allQuotes = [...cryptoQ, ...forexQ, ...stockQ];
  const fetched = new Set(allQuotes.map(q => q.symbol));

  // Fallback 1: Twelve Data
  const missingForTwelve = [...allStockLike, ...forex, ...commodity].filter(s => !fetched.has(s));
  if (twelveKey && missingForTwelve.length > 0) {
    const batch = missingForTwelve.slice(0, 8);
    const t2 = Date.now();
    const tdQ = await fetchTwelveDataQuotes(batch, twelveKey);
    logApiUsage(db, 'twelvedata', 'quote', batch.length, tdQ.length, Date.now() - t2);
    for (const q of tdQ) fetched.add(q.symbol);
    allQuotes.push(...tdQ);
  }

  // Fallback 2: Alpaca (stocks + crypto)
  const missingStocks = allStockLike.filter(s => !fetched.has(s));
  if (missingStocks.length > 0) {
    const tA = Date.now();
    const aq = await fetchAlpacaSnapshots(missingStocks);
    logApiUsage(db, 'alpaca', 'quote-stock', missingStocks.length, aq.length, Date.now() - tA);
    for (const q of aq) fetched.add(q.symbol);
    allQuotes.push(...aq);
  }
  const missingCrypto = crypto.filter(s => !fetched.has(s));
  if (missingCrypto.length > 0) {
    const tAC = Date.now();
    const acq = await fetchAlpacaCryptoSnapshots(missingCrypto);
    logApiUsage(db, 'alpaca', 'quote-crypto', missingCrypto.length, acq.length, Date.now() - tAC);
    for (const q of acq) fetched.add(q.symbol);
    allQuotes.push(...acq);
  }

  // Fallback 3: ExchangeRate-API (forex, free)
  const missingFx = forex.filter(s => !fetched.has(s));
  if (missingFx.length > 0) {
    const t3 = Date.now();
    const erQ = await fetchExchangeRateAPI(missingFx);
    logApiUsage(db, 'exchangerate-api', 'quote', missingFx.length, erQ.length, Date.now() - t3);
    for (const q of erQ) fetched.add(q.symbol);
    allQuotes.push(...erQ);
  }

  // Fallback 4: Alpha Vantage FX/Commodity
  const missingFXC = [...forex, ...commodity].filter(s => !fetched.has(s));
  if (alphaVantageKey && missingFXC.length > 0) {
    const t4 = Date.now();
    const avQ = await fetchAlphaVantageForex(missingFXC, alphaVantageKey);
    logApiUsage(db, 'alphavantage', 'quote-forex', missingFXC.length, avQ.length, Date.now() - t4);
    for (const q of avQ) fetched.add(q.symbol);
    allQuotes.push(...avQ);
  }

  // Fallback 5: Finnhub (stocks)
  const missingFH = allStockLike.filter(s => !fetched.has(s));
  if (finnhubKey && missingFH.length > 0) {
    const t5 = Date.now();
    const fhQ = await fetchFinnhubQuotes(missingFH, finnhubKey);
    logApiUsage(db, 'finnhub', 'quote', missingFH.length, fhQ.length, Date.now() - t5);
    for (const q of fhQ) fetched.add(q.symbol);
    allQuotes.push(...fhQ);
  }

  // Fallback 6: Alpha Vantage stocks
  const missingAV = allStockLike.filter(s => !fetched.has(s));
  if (alphaVantageKey && missingAV.length > 0) {
    const t6 = Date.now();
    const avSQ = await fetchAlphaVantageQuotes(missingAV.slice(0, 5), alphaVantageKey);
    logApiUsage(db, 'alphavantage', 'quote-stock', Math.min(missingAV.length, 5), avSQ.length, Date.now() - t6);
    for (const q of avSQ) fetched.add(q.symbol);
    allQuotes.push(...avSQ);
  }

  // Fallback 7: Yahoo batch
  const missingY = allStockLike.filter(s => !fetched.has(s));
  if (missingY.length > 0) {
    const t7 = Date.now();
    const yQ = await fetchYahooBatch(missingY);
    logApiUsage(db, 'yahoo-batch', 'quote', missingY.length, yQ.length, Date.now() - t7);
    for (const q of yQ) fetched.add(q.symbol);
    allQuotes.push(...yQ);
  }

  // Fallback 8: Yahoo chart
  const missingYC = allStockLike.filter(s => !fetched.has(s));
  if (missingYC.length > 0) {
    const t8 = Date.now();
    const ycQ = await fetchYahooChartParallel(missingYC);
    logApiUsage(db, 'yahoo-chart', 'quote', missingYC.length, ycQ.length, Date.now() - t8);
    for (const q of ycQ) fetched.add(q.symbol);
    allQuotes.push(...ycQ);
  }

  // Fallback 9: OHLCV DB cache (48h)
  const finalMissing = symbols.filter(s => !fetched.has(s));
  if (finalMissing.length > 0) {
    const dbQ = await fetchFromDBCache(finalMissing, db);
    logApiUsage(db, 'db-cache', 'quote', finalMissing.length, dbQ.length, 0);
    allQuotes.push(...dbQ);
  }

  return allQuotes;
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

    // Load symbol mappings (cached 5min)
    await loadMappings(db);

    // ─── ACTION: quotes ───
    if (action === 'quotes') {
      const allSymbols = symbols as string[];
      const cacheKey = `nq:${allSymbols.sort().join(',')}`;
      const cached = memGet(cacheKey);
      if (cached) {
        logApiUsage(db, 'mem-cache', 'quote', allSymbols.length, allSymbols.length, 0);
        return jsonResponse(cached);
      }

      const { cached: dbCached, missing: dbMissing } = await getFromDBCache(allSymbols, db);
      if (dbCached.length > 0) {
        logApiUsage(db, 'db-cache-hit', 'quote', allSymbols.length, dbCached.length, 0);
      }

      if (dbMissing.length === 0) {
        const quotesMap: Record<string, NormalizedQuote> = {};
        for (const q of dbCached) quotesMap[q.symbol] = q;
        memSet(cacheKey, quotesMap);
        return jsonResponse(quotesMap);
      }

      const freshQuotes = await coalesce(`fetch:${dbMissing.sort().join(',')}`, async () => {
        return await fetchMissingQuotes(dbMissing, { freeCryptoKey, fcsKey, twelveKey, finnhubKey, alphaVantageKey, db });
      });

      const allQuotes = [...dbCached, ...freshQuotes];
      const quotesMap: Record<string, NormalizedQuote> = {};
      for (const q of allQuotes) quotesMap[q.symbol] = q;
      memSet(cacheKey, quotesMap);

      persistToDBCache(freshQuotes, db, 2);

      const bars = freshQuotes.filter(q => !q.source.startsWith('cache:')).map(q => ({
        symbol: q.symbol, timeframe: '1d',
        open: q.open, high: q.high, low: q.low, close: q.price,
        volume: q.volume, timestamp: new Date().toISOString().split('T')[0] + 'T00:00:00Z',
        source: q.source, asset_type: q.asset_type,
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

      const { data: cached } = await db.from('ohlcv_cache').select('*').eq('symbol', symbol).eq('timeframe', tf).order('timestamp', { ascending: false }).limit(size);
      if (cached && cached.length >= size * 0.8) {
        return jsonResponse({ symbol, timeframe: tf, bars: cached });
      }

      if (twelveKey) {
        const bars = await fetchOHLCVHistory(symbol, tf, size, twelveKey);
        if (bars.length > 0) {
          db.from('ohlcv_cache').upsert(bars.map(b => ({ ...b, fetched_at: new Date().toISOString() })), { onConflict: 'symbol,timeframe,timestamp' }).then(({ error }) => {
            if (error) console.error('OHLCV history upsert:', error.message);
          });
          return jsonResponse({ symbol, timeframe: tf, bars });
        }
      }

      return jsonResponse({ symbol, timeframe: tf, bars: cached || [] });
    }

    // ─── ACTION: features ───
    if (action === 'features') {
      const { data } = await db.from('market_features').select('*').in('symbol', symbols as string[]).eq('timeframe', timeframe || '1d');
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
