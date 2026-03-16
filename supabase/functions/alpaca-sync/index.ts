import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ALPACA_PAPER_URL = "https://paper-api.alpaca.markets";
const ALPACA_LIVE_URL = "https://api.alpaca.markets";

function alpacaHeaders() {
  const keyId = Deno.env.get("ALPACA_API_KEY_ID");
  const secret = Deno.env.get("ALPACA_API_SECRET_KEY");
  if (!keyId || !secret) throw new Error("Alpaca API keys not configured");
  return {
    "APCA-API-KEY-ID": keyId,
    "APCA-API-SECRET-KEY": secret,
    "Accept": "application/json",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonRes({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return jsonRes({ error: "Unauthorized" }, 401);
    }
    const userId = claimsData.claims.sub as string;

    const body = await req.json();
    const { paper = true } = body;
    const baseUrl = paper ? ALPACA_PAPER_URL : ALPACA_LIVE_URL;
    const headers = alpacaHeaders();

    // 1. Fetch Alpaca positions
    const alpacaRes = await fetch(`${baseUrl}/v2/positions`, { headers });
    if (!alpacaRes.ok) {
      const errBody = await alpacaRes.text();
      return jsonRes({ error: `Alpaca API error [${alpacaRes.status}]: ${errBody}` }, alpacaRes.status);
    }
    const alpacaPositions = await alpacaRes.json() as AlpacaPosition[];

    // 2. Fetch Alpaca closed orders (last 24h) for recently closed positions
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const ordersRes = await fetch(
      `${baseUrl}/v2/orders?status=closed&after=${encodeURIComponent(since)}&limit=100&direction=desc`,
      { headers }
    );
    const closedOrders = ordersRes.ok ? await ordersRes.json() as AlpacaOrder[] : [];

    // 3. Fetch local open positions
    const { data: localPositions, error: localError } = await supabase
      .from("positions")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "open");

    if (localError) {
      return jsonRes({ error: `DB error: ${localError.message}` }, 500);
    }

    const localBySymbol = new Map<string, typeof localPositions[0]>();
    for (const p of (localPositions || [])) {
      // Map both formats: "BTC/USD" and "BTCUSD" → key by clean symbol
      localBySymbol.set(cleanSymbol(p.symbol), p);
    }

    const alpacaSymbols = new Set<string>();
    const changes: SyncChange[] = [];

    // 4. Sync Alpaca → Local: update or create positions
    for (const ap of alpacaPositions) {
      const sym = ap.symbol;
      alpacaSymbols.add(sym);
      const local = localBySymbol.get(cleanSymbol(sym));

      const qty = parseFloat(ap.qty);
      const avgEntry = parseFloat(ap.avg_entry_price);
      const currentPrice = parseFloat(ap.current_price);
      const unrealizedPl = parseFloat(ap.unrealized_pl);
      const side = ap.side === "long" ? "long" : "short";
      const assetClass = ap.asset_class === "crypto" ? "crypto" : (isEtf(sym) ? "etf" : "stock");

      if (local) {
        // Update quantity/entry if changed
        const localQty = Number(local.quantity);
        const localEntry = Number(local.avg_entry);
        if (Math.abs(localQty - qty) > 0.0001 || Math.abs(localEntry - avgEntry) > 0.01) {
          await supabase.from("positions").update({
            quantity: qty,
            avg_entry: avgEntry,
            updated_at: new Date().toISOString(),
          }).eq("id", local.id);

          changes.push({
            action: "updated",
            symbol: sym,
            detail: `qty: ${localQty}→${qty}, entry: ${localEntry.toFixed(2)}→${avgEntry.toFixed(2)}`,
          });
        }
      } else {
        // New position from Alpaca → create locally
        await supabase.from("positions").insert({
          user_id: userId,
          symbol: sym,
          name: sym,
          asset_type: assetClass,
          direction: side,
          quantity: qty,
          avg_entry: avgEntry,
          status: "open",
          strategy: "alpaca-sync",
          notes: `Synced from Alpaca ${paper ? "(Paper)" : "(Live)"}`,
        });

        changes.push({ action: "opened", symbol: sym, detail: `${side} ${qty} @ ${avgEntry.toFixed(2)}` });
      }
    }

    // 5. Check if local positions were closed on Alpaca
    const closedSymbols = new Map<string, AlpacaOrder>();
    for (const order of closedOrders) {
      if (order.status === "filled" && order.filled_qty && parseFloat(order.filled_qty) > 0) {
        closedSymbols.set(cleanSymbol(order.symbol), order);
      }
    }

    for (const [cleanSym, local] of localBySymbol) {
      if (alpacaSymbols.has(cleanSym) || alpacaSymbols.has(local.symbol)) continue;

      // Position exists locally but not on Alpaca → check if it was closed
      const closingOrder = closedSymbols.get(cleanSym);
      if (closingOrder) {
        const filledPrice = parseFloat(closingOrder.filled_avg_price || "0");
        const qty = Number(local.quantity);
        const entry = Number(local.avg_entry);
        const direction = local.direction;
        const diff = direction === "long" ? filledPrice - entry : entry - filledPrice;
        const pnl = diff * qty;

        await supabase.from("positions").update({
          status: "closed",
          closed_at: closingOrder.filled_at || new Date().toISOString(),
          close_price: filledPrice,
          pnl,
        }).eq("id", local.id);

        changes.push({
          action: "closed",
          symbol: local.symbol,
          detail: `@ ${filledPrice.toFixed(2)}, PnL: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}`,
        });
      }
    }

    // 6. Fetch account info
    const acctRes = await fetch(`${baseUrl}/v2/account`, { headers });
    const account = acctRes.ok ? await acctRes.json() : null;

    return jsonRes({
      success: true,
      synced_at: new Date().toISOString(),
      paper,
      alpaca_positions: alpacaPositions.length,
      local_positions: (localPositions || []).length,
      changes,
      account: account ? {
        equity: account.equity,
        cash: account.cash,
        buying_power: account.buying_power,
        portfolio_value: account.portfolio_value,
      } : null,
    });
  } catch (e) {
    console.error("Alpaca sync error:", e);
    return jsonRes({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

// ─── Helpers ───

function cleanSymbol(s: string): string {
  return s.replace("/", "").replace("-", "").toUpperCase();
}

const ETF_SET = new Set(["SPY","QQQ","VTI","ARKK","XLE","XLK","IWM","EEM","GLD","TLT","DIA","XLF","XLV","SOXX","VOO","KWEB","SMH","XBI","IBIT","BITO"]);
function isEtf(sym: string): boolean {
  return ETF_SET.has(sym.toUpperCase());
}

interface AlpacaPosition {
  asset_id: string;
  symbol: string;
  exchange: string;
  asset_class: string;
  qty: string;
  avg_entry_price: string;
  side: string;
  market_value: string;
  cost_basis: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  current_price: string;
  lastday_price: string;
  change_today: string;
}

interface AlpacaOrder {
  id: string;
  symbol: string;
  qty: string;
  filled_qty: string;
  filled_avg_price: string;
  side: string;
  type: string;
  status: string;
  submitted_at: string;
  filled_at: string;
}

interface SyncChange {
  action: "opened" | "closed" | "updated";
  symbol: string;
  detail: string;
}

function jsonRes(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
