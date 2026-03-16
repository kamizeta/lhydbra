import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// In-memory cache for hot data
const memCache = new Map<string, { data: unknown; ts: number }>();
const MEM_TTL = 30_000; // 30s in-memory

function memGet(key: string) {
  const e = memCache.get(key);
  if (e && Date.now() - e.ts < MEM_TTL) return e.data;
  memCache.delete(key);
  return null;
}
function memSet(key: string, data: unknown) {
  memCache.set(key, { data, ts: Date.now() });
}

// ─── Normalized OHLCV bar ───
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

// ─── Quote (current price snapshot) ───
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
  const etfSet = new Set(['SPY','QQQ','VTI','ARKK','XLE','XLK','IWM','EEM','GLD','TLT','DIA','XLF','XLV','SOXX','VOO','KWEB']);
  const requestUrls = endpoint === 'stock'
    ? [
        // First try without exchange filter because many ETFs trade on ARCA/BATS and were being excluded.
        `https://fcsapi.com/api-v3/stock/latest?symbol=${encodeURIComponent(symbols.join(','))}&access_key=${apiKey}`,
        // Fallback to explicit US exchanges in case the provider needs narrowing.
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

        const close = parseFloat(String(item.c || 0));
        if (close <= 0) continue;

        const matched = symbols.find(sym => s === sym || s.includes(sym) || sym.includes(s)) || s;
        const change = parseFloat(String(item.ch || 0));

        let assetType: string;
        if (endpoint === 'stock') {
          assetType = etfSet.has(matched) ? 'etf' : 'stock';
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
      }

      if (results.length > 0) break;
    }
  } catch (e) {
    console.error(`FCS ${endpoint}:`, e);
  }

  return results;
}

async function fetchYahooQuotes(symbols: string[]): Promise<NormalizedQuote[]> {
  if (!symbols.length) return [];
  const results: NormalizedQuote[] = [];
  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(','))}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketOpen,regularMarketDayHigh,regularMarketDayLow,regularMarketVolume,regularMarketPreviousClose,shortName,longName,exchange`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return results;
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
        source: 'yahoo',
        timestamp: new Date().toISOString(),
      });
    }
  } catch (e) { console.error('Yahoo:', e); }
  return results;
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, supabaseKey);

    // ─── ACTION: quotes ───
    if (action === 'quotes') {
      const cacheKey = `nq:${(symbols as string[]).sort().join(',')}`;
      const cached = memGet(cacheKey);
      if (cached) return jsonResponse(cached);

      // Classify symbols
      const crypto: string[] = [], forex: string[] = [], commodity: string[] = [], stocks: string[] = [], etfs: string[] = [];
      const forexSet = new Set(['EUR/USD','GBP/USD','USD/JPY','AUD/USD','USD/CAD','USD/CHF','NZD/USD','EUR/GBP','EUR/JPY','GBP/JPY']);
      const commoditySet = new Set(['XAU/USD','XAG/USD','CL','NG','HG']);
      const etfSet = new Set(['SPY','QQQ','VTI','ARKK','XLE','XLK','IWM','EEM','GLD','TLT','DIA','XLF','XLV','SOXX','VOO','KWEB']);

      for (const s of (symbols as string[])) {
        if (s.includes('/USD') && !forexSet.has(s) && !commoditySet.has(s)) crypto.push(s);
        else if (forexSet.has(s)) forex.push(s);
        else if (commoditySet.has(s)) commodity.push(s);
        else if (etfSet.has(s)) etfs.push(s);
        else stocks.push(s);
      }

      // Fetch in parallel: ETFs go through FCS stock endpoint first (same as stocks)
      const allStockLike = [...stocks, ...etfs];
      const [cryptoQ, forexQ, stockQ] = await Promise.all([
        freeCryptoKey ? fetchCryptoQuotes(crypto, freeCryptoKey) : [],
        fcsKey ? fetchFCSQuotes([...forex, ...commodity], fcsKey, 'forex') : [],
        fcsKey ? fetchFCSQuotes(allStockLike, fcsKey, 'stock') : [],
      ]);

      const allQuotes = [...cryptoQ, ...forexQ, ...stockQ];
      const fetched = new Set(allQuotes.map(q => q.symbol));

      // Fallback: Yahoo for missing stocks AND ETFs
      const missingStockLike = allStockLike.filter(s => !fetched.has(s));
      if (missingStockLike.length > 0) {
        const yFallback = await fetchYahooQuotes(missingStockLike);
        // Fix asset_type for ETFs from Yahoo
        for (const q of yFallback) {
          if (etfSet.has(q.symbol)) q.asset_type = 'etf';
        }
        allQuotes.push(...yFallback);
      }

      // Build map
      const quotesMap: Record<string, NormalizedQuote> = {};
      for (const q of allQuotes) quotesMap[q.symbol] = q;

      memSet(cacheKey, quotesMap);

      // Persist latest bars to ohlcv_cache (fire-and-forget)
      const bars = allQuotes.map(q => ({
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

    // ─── ACTION: ohlcv ─── (historical OHLCV)
    if (action === 'ohlcv') {
      const symbol = (symbols as string[])[0];
      const tf = timeframe || '1d';
      const size = outputsize || 50;

      // Check DB cache first
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

      // Fetch from Twelve Data
      if (twelveKey) {
        const bars = await fetchOHLCVHistory(symbol, tf, size, twelveKey);
        if (bars.length > 0) {
          // Persist
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

    // ─── ACTION: features ─── (get computed features)
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
