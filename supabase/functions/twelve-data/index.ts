import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "http://localhost:5173",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BASE_URL = "https://api.twelvedata.com";

// Simple in-memory cache (persists across warm invocations)
const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 60_000; // 60 seconds

function getCached(key: string) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  cache.delete(key);
  return null;
}

function setCache(key: string, data: unknown) {
  cache.set(key, { data, ts: Date.now() });
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const origin = req.headers.get("origin") ?? "";
  const allowed = Deno.env.get("ALLOWED_ORIGIN") ?? "http://localhost:5173";
  if (origin && origin !== allowed) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const apiKey = Deno.env.get("TWELVE_DATA_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "TWELVE_DATA_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, params } = await req.json();

    // For quote action, batch symbols in groups of 4 with delay to respect rate limits
    if (action === "quote") {
      const symbols: string[] = params.symbols || [];
      const cacheKey = `quote:${symbols.sort().join(",")}`;
      const cached = getCached(cacheKey);
      if (cached) {
        return new Response(JSON.stringify(cached), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Split into batches of 4 (each batch = 1 API credit per symbol, max 8/min)
      const BATCH_SIZE = 4;
      const batches: string[][] = [];
      for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
        batches.push(symbols.slice(i, i + BATCH_SIZE));
      }

      let allData: Record<string, unknown> = {};
      for (let i = 0; i < batches.length; i++) {
        if (i > 0) await delay(15_000); // Wait 15s between batches to reset credit window

        const batchSymbols = batches[i].join(",");
        const url = `${BASE_URL}/quote?symbol=${encodeURIComponent(batchSymbols)}&apikey=${apiKey}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.status === "error") {
          console.error("Twelve Data error:", JSON.stringify(data));
          return new Response(JSON.stringify({ error: data.message || "Twelve Data error", code: data.code }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // If single symbol, Twelve Data returns object directly instead of keyed
        if (batches[i].length === 1) {
          allData[batches[i][0]] = data;
        } else {
          allData = { ...allData, ...data };
        }
      }

      setCache(cacheKey, allData);
      return new Response(JSON.stringify(allData), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For other actions, use cache too
    let url: string;
    const cacheKey = `${action}:${JSON.stringify(params)}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return new Response(JSON.stringify(cached), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    switch (action) {
      case "time_series": {
        url = `${BASE_URL}/time_series?symbol=${encodeURIComponent(params.symbol)}&interval=${params.interval || "1day"}&outputsize=${params.outputsize || 30}&apikey=${apiKey}`;
        if (params.start_date) url += `&start_date=${params.start_date}`;
        if (params.end_date) url += `&end_date=${params.end_date}`;
        break;
      }
      case "price": {
        const symbols = params.symbols.join(",");
        url = `${BASE_URL}/price?symbol=${encodeURIComponent(symbols)}&apikey=${apiKey}`;
        break;
      }
      case "rsi": {
        url = `${BASE_URL}/rsi?symbol=${encodeURIComponent(params.symbol)}&interval=${params.interval || "1day"}&time_period=${params.time_period || 14}&apikey=${apiKey}`;
        break;
      }
      case "macd": {
        url = `${BASE_URL}/macd?symbol=${encodeURIComponent(params.symbol)}&interval=${params.interval || "1day"}&apikey=${apiKey}`;
        break;
      }
      case "ema": {
        url = `${BASE_URL}/ema?symbol=${encodeURIComponent(params.symbol)}&interval=${params.interval || "1day"}&time_period=${params.time_period || 20}&apikey=${apiKey}`;
        break;
      }
      case "atr": {
        url = `${BASE_URL}/atr?symbol=${encodeURIComponent(params.symbol)}&interval=${params.interval || "1day"}&time_period=${params.time_period || 14}&apikey=${apiKey}`;
        break;
      }
      case "bbands": {
        url = `${BASE_URL}/bbands?symbol=${encodeURIComponent(params.symbol)}&interval=${params.interval || "1day"}&apikey=${apiKey}`;
        break;
      }
      case "symbol_search": {
        url = `${BASE_URL}/symbol_search?symbol=${encodeURIComponent(params.query)}&apikey=${apiKey}`;
        break;
      }
      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok || data.status === "error") {
      console.error("Twelve Data error:", JSON.stringify(data));
      return new Response(JSON.stringify({ error: data.message || "Twelve Data API error", code: data.code }), {
        status: data.status === "error" ? 400 : response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    setCache(cacheKey, data);
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("twelve-data function error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
