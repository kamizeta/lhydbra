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

  // FreeCryptoAPI: fetch one symbol at a time (unlimited, no rate limit)
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

// ──────────────── FCS API (forex & commodities) ────────────────
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

// ──────────────── Twelve Data (stocks, ETFs, fallback) ────────────────
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

// Fetch multiple batches of 8 symbols from Twelve Data
async function fetchTwelveDataMultiBatch(symbols: string[], apiKey: string) {
  const results: Record<string, unknown> = {};
  const batchSize = 8;
  
  // Process batches sequentially to respect rate limits
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    try {
      const data = await fetchTwelveDataBatch(batch, apiKey);
      Object.assign(results, data);
    } catch (e) {
      console.error(`Twelve Data batch error for ${batch.join(',')}:`, e);
    }
    // Small delay between batches to avoid rate limits
    if (i + batchSize < symbols.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  
  return results;
}

// ──────────────── Main handler ────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { cryptoSymbols, stockSymbols, etfSymbols, commoditySymbols, forexSymbols } = await req.json();

    const freeCryptoKey = Deno.env.get("FREE_CRYPTO_API_KEY");
    const fcsKey = Deno.env.get("FCS_API_KEY");
    const twelveDataKey = Deno.env.get("TWELVE_DATA_API_KEY");

    const allResults: Record<string, unknown> = {};
    const errors: string[] = [];

    // 1. Fetch crypto from FreeCryptoAPI (unlimited, no rate limit)
    if (cryptoSymbols?.length > 0) {
      let cryptoFetched = false;
      try {
        if (freeCryptoKey) {
          const data = await fetchCryptoData(cryptoSymbols, freeCryptoKey);
          if (Object.keys(data).length > 0) {
            Object.assign(allResults, data);
            cryptoFetched = true;
          }
        }
      } catch (e) {
        errors.push(`Crypto: ${e instanceof Error ? e.message : 'Unknown error'}`);
      }
      if (!cryptoFetched && twelveDataKey) {
        try {
          const data = await fetchTwelveDataBatch(cryptoSymbols.slice(0, 4), twelveDataKey);
          Object.assign(allResults, data);
        } catch (_) { /* silent */ }
      }
    }

    // 2. Fetch forex pairs from FCS API (free tier supports forex)
    const allForex = [...(forexSymbols || []), ...(commoditySymbols || [])];
    if (allForex.length > 0) {
      try {
        if (fcsKey) {
          const data = await fetchFCSForex(allForex, fcsKey);
          Object.assign(allResults, data);
        } else if (twelveDataKey) {
          const data = await fetchTwelveDataBatch(allForex.slice(0, 4), twelveDataKey);
          Object.assign(allResults, data);
        }
      } catch (e) {
        errors.push(`Forex/Commodities: ${e instanceof Error ? e.message : 'Unknown error'}`);
        if (twelveDataKey) {
          try {
            const data = await fetchTwelveDataBatch(allForex.slice(0, 4), twelveDataKey);
            Object.assign(allResults, data);
          } catch (_) { /* silent */ }
        }
      }
    }

    // 3. Fetch stocks + ETFs from Twelve Data (multi-batch for large lists)
    const allStocks = [...(stockSymbols || []), ...(etfSymbols || [])];
    if (allStocks.length > 0 && twelveDataKey) {
      try {
        const data = await fetchTwelveDataMultiBatch(allStocks, twelveDataKey);
        Object.assign(allResults, data);
      } catch (e) {
        errors.push(`Stocks: ${e instanceof Error ? e.message : 'Unknown error'}`);
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
