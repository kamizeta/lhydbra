import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BASE_URL = "https://api.twelvedata.com";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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

    let url: string;

    switch (action) {
      case "quote": {
        // Get real-time quote for one or more symbols
        const symbols = params.symbols.join(",");
        url = `${BASE_URL}/quote?symbol=${encodeURIComponent(symbols)}&apikey=${apiKey}`;
        break;
      }
      case "time_series": {
        // Get OHLCV time series
        url = `${BASE_URL}/time_series?symbol=${encodeURIComponent(params.symbol)}&interval=${params.interval || "1day"}&outputsize=${params.outputsize || 30}&apikey=${apiKey}`;
        if (params.start_date) url += `&start_date=${params.start_date}`;
        if (params.end_date) url += `&end_date=${params.end_date}`;
        break;
      }
      case "price": {
        // Simple real-time price
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

    if (!response.ok) {
      console.error("Twelve Data API error:", response.status, JSON.stringify(data));
      return new Response(JSON.stringify({ error: "Twelve Data API error", details: data }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check for Twelve Data error in response body
    if (data.status === "error") {
      console.error("Twelve Data error:", JSON.stringify(data));
      return new Response(JSON.stringify({ error: data.message || "Twelve Data error", code: data.code }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
