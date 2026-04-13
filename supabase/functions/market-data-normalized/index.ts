import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

function jsonRes(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

function classifySymbol(sym: string): string {
  if (sym.includes("/")) return "crypto";
  return "stock";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });

  try {
    const body = await req.json().catch(() => ({}));
    const { symbols = [], timeframe = "1d" } = body;

    if (!Array.isArray(symbols) || symbols.length === 0) {
      return jsonRes(req, { error: "symbols array required" }, 400);
    }

    const apiKeyId = Deno.env.get("ALPACA_API_KEY_ID") || "";
    const apiSecret = Deno.env.get("ALPACA_API_SECRET_KEY") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, serviceKey);

    const stocks: string[] = [];
    const cryptos: string[] = [];
    for (const sym of symbols) {
      if (classifySymbol(sym) === "crypto") cryptos.push(sym);
      else stocks.push(sym);
    }

    const quotes: Record<string, { price: number; change_percent: number; source: string }> = {};

    // ─── Fetch stock quotes from Alpaca snapshots ───
    if (stocks.length > 0 && apiKeyId && apiSecret) {
      try {
        const url = `https://data.alpaca.markets/v2/stocks/snapshots?symbols=${encodeURIComponent(stocks.join(","))}`;
        const res = await fetch(url, {
          headers: {
            "APCA-API-KEY-ID": apiKeyId,
            "APCA-API-SECRET-KEY": apiSecret,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) {
          const data = await res.json();
          for (const [sym, snap] of Object.entries(data)) {
            const s = snap as Record<string, any>;
            const price = s.latestTrade?.p || s.dailyBar?.c || 0;
            const prevClose = s.prevDailyBar?.c || price;
            const changePct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
            if (price > 0) {
              quotes[sym] = { price, change_percent: +changePct.toFixed(4), source: "alpaca" };
            }
          }
        } else {
          console.error(`Alpaca stocks HTTP ${res.status}: ${await res.text()}`);
        }
      } catch (e) {
        console.error("Alpaca stocks error:", e);
      }
    }

    // ─── Fetch crypto quotes from Alpaca ───
    const alpacaHeaders = {
      "APCA-API-KEY-ID": apiKeyId,
      "APCA-API-SECRET-KEY": apiSecret,
      Accept: "application/json",
    };
    if (cryptos.length > 0 && apiKeyId && apiSecret) {
      for (const sym of cryptos) {
        try {
          // Convert BTC/USD → BTC%2FUSD for Alpaca crypto
          const encoded = encodeURIComponent(sym);
          const url = `https://data.alpaca.markets/v1beta3/crypto/us/latest/quotes?symbols=${encoded}`;
          const res = await fetch(url, {
            headers: alpacaHeaders,
            signal: AbortSignal.timeout(5000),
          });
          if (res.ok) {
            const data = await res.json();
            const quoteData = data.quotes?.[sym];
            if (quoteData) {
              const price = (quoteData.ap + quoteData.bp) / 2; // midpoint of ask/bid
              if (price > 0) {
                let changePct = 0;

                // Fetch previous day bar for real change_percent
                try {
                  const barsUrl = `https://data.alpaca.markets/v1beta3/crypto/us/bars?symbols=${encoded}&timeframe=1Day&limit=2`;
                  const barsRes = await fetch(barsUrl, {
                    headers: alpacaHeaders,
                    signal: AbortSignal.timeout(5000),
                  });
                  if (barsRes.ok) {
                    const barsData = await barsRes.json();
                    const symbolBars = barsData.bars?.[sym];
                    console.log(`[market-data] Crypto bars for ${sym}: count=${symbolBars?.length ?? 0}`);
                    if (symbolBars && symbolBars.length >= 2) {
                      const prevClose = symbolBars[symbolBars.length - 2].c;
                      changePct = prevClose > 0 ? +((price - prevClose) / prevClose * 100).toFixed(2) : 0;
                    } else if (symbolBars && symbolBars.length === 1) {
                      // Only one bar available — use its open as reference
                      const prevClose = symbolBars[0].o;
                      changePct = prevClose > 0 ? +((price - prevClose) / prevClose * 100).toFixed(2) : 0;
                    }
                  } else {
                    console.warn(`[market-data] Crypto bars HTTP ${barsRes.status} for ${sym}`);
                  }
                } catch (e) {
                  console.warn(`[market-data] Failed to get crypto change for ${sym}:`, e);
                }

                quotes[sym] = { price: +price.toFixed(2), change_percent: changePct, source: "alpaca-crypto" };
              }
            }
          }
        } catch (e) {
          console.error(`Alpaca crypto ${sym}:`, e);
        }
      }
    }

    // ─── Fallback: TwelveData for anything still missing ───
    const missingSymbols = symbols.filter((s: string) => !quotes[s]);
    if (missingSymbols.length > 0) {
      const twelveKey = Deno.env.get("TWELVE_DATA_API_KEY") || "";
      if (twelveKey) {
        try {
          const symStr = missingSymbols.map((s: string) => s.replace("/", "")).join(",");
          const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symStr)}&apikey=${twelveKey}`;
          const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
          if (res.ok) {
            const data = await res.json();
            const entries = missingSymbols.length === 1 ? [[missingSymbols[0], data]] : Object.entries(data);
            for (const [, val] of entries) {
              const q = val as Record<string, any>;
              if (!q || q.status === "error" || !q.close) continue;
              const sym = q.symbol || "";
              // Find the original symbol that matches
              const origSym = missingSymbols.find((s: string) => s === sym || s.replace("/", "") === sym) || sym;
              const price = parseFloat(q.close);
              const prevClose = parseFloat(q.previous_close || q.open || String(price));
              const changePct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
              if (price > 0) {
                quotes[origSym] = { price, change_percent: +changePct.toFixed(4), source: "twelvedata" };
              }
            }
          }
        } catch (e) {
          console.error("TwelveData fallback error:", e);
        }
      }
    }

    // ─── Upsert to market_cache ───
    const rows = Object.entries(quotes).map(([symbol, q]) => ({
      symbol,
      asset_class: classifySymbol(symbol),
      price: q.price,
      change_percent: q.change_percent,
      change_val: 0,
      provider: q.source,
      updated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 2 * 60_000).toISOString(),
    }));

    if (rows.length > 0) {
      const { error } = await db.from("market_cache").upsert(rows, { onConflict: "symbol" });
      if (error) console.error("market_cache upsert error:", error.message);
    }

    // ─── Log API usage ───
    db.from("api_usage_log").insert({
      source: "market-data-normalized",
      action: "quote",
      symbols_requested: symbols.length,
      symbols_returned: Object.keys(quotes).length,
      response_time_ms: 0,
    }).then(() => {});

    console.log(`[market-data-normalized] Fetched ${Object.keys(quotes).length}/${symbols.length} quotes`);

    return jsonRes(req, { quotes, fetched: Object.keys(quotes).length, requested: symbols.length });
  } catch (e) {
    console.error("market-data-normalized error:", e);
    return jsonRes(req, { error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
