import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonRes({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userSb = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: uErr } = await userSb.auth.getUser();
    if (uErr || !user) return jsonRes({ error: "Unauthorized" }, 401);

    const sb = createClient(supabaseUrl, serviceKey);
    const body = await req.json();
    const { action = "daily_review" } = body;

    const today = new Date().toISOString().split("T")[0];
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
    const monthAgo = new Date(now.getTime() - 30 * 86400000).toISOString();

    // Load goal profile
    const { data: goal } = await sb.from("goal_profiles").select("*").eq("user_id", user.id).maybeSingle();

    // Load settings
    const { data: settings } = await sb.from("user_settings").select("*").eq("user_id", user.id).maybeSingle();

    // Load journal entries
    const [todayJournal, weekJournal, monthJournal] = await Promise.all([
      sb.from("trade_journal").select("*").eq("user_id", user.id).gte("entered_at", `${today}T00:00:00Z`),
      sb.from("trade_journal").select("pnl, r_multiple, strategy_family, market_regime, direction").eq("user_id", user.id).gte("entered_at", weekAgo),
      sb.from("trade_journal").select("pnl, r_multiple").eq("user_id", user.id).gte("entered_at", monthAgo),
    ]);

    const todayTrades = todayJournal.data || [];
    const weekTrades = weekJournal.data || [];
    const monthTrades = monthJournal.data || [];

    const todayPnl = todayTrades.reduce((s, t) => s + (t.pnl || 0), 0);
    const weekPnl = weekTrades.reduce((s, t) => s + (t.pnl || 0), 0);
    const monthPnl = monthTrades.reduce((s, t) => s + (t.pnl || 0), 0);
    const todayWins = todayTrades.filter(t => (t.pnl || 0) > 0).length;
    const todayLosses = todayTrades.filter(t => (t.pnl || 0) < 0).length;
    const todayAvgR = todayTrades.length > 0
      ? todayTrades.reduce((s, t) => s + (t.r_multiple || 0), 0) / todayTrades.length
      : 0;

    const monthlyTarget = goal?.monthly_target || 3000;
    const dailyTarget = goal?.daily_target || 150;
    const tradingDaysInMonth = 22;
    const dayOfMonth = now.getDate();
    const expectedByNow = (dayOfMonth / 30) * monthlyTarget;
    const pace = monthPnl >= expectedByNow ? "ahead" : "behind";
    const progressPct = Math.min((monthPnl / monthlyTarget) * 100, 100);
    const remainingTarget = Math.max(monthlyTarget - monthPnl, 0);
    const remainingDays = Math.max(tradingDaysInMonth - Math.floor(dayOfMonth * 22 / 30), 1);
    const requiredDailyFromNow = remainingTarget / remainingDays;

    // Detect mistakes
    const mistakes: string[] = [];
    const suggestions: string[] = [];

    // 1. Overtrading
    const maxTrades = settings?.max_trades_per_day || 3;
    if (todayTrades.length > maxTrades) {
      mistakes.push(`Overtrade: ${todayTrades.length} trades (limit: ${maxTrades})`);
      suggestions.push("Stick to your daily trade limit. Quality > quantity.");
    }

    // 2. Low-quality trades taken
    const lowQuality = todayTrades.filter(t => (t.opportunity_score || 0) < 70);
    if (lowQuality.length > 0) {
      mistakes.push(`${lowQuality.length} trade(s) below quality threshold (score < 70)`);
      suggestions.push("Only take signals with score ≥ 70. Lower scores reduce your edge.");
    }

    // 3. Bad R-multiples
    const negativeR = todayTrades.filter(t => (t.r_multiple || 0) < -1);
    if (negativeR.length > 0) {
      mistakes.push(`${negativeR.length} trade(s) with R < -1.0 (poor risk management)`);
      suggestions.push("Review your stop-loss placement. Losses should stay within -1R.");
    }

    // 4. Revenge trading (multiple losses in sequence)
    if (todayLosses >= 2 && todayTrades.length > 3) {
      mistakes.push("Possible revenge trading detected");
      suggestions.push("After 2 losses, take a break. The market will be there tomorrow.");
    }

    // 5. Missing the daily target
    if (todayPnl < dailyTarget && todayTrades.length > 0) {
      suggestions.push(`Daily target: $${dailyTarget}. Today: $${todayPnl.toFixed(0)}. Focus on higher-conviction setups.`);
    }

    // Grade
    let grade = "B";
    if (todayPnl >= dailyTarget && mistakes.length === 0) grade = "A+";
    else if (todayPnl >= dailyTarget * 0.8 && mistakes.length <= 1) grade = "A";
    else if (todayPnl >= 0 && mistakes.length <= 1) grade = "B+";
    else if (todayPnl >= 0) grade = "B";
    else if (mistakes.length <= 1) grade = "C+";
    else grade = "C";

    // Pre-market briefing
    if (action === "pre_market") {
      const { data: openPos } = await sb.from("positions").select("symbol, direction, pnl").eq("user_id", user.id).eq("status", "open");
      const openPnl = (openPos || []).reduce((s, p) => s + (p.pnl || 0), 0);
      const consecutiveLosses = settings?.consecutive_losses || 0;
      const cooldownActive = consecutiveLosses >= (settings?.loss_cooldown_count || 2);

      return jsonRes({
        phase: "pre_market",
        date: today,
        briefing: {
          capital: settings?.current_capital || 10000,
          open_positions: (openPos || []).length,
          open_pnl: openPnl,
          risk_available: `${((settings?.max_daily_risk || 2) - (settings?.daily_risk_used || 0)).toFixed(1)}%`,
          trades_remaining: maxTrades - (settings?.trades_today || 0),
          cooldown_active: cooldownActive,
          consecutive_losses: consecutiveLosses,
        },
        goal: {
          monthly_target: monthlyTarget,
          daily_target: dailyTarget,
          month_progress: monthPnl,
          progress_pct: progressPct,
          pace,
          required_daily_from_now: requiredDailyFromNow,
        },
        message: cooldownActive
          ? "⚠️ Cooldown active. Wait for conditions to improve before trading."
          : `Ready to trade. Daily target: $${dailyTarget}. Focus on top-quality setups only.`,
      });
    }

    // Post-market review
    const coaching = {
      phase: "post_market",
      date: today,
      performance: {
        pnl: todayPnl,
        trades: todayTrades.length,
        wins: todayWins,
        losses: todayLosses,
        avg_r: todayAvgR,
        win_rate: todayTrades.length > 0 ? (todayWins / todayTrades.length) * 100 : 0,
      },
      goal: {
        monthly_target: monthlyTarget,
        daily_target: dailyTarget,
        month_progress: monthPnl,
        week_progress: weekPnl,
        progress_pct: progressPct,
        pace,
        remaining_target: remainingTarget,
        remaining_days: remainingDays,
        required_daily_from_now: requiredDailyFromNow,
      },
      grade,
      mistakes,
      suggestions,
      message: generateCoachMessage(grade, todayPnl, dailyTarget, pace, mistakes.length),
    };

    // Save coaching log
    await sb.from("coaching_logs").insert({
      user_id: user.id,
      date: today,
      phase: action,
      summary: coaching.message,
      mistakes,
      suggestions,
      daily_grade: grade,
      goal_progress_pct: progressPct,
      metrics: {
        pnl: todayPnl,
        trades: todayTrades.length,
        wins: todayWins,
        avg_r: todayAvgR,
      },
    });

    return jsonRes(coaching);
  } catch (e) {
    console.error("Performance coach error:", e);
    return jsonRes({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function generateCoachMessage(grade: string, pnl: number, target: number, pace: string, mistakeCount: number): string {
  if (grade === "A+" || grade === "A") {
    return `Excellent day! You hit your target with discipline. Keep this consistency. You're ${pace} of schedule for the month.`;
  }
  if (grade === "B+" || grade === "B") {
    return `Solid day. ${pnl >= 0 ? "Profitable" : "Small loss"} with ${mistakeCount > 0 ? "minor issues" : "no mistakes"}. Stay focused on quality setups.`;
  }
  return `Tough day. ${mistakeCount} issue(s) detected. Review your trades and adjust. The goal is consistency, not perfection.`;
}

function jsonRes(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
