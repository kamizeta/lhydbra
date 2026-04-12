import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { log, tradeLog } from "../_shared/logger.ts";
import { checkAllRiskRules } from "../_shared/risk-engine.ts";

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

function jsonRes(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

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
  existingExposure?: number;
}): number {
  if (params.capital <= 0 || params.entryPrice <= 0) return 0;
  const riskPerUnit = Math.abs(params.entryPrice - params.stopLoss);
  if (riskPerUnit <= 0) return 0;
  const dollarRisk = params.capital * (params.riskPct / 100);
  const riskBasedSize = dollarRisk / riskPerUnit;
  const maxAssetValue = Math.max(0, (params.capital * params.maxSingleAssetPct / 100) - (params.existingExposure || 0));
  const concentrationCap = maxAssetValue / params.entryPrice;
  const maxExposure = params.capital * params.maxLeverage;
  const leverageCap = maxExposure / params.entryPrice;
  const idealSize = Math.max(0, Math.min(riskBasedSize, concentrationCap, leverageCap));
  if (params.isFractional) return parseFloat(idealSize.toFixed(6));
  return Math.floor(idealSize);
}

async function isUSMarketOpen(paper: boolean): Promise<boolean> {
  try {
    const alpacaBase = paper
      ? "https://paper-api.alpaca.markets"
      : "https://api.alpaca.markets";
    const res = await fetch(`${alpacaBase}/v2/clock`, {
      headers: {
        "APCA-API-KEY-ID": Deno.env.get("ALPACA_API_KEY_ID") ?? "",
        "APCA-API-SECRET-KEY": Deno.env.get("ALPACA_API_SECRET_KEY") ?? "",
      },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      console.warn("[operator-mode] Alpaca clock failed, using NY fallback");
      return nyFallbackMarketOpen();
    }
    const clock = await res.json();
    return clock.is_open === true;
  } catch (e) {
    console.warn("[operator-mode] Alpaca clock error, using NY fallback:", e);
    return nyFallbackMarketOpen();
  }
}

function nyFallbackMarketOpen(): boolean {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(now);
  const weekday = parts.find(p => p.type === "weekday")?.value;
  const hour = Number(parts.find(p => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find(p => p.type === "minute")?.value ?? "0");
  if (weekday === "Sat" || weekday === "Sun") return false;
  const mins = hour * 60 + minute;
  return mins >= 570 && mins < 960;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });

  try {
    const authHeader = req.headers.get("Authorization");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const isServiceRole = authHeader === `Bearer ${serviceKey}`;

    const body = await req.json().catch(() => ({}));
    const { scheduled = false } = body;

    // ─── Scheduled run: iterate all full_operator users ───
    if (scheduled) {
      if (!isServiceRole) {
        return jsonRes(req, { error: "Forbidden: scheduled requires service role" }, 403);
      }
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

      return jsonRes(req, { scheduled: true, processed: results.length, results });
    }

    // ─── Standard auth flow ───
    if (!authHeader?.startsWith("Bearer ")) return jsonRes(req, { error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Support user_id_override for scheduled per-user calls
    const { action = "run", paper = true, user_id_override } = body;

    let user: { id: string } | null = null;
    if (user_id_override) {
      if (!isServiceRole) {
        return jsonRes(req, { error: "Forbidden: user_id_override requires service role" }, 403);
      }
      user = { id: user_id_override } as typeof user;
    } else {
      const userSupabase = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user: authUser }, error: userError } = await userSupabase.auth.getUser();
      if (userError || !authUser) return jsonRes(req, { error: "Unauthorized" }, 401);
      user = authUser;
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // ─── Atomic rate limit: max 10 calls per minute per user ───
    const rateLimitKey = `operator-mode:${user.id}:${Math.floor(Date.now() / 60000)}`;
    const { data: currentCount, error: rlError } = await supabase.rpc('check_and_increment_rate_limit', {
      p_key: rateLimitKey,
      p_max_count: 10,
      p_window_seconds: 60,
    });
    if (rlError) {
      console.warn('[operator-mode][rate-limit] RPC error:', rlError.message);
    }
    if (currentCount && currentCount > 10) {
      return jsonRes(req, { error: "Rate limit exceeded. Try again in a minute." }, 429);
    }

    // ─── KILL SWITCH CHECK ───
    const { data: sysConfig } = await supabase.from("system_config").select("*").eq("id", "global").maybeSingle();
    if (sysConfig && !sysConfig.trading_enabled) {
      return jsonRes({
        status: "killed",
        reason: sysConfig.kill_switch_reason || "System kill switch active",
      });
    }

    // ─── FEATURE FLAGS ───
    const { data: flagRows } = await supabase.from("feature_flags").select("id, enabled");
    const flagMap: Record<string, boolean> = {};
    for (const f of (flagRows || [])) { flagMap[f.id] = f.enabled; }

    if (action === "run" && flagMap.auto_trading === false) {
      return jsonRes(req, { status: "disabled", reason: "Auto-trading feature flag is off" });
    }

    // ─── Load user settings & goal ───
    const [settingsRes, goalRes] = await Promise.all([
      supabase.from("user_settings").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("goal_profiles").select("*").eq("user_id", user.id).maybeSingle(),
    ]);

    const settings = settingsRes.data;
    if (!settings) return jsonRes(req, { error: "User settings not found. Configure your account first." }, 400);

    if (goalRes.error) {
      console.error('[operator-mode] goal_profiles fetch error:', goalRes.error.message);
    }
    const goal = goalRes.data;
    console.log('[operator-mode] goal fetched:', JSON.stringify(goal));
    console.log('[operator-mode] automation_level:', goal?.automation_level);
    console.log('[operator-mode] is_active:', goal?.is_active);
    const today = new Date().toISOString().split("T")[0];
    const maxTradesPerDay = Number(settings.max_trades_per_day || 3);
    const lossCooldownCount = Number(settings.loss_cooldown_count || 2);
    let consecutiveLosses = Number(settings.consecutive_losses || 0);
    let tradesToday = settings.last_trade_date === today ? Number(settings.trades_today || 0) : 0;
    const autoExecute = Boolean(settings.auto_execute);
    let currentCapital = Number(settings.current_capital || 10000);

    // ─── DAILY LOSS GUARD ───
    const { data: todayJournal } = await supabase
      .from("trade_journal")
      .select("pnl")
      .eq("user_id", user.id)
      .gte("exited_at", today);
    const dailyPnl = (todayJournal || []).reduce((sum: number, t: any) => sum + (Number(t.pnl) || 0), 0);
    const maxDailyLossPct = sysConfig?.max_daily_loss_pct || 3;
    const maxDailyLoss = (maxDailyLossPct / 100) * currentCapital;
    if (dailyPnl < -maxDailyLoss) {
      return jsonRes({
        status: "blocked",
        reason: `Daily loss limit reached: $${dailyPnl.toFixed(2)} exceeds max -$${maxDailyLoss.toFixed(2)}`,
      });
    }
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

    // ─── Weekly risk guard ───
    const maxWeeklyRisk = Number((settings as any).max_weekly_risk || 10);
    const weekStart = new Date();
    weekStart.setUTCHours(0, 0, 0, 0);
    weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7));
    const { data: weekTrades } = await supabase
      .from("trade_journal")
      .select("pnl")
      .eq("user_id", user.id)
      .gte("entered_at", weekStart.toISOString());
    const weeklyLossPct = currentCapital > 0
      ? ((weekTrades || [])
          .filter(t => (t.pnl || 0) < 0)
          .reduce((s, t) => s + Math.abs(t.pnl || 0), 0) / currentCapital) * 100
      : 0;

    // ─── Pre-flight checks ───
    const preflight: string[] = [];
    if (consecutiveLosses >= lossCooldownCount) preflight.push(`🔴 COOLDOWN: ${consecutiveLosses} losses (limit: ${lossCooldownCount})`);
    if (tradesToday >= maxTradesPerDay) preflight.push(`🔴 DAILY CAP: ${tradesToday}/${maxTradesPerDay} trades`);
    if (dailyRiskUsed >= maxDailyRisk) preflight.push(`🔴 RISK EXHAUSTED: ${dailyRiskUsed.toFixed(1)}%/${maxDailyRisk}%`);
    if (drawdownPct > maxDrawdown) preflight.push(`🔴 MAX DRAWDOWN: ${drawdownPct.toFixed(1)}% (limit: ${maxDrawdown}%)`);
    if (weeklyLossPct >= maxWeeklyRisk) preflight.push(`🔴 WEEKLY RISK: ${weeklyLossPct.toFixed(1)}% loss this week (limit: ${maxWeeklyRisk}%)`);
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
      return jsonRes(req, { status: "blocked", reasons: preflight, trades_today: tradesToday, consecutive_losses: consecutiveLosses, daily_risk_used: dailyRiskUsed });
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
          currentVIX = Math.max(10, Math.min(80, vixyPrice * 0.9));
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

      return jsonRes(req, {
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

    // ─── Sync data BEFORE signal generation to avoid stale data ───
    const watchlistSymbols = Array.isArray((settings as any).watchlist) && (settings as any).watchlist.length > 0
      ? (settings as any).watchlist
      : ["AAPL", "MSFT", "NVDA", "TSLA", "SPY", "QQQ", "BTC/USD", "ETH/USD"];

    // ─── Await data refresh before signal generation ───
    try {
      const [syncResult, marketResult, indicatorsResult] = await Promise.allSettled([
        fetch(`${supabaseUrl}/functions/v1/alpaca-sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
          body: JSON.stringify({ paper, user_id_override: user.id }),
        }),
        fetch(`${supabaseUrl}/functions/v1/market-data-normalized`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
          body: JSON.stringify({ symbols: watchlistSymbols, timeframe: "1d" }),
        }),
        fetch(`${supabaseUrl}/functions/v1/compute-indicators`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
          body: JSON.stringify({ symbols: watchlistSymbols, timeframe: "1d" }),
        }),
      ]);

      // Log failures but continue
      for (const r of [syncResult, marketResult, indicatorsResult]) {
        if (r.status === 'rejected') console.warn('[operator] Background task failed:', r.reason);
      }

      console.log("[operator-mode] Data refresh completed before signal generation");
    } catch (e) {
      console.warn("[operator-mode] Data refresh error:", e);
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
    if (signalResult.blocked) return jsonRes(req, { status: "blocked", ...signalResult });

    const signals = signalResult.signals || [];
    if (signals.length === 0) {
      return jsonRes(req, {
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
    const marketOpen = await isUSMarketOpen(paper);
    if (hasEquitySignals && !marketOpen) {
      return jsonRes(req, {
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

    // ─── Half-Kelly Criterion: calculate optimal position sizing per symbol ───
    const kellyRisk: Record<string, { kelly_pct: number; W: number; R: number; trades: number }> = {};
    try {
      const { data: recentTrades } = await supabase
        .from("positions")
        .select("symbol, pnl, avg_entry, stop_loss, direction, quantity")
        .eq("user_id", user.id)
        .eq("status", "closed")
        .order("closed_at", { ascending: false })
        .limit(100);

      if (recentTrades && recentTrades.length > 0) {
        const bySymbol: Record<string, { wins: number; total: number; totalProfit: number; totalLoss: number }> = {};
        for (const t of recentTrades) {
          const sym = String(t.symbol);
          if (!bySymbol[sym]) bySymbol[sym] = { wins: 0, total: 0, totalProfit: 0, totalLoss: 0 };
          bySymbol[sym].total++;
          const pnl = Number(t.pnl || 0);
          if (pnl > 0) {
            bySymbol[sym].wins++;
            bySymbol[sym].totalProfit += pnl;
          } else {
            bySymbol[sym].totalLoss += Math.abs(pnl);
          }
        }

        for (const [sym, data] of Object.entries(bySymbol)) {
          // W = Win Rate, R = Avg Profit / Avg Loss
          const W = data.total >= 3 ? data.wins / data.total : 0.45;
          const avgProfit = data.wins > 0 ? data.totalProfit / data.wins : 0;
          const avgLoss = (data.total - data.wins) > 0 ? data.totalLoss / (data.total - data.wins) : 0;
          const R = avgLoss > 0 ? avgProfit / avgLoss : 1.5;

          // Kelly formula: f* = W - (1 - W) / R
          const kelly = W - ((1 - W) / R);

          // Half-Kelly for conservative sizing
          const halfKelly = kelly * 0.5;

          // Clamp: min 0.5%, max half of daily risk limit
          const kellyPct = Math.max(0.5, Math.min(halfKelly * 100, maxDailyRisk * 0.5));

          kellyRisk[sym] = { kelly_pct: kellyPct, W, R, trades: data.total };
        }
      }
    } catch { /* no recent trades, defaults will be used */ }

    // Default Kelly for symbols without history: W=0.45, R=1.5
    const defaultW = 0.45;
    const defaultR = 1.5;
    const defaultKelly = defaultW - ((1 - defaultW) / defaultR);
    const defaultHalfKellyPct = Math.max(0.5, Math.min((defaultKelly * 0.5) * 100, maxDailyRisk * 0.5));

    console.log(`[operator-mode] Half-Kelly defaults: W=${defaultW}, R=${defaultR}, kelly=${defaultKelly.toFixed(4)}, half-kelly=${defaultHalfKellyPct.toFixed(2)}%`);
    for (const [sym, k] of Object.entries(kellyRisk)) {
      console.log(`[operator-mode] Half-Kelly ${sym}: W=${k.W.toFixed(2)}, R=${k.R.toFixed(2)}, risk=${k.kelly_pct.toFixed(2)}% (${k.trades} trades)`);
    }

    // ─── Build exposure map from open positions ───
    const { data: existingPositions } = await supabase
      .from("positions")
      .select("symbol, quantity, avg_entry")
      .eq("user_id", user.id)
      .eq("status", "open");
    const exposureBySymbol: Record<string, number> = {};
    for (const pos of (existingPositions || [])) {
      const exposure = Math.abs((Number(pos.quantity) || 0) * (Number(pos.avg_entry) || 0));
      exposureBySymbol[String(pos.symbol)] = (exposureBySymbol[String(pos.symbol)] || 0) + exposure;
    }
    console.log(`[operator-mode] Exposure map:`, exposureBySymbol);

    // ─── Size positions with Half-Kelly risk ───
    const sized = signals.map((sig: Record<string, unknown>) => {
      const entryPrice = Number(sig.entry_price);
      const stopLoss = Number(sig.stop_loss);
      const stopDist = Math.abs(entryPrice - stopLoss);
      const symbol = String(sig.asset);

      // Use per-symbol Kelly or default
      const symKelly = kellyRisk[symbol];
      const kellyPct = symKelly ? symKelly.kelly_pct : defaultHalfKellyPct;

      // Cap by remaining daily risk budget
      const effectiveRisk = Math.min(kellyPct, remainingRisk / signals.length);
      // Final cap: never exceed half of max daily risk
      const cappedRisk = Math.min(effectiveRisk, maxDailyRisk * 0.5);
      // Also respect the adaptive loss-based riskPerTrade
      const finalRisk = Math.max(0.5, Math.min(cappedRisk, riskPerTrade));
      const riskDollars = liveCapital * (finalRisk / 100);

      const isFractional = ['crypto'].includes(String(sig.asset_class || 'stock'));
      const existingExposure = exposureBySymbol[String(sig.asset)] || 0;
      const quantity = calcPositionSize({
        capital: liveCapital,
        riskPct: finalRisk,
        entryPrice,
        stopLoss,
        maxSingleAssetPct: Number(settings.max_single_asset || 25),
        maxLeverage: Number(settings.max_leverage || 2.0),
        isFractional,
        existingExposure,
      });

      if (quantity <= 0) {
        return { ...sig, quantity: 0, skip: true,
          skip_reason: `Sizing returned 0: entry=${entryPrice}, sl=${stopLoss}, risk=${finalRisk.toFixed(2)}%` };
      }

      const targets = (sig.targets as number[]) || [];
      const takeProfit = targets.length > 1 ? targets[1] : targets.length > 0 ? targets[0] : entryPrice + stopDist * 2;

      return {
        ...sig, quantity,
        risk_pct: finalRisk,
        risk_dollars: riskDollars,
        position_value: quantity * entryPrice,
        take_profit: takeProfit,
        kelly_W: symKelly?.W ?? defaultW,
        kelly_R: symKelly?.R ?? defaultR,
        kelly_pct: kellyPct,
        adjusted_risk_pct: finalRisk.toFixed(2),
      };
    });

    // ─── Execute based on automation level ───
    const shouldExecute = automationLevel === "full_operator" || (automationLevel === "assisted" && autoExecute);
    const execResults: Record<string, unknown>[] = [];
    let totalOutcomes = 0;

    const executableTrades = sized.filter((t: Record<string, unknown>) => !t.skip);
    if (shouldExecute && action === "run") {
      for (const trade of executableTrades) {
        try {
          // ─── Feature flag guards ───
          const isCrypto = ['crypto'].includes(String(trade.asset_class || ''));
          if (String(trade.direction) === 'short' && flagMap.short_selling === false) {
            tradeLog("skipped_short", { user_id: user.id, symbol: String(trade.asset), reason: "short_selling flag disabled" });
            execResults.push({ symbol: String(trade.asset), success: false, error: "Short selling disabled", skipped: true });
            continue;
          }
          if (isCrypto && flagMap.crypto_trading === false) {
            tradeLog("skipped_crypto", { user_id: user.id, symbol: String(trade.asset), reason: "crypto_trading flag disabled" });
            execResults.push({ symbol: String(trade.asset), success: false, error: "Crypto trading disabled", skipped: true });
            continue;
          }

          // ─── Idempotency: check if order already exists ───
          const idempotencyKey = `${user.id}|${trade.id || trade.asset}|${String(trade.asset)}|${today}`;
          const { data: existingOrder } = await supabase
            .from("orders")
            .select("id, status")
            .eq("idempotency_key", idempotencyKey)
            .maybeSingle();

          if (existingOrder) {
            tradeLog("order_duplicate_skipped", { user_id: user.id, symbol: String(trade.asset), existing_status: existingOrder.status });
            execResults.push({ symbol: trade.asset, success: false, error: `Duplicate order (${existingOrder.status})`, skipped: true });
            continue;
          }

          // ─── Centralized Risk Engine check ───
          const riskCheck = checkAllRiskRules({
            userId: user.id,
            symbol: String(trade.asset),
            direction: String(trade.direction) as "long" | "short",
            requestedQty: trade.quantity,
            entryPrice: Number(trade.entry_price),
            stopLoss: Number(trade.stop_loss),
            capital: liveCapital,
            settings: {
              max_risk_per_trade: Number(settings.risk_per_trade || 1),
              max_single_asset_pct: Number(settings.max_single_asset || 25),
              max_leverage: Number(settings.max_leverage || 2),
              max_open_positions: Number(settings.max_positions || 10),
              max_daily_loss_pct: sysConfig?.max_daily_loss_pct || 3,
            },
            currentState: {
              openPositions: (existingPositions || []).map((p: any) => ({
                symbol: String(p.symbol),
                quantity: Number(p.quantity),
                avg_entry: Number(p.avg_entry),
              })),
              dailyPnl,
              totalExposure: Object.values(exposureBySymbol).reduce((a: number, b: number) => a + b, 0),
            },
          });

          if (!riskCheck.allowed) {
            tradeLog("risk_rejected", { user_id: user.id, symbol: String(trade.asset), reason: riskCheck.reason });
            execResults.push({ symbol: String(trade.asset), success: false, error: riskCheck.reason, risk_rejected: true });
            continue;
          }

          // Apply adjusted size if risk engine capped it
          const finalQty = riskCheck.adjustedSize || trade.quantity;
          if (finalQty !== trade.quantity) {
            tradeLog("risk_size_adjusted", { user_id: user.id, symbol: String(trade.asset), original: trade.quantity, adjusted: finalQty, reason: riskCheck.reason });
            trade.quantity = finalQty;
          }

          // ─── Create order record with pending status ───
          const { data: newOrder, error: orderInsertErr } = await supabase
            .from("orders")
            .insert({
              user_id: user.id,
              signal_id: trade.id || null,
              symbol: String(trade.asset),
              direction: String(trade.direction),
              quantity: trade.quantity,
              status: "pending",
              idempotency_key: idempotencyKey,
              submitted_price: Number(trade.entry_price),
              stop_loss: Number(trade.stop_loss),
              take_profit: Number(trade.take_profit),
            })
            .select()
            .single();

          if (orderInsertErr) {
            log("error", "order_insert_failed", { user_id: user.id, symbol: String(trade.asset), error: orderInsertErr.message });
            execResults.push({ symbol: String(trade.asset), success: false, error: `Order record failed: ${orderInsertErr.message}` });
            continue; // SKIP this trade - do NOT call Alpaca without DB record
          }

          // ─── Shadow Mode: log but don't execute ───
          const shadowMode = (settings as any).shadow_mode === true;
          if (shadowMode) {
            tradeLog("shadow_trade", {
              user_id: user.id,
              symbol: String(trade.asset),
              direction: String(trade.direction),
              quantity: trade.quantity,
              entry_price: Number(trade.entry_price),
              stop_loss: Number(trade.stop_loss),
              take_profit: Number(trade.take_profit),
              signal_score: Number(trade.opportunity_score),
              kelly_fraction: Number(trade.kelly_fraction || 0),
            });

            if (newOrder) {
              await supabase.from("orders").update({
                status: "shadow",
                metadata: { shadow: true, signal_score: Number(trade.opportunity_score) },
                updated_at: new Date().toISOString(),
              }).eq("id", newOrder.id);
            }

            execResults.push({ symbol: String(trade.asset), success: true, shadow: true });
            continue; // Skip actual Alpaca execution
          }

          // ─── Submit to Alpaca ───
          if (newOrder) {
            tradeLog("order_submitted", { user_id: user.id, symbol: String(trade.asset), qty: trade.quantity, entry: Number(trade.entry_price), direction: String(trade.direction), order_id: newOrder.id });
            await supabase.from("orders").update({ status: "submitted", updated_at: new Date().toISOString() }).eq("id", newOrder.id);
          }

          const orderRes = await fetch(`${supabaseUrl}/functions/v1/alpaca-trade`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
            body: JSON.stringify({
              action: "place_order", paper,
              signal_id: String(trade.id || ""),
              symbol: String(trade.asset).replace("/", ""),
              qty: trade.quantity,
              side: trade.direction === "long" ? "buy" : "sell",
              type: "market", time_in_force: "day",
              take_profit: trade.take_profit, stop_loss: trade.stop_loss,
              authenticated_user_id: user.id,
            }),
          });
          const orderResult = await orderRes.json();
          execResults.push({ symbol: trade.asset, success: orderResult.success || false, order: orderResult.order || null, error: orderResult.error || null, fail_safe_triggered: orderResult.fail_safe_triggered || false, critical: orderResult.critical || false });

          // ─── Update order status based on result ───
          if (newOrder) {
            if (orderResult.success) {
              const filledPrice = parseFloat(orderResult.order?.filled_avg_price || "0") || Number(trade.entry_price);
              const submittedPrice = Number(trade.entry_price);
              const slippagePct = submittedPrice > 0 ? Math.abs(filledPrice - submittedPrice) / submittedPrice : 0;

              await supabase.from("orders").update({
                status: orderResult.fail_safe_triggered ? "fail_safe_closed" : "filled",
                filled_price: filledPrice,
                slippage_pct: +slippagePct.toFixed(6),
                broker_order_id: orderResult.order?.id || null,
                metadata: { fill: orderResult.order },
                updated_at: new Date().toISOString(),
              }).eq("id", newOrder.id);
            } else {
              await supabase.from("orders").update({
                status: "failed",
                error_message: orderResult.error || orderResult.reason || "Unknown failure",
                updated_at: new Date().toISOString(),
              }).eq("id", newOrder.id);
            }
          }

          // ─── HALT: fail-safe or critical from alpaca-trade ───
          if (orderResult.fail_safe_triggered) {
            tradeLog("fail_safe_triggered", { user_id: user.id, symbol: String(trade.asset) });
            log("error", "execution_halted", { user_id: user.id, reason: "fail_safe", symbol: String(trade.asset) });
          }
          if (orderResult.critical) {
            log("error", "critical_unprotected_position", { user_id: user.id, symbol: String(trade.asset) });
            break;
          }

          if (orderResult.success && orderResult.order) {
            const expectedEntry = Number(trade.entry_price);
            const filledPrice = parseFloat(orderResult.order.filled_avg_price || "0") || expectedEntry;
            const slippage = Math.abs(filledPrice - expectedEntry) / expectedEntry;
            tradeLog("order_filled", { user_id: user.id, symbol: String(trade.asset), filled_price: filledPrice, slippage_pct: +(slippage * 100).toFixed(4), direction: String(trade.direction) });

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

            // Check if position already exists for this symbol to prevent duplicates
            const { data: existingPos } = await supabase
              .from("positions")
              .select("id")
              .eq("user_id", user.id)
              .eq("symbol", String(trade.asset))
              .eq("status", "open")
              .maybeSingle();

            let newPositionId: string | null = null;

            if (existingPos) {
              newPositionId = existingPos.id;
              await supabase.from("positions").update({
                quantity: actualQty,
                avg_entry: filledPrice,
                stop_loss: adjustedStop,
                take_profit: Number(trade.take_profit),
                updated_at: new Date().toISOString(),
                notes: `Operator auto-exec (updated). Score: ${Number(trade.opportunity_score).toFixed(0)}, R: ${Number(trade.expected_r_multiple).toFixed(1)}${slippageNote}`,
              }).eq("id", existingPos.id);
            } else {
              const { data: insertedPos } = await supabase.from("positions").insert({
                user_id: user.id,
                symbol: String(trade.asset),
                name: String(trade.asset),
                asset_type: String(trade.asset_class || "stock"),
                direction: String(trade.direction),
                quantity: actualQty,
                avg_entry: filledPrice,
                stop_loss: adjustedStop,
                take_profit: Number(trade.take_profit),
                strategy: String(trade.strategy_family || "operator"),
                strategy_family: String(trade.strategy_family || "operator"),
                regime_at_entry: String(trade.market_regime || "undefined"),
                status: "open",
                notes: `Operator auto-exec. Score: ${Number(trade.opportunity_score).toFixed(0)}, R: ${Number(trade.expected_r_multiple).toFixed(1)}${slippageNote}${actualQty < trade.quantity ? ` | Partial fill: ${actualQty}/${trade.quantity}` : ""}`,
              }).select("id").single();
              newPositionId = insertedPos?.id || null;
            }

            // Link position to order
            if (newOrder && newPositionId) {
              await supabase.from("orders").update({
                position_id: newPositionId,
                updated_at: new Date().toISOString(),
              }).eq("id", newOrder.id);
            }

            // ── Capital Ledger: record trade_open ──
            try {
              const tradeAmount = filledPrice * actualQty;
              await supabase.from("capital_ledger").insert({
                user_id: user.id,
                event_type: "trade_open",
                symbol: String(trade.asset),
                amount: -(tradeAmount),
                balance_after: liveCapital - tradeAmount,
                reference_id: newOrder?.id || null,
                reference_type: "order",
                notes: `${String(trade.direction)} ${actualQty} ${String(trade.asset)} @ ${filledPrice.toFixed(2)}`,
              });
            } catch (ledgerErr) {
              console.warn("[operator-mode] Ledger insert failed:", ledgerErr);
            }
          } else if (!orderResult.success && !orderResult.pending) {
            log("error", "order_failed", { user_id: user.id, symbol: String(trade.asset), error: orderResult.error });
          } else if (orderResult.pending) {
            log("warn", "order_fill_unconfirmed", { user_id: user.id, symbol: String(trade.asset) });
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

    return jsonRes(req, {
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
        kelly_W: t.kelly_W,
        kelly_R: t.kelly_R,
        kelly_pct: t.kelly_pct,
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
    return jsonRes(req, { error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

