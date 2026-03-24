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

// ─── Retry helper ───
async function fetchWithRetry(url: string, options: RequestInit, retries = 3, delayMs = 1000): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.ok || res.status < 500) return res;
      if (attempt < retries) {
        console.warn(`Alpaca retry ${attempt}/${retries} for ${url} (status ${res.status})`);
        await new Promise(r => setTimeout(r, delayMs * attempt));
      } else {
        return res;
      }
    } catch (err) {
      if (attempt === retries) throw err;
      console.warn(`Alpaca fetch error attempt ${attempt}/${retries}:`, err);
      await new Promise(r => setTimeout(r, delayMs * attempt));
    }
  }
  throw new Error("Retry exhausted");
}

// ─── Poll order until filled or terminal ───
async function pollOrderStatus(baseUrl: string, orderId: string, headers: Record<string, string>, maxAttempts = 10): Promise<Record<string, unknown>> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const res = await fetch(`${baseUrl}/v2/orders/${orderId}`, { headers });
    if (!res.ok) continue;
    const order = await res.json();
    const status = String(order.status);
    if (['filled', 'canceled', 'expired', 'rejected', 'stopped'].includes(status)) {
      return order;
    }
  }
  return { status: 'polling_timeout', id: orderId };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth check - fixed: use getUser instead of getClaims
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonRes({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const isServiceRole = authHeader === `Bearer ${serviceKey}`;

    const body = await req.json();
    const { action, paper = true, user_id_override } = body;

    let userId: string;
    if (isServiceRole && user_id_override) {
      // Trusted call from operator-mode
      userId = user_id_override;
    } else {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        return jsonRes({ error: "Unauthorized" }, 401);
      }
      userId = user.id;
    }
    const baseUrl = paper ? ALPACA_PAPER_URL : ALPACA_LIVE_URL;
    const headers = alpacaHeaders();

    // ─── ACTION: test_connection ───
    if (action === "test_connection") {
      const res = await fetchWithRetry(`${baseUrl}/v2/account`, { headers });
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
      const res = await fetchWithRetry(`${baseUrl}/v2/positions`, { headers });
      const data = await res.json();
      if (!res.ok) {
        return jsonRes({ error: `Alpaca error [${res.status}]: ${JSON.stringify(data)}` }, res.status);
      }
      return jsonRes({ success: true, positions: data });
    }

    // ─── ACTION: place_order ───
    if (action === "place_order") {
      const { symbol, qty, side, type = "market", time_in_force = "day",
        limit_price, stop_price, order_class, take_profit, stop_loss,
        signal_id } = body;

      if (!symbol || !qty || !side) {
        return jsonRes({ error: "Missing required: symbol, qty, side" }, 400);
      }

      // Pre-trade validation: check account buying power
      const acctRes = await fetchWithRetry(`${baseUrl}/v2/account`, { headers });
      if (acctRes.ok) {
        const acct = await acctRes.json();
        const buyingPower = Number(acct.buying_power || 0);
        // Simple check: if buying power is very low, block
        if (buyingPower < 10) {
          return jsonRes({ error: "Insufficient buying power" }, 400);
        }
      }

      // Validate asset is tradable on Alpaca
      try {
        const assetRes = await fetchWithRetry(
          `${baseUrl}/v2/assets/${encodeURIComponent(symbol.replace('/', ''))}`,
          { headers }
        );
        if (assetRes.ok) {
          const asset = await assetRes.json();
          if (asset.tradable === false) {
            return jsonRes({
              error: `${symbol} is not tradable on Alpaca (status: ${asset.status || "unknown"})`,
            }, 400);
          }
          if (asset.status === "inactive") {
            return jsonRes({
              error: `${symbol} is inactive on Alpaca`,
            }, 400);
          }
          if (side === "sell" && asset.easy_to_borrow === false) {
            console.warn(`${symbol} is not easy-to-borrow, short may be rejected by Alpaca`);
          }
        }
      } catch {
        console.warn(`Asset tradability check failed for ${symbol}, proceeding with order`);
      }

      const idempotencyId = signal_id
        ? `lhy-${String(signal_id).slice(0, 8)}`
        : `lhy-${crypto.randomUUID().slice(0, 12)}`;

      const orderBody: Record<string, unknown> = {
        client_order_id: idempotencyId,
        symbol,
        qty: String(qty),
        side,
        type,
        time_in_force,
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

      const res = await fetchWithRetry(`${baseUrl}/v2/orders`, {
        method: "POST",
        headers,
        body: JSON.stringify(orderBody),
      });
      const data = await res.json();

      if (!res.ok) {
        console.error("Alpaca order error:", JSON.stringify(data));
        return jsonRes({ error: `Alpaca order error [${res.status}]: ${data.message || JSON.stringify(data)}` }, res.status);
      }

      // Poll for fill confirmation
      let finalOrder = data;
      let fillConfirmed = !['accepted', 'new', 'pending_new'].includes(String(data.status));

      if (!fillConfirmed) {
        const polled = await pollOrderStatus(baseUrl, data.id, headers);
        if (polled.status === 'polling_timeout') {
          return jsonRes({
            success: false,
            pending: true,
            order_id: data.id,
            client_order_id: idempotencyId,
            message: "Order sent to Alpaca but fill not confirmed within timeout. Run alpaca-sync to reconcile.",
          });
        }
        finalOrder = polled;
        fillConfirmed = String(finalOrder.status) === 'filled';
      }

      return jsonRes({
        success: fillConfirmed,
        order: {
          id: finalOrder.id,
          client_order_id: finalOrder.client_order_id,
          symbol: finalOrder.symbol,
          qty: finalOrder.qty,
          filled_qty: finalOrder.filled_qty,
          side: finalOrder.side,
          type: finalOrder.type,
          status: finalOrder.status,
          submitted_at: finalOrder.submitted_at,
          filled_at: finalOrder.filled_at,
          filled_avg_price: finalOrder.filled_avg_price,
          order_class: finalOrder.order_class,
        },
      });
    }

    // ─── ACTION: close_position ───
    if (action === "close_position") {
      const { symbol, qty } = body;
      if (!symbol) return jsonRes({ error: "Missing: symbol" }, 400);

      const absQty = qty ? Math.abs(Number(qty)) : null;
      const url = absQty
        ? `${baseUrl}/v2/positions/${encodeURIComponent(symbol)}?qty=${absQty}`
        : `${baseUrl}/v2/positions/${encodeURIComponent(symbol)}`;

      const res = await fetchWithRetry(url, { method: "DELETE", headers });
      const data = await res.json();

      if (!res.ok) {
        return jsonRes({ error: `Alpaca close error [${res.status}]: ${data.message || JSON.stringify(data)}` }, res.status);
      }

      // Immediately update local position record
      try {
        const fillPrice = parseFloat(data.filled_avg_price || "0");
        if (fillPrice > 0) {
          const { data: localPos } = await supabase
            .from("positions")
            .select("id, direction, quantity, avg_entry")
            .eq("user_id", userId)
            .eq("symbol", symbol)
            .eq("status", "open")
            .maybeSingle();

          if (localPos) {
            const diff = localPos.direction === "long"
              ? fillPrice - Number(localPos.avg_entry)
              : Number(localPos.avg_entry) - fillPrice;
            const pnl = diff * Number(localPos.quantity);

            await supabase.from("positions").update({
              status: "closed",
              close_price: fillPrice,
              pnl,
              closed_at: data.filled_at || new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }).eq("id", localPos.id);
          }
        }
      } catch (syncErr) {
        console.error("Local position sync failed (Alpaca close succeeded):", syncErr);
      }

      return jsonRes({ success: true, order: data });
    }

    // ─── ACTION: get_orders ───
    if (action === "get_orders") {
      const { status: orderStatus = "all", limit = 50 } = body;
      const res = await fetchWithRetry(`${baseUrl}/v2/orders?status=${orderStatus}&limit=${limit}`, { headers });
      const data = await res.json();
      if (!res.ok) {
        return jsonRes({ error: `Alpaca error [${res.status}]: ${JSON.stringify(data)}` }, res.status);
      }
      return jsonRes({ success: true, orders: data });
    }

    // ─── ACTION: get_order_status ───
    if (action === "get_order_status") {
      const { order_id } = body;
      if (!order_id) return jsonRes({ error: "Missing: order_id" }, 400);
      const res = await fetchWithRetry(`${baseUrl}/v2/orders/${order_id}`, { headers });
      const data = await res.json();
      if (!res.ok) {
        return jsonRes({ error: `Alpaca error [${res.status}]: ${JSON.stringify(data)}` }, res.status);
      }
      return jsonRes({ success: true, order: data });
    }

    return jsonRes({ error: "Invalid action. Use: test_connection, get_positions, place_order, close_position, get_orders, get_order_status" }, 400);
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
