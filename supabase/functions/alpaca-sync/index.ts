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

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return jsonRes({ error: "Unauthorized" }, 401);
    }
    const userId = user.id;

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

        changes.push({
          action: "closed",
          symbol: local.symbol,
          detail: `@ ${filledPrice.toFixed(2)}, PnL: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}`,
        });
      }
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

function jsonRes(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
