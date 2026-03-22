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
const MAPPINGS_TTL = 5 * 60_000;

async function loadMappings(db: ReturnType<typeof createClient>) {
  if (symbolMappings.length > 0 && Date.now() - mappingsLoadedAt < MAPPINGS_TTL) return;
  const { data, error } = await db.from('symbol_mapping').select('*').eq('is_active', true);
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
  const { data } = await db.from('market_cache').select('*').in('symbol', symbols).gt('expires_at', new Date().toISOString());
  const cached: NormalizedQuote[] = [];
  const foundSymbols = new Set<string>();
  for (const row of (data || [])) {
    foundSymbols.add(row.symbol);
    cached.push({
      symbol: row.symbol,
      name: row.raw_data?.name || getMapping(row.symbol)?.display_name || row.symbol,
      asset_type: row.asset_class, price: Number(row.price),
      open: Number(row.open_price || row.price), high: Number(row.high_price || row.price),
      low: Number(row.low_price || row.price), volume: Number(row.volume || 0),
      change: Number(row.change_val || 0), change_percent: Number(row.change_percent || 0),
      previous_close: Number(row.previous_close || row.price),
      is_market_open: row.is_market_open ?? true,
      source: `cache:${row.provider}`, timestamp: row.updated_at,
    });
  }
  return { cached, missing: symbols.filter(s => !foundSymbols.has(s)) };
}

async function persistToDBCache(quotes: NormalizedQuote[], db: ReturnType<typeof createClient>, ttlMinutes = 2) {
  if (!quotes.length) return;
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();
  const rows = quotes.filter(q => !q.source.startsWith('cache:')).map(q => ({
    symbol: q.symbol, asset_class: q.asset_type, provider: q.source, price: q.price,
    open_price: q.open, high_price: q.high, low_price: q.low, volume: q.volume,
    change_val: q.change, change_percent: q.change_percent, previous_close: q.previous_close,
    is_market_open: q.is_market_open, raw_data: { name: q.name },
    updated_at: new Date().toISOString(), expires_at: expiresAt, request_count: 1,
  }));
  if (rows.length > 0) {
    db.from('market_cache').upsert(rows, { onConflict: 'symbol' }).then(({ error }) => {
      if (error) console.error('market_cache upsert error:', error.message);
    });
  }
}

// ─── Data Source Fetchers ───

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

async function fetchAlpacaSnapshots(symbols: string[]): Promise<NormalizedQuote[]> {
  if (!symbols.length) return [];
  const apiKeyId = Deno.env.get("ALPACA_API_KEY_ID");
  const apiSecret = Deno.env.get("ALPACA_API_SECRET_KEY");
  if (!apiKeyId || !apiSecret) return [];
  const results: NormalizedQuote[] = [];
  const { providerSymbols, toInternal } = resolveForProvider(symbols, 'alpaca_symbol');
  const validSymbols = providerSymbols.filter(Boolean);
  if (!validSymbols.length) return [];
  try {
    const url = `https://data.alpaca.markets/v2/stocks/snapshots?symbols=${encodeURIComponent(validSymbols.join(','))}`;
    const res = await fetch(url, {
      headers: { 'APCA-API-KEY-ID': apiKeyId, 'APCA-API-SECRET-KEY': apiSecret, 'Accept': 'application/json' },
    });
    if (!res.ok) { console.error(`Alpaca snapshots HTTP ${res.status}`); return []; }
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

async function fetchBinanceTicker(symbols: string[]): Promise<NormalizedQuote[]> {
  if (!symbols.length) return [];
  const results: NormalizedQuote[] = [];
  for (const sym of symbols) {
    try {
      const m = getMapping(sym);
      // Convert BTC/USD → BTCUSDT for Binance
      const base = m?.base_asset || sym.split('/')[0];
      const binanceSym = `${base}USDT`;
      const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${binanceSym}`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) continue;
      const d = await res.json();
      const price = parseFloat(d.lastPrice);
      if (!price || price <= 0) continue;
      const prevClose = parseFloat(d.prevClosePrice || d.openPrice || String(price));
      const change = parseFloat(d.priceChange || '0');
      const changePct = parseFloat(d.priceChangePercent || '0');
      results.push({
        symbol: sym, name: m?.display_name || sym, asset_type: 'crypto',
        price, open: parseFloat(d.openPrice || String(price)),
        high: parseFloat(d.highPrice || String(price)),
        low: parseFloat(d.lowPrice || String(price)),
        volume: parseFloat(d.volume || '0'), change, change_percent: changePct,
        previous_close: prevClose, is_market_open: true,
        source: 'binance', timestamp: new Date().toISOString(),
      });
    } catch (e) { console.error(`Binance ${sym}:`, e); }
  }
  return results;
}

// ─── Stale DB fallback (48h) ───
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

// ─── Simplified fetch: TwelveData primary, Alpaca/Binance fallback ───
async function fetchMissingQuotes(symbols: string[], twelveKey: string, db: ReturnType<typeof createClient>): Promise<NormalizedQuote[]> {
  const { crypto, forex, commodity, stocks, etfs } = classifySymbols(symbols);
  const allStockLike = [...stocks, ...etfs];
  const t0 = Date.now();

  // Primary: TwelveData for everything
  const allForTwelve = [...allStockLike, ...forex, ...commodity, ...crypto];
  const tdQ = await fetchTwelveDataQuotes(allForTwelve, twelveKey);
  logApiUsage(db, 'twelvedata', 'quote', allForTwelve.length, tdQ.length, Date.now() - t0);

  const fetched = new Set(tdQ.map(q => q.symbol));
  const allQuotes = [...tdQ];

  // Fallback: Alpaca for missing stocks/ETFs
  const missingStocks = allStockLike.filter(s => !fetched.has(s));
  if (missingStocks.length > 0) {
    const tA = Date.now();
    const aq = await fetchAlpacaSnapshots(missingStocks);
    logApiUsage(db, 'alpaca', 'quote-stock', missingStocks.length, aq.length, Date.now() - tA);
    for (const q of aq) fetched.add(q.symbol);
    allQuotes.push(...aq);
  }

  // Fallback: Binance for missing crypto
  const missingCrypto = crypto.filter(s => !fetched.has(s));
  if (missingCrypto.length > 0) {
    const tB = Date.now();
    const bq = await fetchBinanceTicker(missingCrypto);
    logApiUsage(db, 'binance', 'quote-crypto', missingCrypto.length, bq.length, Date.now() - tB);
    for (const q of bq) fetched.add(q.symbol);
    allQuotes.push(...bq);
  }

  // Final fallback: stale DB cache for anything still missing
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
    const twelveKey = Deno.env.get("TWELVE_DATA_API_KEY") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, supabaseKey);

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
        return await fetchMissingQuotes(dbMissing, twelveKey, db);
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
