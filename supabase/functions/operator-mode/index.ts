import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getDynamicThresholds(vix: number, baseMinScore: number, baseMinR: number, baseMinConfidence: number) {
  let scoreAdj = 0, rAdj = 0, confAdj = 0;
  if (vix < 15) {
    scoreAdj = +5; rAdj = +0.2; confAdj = +5;
  } else if (vix <= 20) {
    scoreAdj = 0; rAdj = 0; confAdj = 0;
  } else if (vix <= 25) {
    scoreAdj = -5; rAdj = -0.1; confAdj = -3;
  } else if (vix <= 30) {
    scoreAdj = -8; rAdj = -0.2; confAdj = -5;
  } else if (vix <= 40) {
    scoreAdj = -12; rAdj = -0.3; confAdj = -8;
  } else {
    scoreAdj = -15; rAdj = -0.3; confAdj = -10;
  }
  return {
    min_score: Math.max(45, Math.min(85, baseMinScore + scoreAdj)),
    min_r: Math.max(1.2, Math.min(3.0, baseMinR + rAdj)),
    min_confidence: Math.max(40, Math.min(80, baseMinConfidence + confAdj)),
    vix,
    adjustment_reason: vix < 15 ? "calm_market" :
                       vix <= 20 ? "normal" :
                       vix <= 25 ? "elevated_volatility" :
                       vix <= 30 ? "high_volatility" :
                       vix <= 40 ? "extreme_volatility" : "crisis",
  };
}

function calcPositionSize(params: {
  capital: number;
  riskPct: number;
  entryPrice: number;
  stopLoss: number;
  maxSingleAssetPct: number;
  maxLeverage: number;
  isFractional: boolean;
}): number {
  if (params.capital <= 0 || params.entryPrice <= 0) return 0;
  const riskPerUnit = Math.abs(params.entryPrice - params.stopLoss);
  if (riskPerUnit <= 0) return 0;
  const dollarRisk = params.capital * (params.riskPct / 100);
  const riskBasedSize = dollarRisk / riskPerUnit;
  const maxAssetValue = params.capital * params.maxSingleAssetPct / 100;
  const concentrationCap = maxAssetValue / params.entryPrice;
  const maxExposure = params.capital * params.maxLeverage;
  const leverageCap = maxExposure / params.entryPrice;
  const idealSize = Math.max(0, Math.min(riskBasedSize, concentrationCap, leverageCap));
  if (params.isFractional) return parseFloat(idealSize.toFixed(6));
  return Math.floor(idealSize);
}

function isUSMarketOpen(): boolean {
  const now = new Date();
  const day = now.getUTCDay();
  if (day === 0 || day === 6) return false;
  const utcMins = now.getUTCHours() * 60 + now.getUTCMinutes();
  // NYSE 9:30am-4pm ET
  // EDT (UTC-4, Mar-Nov): 13:30-20:00 UTC = 810-1200
  // EST (UTC-5, Nov-Mar): 14:30-21:00 UTC = 870-1260
  // Use 810-1200 to cover both — avoids blocking EDT open
  return utcMins >= 810 && utcMins < 1200;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { scheduled = false } = body;

    // ─── Scheduled run: iterate all full_operator users ───
    if (scheduled) {
      const adminSupabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      const { data: autoUsers } = await adminSupabase
        .from("goal_profiles")
        .select("user_id")
        .eq("automation_level", "full_operator")
        .eq("is_active", true);

      const results = [];
      for (const u of (autoUsers || [])) {
        try {
          const resp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/operator-mode`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({ action: "run", paper: true, user_id_override: u.user_id }),
          });
          results.push({ user_id: u.user_id, ok: resp.ok });
        } catch (e) {
          results.push({ user_id: u.user_id, ok: false, error: e instanceof Error ? e.message : "Unknown" });
        }
      }

      return jsonRes({ scheduled: true, processed: results.length, results });
    }

    // ─── Standard auth flow ───
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonRes({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Support user_id_override for scheduled per-user calls
    const { action = "run", paper = true, user_id_override } = body;

    let user: { id: string } | null = null;
    if (user_id_override) {
      const isServiceRole = authHeader === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
      if (!isServiceRole) {
        return jsonRes({ error: "Forbidden: user_id_override requires service role" }, 403);
      }
      user = { id: user_id_override } as typeof user;
    } else {
      const userSupabase = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user: authUser }, error: userError } = await userSupabase.auth.getUser();
      if (userError || !authUser) return jsonRes({ error: "Unauthorized" }, 401);
      user = authUser;
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // ─── Load user settings & goal ───
    const [settingsRes, goalRes] = await Promise.all([
      supabase.from("user_settings").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("goal_profiles").select("*").eq("user_id", user.id).maybeSingle(),
    ]);

    const settings = settingsRes.data;
    if (!settings) return jsonRes({ error: "User settings not found. Configure your account first." }, 400);

    const goal = goalRes.data;
    const today = new Date().toISOString().split("T")[0];
    const maxTradesPerDay = Number(settings.max_trades_per_day || 3);
    const lossCooldownCount = Number(settings.loss_cooldown_count || 2);
    let consecutiveLosses = Number(settings.consecutive_losses || 0);
    let tradesToday = settings.last_trade_date === today ? Number(settings.trades_today || 0) : 0;
    const autoExecute = Boolean(settings.auto_execute);
    let currentCapital = Number(settings.current_capital || 10000);
    const baseRiskPerTrade = Number(settings.risk_per_trade || 1);
    const maxDailyRisk = Number(settings.max_daily_risk || 2);
    const maxDrawdown = Number(settings.max_drawdown || 15);
    let dailyRiskUsed = settings.last_trade_date === today ? Number(settings.daily_risk_used || 0) : 0;
    const automationLevel = goal?.automation_level || "guided";

    // ─── Adaptive risk: reduce after losses ───
    let riskPerTrade = baseRiskPerTrade;
    if (consecutiveLosses >= 2) riskPerTrade = Math.max(riskPerTrade * 0.5, 0.25);
    else if (consecutiveLosses === 1) riskPerTrade = Math.max(riskPerTrade * 0.75, 0.25);

    // Check drawdown
    const initialCapital = Number(settings.initial_capital || 10000);
    const drawdownPct = initialCapital > 0 ? ((initialCapital - currentCapital) / initialCapital) * 100 : 0;
    if (drawdownPct > maxDrawdown * 0.8) {
      riskPerTrade = Math.max(riskPerTrade * 0.5, 0.25);
    }

    // ─── Pre-flight checks ───
    const preflight: string[] = [];
    if (consecutiveLosses >= lossCooldownCount) preflight.push(`🔴 COOLDOWN: ${consecutiveLosses} losses (limit: ${lossCooldownCount})`);
    if (tradesToday >= maxTradesPerDay) preflight.push(`🔴 DAILY CAP: ${tradesToday}/${maxTradesPerDay} trades`);
    if (dailyRiskUsed >= maxDailyRisk) preflight.push(`🔴 RISK EXHAUSTED: ${dailyRiskUsed.toFixed(1)}%/${maxDailyRisk}%`);
    if (drawdownPct > maxDrawdown) preflight.push(`🔴 MAX DRAWDOWN: ${drawdownPct.toFixed(1)}% (limit: ${maxDrawdown}%)`);

    // Intraday circuit breaker: check unrealized loss on open positions
    if (action !== "status") {
      const { data: cbPositions } = await supabase
        .from("positions")
        .select("symbol, direction, quantity, avg_entry")
        .eq("user_id", user.id).eq("status", "open");
      const cbSymbols = (cbPositions || []).map((p: Record<string, unknown>) => String(p.symbol));
      if (cbSymbols.length > 0) {
        const { data: cbPrices } = await supabase
          .from("market_cache")
          .select("symbol, price")
          .in("symbol", cbSymbols);
        const cbPriceMap = new Map((cbPrices || []).map((r: Record<string, unknown>) =>
          [String(r.symbol), parseFloat(String(r.price || "0"))]
        ));
        let cbUnrealized = 0;
        for (const pos of (cbPositions || [])) {
          const cp = cbPriceMap.get(String(pos.symbol)) || Number(pos.avg_entry);
          const diff = pos.direction === "long"
            ? cp - Number(pos.avg_entry)
            : Number(pos.avg_entry) - cp;
          cbUnrealized += diff * Number(pos.quantity);
        }
        const cbPct = currentCapital > 0 ? (cbUnrealized / currentCapital) * 100 : 0;
        if (cbPct < -maxDailyRisk) {
          preflight.push(`🔴 CIRCUIT BREAKER: Unrealized loss ${cbPct.toFixed(1)}% exceeds daily limit -${maxDailyRisk}%`);
        }
      }
    }

    if (preflight.length > 0 && action !== "status") {
      return jsonRes({ status: "blocked", reasons: preflight, trades_today: tradesToday, consecutive_losses: consecutiveLosses, daily_risk_used: dailyRiskUsed });
    }

    // ─── Fetch VIX for dynamic thresholds (via VIXY proxy on Alpaca) ───
    let currentVIX = 20;
    try {
      const alpHdrs = {
        "APCA-API-KEY-ID": Deno.env.get("ALPACA_API_KEY_ID") ?? "",
        "APCA-API-SECRET-KEY": Deno.env.get("ALPACA_API_SECRET_KEY") ?? "",
      };
      const vixRes = await fetch(
        "https://data.alpaca.markets/v2/stocks/VIXY/bars?timeframe=1Day&limit=2&feed=iex",
        { headers: alpHdrs, signal: AbortSignal.timeout(4000) }
      );
      if (vixRes.ok) {
        const vixData = await vixRes.json();
        const bars = vixData?.bars || [];
        const vixyPrice = bars.length > 0 ? parseFloat(bars[bars.length - 1].c ?? "0") : 0;
        if (vixyPrice > 0) {
          currentVIX = Math.max(10, Math.min(80, vixyPrice * 2));
        }
      }
    } catch (e) {
      console.warn("[operator-mode] VIX fetch failed, using default 20");
    }

    const baseMinScore = Number((settings as any).min_score || 60);
    const baseMinR = Number((settings as any).min_r || 1.5);
    const baseMinConfidence = Number((settings as any).min_confidence || 55);
    const thresholds = getDynamicThresholds(currentVIX, baseMinScore, baseMinR, baseMinConfidence);
    console.log(`[operator-mode] VIX: ${currentVIX} → thresholds: score≥${thresholds.min_score}, R≥${thresholds.min_r}, conf≥${thresholds.min_confidence} (${thresholds.adjustment_reason})`);

    // ─── ACTION: status ───
    if (action === "status") {
      const { data: openPositions } = await supabase
        .from("positions")
        .select("symbol, direction, quantity, avg_entry, stop_loss, pnl, strategy")
        .eq("user_id", user.id).eq("status", "open");

      // Fetch current prices to calculate unrealized PnL
      const openSymbols = (openPositions || []).map((p: Record<string, unknown>) => String(p.symbol));
      let intradayUnrealizedPct = 0;
      if (openSymbols.length > 0) {
        const { data: priceRows } = await supabase
          .from("market_cache")
          .select("symbol, price")
          .in("symbol", openSymbols);
        const priceMap = new Map((priceRows || []).map((r: Record<string, unknown>) =>
          [String(r.symbol), parseFloat(String(r.price || "0"))]
        ));
        let unrealizedPnl = 0;
        for (const pos of (openPositions || [])) {
          const cp = priceMap.get(String(pos.symbol)) || Number(pos.avg_entry);
          const diff = pos.direction === "long"
            ? cp - Number(pos.avg_entry)
            : Number(pos.avg_entry) - cp;
          unrealizedPnl += diff * Number(pos.quantity);
        }
        intradayUnrealizedPct = currentCapital > 0
          ? (unrealizedPnl / currentCapital) * 100
          : 0;
      }

      const { data: todayJournal } = await supabase
        .from("trade_journal").select("pnl, r_multiple")
        .eq("user_id", user.id).gte("entered_at", `${today}T00:00:00Z`);

      const todayPnl = (todayJournal || []).reduce((s, t) => s + (t.pnl || 0), 0);
      const todayWins = (todayJournal || []).filter(t => (t.pnl || 0) > 0).length;

      return jsonRes({
        status: "ready",
        capital: currentCapital,
        positions_open: (openPositions || []).length,
        positions: openPositions || [],
        trades_today: tradesToday,
        max_trades_per_day: maxTradesPerDay,
        consecutive_losses: consecutiveLosses,
        cooldown_active: consecutiveLosses >= lossCooldownCount,
        daily_risk_used: dailyRiskUsed,
        max_daily_risk: maxDailyRisk,
        today_pnl: todayPnl,
        today_wins: todayWins,
        auto_execute: autoExecute,
        automation_level: automationLevel,
        effective_risk_per_trade: riskPerTrade,
        drawdown_pct: drawdownPct,
        intraday_unrealized_pct: +intradayUnrealizedPct.toFixed(2),
        circuit_breaker_active: intradayUnrealizedPct < -maxDailyRisk,
        preflight_warnings: preflight,
        vix: currentVIX,
        thresholds,
        goal: goal ? {
          monthly_target: Number(goal.monthly_target),
          daily_target: Number(goal.daily_target),
        } : null,
      });
    }

    // ─── ACTION: run ───

    // ─── Fire-and-forget: sync and data refresh run in background ───
    // Don't await — let signals run immediately with existing data
    // The cron handles sync automatically every 15 min
    const watchlistSymbols = Array.isArray((settings as any).watchlist) && (settings as any).watchlist.length > 0
      ? (settings as any).watchlist
      : ["AAPL", "MSFT", "NVDA", "TSLA", "SPY", "QQQ", "BTC/USD", "ETH/USD"];

    try {
      // Non-blocking sync — just trigger, don't wait
      fetch(`${supabaseUrl}/functions/v1/alpaca-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
        body: JSON.stringify({ paper, user_id_override: user.id }),
      }).catch(e => console.warn("Background sync failed:", e));

      // Non-blocking data refresh
      fetch(`${supabaseUrl}/functions/v1/market-data-normalized`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
        body: JSON.stringify({ symbols: watchlistSymbols, timeframe: "1d" }),
      }).catch(e => console.warn("Background market-data failed:", e));

      fetch(`${supabaseUrl}/functions/v1/compute-indicators`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
        body: JSON.stringify({ symbols: watchlistSymbols, timeframe: "1d" }),
      }).catch(e => console.warn("Background compute failed:", e));

      console.log("[operator-mode] Background refresh triggered (non-blocking)");
    } catch (e) {
      console.warn("[operator-mode] Background trigger error:", e);
    }

    // Calculate remaining capacity before signal generation
    const remainingSlots = Math.max(0, maxTradesPerDay - tradesToday);
    const remainingRisk = Math.max(0, maxDailyRisk - dailyRiskUsed);

    // Now run signal engine with VIX-adjusted thresholds
    const signalResponse = await fetch(`${supabaseUrl}/functions/v1/signal-engine`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
      body: JSON.stringify({
        user_id: user.id,
        min_score: thresholds.min_score,
        min_r: thresholds.min_r,
        min_confidence: thresholds.min_confidence,
        max_signals: Math.min(remainingSlots, 3),
        operator_mode: true,
        symbols: watchlistSymbols,
      }),
    });

    const signalResult = await signalResponse.json();
    if (signalResult.blocked) return jsonRes({ status: "blocked", ...signalResult });

    const signals = signalResult.signals || [];
    if (signals.length === 0) {
      return jsonRes({
        status: "no_opportunities",
        message: "No signals passed quality filters",
        rejected: signalResult.rejected || 0,
        rejections: signalResult.rejections || [],
        filters: signalResult.filters_applied,
      });
    }

    // Block equity orders outside market hours
    const hasEquitySignals = signals.some((s: Record<string, unknown>) =>
      ['stock', 'etf'].includes(String(s.asset_class || 'stock'))
    );
    if (hasEquitySignals && !isUSMarketOpen()) {
      return jsonRes({
        status: "blocked",
        reasons: ["🔴 MARKET CLOSED: US equity execution blocked outside NYSE hours (14:30–21:00 UTC Mon–Fri)"],
        market_open: false,
        signals_generated: signals.length,
      });
    }

    // Use real Alpaca equity for sizing instead of manually-entered capital
    let liveCapital = currentCapital;
    try {
      const alpacaBase = paper ? "https://paper-api.alpaca.markets" : "https://api.alpaca.markets";
      const alpacaHdrs = {
        "APCA-API-KEY-ID": Deno.env.get("ALPACA_API_KEY_ID")!,
        "APCA-API-SECRET-KEY": Deno.env.get("ALPACA_API_SECRET_KEY")!,
      };
      const acctRes = await fetch(`${alpacaBase}/v2/account`, { headers: alpacaHdrs });
      if (acctRes.ok) {
        const acct = await acctRes.json();
        const alpacaEquity = parseFloat(acct.portfolio_value || acct.equity || "0");
        if (alpacaEquity > 0) {
          liveCapital = alpacaEquity;
          if (Math.abs(liveCapital - currentCapital) / currentCapital > 0.01) {
            await supabase.from("user_settings")
              .update({ current_capital: liveCapital, updated_at: new Date().toISOString() })
              .eq("user_id", user.id);
          }
        }
      }
    } catch { /* fallback to currentCapital */ }

    // ─── Fetch recent performance per symbol for adaptive sizing ───
    const symbolMultiplier: Record<string, number> = {};
    try {
      const { data: recentTrades } = await supabase
        .from("positions")
        .select("symbol, pnl")
        .eq("user_id", user.id)
        .eq("status", "closed")
        .order("closed_at", { ascending: false })
        .limit(50);

      if (recentTrades && recentTrades.length > 0) {
        const bySymbol: Record<string, { wins: number; losses: number }> = {};
        for (const t of recentTrades) {
          const sym = String(t.symbol);
          if (!bySymbol[sym]) bySymbol[sym] = { wins: 0, losses: 0 };
          if (Number(t.pnl || 0) > 0) bySymbol[sym].wins++;
          else bySymbol[sym].losses++;
        }
        for (const [sym, data] of Object.entries(bySymbol)) {
          const total = data.wins + data.losses;
          if (total < 3) { symbolMultiplier[sym] = 1.0; continue; }
          const recentWR = data.wins / total;
          if (recentWR >= 0.6) symbolMultiplier[sym] = 1.4;
          else if (recentWR >= 0.5) symbolMultiplier[sym] = 1.2;
          else if (recentWR >= 0.4) symbolMultiplier[sym] = 1.0;
          else if (recentWR >= 0.3) symbolMultiplier[sym] = 0.7;
          else symbolMultiplier[sym] = 0.5;
        }
      }
    } catch { /* no recent trades, all multipliers default to 1.0 */ }

    // ─── Size positions with adaptive risk ───
    const sized = signals.map((sig: Record<string, unknown>) => {
      const entryPrice = Number(sig.entry_price);
      const stopLoss = Number(sig.stop_loss);
      const stopDist = Math.abs(entryPrice - stopLoss);
      const effectiveRisk = Math.min(riskPerTrade, remainingRisk / signals.length);
      const symMult = symbolMultiplier[String(sig.asset)] ?? 1.0;
      const adjustedRisk = effectiveRisk * symMult;
      const cappedRisk = Math.min(adjustedRisk, maxDailyRisk * 0.5);
      const riskDollars = liveCapital * (cappedRisk / 100);

      const isFractional = ['crypto'].includes(String(sig.asset_class || 'stock'));
      const quantity = calcPositionSize({
        capital: liveCapital,
        riskPct: cappedRisk,
        entryPrice,
        stopLoss,
        maxSingleAssetPct: Number(settings.max_single_asset || 25),
        maxLeverage: Number(settings.max_leverage || 2.0),
        isFractional,
      });

      if (quantity <= 0) {
        return { ...sig, quantity: 0, skip: true,
          skip_reason: `Sizing returned 0: entry=${entryPrice}, sl=${stopLoss}, risk=${cappedRisk.toFixed(2)}%` };
      }

      const targets = (sig.targets as number[]) || [];
      const takeProfit = targets.length > 1 ? targets[1] : targets.length > 0 ? targets[0] : entryPrice + stopDist * 2;

      return { ...sig, quantity, risk_pct: cappedRisk, risk_dollars: riskDollars, position_value: quantity * entryPrice, take_profit: takeProfit, symbol_multiplier: symMult, adjusted_risk_pct: cappedRisk.toFixed(2) };
    });

    // ─── Execute based on automation level ───
    const shouldExecute = automationLevel === "full_operator" || (automationLevel === "assisted" && autoExecute);
    const execResults: Record<string, unknown>[] = [];
    let totalOutcomes = 0;

    const executableTrades = sized.filter((t: Record<string, unknown>) => !t.skip);
    if (shouldExecute && action === "run") {
      for (const trade of executableTrades) {
        try {
          const orderRes = await fetch(`${supabaseUrl}/functions/v1/alpaca-trade`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
            body: JSON.stringify({
              action: "place_order", paper,
              signal_id: String(trade.id || ""),
              symbol: String(trade.asset).replace("/", ""),
              qty: trade.quantity,
              side: trade.direction === "long" ? "buy" : "sell",
              type: "market", time_in_force: "day", order_class: "bracket",
              take_profit: trade.take_profit, stop_loss: trade.stop_loss,
              user_id_override: user.id,
            }),
          });
          const orderResult = await orderRes.json();
          execResults.push({ symbol: trade.asset, success: orderResult.success || false, order: orderResult.order || null, error: orderResult.error || null });

          if (orderResult.success && orderResult.order) {
            const expectedEntry = Number(trade.entry_price);
            const filledPrice = parseFloat(orderResult.order.filled_avg_price || "0") || expectedEntry;
            const slippage = Math.abs(filledPrice - expectedEntry) / expectedEntry;

            const rawStop = Number(trade.stop_loss);
            let adjustedStop = rawStop;
            if (slippage > 0.003 && filledPrice > 0) {
              const stopDist = Math.abs(expectedEntry - rawStop);
              adjustedStop = String(trade.direction) === "long"
                ? filledPrice - stopDist
                : filledPrice + stopDist;
            }

            const slippageNote = slippage > 0.003
              ? ` | Slippage: ${(slippage * 100).toFixed(2)}% (expected ${expectedEntry}, filled ${filledPrice})`
              : "";

            const actualQty = parseFloat(orderResult.order.filled_qty || "0") || trade.quantity;
            const actualEntry = filledPrice > 0 ? filledPrice : expectedEntry;

            await supabase.from("positions").insert({
              user_id: user.id,
              symbol: String(trade.asset),
              name: String(trade.asset),
              asset_type: String(trade.asset_class || "stock"),
              direction: String(trade.direction),
              quantity: actualQty,
              avg_entry: actualEntry,
              stop_loss: adjustedStop,
              take_profit: Number(trade.take_profit),
              strategy: String(trade.strategy_family || "operator"),
              strategy_family: String(trade.strategy_family || "operator"),
              regime_at_entry: String(trade.market_regime || "undefined"),
              status: "open",
              notes: `Operator auto-exec. Score: ${Number(trade.opportunity_score).toFixed(0)}, R: ${Number(trade.expected_r_multiple).toFixed(1)}${slippageNote}${actualQty < trade.quantity ? ` | Partial fill: ${actualQty}/${trade.quantity}` : ""}`,
            });
          } else if (!orderResult.success && !orderResult.pending) {
            console.error("Order failed for", trade.asset, ":", orderResult.error);
          } else if (orderResult.pending) {
            console.warn("Fill unconfirmed for", trade.asset, "- will reconcile via alpaca-sync");
          }
        } catch (execErr) {
          execResults.push({ symbol: trade.asset, success: false, error: execErr instanceof Error ? execErr.message : "Execution failed" });
        }
      }

      // Update counters
      const successCount = execResults.filter(r => r.success).length;
      const riskUsed = sized
        .filter((_: unknown, i: number) => execResults[i]?.success)
        .reduce((s: number, t: Record<string, unknown>, i: number) => {
          const result = execResults[i] as Record<string, unknown>;
          const order = result?.order as Record<string, unknown>;
          const filledQty = parseFloat(String(order?.filled_qty || "0")) || Number(t.quantity);
          const requestedQty = Number(t.quantity);
          const fillRatio = requestedQty > 0 ? filledQty / requestedQty : 1;
          return s + Number(t.risk_pct || 0) * fillRatio;
        }, 0);

      await supabase.rpc("increment_trade_counters", {
        p_user_id: user.id,
        p_trade_count: successCount,
        p_risk_pct: riskUsed,
        p_today: today,
        p_max_trades: maxTradesPerDay,
        p_max_risk: maxDailyRisk,
      });

      await supabase.from("daily_performance").upsert({
        user_id: user.id, date: today,
        starting_capital: currentCapital,
        trades_opened: tradesToday + successCount,
        risk_used_pct: dailyRiskUsed + riskUsed,
      }, { onConflict: "user_id,date" });

      // ─── Save daily execution report ───
      try {
        const signalsConsidered = signals.length + (signalResult.rejected || 0);
        const signalsGenerated = signals.length;
        const tradesExecuted = execResults.filter(r => r.success).length;
        const tradesFailed = execResults.filter(r => !r.success && !r.pending).length;
        const tradesPending = execResults.filter(r => r.pending).length;

        await supabase.from("daily_performance").upsert({
          user_id: user.id,
          date: today,
          starting_capital: liveCapital,
          trades_opened: tradesToday + tradesExecuted,
          risk_used_pct: dailyRiskUsed + riskUsed,
          signals_considered: signalsConsidered,
          signals_generated: signalsGenerated,
          trades_executed: tradesExecuted,
          trades_failed: tradesFailed,
          trades_pending: tradesPending,
          automation_level: automationLevel,
          operator_ran_at: new Date().toISOString(),
          execution_details: JSON.stringify(
            executableTrades.map((t: Record<string, unknown>, i: number) => ({
              symbol: t.asset,
              direction: t.direction,
              score: Number(t.opportunity_score).toFixed(0),
              r: Number(t.expected_r_multiple).toFixed(1),
              qty: t.quantity,
              result: execResults[i]?.success ? 'executed' : execResults[i]?.pending ? 'pending' : 'failed',
              error: execResults[i]?.error || null,
            }))
          ),
        }, { onConflict: "user_id,date" });
      } catch (reportErr) {
        console.error("Daily report save error:", reportErr);
      }

      // ─── Send notification for trades executed ───
      const tradesExecuted = execResults.filter(r => r.success).length;
      if (tradesExecuted > 0) {
        try {
          await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
            body: JSON.stringify({ user_id: user.id, event: "trade_executed", data: { trades: executableTrades.map((t: Record<string, unknown>) => ({ symbol: t.asset, direction: t.direction, score: Number(t.opportunity_score).toFixed(0), r: Number(t.expected_r_multiple).toFixed(1) })), capital: liveCapital } }),
          });
        } catch {}
      }

      // ─── Auto-trigger adaptive scoring if enough outcomes exist ───
      try {
        const { count } = await supabase
          .from("signal_outcomes")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .neq("outcome", "pending");

        totalOutcomes = count || 0;

        if (totalOutcomes >= 10) {
          fetch(`${supabaseUrl}/functions/v1/adaptive-scoring`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              user_id: user.id,
              window_days: 30,
            }),
          }).catch(e => console.warn("Adaptive scoring trigger failed:", e));
          console.log(`[operator-mode] Triggered adaptive scoring (${totalOutcomes} outcomes available)`);
        }
      } catch (adaptErr) {
        console.warn("Adaptive scoring check failed:", adaptErr);
      }
    }

    return jsonRes({
      status: shouldExecute ? "executed" : "ready_for_approval",
      automation_level: automationLevel,
      signals_generated: signals.length,
      signals_rejected: signalResult.rejected || 0,
      effective_risk_per_trade: riskPerTrade,
      vix: currentVIX,
      thresholds_applied: thresholds,
      skipped: sized.filter((t: Record<string, unknown>) => t.skip).map((t: Record<string, unknown>) => ({ symbol: t.asset, reason: t.skip_reason })),
      trades: executableTrades.map((t: Record<string, unknown>) => ({
        symbol: t.asset, direction: t.direction,
        score: Number(t.opportunity_score).toFixed(0),
        confidence: Number(t.confidence_score).toFixed(0),
        expected_r: Number(t.expected_r_multiple).toFixed(1),
        quantity: t.quantity, entry: t.entry_price,
        stop_loss: t.stop_loss, take_profit: t.take_profit,
        risk_pct: Number(t.risk_pct).toFixed(2),
        symbol_multiplier: t.symbol_multiplier,
        adjusted_risk_pct: t.adjusted_risk_pct,
        strategy: t.strategy_family, regime: t.market_regime,
      })),
      execution: shouldExecute ? execResults : null,
      daily_summary: {
        trades_today: tradesToday + (shouldExecute ? execResults.filter(r => r.success).length : 0),
        max_trades: maxTradesPerDay,
        daily_risk_used: dailyRiskUsed,
        max_daily_risk: maxDailyRisk,
        consecutive_losses: consecutiveLosses,
      },
      adaptive_scoring: shouldExecute ? (totalOutcomes >= 10 ? "triggered" : `waiting (${totalOutcomes}/10 outcomes)`) : "skipped",
    });
  } catch (e) {
    console.error("Operator mode error:", e);
    return jsonRes({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function jsonRes(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
