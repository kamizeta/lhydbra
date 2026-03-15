import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
interface FreeCryptoResponse {
  symbol: string;
  name: string;
  price: number;
  change_24h: number;
  change_percentage_24h: number;
  high_24h: number;
  low_24h: number;
  market_cap: number;
  volume: number;
  [key: string]: unknown;
}

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

  // FreeCryptoAPI free plan: fetch one symbol at a time (batch returns empty)
  await Promise.all(bases.map(async (base) => {
    try {
      const url = `https://api.freecryptoapi.com/v1/getData?symbol=${base}`;
      console.log('FreeCryptoAPI URL:', url);
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
  
  if (!response.ok) {
    const text = await response.text();
    console.error('FreeCryptoAPI error:', response.status, text);
    throw new Error(`FreeCryptoAPI error: ${response.status}`);
  }

  const data = await response.json();
  console.log('FreeCryptoAPI raw response (first 500 chars):', JSON.stringify(data).slice(0, 500));
  
  // Normalize to our standard format keyed by original symbol (BTC/USD)
  const result: Record<string, unknown> = {};
  
  // FreeCryptoAPI returns { status: "success", symbols: [{symbol:"BTC", last:"72883.77", ...}] }
  const symbolsArr = Array.isArray(data.symbols) ? data.symbols : [];
  
  for (const item of symbolsArr) {
    const base = item.symbol || '';
    const originalSymbol = symbolMap[base] || `${base}/USD`;
    const price = parseFloat(String(item.last || item.price || '0'));
    if (!price || price <= 0) continue;
    
    const changePct = parseFloat(String(item.daily_change_percentage || '0'));
    const high = parseFloat(String(item.highest || item.high_24h || price));
    const low = parseFloat(String(item.lowest || item.low_24h || price));
    
    result[originalSymbol] = {
      symbol: originalSymbol,
      name: item.name || base,
      exchange: item.source_exchange || 'Crypto',
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
  console.log('FreeCryptoAPI parsed results:', Object.keys(result));
  setCache(cacheKey, result);
  return result;
}

// ──────────────── FCS API (stocks, ETFs, commodities) ────────────────
async function fetchFCSData(symbols: string[], apiKey: string, type: 'stock' | 'forex') {
  const cacheKey = `fcs:${type}:${symbols.sort().join(',')}`;
  const cached = getCached(cacheKey);
  if (cached) return cached as Record<string, unknown>;

  let url: string;
  const result: Record<string, unknown> = {};

  if (type === 'stock') {
    // FCS stock API: needs exchange prefix like NASDAQ:AAPL
    const fcsSymbols = symbols.map(s => {
      // Map common symbols to FCS format
      const stockExchangeMap: Record<string, string> = {
        'AAPL': 'NASDAQ:AAPL', 'MSFT': 'NASDAQ:MSFT', 'NVDA': 'NASDAQ:NVDA',
        'TSLA': 'NASDAQ:TSLA', 'AMZN': 'NASDAQ:AMZN', 'GOOGL': 'NASDAQ:GOOGL',
        'META': 'NASDAQ:META',
        'SPY': 'AMEX:SPY', 'QQQ': 'NASDAQ:QQQ', 'VTI': 'AMEX:VTI',
        'ARKK': 'AMEX:ARKK', 'XLE': 'AMEX:XLE', 'XLK': 'AMEX:XLK',
      };
      return stockExchangeMap[s] || s;
    });

    url = `https://api-v4.fcsapi.com/stock/latest?symbol=${encodeURIComponent(fcsSymbols.join(','))}&access_key=${apiKey}`;
    console.log('FCS stock URL:', url);
    const response = await fetch(url);
    const data = await response.json();
    console.log('FCS stock response:', JSON.stringify(data).slice(0, 500));
    if (!response.ok) {
      console.error('FCS stock error:', response.status);
      throw new Error(`FCS API stock error: ${response.status}`);
    }

    if (data.status && data.response) {
      for (const item of data.response) {
        // Extract base symbol from ticker like "NASDAQ:AAPL" -> "AAPL"
        const baseSymbol = item.ticker?.split(':')[1] || item.ticker;
        const active = item.active || {};
        result[baseSymbol] = {
          symbol: baseSymbol,
          name: item.profile?.name || baseSymbol,
          exchange: item.ticker?.split(':')[0] || '',
          currency: 'USD',
          open: String(active.o || 0),
          high: String(active.h || 0),
          low: String(active.l || 0),
          close: String(active.c || 0),
          volume: String(active.v || 0),
          previous_close: String((active.c || 0) - (active.ch || 0)),
          change: String(active.ch || 0),
          percent_change: String(active.cp || 0),
          is_market_open: true,
          _source: 'fcsapi',
        };
      }
    }
  } else {
    // Forex/commodity: XAU/USD, XAG/USD, CL, NG, HG
    const forexSymbols = symbols.map(s => {
      // FCS uses format like XAU/USD for commodities
      return s;
    });

    url = `https://fcsapi.com/api-v3/forex/latest?symbol=${encodeURIComponent(forexSymbols.join(','))}&access_key=${apiKey}`;
    const response = await fetch(url);
    if (!response.ok) {
      const text = await response.text();
      console.error('FCS forex error:', response.status, text);
      throw new Error(`FCS API forex error: ${response.status}`);
    }
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
  }

  setCache(cacheKey, result);
  return result;
}

// ──────────────── Twelve Data fallback ────────────────
async function fetchTwelveDataFallback(symbols: string[], apiKey: string) {
  const cacheKey = `td:${symbols.sort().join(',')}`;
  const cached = getCached(cacheKey);
  if (cached) return cached as Record<string, unknown>;

  const batchSymbols = symbols.join(',');
  const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(batchSymbols)}&apikey=${apiKey}`;
  const response = await fetch(url);
  const data = await response.json();
  
  if (data.status === 'error') {
    console.error('Twelve Data fallback error:', JSON.stringify(data));
    return {};
  }

  const result = symbols.length === 1 ? { [symbols[0]]: data } : data;
  setCache(cacheKey, result);
  return result as Record<string, unknown>;
}

// ──────────────── Main handler ────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { cryptoSymbols, stockSymbols, etfSymbols, commoditySymbols } = await req.json();

    const freeCryptoKey = Deno.env.get("FREE_CRYPTO_API_KEY");
    const fcsKey = Deno.env.get("FCS_API_KEY");
    const twelveDataKey = Deno.env.get("TWELVE_DATA_API_KEY");

    console.log('[DEBUG] Keys found:', { crypto: !!freeCryptoKey, fcs: !!fcsKey, td: !!twelveDataKey });
    console.log('[DEBUG] Symbols:', { cryptoSymbols, stockSymbols, etfSymbols, commoditySymbols });

    const allResults: Record<string, unknown> = {};
    const errors: string[] = [];

    // Fetch crypto from FreeCryptoAPI (or fallback to Twelve Data)
    if (cryptoSymbols?.length > 0) {
      let cryptoFetched = false;
      try {
        if (freeCryptoKey) {
          const data = await fetchCryptoData(cryptoSymbols, freeCryptoKey);
          const keys = Object.keys(data);
          if (keys.length > 0) {
            Object.assign(allResults, data);
            cryptoFetched = true;
          } else {
            console.log('FreeCryptoAPI returned empty, falling back to Twelve Data');
          }
        }
      } catch (e) {
        errors.push(`Crypto: ${e instanceof Error ? e.message : 'Unknown error'}`);
      }
      // Fallback to Twelve Data if FreeCryptoAPI didn't return data
      if (!cryptoFetched && twelveDataKey) {
        try {
          const data = await fetchTwelveDataFallback(cryptoSymbols.slice(0, 4), twelveDataKey);
          Object.assign(allResults, data);
        } catch (_) { /* silent */ }
      }
    }

    // Fetch stocks + ETFs from Twelve Data (FCS free plan doesn't support stocks)
    const allStocks = [...(stockSymbols || []), ...(etfSymbols || [])];
    if (allStocks.length > 0 && twelveDataKey) {
      try {
        // Twelve Data: batch up to 8 symbols
        const batch = allStocks.slice(0, 8);
        console.log('Fetching stocks from Twelve Data:', batch);
        const data = await fetchTwelveDataFallback(batch, twelveDataKey);
        Object.assign(allResults, data);
      } catch (e) {
        errors.push(`Stocks: ${e instanceof Error ? e.message : 'Unknown error'}`);
      }
    }

    // Fetch commodities from FCS API forex endpoint (or fallback)
    if (commoditySymbols?.length > 0) {
      try {
        if (fcsKey) {
          const data = await fetchFCSData(commoditySymbols, fcsKey, 'forex');
          Object.assign(allResults, data);
        } else if (twelveDataKey) {
          console.log('FCS API key not set, falling back to Twelve Data for commodities');
          const data = await fetchTwelveDataFallback(commoditySymbols.slice(0, 2), twelveDataKey);
          Object.assign(allResults, data);
        }
      } catch (e) {
        errors.push(`Commodities: ${e instanceof Error ? e.message : 'Unknown error'}`);
        if (twelveDataKey) {
          try {
            const data = await fetchTwelveDataFallback(commoditySymbols.slice(0, 2), twelveDataKey);
            Object.assign(allResults, data);
          } catch (_) { /* silent */ }
        }
      }
    }

    return new Response(JSON.stringify({ data: allResults, errors: errors.length > 0 ? errors : undefined }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("market-data-hybrid error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
