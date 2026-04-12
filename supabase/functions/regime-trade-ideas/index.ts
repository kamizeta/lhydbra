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

// Regime-based trade idea templates
const REGIME_STRATEGIES: Record<string, {
  direction: string;
  strategy_family: string;
  strategy: string;
  confidence_boost: number;
  reasoning_template: string;
}> = {
  pre_breakout: {
    direction: 'long',
    strategy_family: 'breakout',
    strategy: 'Breakout Entry',
    confidence_boost: 10,
    reasoning_template: 'Regime Pre-Breakout detected. Compression phase with expanding momentum suggests imminent directional move.',
  },
  bull_market: {
    direction: 'long',
    strategy_family: 'trend_following',
    strategy: 'Trend Following Long',
    confidence_boost: 15,
    reasoning_template: 'Bull Market regime confirmed. Trend alignment and strong momentum support continuation trades.',
  },
  trending_bullish: {
    direction: 'long',
    strategy_family: 'trend_following',
    strategy: 'Bull Trend Continuation',
    confidence_boost: 10,
    reasoning_template: 'Bullish trend in progress. Pullback to support offers favorable entry with trend.',
  },
  oversold: {
    direction: 'long',
    strategy_family: 'mean_reversion',
    strategy: 'Mean Reversion Long',
    confidence_boost: 5,
    reasoning_template: 'Oversold conditions detected. RSI and price structure suggest potential reversal or bounce.',
  },
  bear_market: {
    direction: 'short',
    strategy_family: 'trend_following',
    strategy: 'Trend Following Short',
    confidence_boost: 10,
    reasoning_template: 'Bear Market regime. Sustained selling pressure and weak structure favor short positions.',
  },
  trending_bearish: {
    direction: 'short',
    strategy_family: 'trend_following',
    strategy: 'Bear Trend Continuation',
    confidence_boost: 5,
    reasoning_template: 'Bearish trend confirmed. Rallies to resistance offer short entry opportunities.',
  },
  overbought: {
    direction: 'short',
    strategy_family: 'mean_reversion',
    strategy: 'Mean Reversion Short',
    confidence_boost: 5,
    reasoning_template: 'Overbought conditions. Extended price and momentum suggest correction risk.',
  },
  euphoria: {
    direction: 'short',
    strategy_family: 'mean_reversion',
    strategy: 'Euphoria Fade',
    confidence_boost: 0,
    reasoning_template: 'Euphoria regime — extreme overbought. High risk of sharp reversal. Counter-trend with tight stops only.',
  },
  capitulation: {
    direction: 'long',
    strategy_family: 'mean_reversion',
    strategy: 'Capitulation Bounce',
    confidence_boost: 0,
    reasoning_template: 'Capitulation detected — extreme oversold. Potential snap-back rally. High risk, tight stops required.',
  },
};

// Regimes that don't generate directional ideas
const NEUTRAL_REGIMES = new Set(['volatile', 'ranging', 'compression', 'undefined']);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, supabaseKey);

    // Get user from token
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const { min_score = 45 } = await req.json().catch(() => ({}));

    // Fetch features and scores
    const [{ data: features }, { data: scores }, { data: existingSignals }] = await Promise.all([
      db.from('market_features').select('*').eq('timeframe', '1d'),
      db.from('opportunity_scores').select('*').eq('timeframe', '1d').gte('total_score', min_score).order('total_score', { ascending: false }),
      db.from('signals').select('asset, status').eq('user_id', user.id).in('status', ['active', 'approved']),
    ]);

    if (!features || !scores) {
      return new Response(JSON.stringify({ error: "No market data available. Run Data Intelligence first." }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Get user settings for position sizing
    const { data: settings } = await db.from('user_settings').select('*').eq('user_id', user.id).single();
    const capital = settings?.current_capital || 10000;
    const riskPct = settings?.risk_per_trade || 1.5;
    const minRR = settings?.min_rr_ratio || 1.5;

    // Build feature map
    const featureMap: Record<string, any> = {};
    for (const f of features) featureMap[f.symbol] = f;

    // Existing signal symbols to avoid duplicates
    const existingSymbols = new Set((existingSignals || []).map((s: any) => s.asset));

    const newSignals: any[] = [];

    for (const score of scores) {
      // Skip if already has a pending/approved signal
      if (existingSymbols.has(score.symbol)) continue;

      const feat = featureMap[score.symbol];
      if (!feat) continue;

      const regime = feat.market_regime || 'undefined';

      // Skip neutral regimes
      if (NEUTRAL_REGIMES.has(regime)) continue;

      const template = REGIME_STRATEGIES[regime];
      if (!template) continue;

      // Use opportunity score direction if available, otherwise template
      const direction = score.direction && score.direction !== 'neutral' ? score.direction : template.direction;

      // Calculate entry/SL/TP from features
      const currentPrice = feat.sma_20 || 0; // Approximate current price from SMA20
      if (currentPrice <= 0) continue;

      const atr = feat.atr_14 || (currentPrice * 0.02); // Fallback 2%
      const support = feat.support_level || (currentPrice - atr * 2);
      const resistance = feat.resistance_level || (currentPrice + atr * 2);

      let entryPrice: number, stopLoss: number, takeProfit: number;

      if (direction === 'long') {
        entryPrice = currentPrice;
        stopLoss = Math.max(support, currentPrice - atr * 1.5);
        const risk = entryPrice - stopLoss;
        takeProfit = entryPrice + (risk * Math.max(minRR, 2));
        // Also cap TP at resistance if it's reasonable
        if (resistance > entryPrice && resistance < takeProfit) {
          takeProfit = Math.max(resistance, entryPrice + risk * minRR);
        }
      } else {
        entryPrice = currentPrice;
        stopLoss = Math.min(resistance, currentPrice + atr * 1.5);
        const risk = stopLoss - entryPrice;
        takeProfit = entryPrice - (risk * Math.max(minRR, 2));
        if (support < entryPrice && support > takeProfit) {
          takeProfit = Math.min(support, entryPrice - risk * minRR);
        }
      }

      const riskPerShare = Math.abs(entryPrice - stopLoss);
      if (riskPerShare <= 0) continue;

      const riskReward = Math.abs(takeProfit - entryPrice) / riskPerShare;
      if (riskReward < minRR) continue;

      const positionSize = Math.floor((capital * (riskPct / 100)) / riskPerShare);
      if (positionSize <= 0) continue;

      // Confidence from score + regime boost
      const rawConf = Math.min(100, Math.round(score.total_score + template.confidence_boost));
      const confidence = Math.max(20, Math.min(95, rawConf));

      // Build reasoning
      const indicators = [];
      if (feat.rsi_14) indicators.push(`RSI=${feat.rsi_14.toFixed(1)}`);
      if (feat.macd) indicators.push(`MACD=${feat.macd.toFixed(4)}`);
      if (feat.momentum_score) indicators.push(`Momentum=${feat.momentum_score}`);
      if (feat.trend_strength) indicators.push(`TrendStr=${feat.trend_strength}`);

      const reasoning = `${template.reasoning_template} Score: ${score.total_score}/100. ${indicators.join(', ')}. ATR: ${atr.toFixed(4)}. Support: ${support.toFixed(2)}, Resistance: ${resistance.toFixed(2)}.`;

      const signalKey = `${user.id}|${score.symbol}|${direction}|1d|${new Date().toISOString().slice(0, 10)}`;
      newSignals.push({
        user_id: user.id,
        asset: score.symbol,
        asset_class: score.asset_type || feat.asset_type || 'stock',
        direction,
        strategy_family: template.strategy_family,
        entry_price: parseFloat(entryPrice.toFixed(6)),
        stop_loss: parseFloat(stopLoss.toFixed(6)),
        targets: [{ price: parseFloat(takeProfit.toFixed(6)), label: "TP1" }],
        expected_r_multiple: parseFloat(riskReward.toFixed(2)),
        confidence_score: confidence,
        opportunity_score: score.total_score,
        market_regime: regime,
        reasoning,
        explanation: {
          name: `${template.strategy} — ${score.symbol}`,
          strategy: template.strategy,
          position_size: positionSize,
          risk_percent: riskPct,
        },
        score_breakdown: {
          structure: score.structure_score,
          momentum: score.momentum_score,
          volatility: score.volatility_score,
          strategy: score.strategy_score,
          rr: score.rr_score,
          macro: score.macro_score,
          sentiment: score.sentiment_score,
          historical: score.historical_score,
        },
        modifiers_applied: {},
        weight_profile_used: {},
        signal_key: signalKey,
        status: 'active',
      });
    }

    // Insert signals
    if (newSignals.length > 0) {
      const { error: insertError } = await db.from('signals').upsert(newSignals, { onConflict: 'signal_key', ignoreDuplicates: true });
      if (insertError) {
        console.error('Insert error:', insertError);
        return new Response(JSON.stringify({ error: insertError.message }), {
          status: 500,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({
      count: newSignals.length,
      skipped_existing: existingSymbols.size,
      skipped_neutral: scores.filter((s: any) => NEUTRAL_REGIMES.has(featureMap[s.symbol]?.market_regime)).length,
      signals: newSignals.map(s => ({ symbol: s.symbol, direction: s.direction, strategy: s.strategy, regime: s.market_regime, score: s.opportunity_score, confidence: s.confidence })),
    }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("regime-trade-ideas error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
