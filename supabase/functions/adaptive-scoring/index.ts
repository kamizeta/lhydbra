import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const WEIGHT_KEYS = [
  'structure_weight', 'momentum_weight', 'volatility_weight',
  'strategy_weight', 'rr_weight', 'macro_weight',
  'sentiment_weight', 'historical_weight',
] as const;

const SCORE_KEYS = [
  'structure_score', 'momentum_score', 'volatility_score',
  'strategy_score', 'rr_score', 'macro_score',
  'sentiment_score', 'historical_score',
] as const;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  }

  try {
    const { user_id, window_days } = await req.json();
    if (!user_id) throw new Error("user_id required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, serviceKey);

    const windowDays = window_days || 30;
    const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

    // 1. Fetch signal outcomes within window
    const { data: outcomes } = await db
      .from('signal_outcomes')
      .select('*')
      .eq('user_id', user_id)
      .neq('outcome', 'pending')
      .gte('resolved_at', cutoff)
      .order('resolved_at', { ascending: false });

    if (!outcomes || outcomes.length < 5) {
      return new Response(JSON.stringify({
        message: 'Insufficient outcomes for adaptation. Need at least 5 resolved signals.',
        outcomes_count: outcomes?.length || 0,
        adjusted: false,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 2. Fetch current weights
    const { data: currentWeights } = await db
      .from('scoring_weights')
      .select('*')
      .eq('user_id', user_id)
      .eq('is_active', true)
      .maybeSingle();

    const weights: Record<string, number> = {};
    for (const k of WEIGHT_KEYS) {
      weights[k] = currentWeights ? Number(currentWeights[k]) : (k === 'structure_weight' ? 15 : k === 'momentum_weight' ? 15 : k === 'volatility_weight' ? 10 : k === 'strategy_weight' ? 15 : k === 'rr_weight' ? 15 : k === 'macro_weight' ? 10 : k === 'sentiment_weight' ? 10 : 10);
    }

    // 3. Compute correlation between each sub-score and actual outcomes
    const correlations: Record<string, number> = {};
    for (let si = 0; si < SCORE_KEYS.length; si++) {
      const scoreKey = SCORE_KEYS[si];
      const pairs = outcomes
        .filter(o => o.score_breakdown && (o.score_breakdown as any)[scoreKey] != null)
        .map(o => ({
          score: Number((o.score_breakdown as any)[scoreKey]),
          result: Number(o.actual_r_multiple) || (o.outcome === 'win' ? 1 : -1),
        }));

      if (pairs.length < 3) { correlations[scoreKey] = 0; continue; }

      // Pearson correlation
      const n = pairs.length;
      const sumX = pairs.reduce((s, p) => s + p.score, 0);
      const sumY = pairs.reduce((s, p) => s + p.result, 0);
      const sumXY = pairs.reduce((s, p) => s + p.score * p.result, 0);
      const sumX2 = pairs.reduce((s, p) => s + p.score * p.score, 0);
      const sumY2 = pairs.reduce((s, p) => s + p.result * p.result, 0);

      const numerator = n * sumXY - sumX * sumY;
      const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
      correlations[scoreKey] = denominator > 0 ? numerator / denominator : 0;
    }

    // 4. Adjust weights based on correlations
    const newWeights: Record<string, number> = { ...weights };
    const adjustmentRate = 0.15; // max 15% change per iteration

    for (let si = 0; si < SCORE_KEYS.length; si++) {
      const scoreKey = SCORE_KEYS[si];
      const weightKey = WEIGHT_KEYS[si];
      const corr = correlations[scoreKey];

      // Positive correlation = good predictor, boost weight
      // Negative correlation = bad predictor, reduce weight
      const adjustment = corr * adjustmentRate * weights[weightKey];
      newWeights[weightKey] = Math.max(2, Math.min(30, weights[weightKey] + adjustment));
    }

    // Normalize to sum 100
    const totalNew = Object.values(newWeights).reduce((s, v) => s + v, 0);
    for (const k of WEIGHT_KEYS) {
      newWeights[k] = Math.round((newWeights[k] / totalNew) * 100);
    }
    // Fix rounding
    const diff = 100 - Object.values(newWeights).reduce((s, v) => s + v, 0);
    newWeights[WEIGHT_KEYS[0]] += diff;

    // 5. Check if adjustment is significant enough
    let totalDelta = 0;
    for (const k of WEIGHT_KEYS) {
      totalDelta += Math.abs(newWeights[k] - weights[k]);
    }

    if (totalDelta < 3) {
      return new Response(JSON.stringify({
        message: 'Weights are already well-calibrated. No significant adjustment needed.',
        correlations,
        current_weights: weights,
        adjusted: false,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 6. Save adjustment log
    await db.from('score_adjustments').insert({
      user_id,
      adjustment_type: 'auto',
      previous_weights: weights,
      new_weights: newWeights,
      reason: `Adaptive adjustment based on ${outcomes.length} outcomes (${windowDays}d window). Total delta: ${totalDelta.toFixed(1)}`,
      performance_window: windowDays,
      metrics: { correlations, outcomes_count: outcomes.length, total_delta: totalDelta },
    });

    // 7. Update scoring weights
    await db.from('scoring_weights').upsert({
      user_id,
      ...newWeights,
      is_active: true,
      name: 'adaptive',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,name' });

    // 8. Update regime performance
    const regimeGroups = new Map<string, typeof outcomes>();
    for (const o of outcomes) {
      const key = `${o.strategy_family || 'unknown'}|${o.market_regime || 'all'}`;
      if (!regimeGroups.has(key)) regimeGroups.set(key, []);
      regimeGroups.get(key)!.push(o);
    }

    for (const [key, group] of regimeGroups) {
      const [family, regime] = key.split('|');
      const wins = group.filter(o => o.outcome === 'win');
      const totalPnl = group.reduce((s, o) => s + (Number(o.actual_pnl) || 0), 0);
      const avgR = group.reduce((s, o) => s + (Number(o.actual_r_multiple) || 0), 0) / group.length;
      const winRate = (wins.length / group.length) * 100;
      const avgWin = wins.length > 0 ? wins.reduce((s, o) => s + (Number(o.actual_pnl) || 0), 0) / wins.length : 0;
      const losses = group.filter(o => o.outcome !== 'win');
      const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, o) => s + (Number(o.actual_pnl) || 0), 0) / losses.length) : 1;
      const profitFactor = avgLoss > 0 ? (avgWin * wins.length) / (avgLoss * losses.length) : 0;
      const expectancy = (winRate / 100) * avgWin - ((100 - winRate) / 100) * avgLoss;
      const modifier = profitFactor > 1.5 ? 1.2 : profitFactor > 1 ? 1.0 : profitFactor > 0.5 ? 0.8 : 0.6;

      await db.from('regime_performance').upsert({
        user_id, strategy_family: family, market_regime: regime,
        total_trades: group.length, winning_trades: wins.length,
        total_pnl: totalPnl, avg_r_multiple: avgR, win_rate: winRate,
        expectancy, profit_factor: profitFactor,
        optimal_weight_modifier: modifier,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,strategy_family,market_regime,asset_type' });
    }

    return new Response(JSON.stringify({
      adjusted: true,
      previous_weights: weights,
      new_weights: newWeights,
      correlations,
      outcomes_analyzed: outcomes.length,
      total_delta: totalDelta,
      regime_groups: regimeGroups.size,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("adaptive-scoring error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
