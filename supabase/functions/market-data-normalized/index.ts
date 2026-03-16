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
      const [cryptoQ, forexQ, stockQ] = await Promise.all([
        freeCryptoKey ? fetchCryptoQuotes(crypto, freeCryptoKey) : [],
        fcsKey ? fetchFCSQuotes([...forex, ...commodity], fcsKey, 'forex') : [],
        fcsKey ? fetchFCSQuotes(allStockLike, fcsKey, 'stock') : [],
      ]);

      const allQuotes = [...cryptoQ, ...forexQ, ...stockQ];
      const fetched = new Set(allQuotes.map(q => q.symbol));

      // Fallback 1: Twelve Data for missing stocks/ETFs AND missing forex/commodities (batch of 8)
      const missingStockLike = allStockLike.filter(s => !fetched.has(s));
      const missingForex = [...forex, ...commodity].filter(s => !fetched.has(s));
      const missingForTwelve = [...missingStockLike, ...missingForex];
      if (twelveKey && missingForTwelve.length > 0) {
        // Only fetch first batch (8 symbols) to stay within rate limits
        const twelveSymbols = missingForTwelve.slice(0, 8);
        const tdQuotes = await fetchTwelveDataQuotes(twelveSymbols, twelveKey);
        for (const q of tdQuotes) {
          fetched.add(q.symbol);
        }
        allQuotes.push(...tdQuotes);
      }

      // Fallback 2: Yahoo batch for remaining missing stocks/ETFs (single request)
      const stillMissingStocks = allStockLike.filter(s => !fetched.has(s));
      if (stillMissingStocks.length > 0) {
        const yBatch = await fetchYahooBatch(stillMissingStocks);
        for (const q of yBatch) {
          if (etfSet.has(q.symbol)) q.asset_type = 'etf';
          fetched.add(q.symbol);
        }
        allQuotes.push(...yBatch);
      }

      // Fallback 2: Yahoo chart for still-missing symbols (parallel batches of 5)
      const stillMissing = allStockLike.filter(s => !fetched.has(s));
      if (stillMissing.length > 0) {
        const yChart = await fetchYahooChartParallel(stillMissing);
        for (const q of yChart) {
          if (etfSet.has(q.symbol)) q.asset_type = 'etf';
          fetched.add(q.symbol);
        }
        allQuotes.push(...yChart);
      }

      // Fallback 3: DB cache for anything still missing
      const finalMissing = allStockLike.filter(s => !fetched.has(s));
      if (finalMissing.length > 0) {
        const dbQuotes = await fetchFromDBCache(finalMissing, db);
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
