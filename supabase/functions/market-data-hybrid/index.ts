import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ALLOWED_ORIGINS = [
  "https://lhydbra.lovable.app",
  "https://id-preview--cfc6c4be-124b-47d1-b6e8-26dbf563d3b8.lovable.app",
  "http://localhost:5173",
  "http://localhost:8080",
];

function isAllowedOrigin(origin: string) {
  return (
    ALLOWED_ORIGINS.includes(origin) ||
    /^https:\/\/[a-z0-9-]+\.lovableproject\.com$/i.test(origin) ||
    /^https:\/\/[a-z0-9-]+\.lovable\.app$/i.test(origin)
  );
}

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin : "",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

// In-memory cache
const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 60_000;

function getCached(key: string) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  cache.delete(key);
  return null;
}

function setCache(key: string, data: unknown) {
  cache.set(key, { data, ts: Date.now() });
}

// ──────────────── FreeCryptoAPI (crypto) ────────────────
async function fetchCryptoData(symbols: string[], apiKey: string) {
  const symbolMap: Record<string, string> = {};
  for (const s of symbols) {
    const base = s.replace('/USD', '');
    symbolMap[base] = s;
  }

  const bases = Object.keys(symbolMap);
  const cacheKey = `crypto:${bases.sort().join(',')}`;
  const cached = getCached(cacheKey);
  if (cached) return cached as Record<string, unknown>;

  const result: Record<string, unknown> = {};

  await Promise.all(bases.map(async (base) => {
    try {
      const url = `https://api.freecryptoapi.com/v1/getData?symbol=${base}`;
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      if (!response.ok) return;

      const data = await response.json();
      const symbolsArr = Array.isArray(data.symbols) ? data.symbols : [];
      for (const item of symbolsArr) {
        const sym = item.symbol || base;
        const originalSymbol = symbolMap[sym] || `${sym}/USD`;
        const price = parseFloat(String(item.last || item.price || '0'));
        if (!price || price <= 0) continue;
        
        const changePct = parseFloat(String(item.daily_change_percentage || '0'));
        const high = parseFloat(String(item.highest || item.high_24h || price));
        const low = parseFloat(String(item.lowest || item.low_24h || price));
        
        result[originalSymbol] = {
          symbol: originalSymbol,
          name: item.name || sym,
          exchange: item.source_exchange || 'binance',
          currency: 'USD',
          open: String(price / (1 + changePct / 100)),
          high: String(high),
          low: String(low),
          close: String(price),
          volume: String(item.volume || 0),
          previous_close: String(price / (1 + changePct / 100)),
          change: String(price - price / (1 + changePct / 100)),
          percent_change: String(changePct),
          is_market_open: true,
          _source: 'freecryptoapi',
        };
      }
    } catch (e) {
      console.error(`FreeCryptoAPI error for ${base}:`, e);
    }
  }));

  setCache(cacheKey, result);
  return result;
}

// ──────────────── FCS API (forex, commodities, stocks) ────────────────
async function fetchFCSForex(symbols: string[], apiKey: string) {
  if (!symbols.length) return {};
  const cacheKey = `fcs:forex:${symbols.sort().join(',')}`;
  const cached = getCached(cacheKey);
  if (cached) return cached as Record<string, unknown>;

  const result: Record<string, unknown> = {};
  const url = `https://fcsapi.com/api-v3/forex/latest?symbol=${encodeURIComponent(symbols.join(','))}&access_key=${apiKey}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`FCS forex error: ${response.status}`);
  const data = await response.json();

  if (data.status && data.response) {
    for (const item of data.response) {
      const s = item.s || item.symbol;
      result[s] = {
        symbol: s,
        name: s,
        exchange: 'Commodity',
        currency: 'USD',
        open: String(item.o || 0),
        high: String(item.h || 0),
        low: String(item.l || 0),
        close: String(item.c || 0),
        volume: '0',
        previous_close: String((parseFloat(item.c || '0')) - (parseFloat(item.ch || '0'))),
        change: String(item.ch || 0),
        percent_change: String(item.cp || 0),
        is_market_open: true,
        _source: 'fcsapi',
      };
    }
  }

  setCache(cacheKey, result);
  return result;
}

// FCS API for stocks - uses stock/latest endpoint
async function fetchFCSStocks(symbols: string[], apiKey: string) {
  if (!symbols.length) return {};
  const cacheKey = `fcs:stock:${symbols.sort().join(',')}`;
  const cached = getCached(cacheKey);
  if (cached) return cached as Record<string, unknown>;

  const result: Record<string, unknown> = {};
  
  // FCS stock API uses symbol names directly
  const url = `https://fcsapi.com/api-v3/stock/latest?symbol=${encodeURIComponent(symbols.join(','))}&exchange=NASDAQ,NYSE,AMEX&access_key=${apiKey}`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`FCS stock error: ${response.status}`);
      return result;
    }
    const data = await response.json();
    
    if (data.status && data.response) {
      for (const item of data.response) {
        const s = item.s || item.symbol;
        if (!s) continue;
        // Match against our symbol list
        const matchedSymbol = symbols.find(sym => 
          s === sym || s.startsWith(sym + ':') || s.endsWith(':' + sym) || s.includes(sym)
        );
        const key = matchedSymbol || s;
        
        result[key] = {
          symbol: key,
          name: item.name || key,
          exchange: item.exchange || 'NASDAQ',
          currency: 'USD',
          open: String(item.o || 0),
          high: String(item.h || 0),
          low: String(item.l || 0),
          close: String(item.c || 0),
          volume: String(item.v || 0),
          previous_close: String((parseFloat(item.c || '0')) - (parseFloat(item.ch || '0'))),
          change: String(item.ch || 0),
          percent_change: String(item.cp || 0),
          is_market_open: true,
          _source: 'fcsapi-stock',
        };
      }
    }
  } catch (e) {
    console.error('FCS stock fetch error:', e);
  }

  if (Object.keys(result).length > 0) {
    setCache(cacheKey, result);
  }
  return result;
}

// ──────────────── Yahoo Finance (stocks & ETFs fallback) ────────────────
async function fetchYahooFinanceQuotes(symbols: string[]) {
  if (!symbols.length) return {};
  const cacheKey = `yahoo:${symbols.sort().join(',')}`;
  const cached = getCached(cacheKey);
  if (cached) return cached as Record<string, unknown>;

  const result: Record<string, unknown> = {};

  try {
    const symbolsStr = symbols.join(',');
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbolsStr)}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketOpen,regularMarketDayHigh,regularMarketDayLow,regularMarketVolume,regularMarketPreviousClose,shortName,longName,exchange`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      console.error(`Yahoo Finance HTTP error: ${response.status}`);
      return await fetchYahooFinanceFallback(symbols);
    }

    const data = await response.json();
    const quotes = data?.quoteResponse?.result || [];

    for (const q of quotes) {
      const sym = q.symbol;
      if (!sym) continue;
      const price = q.regularMarketPrice || 0;
      if (price <= 0) continue;

      result[sym] = {
        symbol: sym,
        name: q.longName || q.shortName || sym,
        exchange: q.exchange || 'NASDAQ',
        currency: q.currency || 'USD',
        open: String(q.regularMarketOpen || price),
        high: String(q.regularMarketDayHigh || price),
        low: String(q.regularMarketDayLow || price),
        close: String(price),
        volume: String(q.regularMarketVolume || 0),
        previous_close: String(q.regularMarketPreviousClose || price),
        change: String(q.regularMarketChange || 0),
        percent_change: String(q.regularMarketChangePercent || 0),
        is_market_open: q.marketState === 'REGULAR',
        _source: 'yahoo',
      };
    }
  } catch (e) {
    console.error('Yahoo Finance error:', e);
    return await fetchYahooFinanceFallback(symbols);
  }

  if (Object.keys(result).length > 0) {
    setCache(cacheKey, result);
  }
  return result;
}

async function fetchYahooFinanceFallback(symbols: string[]) {
  const result: Record<string, unknown> = {};

  await Promise.all(symbols.map(async (sym) => {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1d&interval=1d`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      if (!response.ok) return;

      const data = await response.json();
      const meta = data?.chart?.result?.[0]?.meta;
      if (!meta || !meta.regularMarketPrice) return;

      const price = meta.regularMarketPrice;
      const prevClose = meta.previousClose || meta.chartPreviousClose || price;
      const change = price - prevClose;
      const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;

      result[sym] = {
        symbol: sym,
        name: meta.shortName || meta.longName || sym,
        exchange: meta.exchangeName || 'NASDAQ',
        currency: meta.currency || 'USD',
        open: String(meta.regularMarketOpen || price),
        high: String(meta.regularMarketDayHigh || price),
        low: String(meta.regularMarketDayLow || price),
        close: String(price),
        volume: String(meta.regularMarketVolume || 0),
        previous_close: String(prevClose),
        change: String(change),
        percent_change: String(changePct),
        is_market_open: meta.marketState === 'REGULAR',
        _source: 'yahoo-chart',
      };
    } catch (e) {
      console.error(`Yahoo chart fallback error for ${sym}:`, e);
    }
  }));

  return result;
}

// ──────────────── Twelve Data (technical indicators only, kept as last resort) ────────────────
async function fetchTwelveDataBatch(symbols: string[], apiKey: string) {
  if (!symbols.length) return {};
  const cacheKey = `td:${symbols.sort().join(',')}`;
  const cached = getCached(cacheKey);
  if (cached) return cached as Record<string, unknown>;

  const batchSymbols = symbols.join(',');
  const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(batchSymbols)}&apikey=${apiKey}`;
  const response = await fetch(url);
  const data = await response.json();
  
  if (data.status === 'error') {
    console.error('Twelve Data error:', JSON.stringify(data));
    return {};
  }

  const result = symbols.length === 1 ? { [symbols[0]]: data } : data;
  setCache(cacheKey, result);
  return result as Record<string, unknown>;
}

// ──────────────── Main handler ────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const { cryptoSymbols, stockSymbols, etfSymbols, commoditySymbols, forexSymbols } = await req.json();

    const freeCryptoKey = Deno.env.get("FREE_CRYPTO_API_KEY");
    const fcsKey = Deno.env.get("FCS_API_KEY");
    const twelveDataKey = Deno.env.get("TWELVE_DATA_API_KEY");

    const allResults: Record<string, unknown> = {};
    const errors: string[] = [];
    const fetchPromises: Promise<void>[] = [];

    // 1. Crypto from FreeCryptoAPI (unlimited)
    if (cryptoSymbols?.length > 0 && freeCryptoKey) {
      fetchPromises.push(
        fetchCryptoData(cryptoSymbols, freeCryptoKey)
          .then(data => { Object.assign(allResults, data); })
          .catch(e => { errors.push(`Crypto: ${e instanceof Error ? e.message : 'Unknown'}`); })
      );
    }

    // 2. Forex & Commodities from FCS API
    const allForex = [...(forexSymbols || []), ...(commoditySymbols || [])];
    if (allForex.length > 0 && fcsKey) {
      fetchPromises.push(
        fetchFCSForex(allForex, fcsKey)
          .then(data => { Object.assign(allResults, data); })
          .catch(e => { errors.push(`Forex/Commodities: ${e instanceof Error ? e.message : 'Unknown'}`); })
      );
    }

    // 3. Stocks + ETFs: Try FCS API first, then Yahoo Finance, then Twelve Data
    const allStocks = [...(stockSymbols || []), ...(etfSymbols || [])];
    if (allStocks.length > 0) {
      fetchPromises.push((async () => {
        let fetched = new Set<string>();

        // Try FCS API for stocks first
        if (fcsKey) {
          try {
            const fcsData = await fetchFCSStocks(allStocks, fcsKey);
            for (const [key, val] of Object.entries(fcsData)) {
              allResults[key] = val;
              fetched.add(key);
            }
          } catch (e) {
            console.error('FCS stocks failed:', e);
          }
        }

        // Try Yahoo Finance for any missing symbols
        const missingAfterFCS = allStocks.filter(s => !fetched.has(s));
        if (missingAfterFCS.length > 0) {
          try {
            const yahooData = await fetchYahooFinanceQuotes(missingAfterFCS);
            for (const [key, val] of Object.entries(yahooData)) {
              allResults[key] = val;
              fetched.add(key);
            }
          } catch (e) {
            console.error('Yahoo Finance failed:', e);
          }
        }

        // Last resort: Twelve Data for any still missing (up to 8 to avoid rate limits)
        const missingAfterYahoo = allStocks.filter(s => !fetched.has(s));
        if (missingAfterYahoo.length > 0 && twelveDataKey) {
          try {
            const tdData = await fetchTwelveDataBatch(missingAfterYahoo.slice(0, 8), twelveDataKey);
            Object.assign(allResults, tdData);
          } catch (_) { /* silent fallback */ }
        }
      })());
    }

    await Promise.all(fetchPromises);

    return new Response(JSON.stringify({ data: allResults, errors: errors.length > 0 ? errors : undefined }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("market-data-hybrid error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
