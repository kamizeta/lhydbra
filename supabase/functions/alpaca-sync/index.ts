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
    const body = await req.json().catch(() => ({}));
    const { scheduled = false, paper = true, user_id_override } = body;

    // ─── Scheduled mode: iterate all users with open positions ───
    if (scheduled) {
      const adminSupabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      const { data: usersWithPositions } = await adminSupabase
        .from("positions")
        .select("user_id")
        .eq("status", "open");

      const uniqueUsers = [...new Set((usersWithPositions || []).map(p => p.user_id))];
      const results: { user_id: string; ok: boolean }[] = [];

      for (const uid of uniqueUsers) {
        try {
          // Fetch user's paper preference
          const { data: userPref } = await adminSupabase
            .from("user_settings")
            .select("paper_trading")
            .eq("user_id", uid)
            .maybeSingle();
          const userPaper = (userPref as any)?.paper_trading !== false; // default to paper

          const resp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/alpaca-sync`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({ paper: userPaper, user_id_override: uid }),
          });
          results.push({ user_id: uid, ok: resp.ok });
        } catch {
          results.push({ user_id: uid, ok: false });
        }
      }

      return jsonRes({ scheduled: true, processed: uniqueUsers.length, results });
    }

    // ─── Auth ───
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonRes({ error: "Unauthorized" }, 401);
    }

    let userId: string;

    // Service-role call with user_id_override
    if (user_id_override && authHeader === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`) {
      userId = user_id_override;
    } else {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });

      const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();
      if (userError || !user) {
        return jsonRes({ error: "Unauthorized" }, 401);
      }
      userId = user.id;
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
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

    // Group local positions by clean symbol (handle duplicates)
    const localGrouped = new Map<string, (typeof localPositions[0])[]>();
    for (const p of (localPositions || [])) {
      const key = cleanSymbol(p.symbol);
      if (!localGrouped.has(key)) localGrouped.set(key, []);
      localGrouped.get(key)!.push(p);
    }
    // Pick the best local position per symbol (highest qty) and mark extras for cleanup
    const localBySymbol = new Map<string, typeof localPositions[0]>();
    const duplicatesToRemove: string[] = [];
    for (const [key, group] of localGrouped) {
      // Sort by absolute quantity descending, pick first
      group.sort((a, b) => Math.abs(Number(b.quantity)) - Math.abs(Number(a.quantity)));
      localBySymbol.set(key, group[0]);
      // Mark smaller duplicates for deletion
      for (let i = 1; i < group.length; i++) {
        duplicatesToRemove.push(group[i].id);
      }
    }
    // Delete duplicate local positions
    if (duplicatesToRemove.length > 0) {
      for (const dupId of duplicatesToRemove) {
        await supabase.from("positions").delete().eq("id", dupId);
        changes.push({ action: "deleted_duplicate", symbol: "dup", detail: `Removed duplicate position ${dupId}` });
      }
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
        // Update quantity/entry/open PnL if changed
        const localQty = Number(local.quantity);
        const localEntry = Number(local.avg_entry);
        const localPnl = Number(local.pnl || 0);
        const roundedUnrealizedPl = Number(unrealizedPl.toFixed(2));
        if (
          Math.abs(localQty - qty) > 0.0001 ||
          Math.abs(localEntry - avgEntry) > 0.01 ||
          Math.abs(localPnl - roundedUnrealizedPl) > 0.01
        ) {
          await supabase.from("positions").update({
            quantity: qty,
            avg_entry: avgEntry,
            pnl: roundedUnrealizedPl,
            updated_at: new Date().toISOString(),
          }).eq("id", local.id);

          changes.push({
            action: "updated",
            symbol: sym,
            detail: `qty: ${localQty}→${qty}, entry: ${localEntry.toFixed(2)}→${avgEntry.toFixed(2)}, pnl: ${localPnl.toFixed(2)}→${roundedUnrealizedPl.toFixed(2)}`,
          });
        }

        // ─── Breakeven stop management ───
        if (local.stop_loss) {
          const currentSL = Number(local.stop_loss);
          const entry = Number(local.avg_entry);
          const stopDist = Math.abs(entry - currentSL);
          const direction = local.direction === "long" ? "long" : "short";

          const currentR = stopDist > 0
            ? direction === "long"
              ? (currentPrice - entry) / stopDist
              : (entry - currentPrice) / stopDist
            : 0;

          const alreadyAtBreakeven = direction === "long"
            ? currentSL >= entry - 0.001
            : currentSL <= entry + 0.001;

          if (currentR >= 1.0 && !alreadyAtBreakeven) {
            try {
              await supabase.from("positions").update({
                stop_loss: entry,
                updated_at: new Date().toISOString(),
                notes: `${local.notes || ""} | BE stop set at ${entry.toFixed(4)} (reached ${currentR.toFixed(1)}R)`,
              }).eq("id", local.id);

              changes.push({
                action: "updated",
                symbol: sym,
                detail: `Breakeven stop set @ ${entry.toFixed(4)} (was ${currentSL.toFixed(4)}, reached ${currentR.toFixed(1)}R)`,
              });

              // ─── Also update the actual Alpaca order ───
              try {
                const alpHdrs = {
                  "APCA-API-KEY-ID": Deno.env.get("ALPACA_API_KEY_ID") ?? "",
                  "APCA-API-SECRET-KEY": Deno.env.get("ALPACA_API_SECRET_KEY") ?? "",
                  "Content-Type": "application/json",
                };
                const ordersRes = await fetch(
                  `${baseUrl}/v2/orders?status=open&limit=100`,
                  { headers: alpHdrs, signal: AbortSignal.timeout(5000) }
                );
                if (ordersRes.ok) {
                  const orders = await ordersRes.json();
                  const cleanSym = String(local.symbol).replace("/", "");
                  const symbolOrders = (orders as any[]).filter(o =>
                    o.symbol === cleanSym &&
                    (o.type === "stop" || o.type === "stop_limit" ||
                     (o.order_class === "bracket" && o.status === "held"))
                  );
                  for (const ord of symbolOrders) {
                    try {
                      const patchRes = await fetch(
                        `${baseUrl}/v2/orders/${ord.id}`,
                        {
                          method: "PATCH",
                          headers: alpHdrs,
                          body: JSON.stringify({ stop_price: entry.toFixed(4) }),
                        }
                      );
                      if (patchRes.ok) {
                        console.log(`[alpaca-sync] ✓ Breakeven stop updated in Alpaca: ${local.symbol} @ ${entry.toFixed(4)}`);
                      } else {
                        const errText = await patchRes.text();
                        console.warn(`[alpaca-sync] Alpaca stop patch failed: ${errText}`);
                      }
                    } catch (patchErr) {
                      console.warn(`[alpaca-sync] Order patch error:`, patchErr);
                    }
                  }
                }
              } catch (alpacaBeErr) {
                console.warn("[alpaca-sync] Alpaca breakeven update error:", alpacaBeErr);
              }
            } catch (beErr) {
              console.error("Breakeven stop update error:", beErr);
            }
          }
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
          pnl: Number(unrealizedPl.toFixed(2)),
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

        // ── Post-trade feedback loop ──
        try {
          const isWin = pnl > 0;

          // Update consecutive wins/losses streak
          const { data: currentSettings } = await supabase
            .from("user_settings")
            .select("consecutive_losses, consecutive_wins")
            .eq("user_id", userId)
            .maybeSingle();

          const prevLosses = Number((currentSettings as any)?.consecutive_losses || 0);
          const prevWins = Number((currentSettings as any)?.consecutive_wins || 0);

          await supabase.from("user_settings").update({
            consecutive_losses: isWin ? 0 : prevLosses + 1,
            consecutive_wins: isWin ? prevWins + 1 : 0,
            updated_at: new Date().toISOString(),
          }).eq("user_id", userId);

          // Upsert strategy_performance
          const strategy = (local as any).strategy_family || (local as any).strategy || "unknown";
          const regime = (local as any).regime_at_entry || "all";
          const entryP = Number(local.avg_entry);
          const stopP = Number((local as any).stop_loss || 0);
          const rMultiple = entryP > 0 && stopP > 0 && Math.abs(entryP - stopP) > 0
            ? pnl / (Math.abs(entryP - stopP) * qty)
            : null;

          const { data: existing } = await supabase
            .from("strategy_performance")
            .select("*")
            .eq("user_id", userId)
            .eq("strategy_family", strategy)
            .eq("market_regime", regime)
            .maybeSingle();

          if (existing) {
            const newTotal = Number(existing.total_trades) + 1;
            const newWins = Number(existing.winning_trades) + (isWin ? 1 : 0);
            const newLosses = Number(existing.losing_trades) + (isWin ? 0 : 1);
            const newPnl = Number(existing.total_pnl || 0) + pnl;
            const newWinRate = newTotal > 0 ? (newWins / newTotal) * 100 : 0;
            const newAvgR = rMultiple !== null
              ? ((Number(existing.avg_r_multiple || 0) * Number(existing.total_trades)) + rMultiple) / newTotal
              : Number(existing.avg_r_multiple || 0);

            await supabase.from("strategy_performance").update({
              total_trades: newTotal,
              winning_trades: newWins,
              losing_trades: newLosses,
              total_pnl: Number(newPnl.toFixed(2)),
              win_rate: Number(newWinRate.toFixed(2)),
              avg_r_multiple: Number(newAvgR.toFixed(4)),
              updated_at: new Date().toISOString(),
            }).eq("id", existing.id);
          } else {
            await supabase.from("strategy_performance").insert({
              user_id: userId,
              strategy_family: strategy,
              market_regime: regime,
              total_trades: 1,
              winning_trades: isWin ? 1 : 0,
              losing_trades: isWin ? 0 : 1,
              total_pnl: Number(pnl.toFixed(2)),
              win_rate: isWin ? 100 : 0,
              avg_r_multiple: rMultiple ? Number(rMultiple.toFixed(4)) : 0,
            });
          }

          console.log(`[FeedbackLoop] ${local.symbol}: ${isWin ? "WIN" : "LOSS"}, streak: ${isWin ? prevWins + 1 : 0}W / ${isWin ? 0 : prevLosses + 1}L`);
        } catch (feedbackErr) {
          console.warn("[FeedbackLoop] Non-blocking error:", feedbackErr);
        }

        // ─── Write to trade_journal ───
        try {
          const entryP = Number(local.avg_entry);
          const stopP = Number((local as any).stop_loss || 0);
          const rMultipleJ = entryP > 0 && stopP > 0 && filledPrice > 0
            ? (local.direction === "long"
                ? (filledPrice - entryP) / Math.abs(entryP - stopP)
                : (entryP - filledPrice) / Math.abs(entryP - stopP))
            : null;

          await supabase.from("trade_journal").insert({
            user_id: userId,
            symbol: local.symbol,
            asset_type: (local as any).asset_type || "stock",
            direction: local.direction,
            entry_price: entryP,
            exit_price: filledPrice,
            quantity: Number(local.quantity),
            pnl: pnl,
            r_multiple: rMultipleJ,
            strategy_family: (local as any).strategy_family || (local as any).strategy || "unknown",
            market_regime: (local as any).regime_at_entry || "unknown",
            opportunity_score: null,
            position_id: local.id,
            entered_at: (local as any).opened_at || (local as any).created_at,
            exited_at: closingOrder.filled_at || new Date().toISOString(),
            exit_reasoning: pnl > 0 ? "take_profit" : "stop_loss",
            entry_reasoning: `Auto-closed via alpaca-sync. PnL: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}`,
          });
        } catch (journalErr) {
          console.error("trade_journal write error:", journalErr);
        }

        // ─── Write signal outcome ───
        try {
          const { data: originalSignal } = await supabase
            .from("signals")
            .select("id, opportunity_score, confidence_score, direction, strategy_family, market_regime, score_breakdown, weight_profile_used")
            .eq("user_id", userId)
            .eq("asset", local.symbol)
            .in("status", ["approved", "active", "completed"])
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (originalSignal) {
            await supabase.from("signal_outcomes").insert({
              user_id: userId,
              signal_id: originalSignal.id,
              symbol: local.symbol,
              predicted_score: originalSignal.opportunity_score,
              predicted_direction: originalSignal.direction,
              actual_pnl: pnl,
              actual_r_multiple: rMultiple ?? 0,
              outcome: pnl > 0 ? "win" : "loss",
              strategy_family: originalSignal.strategy_family,
              market_regime: originalSignal.market_regime,
              score_breakdown: originalSignal.score_breakdown,
              weight_profile_used: originalSignal.weight_profile_used,
              resolved_at: new Date().toISOString(),
            });

            await supabase.from("signals").update({
              status: "completed",
              updated_at: new Date().toISOString(),
            }).eq("id", originalSignal.id);
          }
        } catch (outcomeErr) {
          console.error("signal_outcomes write error:", outcomeErr);
        }

        // ─── Send notification for closed position ───
        try {
          const notifEvent = pnl > 0 ? "take_profit_hit" : "stop_loss_hit";
          await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-notification`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
            body: JSON.stringify({ user_id: userId, event: notifEvent, data: { symbol: local.symbol, pnl, r_multiple: rMultiple, strategy: (local as any).strategy_family || local.strategy } }),
          });
        } catch {}

        changes.push({
          action: "closed",
          symbol: local.symbol,
          detail: `@ ${filledPrice.toFixed(2)}, PnL: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}`,
        });
      }
    }

    // ─── SL/TP Guardian: re-submit missing or expired stop/take-profit orders ───
    try {
      const alpHdrs = {
        "APCA-API-KEY-ID": Deno.env.get("ALPACA_API_KEY_ID") ?? "",
        "APCA-API-SECRET-KEY": Deno.env.get("ALPACA_API_SECRET_KEY") ?? "",
        "Content-Type": "application/json",
        "Accept": "application/json",
      };

      const openOrdersRes = await fetch(
        `${baseUrl}/v2/orders?status=open&limit=500`,
        { headers: alpHdrs, signal: AbortSignal.timeout(8000) }
      );

      if (openOrdersRes.ok) {
        const openOrders = await openOrdersRes.json() as any[];

        // Build maps: which symbols have active stop/limit orders & their order IDs
        const symbolStopOrders = new Map<string, string[]>(); // sym → order IDs
        const symbolLimitOrders = new Map<string, string[]>();

        for (const ord of openOrders) {
          const sym = cleanSymbol(ord.symbol);
          if (ord.type === "stop" || ord.type === "stop_limit") {
            if (!symbolStopOrders.has(sym)) symbolStopOrders.set(sym, []);
            symbolStopOrders.get(sym)!.push(ord.id);
          }
          if (ord.type === "limit") {
            if (!symbolLimitOrders.has(sym)) symbolLimitOrders.set(sym, []);
            symbolLimitOrders.get(sym)!.push(ord.id);
          }
          // Bracket legs
          if (ord.legs && Array.isArray(ord.legs)) {
            for (const leg of ord.legs) {
              const legSym = cleanSymbol(leg.symbol || ord.symbol);
              if (leg.type === "stop" || leg.type === "stop_limit") {
                if (!symbolStopOrders.has(legSym)) symbolStopOrders.set(legSym, []);
                symbolStopOrders.get(legSym)!.push(leg.id);
              }
              if (leg.type === "limit") {
                if (!symbolLimitOrders.has(legSym)) symbolLimitOrders.set(legSym, []);
                symbolLimitOrders.get(legSym)!.push(leg.id);
              }
            }
          }
        }

        // Check each local open position for missing SL/TP
        const freshPositions = await supabase
          .from("positions")
          .select("id, symbol, direction, avg_entry, stop_loss, take_profit, quantity, asset_type")
          .eq("user_id", userId)
          .eq("status", "open");

        for (const pos of (freshPositions.data || [])) {
          const sym = cleanSymbol(pos.symbol);
          const isStock = pos.asset_type !== "crypto";
          if (!isStock) continue;

          const hasSL = pos.stop_loss != null && Number(pos.stop_loss) > 0;
          const hasTP = pos.take_profit != null && Number(pos.take_profit) > 0;
          const hasStopOrder = symbolStopOrders.has(sym);
          const hasLimitOrder = symbolLimitOrders.has(sym);

          const missingStop = hasSL && !hasStopOrder;
          const missingTP = hasTP && !hasLimitOrder;

          if (!missingStop && !missingTP) continue;

          const qty = Math.abs(Number(pos.quantity));
          const closeSide = pos.direction === "long" ? "sell" : "buy";
          const entry = Number(pos.avg_entry);
          const sl = Number(pos.stop_loss);
          const tp = Number(pos.take_profit);

          const slValid = hasSL && (pos.direction === "long" ? sl < entry - 0.01 : sl > entry + 0.01);
          const tpValid = hasTP && (pos.direction === "long" ? tp > entry + 0.01 : tp < entry - 0.01);

          if (!slValid && !tpValid) continue;

          // Cancel ALL existing protective orders for this symbol first
          const toCancel = [...(symbolStopOrders.get(sym) || []), ...(symbolLimitOrders.get(sym) || [])];
          for (const ordId of toCancel) {
            try { await fetch(`${baseUrl}/v2/orders/${ordId}`, { method: "DELETE", headers: alpHdrs }); } catch {}
          }
          if (toCancel.length > 0) await new Promise(r => setTimeout(r, 500));

          // Use OCO order to submit BOTH SL and TP together (one-cancels-other)
          if (slValid && tpValid) {
            try {
              const ocoBody = {
                symbol: sym,
                qty: String(qty),
                side: closeSide,
                type: "limit",
                time_in_force: "gtc",
                order_class: "oco",
                take_profit: { limit_price: String(Math.round(tp * 100) / 100) },
                stop_loss: { stop_price: String(Math.round(sl * 100) / 100) },
              };
              const ocoRes = await fetch(`${baseUrl}/v2/orders`, {
                method: "POST", headers: alpHdrs,
                body: JSON.stringify(ocoBody),
              });
              if (ocoRes.ok) {
                console.log(`[SL-Guardian] ✓ OCO for ${sym}: SL@${sl.toFixed(2)} + TP@${tp.toFixed(2)}`);
                changes.push({ action: "updated", symbol: pos.symbol, detail: `OCO: SL@${sl.toFixed(2)} + TP@${tp.toFixed(2)} (GTC)` });
              } else {
                const errText = await ocoRes.text();
                console.warn(`[SL-Guardian] OCO failed ${sym}: ${errText}`);
                // Fallback: at least set SL (TP can't coexist with SL for same qty)
                await submitSingleOrder(baseUrl, alpHdrs, sym, qty, closeSide, "stop", sl, changes, pos.symbol);
              }
            } catch (e) { console.warn(`[SL-Guardian] OCO error ${sym}:`, e); }
          } else if (slValid) {
            await submitSingleOrder(baseUrl, alpHdrs, sym, qty, closeSide, "stop", sl, changes, pos.symbol);
          } else if (tpValid) {
            await submitSingleOrder(baseUrl, alpHdrs, sym, qty, closeSide, "limit", tp, changes, pos.symbol);
          }
        }
      } else {
        console.warn(`[SL-Guardian] Could not fetch open orders: ${openOrdersRes.status}`);
      }
    } catch (guardianErr) {
      console.warn("[SL-Guardian] Non-blocking error:", guardianErr);
    }

    // ─── Update daily performance summary ───
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data: todaysClosed } = await supabase
        .from("positions")
        .select("pnl, strategy_family, direction")
        .eq("user_id", userId)
        .eq("status", "closed")
        .gte("closed_at", `${today}T00:00:00Z`);

      if (todaysClosed && todaysClosed.length > 0) {
        const totalPnl = todaysClosed.reduce((s, p) => s + Number(p.pnl || 0), 0);
        const wins = todaysClosed.filter(p => Number(p.pnl || 0) > 0).length;
        const losses = todaysClosed.filter(p => Number(p.pnl || 0) <= 0).length;

        await supabase.from("daily_performance").upsert({
          user_id: userId,
          date: today,
          realized_pnl: totalPnl,
          trades_closed: todaysClosed.length,
          win_count: wins,
          loss_count: losses,
        }, { onConflict: "user_id,date" });
      }
    } catch (perfErr) {
      console.error("Daily performance update error:", perfErr);
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

async function submitSingleOrder(
  baseUrl: string, headers: Record<string, string>,
  sym: string, qty: number, side: string,
  orderType: "stop" | "limit", price: number,
  changes: SyncChange[], displaySymbol: string,
) {
  try {
    const body: Record<string, string> = {
      symbol: sym, qty: String(qty), side,
      type: orderType, time_in_force: "gtc",
    };
    if (orderType === "stop") body.stop_price = String(Math.round(price * 100) / 100);
    else body.limit_price = String(Math.round(price * 100) / 100);

    const res = await fetch(`${baseUrl}/v2/orders`, { method: "POST", headers, body: JSON.stringify(body) });
    const label = orderType === "stop" ? "SL" : "TP";
    if (res.ok) {
      console.log(`[SL-Guardian] ✓ ${label} for ${sym} @ ${price.toFixed(2)}`);
      changes.push({ action: "updated", symbol: displaySymbol, detail: `${label} set @ ${price.toFixed(2)} (GTC)` });
    } else {
      console.warn(`[SL-Guardian] ${label} failed ${sym}: ${await res.text()}`);
    }
  } catch (e) { console.warn(`[SL-Guardian] order error ${sym}:`, e); }
}

function jsonRes(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
