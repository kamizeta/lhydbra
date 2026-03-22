import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function isUSMarketOpen(): boolean {
  const now = new Date();
  const day = now.getUTCDay();
  if (day === 0 || day === 6) return false;
  const utcMins = now.getUTCHours() * 60 + now.getUTCMinutes();
  return utcMins >= 870 && utcMins < 1260; // 14:30–21:00 UTC = NYSE hours
}

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonRes({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userSupabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userSupabase.auth.getUser();
    if (userError || !user) return jsonRes({ error: "Unauthorized" }, 401);

    const supabase = createClient(supabaseUrl, serviceKey);
    const body = await req.json();
    const { action = "run", paper = true } = body;

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
    const consecutiveLosses = Number(settings.consecutive_losses || 0);
    const tradesToday = settings.last_trade_date === today ? Number(settings.trades_today || 0) : 0;
    const autoExecute = Boolean(settings.auto_execute);
    const currentCapital = Number(settings.current_capital || 10000);
    const baseRiskPerTrade = Number(settings.risk_per_trade || 1);
    const maxDailyRisk = Number(settings.max_daily_risk || 2);
    const maxDrawdown = Number(settings.max_drawdown || 15);
    const dailyRiskUsed = settings.last_trade_date === today ? Number(settings.daily_risk_used || 0) : 0;
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

    if (preflight.length > 0 && action !== "status") {
      return jsonRes({ status: "blocked", reasons: preflight, trades_today: tradesToday, consecutive_losses: consecutiveLosses, daily_risk_used: dailyRiskUsed });
    }

    // ─── ACTION: status ───
    if (action === "status") {
      const { data: openPositions } = await supabase
        .from("positions")
        .select("symbol, direction, quantity, avg_entry, stop_loss, pnl, strategy")
        .eq("user_id", user.id).eq("status", "open");

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
        preflight_warnings: preflight,
        goal: goal ? {
          monthly_target: Number(goal.monthly_target),
          daily_target: Number(goal.daily_target),
        } : null,
      });
    }

    // ─── ACTION: run ───
    const remainingSlots = maxTradesPerDay - tradesToday;
    const remainingRisk = maxDailyRisk - dailyRiskUsed;

    const signalResponse = await fetch(`${supabaseUrl}/functions/v1/signal-engine`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
      body: JSON.stringify({
        user_id: user.id, min_score: 70, min_r: 1.8, min_confidence: 60,
        max_signals: Math.min(remainingSlots, 3), operator_mode: true,
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

    // ─── Size positions with adaptive risk ───
    const sized = signals.map((sig: Record<string, unknown>) => {
      const entryPrice = Number(sig.entry_price);
      const stopLoss = Number(sig.stop_loss);
      const stopDist = Math.abs(entryPrice - stopLoss);
      const effectiveRisk = Math.min(riskPerTrade, remainingRisk / signals.length);
      const riskDollars = currentCapital * (effectiveRisk / 100);
      let quantity = stopDist > 0 ? Math.floor(riskDollars / stopDist) : 0;
      if (quantity <= 0) quantity = 1;

      const maxSingleAsset = Number(settings.max_single_asset || 25);
      const positionValue = quantity * entryPrice;
      const positionPct = (positionValue / currentCapital) * 100;
      if (positionPct > maxSingleAsset) quantity = Math.floor((currentCapital * maxSingleAsset / 100) / entryPrice);

      const targets = (sig.targets as number[]) || [];
      const takeProfit = targets.length > 0 ? targets[0] : entryPrice + stopDist * 2;

      return { ...sig, quantity, risk_pct: effectiveRisk, risk_dollars: riskDollars, position_value: quantity * entryPrice, take_profit: takeProfit };
    });

    // ─── Execute based on automation level ───
    const shouldExecute = automationLevel === "full_operator" || (automationLevel === "assisted" && autoExecute);
    const execResults: Record<string, unknown>[] = [];

    if (shouldExecute && action === "run") {
      for (const trade of sized) {
        try {
          const orderRes = await fetch(`${supabaseUrl}/functions/v1/alpaca-trade`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": authHeader },
            body: JSON.stringify({
              action: "place_order", paper,
              symbol: String(trade.asset).replace("/", ""),
              qty: trade.quantity,
              side: trade.direction === "long" ? "buy" : "sell",
              type: "market", time_in_force: "day", order_class: "bracket",
              take_profit: trade.take_profit, stop_loss: trade.stop_loss,
            }),
          });
          const orderResult = await orderRes.json();
          execResults.push({ symbol: trade.asset, success: orderResult.success || false, order: orderResult.order || null, error: orderResult.error || null });

          if (orderResult.success) {
            await supabase.from("positions").insert({
              user_id: user.id, symbol: String(trade.asset), name: String(trade.asset),
              asset_type: String(trade.asset_class || "stock"), direction: String(trade.direction),
              quantity: trade.quantity, avg_entry: Number(trade.entry_price),
              stop_loss: Number(trade.stop_loss), take_profit: Number(trade.take_profit),
              strategy: String(trade.strategy_family || "operator"),
              strategy_family: String(trade.strategy_family || "operator"),
              regime_at_entry: String(trade.market_regime || "undefined"),
              status: "open",
              notes: `Operator auto-exec. Score: ${Number(trade.opportunity_score).toFixed(0)}, R: ${Number(trade.expected_r_multiple).toFixed(1)}`,
            });
          }
        } catch (execErr) {
          execResults.push({ symbol: trade.asset, success: false, error: execErr instanceof Error ? execErr.message : "Execution failed" });
        }
      }

      // Update counters
      const successCount = execResults.filter(r => r.success).length;
      const riskUsed = sized.filter((_: unknown, i: number) => execResults[i]?.success).reduce((s: number, t: Record<string, unknown>) => s + Number(t.risk_pct || 0), 0);

      await supabase.from("user_settings").update({
        trades_today: tradesToday + successCount,
        last_trade_date: today,
        daily_risk_used: dailyRiskUsed + riskUsed,
      }).eq("user_id", user.id);

      await supabase.from("daily_performance").upsert({
        user_id: user.id, date: today,
        starting_capital: currentCapital,
        trades_opened: tradesToday + successCount,
        risk_used_pct: dailyRiskUsed + riskUsed,
      }, { onConflict: "user_id,date" });
    }

    return jsonRes({
      status: shouldExecute ? "executed" : "ready_for_approval",
      automation_level: automationLevel,
      signals_generated: signals.length,
      signals_rejected: signalResult.rejected || 0,
      effective_risk_per_trade: riskPerTrade,
      trades: sized.map((t: Record<string, unknown>) => ({
        symbol: t.asset, direction: t.direction,
        score: Number(t.opportunity_score).toFixed(0),
        confidence: Number(t.confidence_score).toFixed(0),
        expected_r: Number(t.expected_r_multiple).toFixed(1),
        quantity: t.quantity, entry: t.entry_price,
        stop_loss: t.stop_loss, take_profit: t.take_profit,
        risk_pct: Number(t.risk_pct).toFixed(2),
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
