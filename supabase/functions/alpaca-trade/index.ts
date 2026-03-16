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
    "Content-Type": "application/json",
    "Accept": "application/json",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth check
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

    const body = await req.json();
    const { action, paper = true } = body;
    const baseUrl = paper ? ALPACA_PAPER_URL : ALPACA_LIVE_URL;
    const headers = alpacaHeaders();

    // ─── ACTION: test_connection ───
    if (action === "test_connection") {
      const res = await fetch(`${baseUrl}/v2/account`, { headers });
      const data = await res.json();
      if (!res.ok) {
        return jsonRes({ error: `Alpaca error [${res.status}]: ${JSON.stringify(data)}` }, res.status);
      }
      return jsonRes({
        success: true,
        account: {
          id: data.id,
          status: data.status,
          currency: data.currency,
          buying_power: data.buying_power,
          cash: data.cash,
          portfolio_value: data.portfolio_value,
          equity: data.equity,
          pattern_day_trader: data.pattern_day_trader,
          trading_blocked: data.trading_blocked,
          account_blocked: data.account_blocked,
        },
      });
    }

    // ─── ACTION: get_positions ───
    if (action === "get_positions") {
      const res = await fetch(`${baseUrl}/v2/positions`, { headers });
      const data = await res.json();
      if (!res.ok) {
        return jsonRes({ error: `Alpaca error [${res.status}]: ${JSON.stringify(data)}` }, res.status);
      }
      return jsonRes({ success: true, positions: data });
    }

    // ─── ACTION: place_order ───
    if (action === "place_order") {
      const { symbol, qty, side, type = "market", time_in_force = "day", limit_price, stop_price, order_class, take_profit, stop_loss } = body;

      if (!symbol || !qty || !side) {
        return jsonRes({ error: "Missing required: symbol, qty, side" }, 400);
      }

      const orderBody: Record<string, unknown> = {
        symbol,
        qty: String(qty),
        side, // "buy" or "sell"
        type, // "market", "limit", "stop", "stop_limit"
        time_in_force, // "day", "gtc", "ioc", "fok"
      };

      if (type === "limit" || type === "stop_limit") {
        orderBody.limit_price = String(limit_price);
      }
      if (type === "stop" || type === "stop_limit") {
        orderBody.stop_price = String(stop_price);
      }

      // Bracket order (OCO with SL/TP)
      if (order_class === "bracket" || (take_profit && stop_loss)) {
        orderBody.order_class = "bracket";
        orderBody.take_profit = { limit_price: String(take_profit) };
        orderBody.stop_loss = { stop_price: String(stop_loss) };
      }

      console.log("Alpaca order payload:", JSON.stringify(orderBody));

      const res = await fetch(`${baseUrl}/v2/orders`, {
        method: "POST",
        headers,
        body: JSON.stringify(orderBody),
      });
      const data = await res.json();

      if (!res.ok) {
        console.error("Alpaca order error:", JSON.stringify(data));
        return jsonRes({ error: `Alpaca order error [${res.status}]: ${data.message || JSON.stringify(data)}` }, res.status);
      }

      return jsonRes({
        success: true,
        order: {
          id: data.id,
          client_order_id: data.client_order_id,
          symbol: data.symbol,
          qty: data.qty,
          filled_qty: data.filled_qty,
          side: data.side,
          type: data.type,
          status: data.status,
          submitted_at: data.submitted_at,
          filled_avg_price: data.filled_avg_price,
          order_class: data.order_class,
        },
      });
    }

    // ─── ACTION: close_position ───
    if (action === "close_position") {
      const { symbol, qty } = body;
      if (!symbol) return jsonRes({ error: "Missing: symbol" }, 400);

      const url = qty
        ? `${baseUrl}/v2/positions/${encodeURIComponent(symbol)}?qty=${qty}`
        : `${baseUrl}/v2/positions/${encodeURIComponent(symbol)}`;

      const res = await fetch(url, { method: "DELETE", headers });
      const data = await res.json();

      if (!res.ok) {
        return jsonRes({ error: `Alpaca close error [${res.status}]: ${data.message || JSON.stringify(data)}` }, res.status);
      }

      return jsonRes({ success: true, order: data });
    }

    // ─── ACTION: get_orders ───
    if (action === "get_orders") {
      const { status: orderStatus = "all", limit = 50 } = body;
      const res = await fetch(`${baseUrl}/v2/orders?status=${orderStatus}&limit=${limit}`, { headers });
      const data = await res.json();
      if (!res.ok) {
        return jsonRes({ error: `Alpaca error [${res.status}]: ${JSON.stringify(data)}` }, res.status);
      }
      return jsonRes({ success: true, orders: data });
    }

    return jsonRes({ error: "Invalid action. Use: test_connection, get_positions, place_order, close_position, get_orders" }, 400);
  } catch (e) {
    console.error("Alpaca trade error:", e);
    return jsonRes({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function jsonRes(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
