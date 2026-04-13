import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://lhydbra.lovable.app",
  "https://id-preview--cfc6c4be-124b-47d1-b6e8-26dbf563d3b8.lovable.app",
  "http://localhost:5173",
  "http://localhost:8080",
];

function isAllowedOrigin(origin: string) {
  return (
    ALLOWED_ORIGINS.includes(origin) ||
    /^https:\/\/[a-z0-9-]+\.lovableproject\.com$/i.test(origin) ||
    /^https:\/\/[a-z0-9-]+\.lovable\.app$/i.test(origin)
  );
}

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin : "",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

// ─── Score Computation Functions ───

/** Structure score: trend alignment + S/R positioning */
function computeStructureScore(f: Record<string, any>): number {
  let score = 50;
  const trend = f.trend_direction;
  const strength = Number(f.trend_strength) || 0;

  // Trend alignment
  if (trend === 'uptrend') score += Math.min(25, strength * 0.5);
  else if (trend === 'downtrend') score -= Math.min(25, strength * 0.5);

  // S/R positioning: price closer to support = better for long
  const support = Number(f.support_level) || 0;
  const resistance = Number(f.resistance_level) || 0;
  const sma20 = Number(f.sma_20) || 0;

  if (support > 0 && resistance > support && sma20 > 0) {
    const range = resistance - support;
    const posInRange = (sma20 - support) / range; // 0 = at support, 1 = at resistance
    // Near support = better opportunity for long
    if (posInRange < 0.3) score += 15;
    else if (posInRange > 0.8) score -= 10;
  }

  // SMA alignment: 20 > 50 > 200 = strong bullish structure
  const sma50 = Number(f.sma_50) || 0;
  const sma200 = Number(f.sma_200) || 0;
  if (sma20 > 0 && sma50 > 0 && sma200 > 0) {
    if (sma20 > sma50 && sma50 > sma200) score += 10;
    else if (sma20 < sma50 && sma50 < sma200) score -= 10;
  }

  return Math.max(0, Math.min(100, score));
}

/** Momentum score: RSI + MACD confirmation */
function computeMomentumScore(f: Record<string, any>): number {
  let score = 50;
  const rsi = Number(f.rsi_14);
  const macd = Number(f.macd);
  const macdSignal = Number(f.macd_signal);
  const macdHist = Number(f.macd_histogram);

  // RSI component
  if (!isNaN(rsi)) {
    if (rsi >= 50 && rsi <= 70) score += 15; // bullish momentum
    else if (rsi >= 30 && rsi < 50) score += 5; // recovering
    else if (rsi > 70 && rsi <= 80) score += 5; // strong but risky
    else if (rsi > 80) score -= 15; // overbought
    else if (rsi < 30) score -= 10; // oversold (could be opportunity)
  }

  // MACD component
  if (!isNaN(macd) && !isNaN(macdSignal)) {
    if (macd > macdSignal) score += 10; // bullish crossover
    else score -= 10;
    
    // Histogram direction (acceleration)
    if (!isNaN(macdHist)) {
      if (macdHist > 0 && macd > macdSignal) score += 5; // accelerating bullish
      else if (macdHist < 0 && macd < macdSignal) score -= 5;
    }
  }

  // Momentum score from features
  const ms = Number(f.momentum_score);
  if (!isNaN(ms)) {
    score += (ms - 50) * 0.2; // slight adjustment from computed momentum
  }

  return Math.max(0, Math.min(100, score));
}

/** Volatility score: favorable volatility conditions */
function computeVolatilityScore(f: Record<string, any>): number {
  const regime = f.volatility_regime || 'normal';
  // Compressed volatility = high opportunity (pre-breakout)
  // Normal = moderate opportunity
  // High = risky, lower score
  const map: Record<string, number> = {
    compressed: 85,
    low: 70,
    normal: 55,
    elevated: 35,
    high: 20,
  };
  return map[regime] ?? 50;
}

/** Strategy score: regime favorability for trading */
function computeStrategyScore(f: Record<string, any>): number {
  const regime = f.market_regime || 'undefined';
  const confidence = Number(f.regime_confidence) || 0;

  const regimeScores: Record<string, number> = {
    trending_bullish: 85,
    trending_bearish: 40, // good for shorts
    bull_market: 80,
    bear_market: 25,
    pre_breakout: 75,
    compression: 70,
    oversold: 65, // potential reversal opportunity
    ranging: 45,
    volatile: 30,
    overbought: 30,
    euphoria: 20,
    capitulation: 15,
    undefined: 40,
  };

  const base = regimeScores[regime] ?? 40;
  // Scale by confidence
  return Math.round(base * (0.5 + (confidence / 200)));
}

/** R:R score: based on distance to support/resistance */
function computeRRScore(f: Record<string, any>): number {
  const support = Number(f.support_level) || 0;
  const resistance = Number(f.resistance_level) || 0;
  const sma20 = Number(f.sma_20) || 0;
  
  if (support <= 0 || resistance <= support || sma20 <= 0) return 50;

  // For long: risk = price - support, reward = resistance - price
  const risk = sma20 - support;
  const reward = resistance - sma20;
  
  if (risk <= 0) return 80; // price at/below support
  
  const rr = reward / risk;
  
  if (rr >= 3) return 95;
  if (rr >= 2) return 80;
  if (rr >= 1.5) return 65;
  if (rr >= 1) return 50;
  if (rr >= 0.5) return 30;
  return 15;
}

/** Macro score: placeholder — can be enhanced with macro data feeds */
function computeMacroScore(_f: Record<string, any>): number {
  // For now, derive from broader market context via SMA200 position
  const sma200 = Number(_f.sma_200) || 0;
  const sma50 = Number(_f.sma_50) || 0;
  if (sma200 > 0 && sma50 > 0) {
    if (sma50 > sma200 * 1.05) return 70; // bullish macro
    if (sma50 < sma200 * 0.95) return 30; // bearish macro
  }
  return 50;
}

/** Sentiment score: placeholder — RSI extremes as proxy */
function computeSentimentScore(f: Record<string, any>): number {
  const rsi = Number(f.rsi_14);
  if (isNaN(rsi)) return 50;
  // Contrarian: extreme fear = opportunity, extreme greed = risk
  if (rsi < 25) return 70; // fear = opportunity
  if (rsi < 35) return 60;
  if (rsi > 75) return 30; // greed = risk
  if (rsi > 65) return 40;
  return 55;
}

/** Historical score: placeholder — will be computed from strategy_performance */
function computeHistoricalScore(_f: Record<string, any>, stratPerf: Record<string, any> | null): number {
  if (!stratPerf) return 50;
  const winRate = Number(stratPerf.win_rate) || 0;
  const avgR = Number(stratPerf.avg_r_multiple) || 0;
  
  let score = 50;
  if (winRate > 60) score += 15;
  else if (winRate > 50) score += 5;
  else if (winRate < 40) score -= 15;
  
  if (avgR > 2) score += 15;
  else if (avgR > 1) score += 5;
  else if (avgR < 0) score -= 10;
  
  return Math.max(0, Math.min(100, score));
}

/** Determine direction based on indicators */
function determineDirection(f: Record<string, any>): string {
  let bullish = 0, bearish = 0;
  
  if (f.trend_direction === 'uptrend') bullish += 2;
  else if (f.trend_direction === 'downtrend') bearish += 2;
  
  const rsi = Number(f.rsi_14);
  if (!isNaN(rsi)) {
    if (rsi > 50) bullish += 1;
    else bearish += 1;
  }
  
  const macd = Number(f.macd), macdSig = Number(f.macd_signal);
  if (!isNaN(macd) && !isNaN(macdSig)) {
    if (macd > macdSig) bullish += 1;
    else bearish += 1;
  }
  
  if (bullish > bearish) return 'long';
  if (bearish > bullish) return 'short';
  return 'neutral';
}

/** Determine best strategy family for this regime */
function determineStrategyFamily(regime: string): string {
  const map: Record<string, string> = {
    trending_bullish: 'trend_following',
    trending_bearish: 'trend_following',
    bull_market: 'trend_following',
    bear_market: 'mean_reversion',
    pre_breakout: 'breakout',
    compression: 'breakout',
    oversold: 'mean_reversion',
    overbought: 'mean_reversion',
    ranging: 'range_trading',
    volatile: 'volatility',
    euphoria: 'mean_reversion',
    capitulation: 'mean_reversion',
  };
  return map[regime] || 'hybrid';
}

// ─── Main Pipeline ───
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const { symbols, user_id } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, serviceKey);

    // 1. Fetch market features for all requested symbols
    const symbolList = (symbols as string[]) || [];
    
    let featureRows: any[] = [];
    if (symbolList.length > 0) {
      const { data } = await db.from('market_features')
        .select('*')
        .in('symbol', symbolList)
        .eq('timeframe', '1d');
      featureRows = data || [];
    } else {
      // Score all available features
      const { data } = await db.from('market_features').select('*').eq('timeframe', '1d');
      featureRows = data || [];
    }

    if (featureRows.length === 0) {
      return new Response(JSON.stringify({ 
        error: 'No market features found. Run Data Intelligence first.',
        scores: [],
      }), { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
    }

    // 2. Fetch user scoring weights if user_id provided
    let weights = {
      structure_weight: 15, momentum_weight: 15, volatility_weight: 10,
      strategy_weight: 15, rr_weight: 15, macro_weight: 10,
      sentiment_weight: 10, historical_weight: 10,
    };

    if (user_id) {
      const { data: userWeights } = await db.from('scoring_weights')
        .select('*')
        .eq('user_id', user_id)
        .eq('is_active', true)
        .maybeSingle();
      
      if (userWeights) {
        weights = {
          structure_weight: Number(userWeights.structure_weight),
          momentum_weight: Number(userWeights.momentum_weight),
          volatility_weight: Number(userWeights.volatility_weight),
          strategy_weight: Number(userWeights.strategy_weight),
          rr_weight: Number(userWeights.rr_weight),
          macro_weight: Number(userWeights.macro_weight),
          sentiment_weight: Number(userWeights.sentiment_weight),
          historical_weight: Number(userWeights.historical_weight),
        };
      }
    }

    // 3. Fetch strategy performance for historical scoring
    let stratPerf: Record<string, any> | null = null;
    if (user_id) {
      const { data } = await db.from('strategy_performance')
        .select('*')
        .eq('user_id', user_id);
      if (data && data.length > 0) {
        // Build a map by strategy_family
        stratPerf = {};
        for (const row of data) {
          (stratPerf as any)[row.strategy_family] = row;
        }
      }
    }

    const totalWeight = weights.structure_weight + weights.momentum_weight +
      weights.volatility_weight + weights.strategy_weight + weights.rr_weight +
      weights.macro_weight + weights.sentiment_weight + weights.historical_weight;

    // 4. Compute scores for each symbol
    const scores: any[] = [];

    for (const f of featureRows) {
      const regime = f.market_regime || 'undefined';
      const stratFamily = determineStrategyFamily(regime);
      const perfData = stratPerf ? (stratPerf as any)[stratFamily] || null : null;

      const structure = computeStructureScore(f);
      const momentum = computeMomentumScore(f);
      const volatility = computeVolatilityScore(f);
      const strategy = computeStrategyScore(f);
      const rr = computeRRScore(f);
      const macro = computeMacroScore(f);
      const sentiment = computeSentimentScore(f);
      const historical = computeHistoricalScore(f, perfData);

      const total = totalWeight > 0 ? Math.round(
        (structure * weights.structure_weight +
         momentum * weights.momentum_weight +
         volatility * weights.volatility_weight +
         strategy * weights.strategy_weight +
         rr * weights.rr_weight +
         macro * weights.macro_weight +
         sentiment * weights.sentiment_weight +
         historical * weights.historical_weight) / totalWeight
      ) : 50;

      const direction = determineDirection(f);

      const scoreRow = {
        symbol: f.symbol,
        timeframe: f.timeframe,
        asset_type: f.asset_type,
        total_score: total,
        structure_score: structure,
        momentum_score: momentum,
        volatility_score: volatility,
        strategy_score: strategy,
        rr_score: rr,
        macro_score: macro,
        sentiment_score: sentiment,
        historical_score: historical,
        direction,
        strategy_family: stratFamily,
        computed_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };

      scores.push(scoreRow);
    }

    // 5. Persist to opportunity_scores
    if (scores.length > 0) {
      const { error } = await db.from('opportunity_scores').upsert(scores, { 
        onConflict: 'symbol,timeframe' 
      });
      if (error) console.error('Upsert scores error:', error.message);
    }

    // Sort by total_score descending
    scores.sort((a, b) => b.total_score - a.total_score);

    return new Response(JSON.stringify({
      scores,
      count: scores.length,
      weights,
    }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("opportunity-score error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
