import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://lhydbra.lovable.app",
  "https://id-preview--cfc6c4be-124b-47d1-b6e8-26dbf563d3b8.lovable.app",
  "http://localhost:5173",
  "http://localhost:8080",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : "",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

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

async function pollOrderStatus(baseUrl: string, orderId: string, headers: Record<string, string>, maxAttempts = 10): Promise<Record<string, unknown>> {
  const url = `${baseUrl}/v2/orders/${orderId}`;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const res = await fetch(url, { headers });
    if (res.status === 401 || res.status === 403) {
      console.error(`[alpaca-trade] Auth error during poll: ${res.status}`);
      return { status: 'auth_error', id: orderId, code: res.status };
    }
    if (res.status === 404) {
      return { status: 'order_not_found', id: orderId };
    }
    if (!res.ok) {
      console.error(`[alpaca-trade] Poll attempt ${i + 1} failed: ${res.status}`);
      continue;
    }
    const order = await res.json();
    if (['filled', 'canceled', 'expired', 'rejected'].includes(order.status)) {
      return order;
    }
  }
  return { status: 'polling_timeout', id: orderId };
}

const round2 = (v: unknown) => {
  const n = Number(v);
  return isNaN(n) ? v : String(Math.round(n * 100) / 100);
};

// Submit Trailing Stop + Take Profit after fill
// trail_amount = abs(entry_price - stop_loss) → dynamic trailing distance
async function submitPostFillProtection(
  baseUrl: string,
  headers: Record<string, string>,
  symbol: string,
  qty: number,
  side: string,
  entryPrice: number,
  stopLoss: number,
  takeProfit: number,
): Promise<{ success: boolean; error?: string; trailing?: boolean }> {
  const closeSide = side === "buy" ? "sell" : "buy";
  const tp = Math.round(takeProfit * 100) / 100;
  const trailAmount = Math.round(Math.abs(entryPrice - stopLoss) * 100) / 100;
  const cleanSymbol = symbol.replace("/", "");

  if (trailAmount <= 0) {
    console.warn(`[alpaca-trade] Trail amount is 0 for ${symbol}, skipping trailing stop`);
    return { success: false, error: "Trail amount is 0 (entry === stop_loss)" };
  }

  console.log(`[alpaca-trade] Protection for ${symbol}: Trailing Stop $${trailAmount} + TP Limit @${tp}`);

  let trailingOk = false;
  let tpOk = false;
  let trailError = "";
  let tpError = "";

  // 1) Submit Trailing Stop order
  try {
    const trailBody = {
      symbol: cleanSymbol,
      qty: String(qty),
      side: closeSide,
      type: "trailing_stop",
      time_in_force: "gtc",
      trail_price: String(trailAmount),
    };
    console.log(`[alpaca-trade] Submitting trailing stop: ${JSON.stringify(trailBody)}`);
    const trailRes = await fetchWithRetry(`${baseUrl}/v2/orders`, {
      method: "POST", headers, body: JSON.stringify(trailBody),
    });
    if (trailRes.ok) {
      console.log(`[alpaca-trade] ✓ Trailing stop placed for ${symbol}: trail $${trailAmount} (GTC)`);
      trailingOk = true;
    } else {
      trailError = await trailRes.text();
      console.error(`[alpaca-trade] Trailing stop failed for ${symbol}: ${trailError}`);

      // Fallback: static stop if trailing not supported
      const fallbackBody = {
        symbol: cleanSymbol, qty: String(qty), side: closeSide,
        type: "stop", time_in_force: "gtc",
        stop_price: String(Math.round(stopLoss * 100) / 100),
      };
      const fallbackRes = await fetch(`${baseUrl}/v2/orders`, {
        method: "POST", headers, body: JSON.stringify(fallbackBody),
      });
      if (fallbackRes.ok) {
        console.log(`[alpaca-trade] ✓ Fallback static SL placed for ${symbol} @ ${stopLoss}`);
        trailingOk = true;
        trailError = `Trailing not supported, static SL fallback active`;
      } else {
        const fbErr = await fallbackRes.text();
        trailError += ` | Fallback also failed: ${fbErr}`;
      }
    }
  } catch (e) {
    trailError = e instanceof Error ? e.message : "Trailing stop error";
    console.error(`[alpaca-trade] Trailing stop exception:`, e);
  }

  // 2) Submit Take Profit limit order (independent)
  if (tp > 0) {
    try {
      const tpBody = {
        symbol: cleanSymbol, qty: String(qty), side: closeSide,
        type: "limit", time_in_force: "gtc",
        limit_price: String(tp),
      };
      const tpRes = await fetchWithRetry(`${baseUrl}/v2/orders`, {
        method: "POST", headers, body: JSON.stringify(tpBody),
      });
      if (tpRes.ok) {
        console.log(`[alpaca-trade] ✓ TP limit placed for ${symbol} @ ${tp} (GTC)`);
        tpOk = true;
      } else {
        tpError = await tpRes.text();
        console.error(`[alpaca-trade] TP limit failed for ${symbol}: ${tpError}`);
      }
    } catch (e) {
      tpError = e instanceof Error ? e.message : "TP limit error";
    }
  }

  const success = trailingOk || tpOk;
  const errors = [trailError, tpError].filter(Boolean).join(" | ");
  return { success, trailing: trailingOk, error: success ? (errors || undefined) : errors };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonRes(req, { error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const isServiceRole = authHeader === `Bearer ${serviceKey}`;

    const body = await req.json();
    const { action, paper = true } = body;

    // Always authenticate via JWT — no user_id_override
    let userId: string;
    if (isServiceRole) {
      // Service role calls (e.g. from operator-mode) use the supabase client directly
      // They must pass user_id in the body for audit purposes only after internal auth
      const bodyUserId = body.authenticated_user_id;
      if (!bodyUserId) {
        return jsonRes(req, { error: "Service role calls must include authenticated_user_id" }, 400);
      }
      userId = bodyUserId;
    } else {
      const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(
        authHeader!.replace("Bearer ", "")
      );
      if (claimsErr || !claimsData?.claims?.sub) {
        return jsonRes(req, { error: "Unauthorized" }, 401);
      }
      userId = claimsData.claims.sub as string;
    }
    const baseUrl = paper ? ALPACA_PAPER_URL : ALPACA_LIVE_URL;
    const headers = alpacaHeaders();

    // ─── ACTION: test_connection ───
    if (action === "test_connection") {
      const res = await fetchWithRetry(`${baseUrl}/v2/account`, { headers });
      const data = await res.json();
      if (!res.ok) {
        return jsonRes(req, { error: `Alpaca error [${res.status}]: ${JSON.stringify(data)}` }, res.status);
      }
      return jsonRes(req, {
        success: true,
        account: {
          id: data.id, status: data.status, currency: data.currency,
          buying_power: data.buying_power, cash: data.cash,
          portfolio_value: data.portfolio_value, equity: data.equity,
          pattern_day_trader: data.pattern_day_trader,
          trading_blocked: data.trading_blocked, account_blocked: data.account_blocked,
        },
      });
    }

    // ─── ACTION: get_positions ───
    if (action === "get_positions") {
      const res = await fetchWithRetry(`${baseUrl}/v2/positions`, { headers });
      const data = await res.json();
      if (!res.ok) {
        return jsonRes(req, { error: `Alpaca error [${res.status}]: ${JSON.stringify(data)}` }, res.status);
      }
      return jsonRes(req, { success: true, positions: data });
    }

    // ─── ACTION: place_order ───
    if (action === "place_order") {
      const { symbol, qty, side, type = "market", time_in_force = "day",
        limit_price, stop_price, take_profit, stop_loss,
        signal_id } = body;

      if (!symbol || !qty || !side) {
        return jsonRes(req, { error: "Missing required: symbol, qty, side" }, 400);
      }

      const parsedQty = parseFloat(qty);
      if (isNaN(parsedQty) || parsedQty <= 0) {
        return jsonRes(req, { error: "qty must be a positive number" }, 400);
      }
      if (parsedQty > 10000) {
        return jsonRes(req, { error: "qty exceeds maximum allowed per order" }, 400);
      }
      if (!["buy", "sell"].includes(String(side).toLowerCase())) {
        return jsonRes(req, { error: "side must be 'buy' or 'sell'" }, 400);
      }
      if (!/^[A-Z]{1,10}$/.test(String(symbol).toUpperCase())) {
        return jsonRes(req, { error: "Invalid symbol format" }, 400);
      }

      // Pre-trade validation: check account buying power
      const acctRes = await fetchWithRetry(`${baseUrl}/v2/account`, { headers });
      if (acctRes.ok) {
        const acct = await acctRes.json();
        const buyingPower = Number(acct.buying_power || 0);
        if (buyingPower < 10) {
          return jsonRes(req, { error: "Insufficient buying power" }, 400);
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
            return jsonRes(req, { error: `${symbol} is not tradable on Alpaca (status: ${asset.status || "unknown"})` }, 400);
          }
          if (asset.status === "inactive") {
            return jsonRes(req, { error: `${symbol} is inactive on Alpaca` }, 400);
          }
          if (side === "sell" && asset.easy_to_borrow === false) {
            console.warn(`${symbol} is not easy-to-borrow, short may be rejected`);
          }
        }
      } catch {
        console.warn(`Asset tradability check failed for ${symbol}, proceeding`);
      }

      const idempotencyId = signal_id
        ? `lhy-${String(signal_id).slice(0, 8)}`
        : `lhy-${crypto.randomUUID().slice(0, 12)}`;

      // ── Submit as plain market/limit order (NO bracket) ──
      const orderBody: Record<string, unknown> = {
        client_order_id: idempotencyId,
        symbol: symbol.replace("/", ""),
        qty: String(qty),
        side,
        type,
        time_in_force,
      };

      if (type === "limit" || type === "stop_limit") {
        orderBody.limit_price = round2(limit_price);
      }
      if (type === "stop" || type === "stop_limit") {
        orderBody.stop_price = round2(stop_price);
      }

      console.log(`[alpaca-trade] Order payload: ${JSON.stringify(orderBody)}`);

      const res = await fetchWithRetry(`${baseUrl}/v2/orders`, {
        method: "POST",
        headers,
        body: JSON.stringify(orderBody),
      });
      const data = await res.json();

      if (!res.ok) {
        console.error(`[alpaca-trade] Order error: ${JSON.stringify(data)}`);
        return jsonRes(req, { error: `Alpaca order error [${res.status}]: ${data.message || JSON.stringify(data)}` }, res.status);
      }

      // Poll for fill confirmation
      let finalOrder = data;
      let fillConfirmed = !['accepted', 'new', 'pending_new'].includes(String(data.status));

      if (!fillConfirmed) {
        const polled = await pollOrderStatus(baseUrl, data.id, headers);
        if (polled.status === 'polling_timeout') {
          return jsonRes(req, {
            success: false,
            pending: true,
            order_id: data.id,
            client_order_id: idempotencyId,
            message: "Order sent but fill not confirmed. Run alpaca-sync to reconcile.",
          });
        }
        finalOrder = polled;
        fillConfirmed = String(finalOrder.status) === 'filled';
      }

      // ── After fill: Submit Trailing Stop + TP ──
      let protectionResult: { success: boolean; error?: string; trailing?: boolean } | null = null;
      const slPrice = Number(stop_loss);
      const tpPrice = Number(take_profit);
      const entryPriceNum = parseFloat(String(finalOrder.filled_avg_price || "0")) || Number(body.entry_price || 0);
      const filledQty = parseFloat(String(finalOrder.filled_qty || "0")) || parsedQty;

      if (fillConfirmed) {
        // Wait for Alpaca to register the position
        await new Promise(r => setTimeout(r, 800));

        if (slPrice > 0 && entryPriceNum > 0) {
          console.log(`[alpaca-trade] Fill confirmed for ${symbol}, submitting trailing stop + TP`);
          // Retry up to 3 times
          for (let attempt = 1; attempt <= 3; attempt++) {
            protectionResult = await submitPostFillProtection(
              baseUrl, headers, symbol, filledQty, side,
              entryPriceNum, slPrice, tpPrice
            );
            if (protectionResult.success) break;
            console.warn(`[alpaca-trade] Protection attempt ${attempt}/3 failed: ${protectionResult.error}`);
            if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt));
          }
          if (!protectionResult?.success) {
            console.error(`[alpaca-trade] ⚠ ALL protection attempts failed for ${symbol}. EXECUTING FAIL-SAFE.`);

            // Fail-safe: close position immediately to prevent unprotected exposure
            try {
              const closeSide = side === "buy" ? "sell" : "buy";
              const closeRes = await fetchWithRetry(`${baseUrl}/v2/orders`, {
                method: "POST",
                headers,
                body: JSON.stringify({
                  symbol: symbol.replace("/", ""),
                  qty: String(filledQty),
                  side: closeSide,
                  type: "market",
                  time_in_force: "day",
                }),
              });

              if (closeRes.ok) {
                console.log(`[alpaca-trade] Fail-safe: Position closed successfully for ${symbol}`);

                await supabase.from("audit_log").insert({
                  user_id: userId,
                  action: "fail_safe_close",
                  entity: "order",
                  entity_id: String(finalOrder.id),
                  new_values: {
                    symbol, qty: filledQty, side: closeSide,
                    reason: "All SL/TP protection attempts failed",
                    protection_error: protectionResult?.error,
                  },
                } as Record<string, unknown>);

                return jsonRes(req, {
                  success: false,
                  fail_safe_triggered: true,
                  reason: "Protection failed, position closed for safety",
                  order: {
                    id: finalOrder.id,
                    symbol: finalOrder.symbol,
                    status: finalOrder.status,
                    filled_avg_price: finalOrder.filled_avg_price,
                  },
                });
              } else {
                const closeErrorText = await closeRes.text();
                console.error(`[alpaca-trade] Fail-safe close failed [${closeRes.status}]: ${closeErrorText}`);
              }
            } catch (closeErr) {
              console.error(`[alpaca-trade] CRITICAL: Fail-safe close exception:`, closeErr);
            }

            // If even the fail-safe close failed, return critical error
            await supabase.from("audit_log").insert({
              user_id: userId,
              action: "critical_unprotected_position",
              entity: "order",
              entity_id: String(finalOrder.id),
              new_values: {
                symbol, qty: filledQty, side,
                reason: "Position filled but unprotected AND fail-safe close failed",
                protection_error: protectionResult?.error,
              },
            } as Record<string, unknown>);

            return jsonRes(req, {
              success: false,
              critical: true,
              reason: "Position filled but unprotected AND fail-safe close failed. MANUAL INTERVENTION REQUIRED.",
              order: {
                id: finalOrder.id,
                symbol: finalOrder.symbol,
                status: finalOrder.status,
                filled_avg_price: finalOrder.filled_avg_price,
              },
            }, 500);
          }
        } else if (tpPrice > 0) {
          // Only TP, no SL
          const closeSide = side === "buy" ? "sell" : "buy";
          try {
            const tpRes = await fetch(`${baseUrl}/v2/orders`, {
              method: "POST", headers,
              body: JSON.stringify({
                symbol: symbol.replace("/", ""), qty: String(filledQty),
                side: closeSide, type: "limit", time_in_force: "gtc",
                limit_price: round2(tpPrice),
              }),
            });
            protectionResult = { success: tpRes.ok, error: tpRes.ok ? undefined : await tpRes.text() };
          } catch (tpErr) {
            console.error(`[alpaca-trade] TP-only fallback exception:`, tpErr);
            protectionResult = { success: false, error: "TP submission failed" };
          }
        } else {
          console.warn(`[alpaca-trade] ⚠ No SL/TP provided for ${symbol}. Position UNPROTECTED.`);
          protectionResult = { success: false, error: "No SL/TP values provided" };
        }
      }

      // Audit log
      await supabase.from("audit_log").insert({
        user_id: userId,
        action: "trade_executed",
        entity: "order",
        entity_id: String(finalOrder.id),
        new_values: {
          symbol, qty, side, status: finalOrder.status,
          filled_avg_price: finalOrder.filled_avg_price,
          trailing_stop: protectionResult?.trailing || false,
          protection_submitted: protectionResult?.success || false,
        },
      } as Record<string, unknown>).then(({ error: auditErr }) => {
        if (auditErr) console.error("[audit_log] insert error:", auditErr.message);
      });

      return jsonRes(req, {
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
        },
        protection: protectionResult,
      });
    }

    // ─── ACTION: close_position ───
    if (action === "close_position") {
      const { symbol, qty } = body;
      if (!symbol) return jsonRes(req, { error: "Missing: symbol" }, 400);

      // Cancel any open protective orders for this symbol first
      try {
        const openOrdersRes = await fetch(`${baseUrl}/v2/orders?status=open&limit=200`, { headers });
        if (openOrdersRes.ok) {
          const openOrders = await openOrdersRes.json() as any[];
          const cleanSym = String(symbol).replace("/", "").toUpperCase();
          for (const ord of openOrders) {
            if (ord.symbol === cleanSym && (ord.type === "stop" || ord.type === "limit" || ord.type === "trailing_stop" || ord.order_class === "oco")) {
              try { await fetch(`${baseUrl}/v2/orders/${ord.id}`, { method: "DELETE", headers }); } catch (cancelErr) { console.error(`[alpaca-trade] Failed to cancel order ${ord.id}:`, cancelErr); }
            }
          }
        }
      } catch (cancelBlockErr) { console.error(`[alpaca-trade] Error cancelling protective orders:`, cancelBlockErr); }

      const absQty = qty ? Math.abs(Number(qty)) : null;
      const url = absQty
        ? `${baseUrl}/v2/positions/${encodeURIComponent(symbol)}?qty=${absQty}`
        : `${baseUrl}/v2/positions/${encodeURIComponent(symbol)}`;

      const res = await fetchWithRetry(url, { method: "DELETE", headers });
      const data = await res.json();

      if (!res.ok) {
        return jsonRes(req, { error: `Alpaca close error [${res.status}]: ${data.message || JSON.stringify(data)}` }, res.status);
      }

      // Update local position record
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
        console.error("Local position sync failed:", syncErr);
      }

      await supabase.from("audit_log").insert({
        user_id: userId,
        action: "position_closed",
        entity: "order",
        entity_id: String(data.id),
        new_values: { symbol, qty: qty || "full", status: data.status, filled_avg_price: data.filled_avg_price },
      } as Record<string, unknown>).then(({ error: auditErr }) => {
        if (auditErr) console.error("[audit_log] insert error:", auditErr.message);
      });

      return jsonRes(req, { success: true, order: data });
    }

    // ─── ACTION: get_orders ───
    if (action === "get_orders") {
      const { status: orderStatus = "all", limit = 50 } = body;
      const res = await fetchWithRetry(`${baseUrl}/v2/orders?status=${orderStatus}&limit=${limit}`, { headers });
      const data = await res.json();
      if (!res.ok) {
        return jsonRes(req, { error: `Alpaca error [${res.status}]: ${JSON.stringify(data)}` }, res.status);
      }
      return jsonRes(req, { success: true, orders: data });
    }

    // ─── ACTION: get_order_status ───
    if (action === "get_order_status") {
      const { order_id } = body;
      if (!order_id) return jsonRes(req, { error: "Missing: order_id" }, 400);
      const res = await fetchWithRetry(`${baseUrl}/v2/orders/${order_id}`, { headers });
      const data = await res.json();
      if (!res.ok) {
        return jsonRes(req, { error: `Alpaca error [${res.status}]: ${JSON.stringify(data)}` }, res.status);
      }
      return jsonRes(req, { success: true, order: data });
    }

    return jsonRes(req, { error: "Invalid action. Use: test_connection, get_positions, place_order, close_position, get_orders, get_order_status" }, 400);
  } catch (e) {
    console.error("Alpaca trade error:", e);
    return jsonRes(req, { error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function jsonRes(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}
