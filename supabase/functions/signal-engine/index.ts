import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonRes(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Weight Profiles by Regime (11 factors) ───
const REGIME_WEIGHTS: Record<string, Record<string, number>> = {
  bullish:     { market_structure: 0.18, momentum: 0.12, volatility_suitability: 0.06, strategy_confluence: 0.14, macro_context: 0.07, sentiment_flow: 0.08, risk_reward: 0.09, historical_performance: 0.07, macd_confirmation: 0.07, volume_confirmation: 0.06, sr_proximity: 0.06 },
  bearish:     { market_structure: 0.18, momentum: 0.11, volatility_suitability: 0.08, strategy_confluence: 0.14, macro_context: 0.09, sentiment_flow: 0.06, risk_reward: 0.10, historical_performance: 0.05, macd_confirmation: 0.07, volume_confirmation: 0.06, sr_proximity: 0.06 },
  ranging:     { market_structure: 0.14, momentum: 0.06, volatility_suitability: 0.10, strategy_confluence: 0.16, macro_context: 0.08, sentiment_flow: 0.08, risk_reward: 0.12, historical_performance: 0.06, macd_confirmation: 0.06, volume_confirmation: 0.06, sr_proximity: 0.08 },
  volatile:    { market_structure: 0.12, momentum: 0.08, volatility_suitability: 0.13, strategy_confluence: 0.13, macro_context: 0.06, sentiment_flow: 0.10, risk_reward: 0.12, historical_performance: 0.06, macd_confirmation: 0.07, volume_confirmation: 0.06, sr_proximity: 0.07 },
  compression: { market_structure: 0.16, momentum: 0.08, volatility_suitability: 0.11, strategy_confluence: 0.16, macro_context: 0.07, sentiment_flow: 0.06, risk_reward: 0.10, historical_performance: 0.06, macd_confirmation: 0.07, volume_confirmation: 0.06, sr_proximity: 0.07 },
  default:     { market_structure: 0.16, momentum: 0.09, volatility_suitability: 0.08, strategy_confluence: 0.15, macro_context: 0.07, sentiment_flow: 0.08, risk_reward: 0.10, historical_performance: 0.08, macd_confirmation: 0.06, volume_confirmation: 0.06, sr_proximity: 0.07 },
};

const ASSET_CLASS_ADJUSTMENTS: Record<string, Record<string, number>> = {
  crypto:    { sentiment_flow: 0.04, volatility_suitability: 0.03, macro_context: -0.04, market_structure: -0.03 },
  stock:     { macro_context: 0.04, market_structure: 0.03, sentiment_flow: -0.04, volatility_suitability: -0.03 },
  commodity: { macro_context: 0.04, momentum: 0.03, sentiment_flow: -0.04, strategy_confluence: -0.03 },
  forex:     { macro_context: 0.03, volatility_suitability: 0.02, historical_performance: -0.03, sentiment_flow: -0.02 },
};

const UNCLEAR_REGIMES = new Set(["undefined", "transitional", "unknown", "neutral"]);

// SYMBOL_SECTORS loaded from DB at runtime (symbol_sectors table)
const MAX_SECTOR_POSITIONS = 2;

// EXTENDED_UNIVERSE removed — now dynamically loads ALL symbols from market_features

const STRATEGY_PRIORS: Record<string, number> = {
  momentum: 52, trend_following: 48, mean_reversion: 55, breakout: 45, hybrid: 50,
};

// ─── Pure helper functions (all at module level) ───

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function getWeightsForContext(regime: string, assetClass: string): Record<string, number> {
  const base = { ...(REGIME_WEIGHTS[regime] || REGIME_WEIGHTS.default) };
  const adj = ASSET_CLASS_ADJUSTMENTS[assetClass] || {};
  for (const [k, v] of Object.entries(adj)) {
    base[k] = (base[k] || 0) + v;
  }
  const total = Object.values(base).reduce((s, v) => s + v, 0);
  if (total > 0) {
    for (const k of Object.keys(base)) base[k] /= total;
  }
  return base;
}

function getMacroRegime(feat: Record<string, unknown> | null): "bull" | "bear" | "choppy" {
  if (!feat) return "choppy";
  const sma20 = Number(feat.sma_20 || 0);
  const sma50 = Number(feat.sma_50 || 0);
  if (sma20 <= 0 || sma50 <= 0) return "choppy";
  const spread = Math.abs(sma20 - sma50) / sma50;
  if (spread < 0.015) return "choppy";
  return sma20 > sma50 ? "bull" : "bear";
}

function computeMarketStructure(features: Record<string, unknown>): number {
  let score = 50;
  const trendStrength = Number(features.trend_strength || 0);
  const support = Number(features.support_level || 0);
  const resistance = Number(features.resistance_level || 0);
  const price = Number(features.current_price || features.sma_20 || 0);
  score += clamp(trendStrength * 30, -25, 25);
  if (support > 0 && resistance > 0 && price > 0) {
    const range = resistance - support;
    if (range > 0) {
      const position = (price - support) / range;
      score += position > 0.7 ? -10 : position < 0.3 ? 10 : 0;
    }
  }
  if (Number(features.sma_50) > 0 && Number(features.sma_200) > 0) {
    score += Number(features.sma_50) > Number(features.sma_200) ? 8 : -8;
  }
  return clamp(score, 0, 100);
}

function computeMomentum(features: Record<string, unknown>): number {
  let score = 50;
  const rsi = Number(features.rsi_14 || 50);
  const macdHist = Number(features.macd_histogram || 0);
  const momentumScore = Number(features.momentum_score || 50);
  if (rsi > 50 && rsi < 70) score += 15;
  else if (rsi > 70) score -= 10;
  else if (rsi < 30) score -= 10;
  else if (rsi >= 30 && rsi < 50) score += 5;
  score += clamp(macdHist * 5, -15, 15);
  score += (momentumScore - 50) * 0.3;
  return clamp(score, 0, 100);
}

function computeVolatilitySuitability(features: Record<string, unknown>, strategyFamily: string): number {
  const volRegime = String(features.volatility_regime || "normal");
  const atr = Number(features.atr_14 || 0);
  const price = Number(features.current_price || features.sma_20 || 1);
  const atrPercent = price > 0 ? (atr / price) * 100 : 2;
  const targetVol: Record<string, number> = {
    momentum: 2.5, breakout: 3.0, mean_reversion: 1.5, trend_following: 2.0, hybrid: 2.0,
  };
  const target = targetVol[strategyFamily] || 2.0;
  let score = 100 - Math.abs(atrPercent - target) * 15;
  if (volRegime === "extreme" && strategyFamily !== "breakout") score -= 15;
  if (volRegime === "low" && strategyFamily === "breakout") score -= 10;
  return clamp(score, 0, 100);
}

function computeStrategyConfluence(features: Record<string, unknown>, strategyFamily: string): number {
  let score = 50;
  const regime = String(features.market_regime || "undefined");
  const trendDir = String(features.trend_direction || "sideways");
  const affinities: Record<string, string[]> = {
    momentum: ["bullish"], breakout: ["compression", "ranging"], mean_reversion: ["ranging"],
    trend_following: ["bullish", "bearish"], hybrid: ["bullish", "ranging", "volatile"],
  };
  if ((affinities[strategyFamily] || []).includes(regime)) score += 25;
  else score -= 10;
  if (strategyFamily === "momentum" && trendDir === "up") score += 10;
  if (strategyFamily === "mean_reversion" && trendDir === "sideways") score += 10;
  return clamp(score, 0, 100);
}

function computeRiskReward(expectedR: number, targets: number[], entryPrice: number, stopLoss: number): number {
  const rrBase = Math.min(100, (expectedR / 3.0) * 100) * 0.70;
  let targetRealism = 50;
  if (targets.length > 0) {
    const stopDist = Math.abs(entryPrice - stopLoss);
    if (stopDist > 0) {
      const ratios = targets.map(t => Math.abs(t - entryPrice) / stopDist);
      const avgRatio = ratios.reduce((s, r) => s + r, 0) / ratios.length;
      targetRealism = avgRatio >= 1.5 && avgRatio <= 5 ? 80 : avgRatio > 5 ? 40 : 60;
    }
  }
  return clamp(rrBase + targetRealism * 0.30, 0, 100);
}

function computeConfidenceScore(features: Record<string, unknown>): number {
  const dataQuality = Number(features.sma_200) > 0 && Number(features.rsi_14) > 0 ? 80 : 50;
  const indicators = [features.rsi_14, features.macd, features.sma_20, features.atr_14];
  const validCount = indicators.filter(i => i !== null && i !== undefined).length;
  const featureConsistency = (validCount / indicators.length) * 100;
  const histSample = Number(features.trend_strength || 0) > 0.3 ? 75 : 55;
  const regimeStability = Number(features.regime_confidence || 50);
  return clamp(
    0.30 * dataQuality + 0.25 * featureConsistency + 0.25 * histSample + 0.20 * regimeStability,
    0, 100
  );
}

function computeStrategyModifier(perfData: Record<string, unknown> | null): number {
  if (!perfData) return 0;
  const winRate = Number(perfData.win_rate || 0);
  const avgR = Number(perfData.avg_r_multiple || 0);
  if (winRate > 60 && avgR > 1.0) return 5;
  if (winRate < 40) return -5;
  return 0;
}

function computeRegimeModifier(regimeConfidence: number): number {
  if (regimeConfidence > 75) return 4;
  if (regimeConfidence > 50) return 1;
  if (regimeConfidence < 30) return -4;
  return 0;
}

function computeHistoricalModifier(perfData: Record<string, unknown> | null): number {
  if (!perfData) return 0;
  const totalTrades = Number(perfData.total_trades || 0);
  const profitFactor = Number(perfData.profit_factor || 0);
  if (totalTrades >= 20 && profitFactor > 1.5) return 4;
  if (totalTrades >= 10 && profitFactor > 1.2) return 2;
  if (totalTrades >= 10 && profitFactor < 0.8) return -3;
  return 0;
}

function macdMomentumDirection(features: Record<string, unknown>): number {
  const hist = Number(features.macd_histogram || 0);
  const histPrev = Number(features.macd_histogram_prev || hist * 0.9);
  return hist - histPrev;
}

function volumeConfirmation(features: Record<string, unknown>): number {
  const volume = Number(features.volume || 0);
  const volumeSma20 = Number(features.volume_sma_20 || volume);
  if (volumeSma20 <= 0) return 50;
  const ratio = volume / volumeSma20;
  if (ratio > 1.5) return 85;
  if (ratio > 1.2) return 70;
  if (ratio > 0.8) return 50;
  if (ratio > 0.5) return 35;
  return 20;
}

function srProximityScore(features: Record<string, unknown>, direction: string): number {
  const price = Number(features.current_price || features.sma_20 || 0);
  const support = Number(features.support_level || 0);
  const resistance = Number(features.resistance_level || 0);
  if (price <= 0 || support <= 0 || resistance <= 0) return 50;
  const distToResistance = (resistance - price) / price;
  const distToSupport = (price - support) / price;
  if (direction === "long") {
    if (distToResistance < 0.005) return 20;
    if (distToResistance < 0.015) return 35;
    if (distToSupport < 0.02) return 80;
    return 55;
  }
  if (distToSupport < 0.005) return 20;
  if (distToSupport < 0.015) return 35;
  if (distToResistance < 0.02) return 80;
  return 55;
}

function computeMacdConfirmation(features: Record<string, unknown>, direction: string): number {
  const mom = macdMomentumDirection(features);
  if (direction === "long") return mom > 0.01 ? 80 : mom < -0.01 ? 25 : 50;
  return mom < -0.01 ? 80 : mom > 0.01 ? 25 : 50;
}

function generateSetups(features: Record<string, unknown>, direction: string): { entry: number; sl: number; targets: number[] }[] {
  const price = Number(features.current_price || features.sma_20 || 0);
  if (price <= 0) return [];
  const atr = Number(features.atr_14 || price * 0.02);
  const support = Number(features.support_level || 0);
  const resistance = Number(features.resistance_level || 0);

  if (direction === "long") {
    // For long: SL must be BELOW entry. Use support only if it's below price.
    const validSupport = support > 0 && support < price ? support : 0;
    let sl = validSupport > 0
      ? Math.max(validSupport, price - atr * 1.5)  // tighter of support vs 1.5 ATR
      : price - atr * 1.5;                          // fallback: 1.5 ATR below
    // Safety: ensure SL is always below entry by at least 0.5 ATR
    if (sl >= price) sl = price - atr * 1.0;
    // Absolute floor
    if (sl >= price - 0.01) sl = price - Math.max(atr * 0.5, price * 0.005);

    const validResistance = resistance > price ? resistance : price + atr * 3;
    return [{
      entry: price,
      sl: +sl.toFixed(4),
      targets: [+(price + atr * 2).toFixed(4), +(price + atr * 3).toFixed(4), +validResistance.toFixed(4)],
    }];
  }

  // Short: SL must be ABOVE entry. Use resistance only if it's above price.
  const validResistance = resistance > 0 && resistance > price ? resistance : 0;
  let sl = validResistance > 0
    ? Math.min(validResistance, price + atr * 1.5)
    : price + atr * 1.5;
  // Safety: ensure SL is always above entry by at least 0.5 ATR
  if (sl <= price) sl = price + atr * 1.0;
  if (sl <= price + 0.01) sl = price + Math.max(atr * 0.5, price * 0.005);

  const validSupport = support > 0 && support < price ? support : price - atr * 3;
  return [{
    entry: price,
    sl: +sl.toFixed(4),
    targets: [+(price - atr * 2).toFixed(4), +(price - atr * 3).toFixed(4), +validSupport.toFixed(4)],
  }];
}

function determineDirection(features: Record<string, unknown>): string | null {
  const trend = String(features.trend_direction || "sideways");
  const rsi = Number(features.rsi_14 || 50);
  const macdHist = Number(features.macd_histogram || 0);
  const trendStrength = Number(features.trend_strength || 0);
  if (trendStrength < 0.2) return null;
  let longScore = 0, shortScore = 0;
  if (trend === "up") longScore += 2; else if (trend === "down") shortScore += 2;
  if (rsi > 55) longScore += 1; else if (rsi < 45) shortScore += 1;
  if (macdHist > 0) longScore += 1; else if (macdHist < 0) shortScore += 1;
  if (Math.abs(longScore - shortScore) < 2) return null;
  return longScore > shortScore ? "long" : "short";
}

function determineBestStrategy(features: Record<string, unknown>): string {
  const regime = String(features.market_regime || 'undefined');
  const map: Record<string, string> = {
    // Bullish regimes
    bullish: 'momentum',
    trending_bullish: 'momentum',
    overbought: 'mean_reversion',
    bull_market: 'momentum',
    // Bearish regimes
    bearish: 'trend_following',
    bear_market: 'trend_following',
    trending_bearish: 'trend_following',
    oversold: 'mean_reversion',
    // Neutral/other
    ranging: 'mean_reversion',
    volatile: 'breakout',
    compression: 'breakout',
    elevated: 'breakout',
  };
  return map[regime] || 'hybrid';
}

async function fetchFearGreedScore(): Promise<number> {
  try {
    const r = await fetch("https://api.alternative.me/fng/?limit=1", {
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) { await r.text().catch(() => {}); return 50; }
    const d = await r.json();
    return parseInt(d?.data?.[0]?.value ?? "50") || 50;
  } catch {
    return 50;
  }
}

async function fetchVIXScore(alpacaKeyId: string, alpacaSecret: string): Promise<number> {
  try {
    const r = await fetch(
      "https://data.alpaca.markets/v2/stocks/VIXY/bars?timeframe=1Day&limit=2&feed=iex",
      {
        headers: {
          "APCA-API-KEY-ID": alpacaKeyId,
          "APCA-API-SECRET-KEY": alpacaSecret,
        },
        signal: AbortSignal.timeout(3000),
      }
    );
    if (!r.ok) return 50;
    const d = await r.json();
    const bars = d?.bars || [];
    const vixy = bars.length > 0 ? parseFloat(bars[bars.length - 1].c ?? "0") : 0;
    if (vixy <= 0) return 50;
    const vixEquiv = vixy * 0.9;
    if (vixEquiv < 12) return 85;
    if (vixEquiv < 17) return 70;
    if (vixEquiv < 25) return 50;
    if (vixEquiv < 35) return 30;
    return 15;
  } catch {
    return 50;
  }
}

// ─── AI Grading via Anthropic Claude ───

async function gradeSignalWithAI(
  symbol: string,
  direction: string,
  strategyFamily: string,
  regime: string,
  subscores: Record<string, number>,
  finalScore: number,
  expectedR: number,
  features: Record<string, unknown>,
): Promise<{ grade: string; rationale: string } | null> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return null; // No key → skip AI filter

  const context = {
    symbol, direction, strategy: strategyFamily, regime,
    final_score: finalScore, expected_r: expectedR,
    rsi_14: features.rsi_14, macd: features.macd, macd_histogram: features.macd_histogram,
    atr_14: features.atr_14, trend_strength: features.trend_strength,
    trend_direction: features.trend_direction, volatility_regime: features.volatility_regime,
    sma_20: features.sma_20, sma_50: features.sma_50, sma_200: features.sma_200,
    momentum_score: features.momentum_score, regime_confidence: features.regime_confidence,
    volume_ratio: features.volume_ratio,
    subscores,
  };

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 300,
        messages: [{
          role: "user",
          content: `You are a Senior Quantitative Analyst. Evaluate this trading signal and respond ONLY with pure JSON (no markdown, no code blocks):
{"grade": "A|B|C", "rationale": "your reasoning"}

Grades: A = High conviction setup, B = Acceptable but watch closely, C = Risky / likely false breakout — reject.

Signal data:
${JSON.stringify(context, null, 2)}

Respond with JSON only.`,
        }],
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!resp.ok) {
      console.warn(`[signal-engine] Anthropic API ${resp.status} — bypassing AI filter`);
      return null;
    }

    const result = await resp.json();
    const text = result?.content?.[0]?.text || "";
    const cleaned = text.replace(/```json\s*/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    const grade = String(parsed.grade || "B").toUpperCase();
    const rationale = String(parsed.rationale || "No rationale provided");

    if (!["A", "B", "C"].includes(grade)) return { grade: "B", rationale };
    return { grade, rationale };
  } catch (err) {
    console.warn("[signal-engine] AI grading failed, bypassing:", err instanceof Error ? err.message : "unknown");
    return null; // Fail-open: approve mathematically
  }
}

// ─── Main Handler ───

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });


  const authHeader = req.headers.get("Authorization") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const isServiceRole = authHeader === `Bearer ${serviceKey}`;

  try {
    // Single body parse
    const body = await req.json().catch(() => ({}));
    const {
      symbols,
      min_score = 70,
      min_r = 1.8,
      min_confidence = 60,
      max_signals = 3,
      operator_mode = false,
    } = body as {
      symbols?: string[];
      min_score?: number;
      min_r?: number;
      min_confidence?: number;
      max_signals?: number;
      operator_mode?: boolean;
    };

    let user_id = body.user_id as string | undefined;

    if (isServiceRole && user_id) {
      // Trusted call from operator-mode — use user_id from body
    } else {
      // Regular call — derive user_id from JWT
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        anonKey,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user: authUser }, error: authError } = await userClient.auth.getUser();
      if (authError || !authUser) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      user_id = authUser.id;
    }

    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const alpacaKeyId = Deno.env.get("ALPACA_API_KEY_ID") ?? "";
    const alpacaSecret = Deno.env.get("ALPACA_API_SECRET_KEY") ?? "";

    // Fetch macro sentiment — both are optional with safe fallbacks
    const [fearGreedScore, vixScore] = await Promise.all([
      fetchFearGreedScore(),
      fetchVIXScore(alpacaKeyId, alpacaSecret),
    ]);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ─── Rate limit: max 10 calls per minute per user ───
    const rateLimitKey = `signal-engine:${user_id}:${Math.floor(Date.now() / 60000)}`;
    const { data: rateData } = await supabase
      .from('rate_limit_log')
      .select('count')
      .eq('key', rateLimitKey)
      .maybeSingle();
    const currentCount = (rateData as { count: number } | null)?.count ?? 0;
    if (currentCount >= 10) {
      return jsonRes({ error: "Rate limit exceeded. Try again in a minute." }, 429);
    }
    await supabase.from('rate_limit_log').upsert({
      key: rateLimitKey,
      count: currentCount + 1,
      expires_at: new Date(Date.now() + 60000).toISOString(),
    } as Record<string, unknown>);

    // ─── Load symbol sectors from DB ───
    const { data: sectorData } = await supabase
      .from('symbol_sectors')
      .select('symbol, sector')
      .eq('is_active', true);
    const SYMBOL_SECTORS: Record<string, string> = Object.fromEntries(
      (sectorData ?? []).map((r: { symbol: string; sector: string }) => [r.symbol, r.sector])
    );

    // ─── Expire stale signals (older than 24h) ───
    const expiryThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await supabase
      .from("signals")
      .update({
        status: "invalidated",
        invalidation_reason: "Signal expired: market conditions may have changed (>24h old)",
        updated_at: new Date().toISOString(),
      } as Record<string, unknown>)
      .eq("user_id", user_id)
      .eq("status", "active")
      .lt("created_at", expiryThreshold);

    const targetSymbols: string[] = Array.isArray(symbols) && symbols.length > 0 ? symbols : [];

    // Fetch open positions to avoid duplicating signals
    const { data: openPositions } = await supabase
      .from("positions")
      .select("symbol, direction")
      .eq("user_id", user_id)
      .eq("status", "open");

    const openPositionMap = new Map<string, string>();
    const sectorCount: Record<string, number> = {};
    for (const pos of openPositions || []) {
      openPositionMap.set(pos.symbol, pos.direction);
      const sector = SYMBOL_SECTORS[pos.symbol] || "other";
      sectorCount[sector] = (sectorCount[sector] || 0) + 1;
    }

    // ─── OPERATOR MODE: Check daily trade cap and cooldown ───
    if (operator_mode) {
      const { data: userSettings } = await supabase
        .from("user_settings")
        .select("max_trades_per_day, loss_cooldown_count, consecutive_losses, trades_today, last_trade_date")
        .eq("user_id", user_id)
        .maybeSingle();

      if (userSettings) {
        const maxTrades = Number(userSettings.max_trades_per_day || 3);
        const cooldownLimit = Number(userSettings.loss_cooldown_count || 2);
        const consLosses = Number(userSettings.consecutive_losses || 0);
        const today = new Date().toISOString().split("T")[0];
        const trades = userSettings.last_trade_date === today ? Number(userSettings.trades_today || 0) : 0;

        if (consLosses >= cooldownLimit) {
          return jsonRes({
            signals: [], count: 0, rejected: 0, blocked: true,
            reason: `Loss cooldown active: ${consLosses} consecutive losses (limit: ${cooldownLimit}).`,
          });
        }
        if (trades >= maxTrades) {
          return jsonRes({
            signals: [], count: 0, rejected: 0, blocked: true,
            reason: `Daily trade cap reached: ${trades}/${maxTrades}`,
          });
        }
      }
    }

    // ─── Expand universe: use ALL symbols with fresh features in DB ───
    let querySymbols = targetSymbols;
    if (targetSymbols.length < 10) {
      // Fetch all distinct symbols that have features computed
      const { data: allFeatureSymbols } = await supabase
        .from("market_features")
        .select("symbol")
        .eq("timeframe", "1d");
      const dbSymbols = (allFeatureSymbols || []).map((r: { symbol: string }) => r.symbol);
      querySymbols = [...new Set([...targetSymbols, ...dbSymbols])];
      console.log(`[signal-engine] Expanded universe: ${targetSymbols.length} watchlist → ${querySymbols.length} total (all DB features)`);
    }

    // ─── Fetch market features ───
    let featuresQuery = supabase.from("market_features").select("*").eq("timeframe", "1d");
    if (querySymbols.length > 0) featuresQuery = featuresQuery.in("symbol", querySymbols);
    const { data: allFeaturesData, error: featErr } = await featuresQuery;

    if (featErr) {
      console.error("[signal-engine] Features query error:", featErr.message);
      return jsonRes({ signals: [], count: 0, rejected: 0, error: featErr.message });
    }
    if (!allFeaturesData || allFeaturesData.length === 0) {
      return jsonRes({ signals: [], count: 0, rejected: 0, message: "No market features available. Run compute-indicators first." });
    }

    // Filter stale features (> 4h old)
    const featuresCutoff = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    const featuresData = allFeaturesData.filter(
      (f: Record<string, unknown>) => f.computed_at && String(f.computed_at) > featuresCutoff
    );
    const staleCount = allFeaturesData.length - featuresData.length;
    if (staleCount > 0) {
      console.warn(`[signal-engine] Filtered ${staleCount} stale features. ${featuresData.length} fresh remaining.`);
    }
    if (featuresData.length === 0) {
      return jsonRes({
        signals: [], count: 0, rejected: 0,
        message: `All ${staleCount} features are stale (>4h). Run compute-indicators first.`,
      });
    }

    // ─── Fetch prices from market_cache ───
    const featureSymbols = featuresData.map((f: Record<string, unknown>) => String(f.symbol));
    const { data: priceData } = await supabase
      .from("market_cache")
      .select("symbol, price")
      .in("symbol", featureSymbols);
    const priceMap: Record<string, number> = {};
    for (const p of priceData || []) {
      priceMap[p.symbol] = Number(p.price);
    }

    // ─── Fetch SPY and BTC features for macro regime (with try/catch) ───
    let spyFeat: Record<string, unknown> | null = null;
    let btcFeat: Record<string, unknown> | null = null;
    try {
      const { data } = await supabase
        .from("market_features")
        .select("sma_20, sma_50, trend_direction, trend_strength")
        .eq("symbol", "SPY")
        .eq("timeframe", "1d")
        .maybeSingle();
      spyFeat = data as Record<string, unknown> | null;
    } catch (e) {
      console.warn("[signal-engine] SPY features fetch failed:", e);
    }
    try {
      const { data } = await supabase
        .from("market_features")
        .select("sma_20, sma_50, trend_direction, trend_strength")
        .eq("symbol", "BTC/USD")
        .eq("timeframe", "1d")
        .maybeSingle();
      btcFeat = data as Record<string, unknown> | null;
    } catch (e) {
      console.warn("[signal-engine] BTC features fetch failed:", e);
    }

    const equityMacro = getMacroRegime(spyFeat);
    const cryptoMacro = getMacroRegime(btcFeat);

    // ─── Fetch strategy performance ───
    const { data: perfData } = await supabase
      .from("strategy_performance")
      .select("*")
      .eq("user_id", user_id);
    const perfMap: Record<string, Record<string, unknown>> = {};
    for (const p of perfData || []) {
      perfMap[`${p.strategy_family}:${p.market_regime}`] = p as Record<string, unknown>;
    }

    // Fetch user scoring weights
    const { data: userWeights } = await supabase
      .from("scoring_weights")
      .select("*")
      .eq("user_id", user_id)
      .eq("is_active", true)
      .limit(1);

    // Fetch correlation matrix
    const { data: corrData } = await supabase
      .from("correlation_matrix")
      .select("symbol_a, symbol_b, correlation");
    const correlationMap = new Map<string, number>();
    for (const c of corrData || []) {
      correlationMap.set(`${c.symbol_a}:${c.symbol_b}`, Number(c.correlation));
      correlationMap.set(`${c.symbol_b}:${c.symbol_a}`, Number(c.correlation));
    }

    // ─── Score each symbol ───
    const candidates: { signal: Record<string, unknown>; finalScore: number; confidenceScore: number }[] = [];
    const rejections: { asset: string; reason: string }[] = [];

    for (const feat of featuresData) {
      const f = feat as Record<string, unknown>;
      const symbol = String(f.symbol);
      const assetClass = String(f.asset_type || "stock");
      const regime = String(f.market_regime || "undefined");

      // Price fallback chain
      const currentPrice =
        priceMap[symbol] ||
        Number(f.sma_20 || 0) ||
        Number(f.ema_12 || 0);

      if (currentPrice <= 0) {
        rejections.push({ asset: symbol, reason: "No price available in market_cache or features" });
        continue;
      }

      // Operator mode: block unclear regimes
      if (operator_mode && UNCLEAR_REGIMES.has(regime)) {
        rejections.push({ asset: symbol, reason: `Unclear regime: ${regime}` });
        continue;
      }

      const enriched: Record<string, unknown> = { ...f, current_price: currentPrice };
      const direction = determineDirection(enriched);
      if (!direction) {
        rejections.push({ asset: symbol, reason: "No clear direction conviction" });
        continue;
      }

      // Macro regime filter
      const isCrypto = assetClass === "crypto";
      const activeMacro = isCrypto ? cryptoMacro : equityMacro;

      if (activeMacro === "choppy") {
        rejections.push({ asset: symbol, reason: `Macro choppy (${isCrypto ? "BTC" : "SPY"} SMA20/50 spread < 1.5%)` });
        continue;
      }
      if (activeMacro === "bull" && direction === "short") {
        rejections.push({ asset: symbol, reason: `Counter-trend short blocked: macro is bullish` });
        continue;
      }
      if (activeMacro === "bear" && direction === "long") {
        rejections.push({ asset: symbol, reason: `Counter-trend long blocked: macro is bearish` });
        continue;
      }

      // ─── Internal regime vs direction consistency ───
      const BULLISH_REGIMES = new Set([
        'bullish', 'trending_bullish', 'overbought', 'bull_market'
      ]);
      const BEARISH_REGIMES = new Set([
        'bearish', 'bear_market', 'oversold', 'trending_bearish'
      ]);
      if (operator_mode) {
        if (BULLISH_REGIMES.has(regime) && direction === 'short') {
          rejections.push({
            asset: symbol,
            reason: `Regime/direction conflict: ${regime} regime with short direction`
          });
          continue;
        }
        if (BEARISH_REGIMES.has(regime) && direction === 'long') {
          rejections.push({
            asset: symbol,
            reason: `Regime/direction conflict: ${regime} regime with long direction`
          });
          continue;
        }
      }

      // Skip if already has position in same direction
      if (openPositionMap.has(symbol) && openPositionMap.get(symbol) === direction) {
        rejections.push({ asset: symbol, reason: `Already has open ${direction} position` });
        continue;
      }

      // Sector cap
      const symbolSector = SYMBOL_SECTORS[symbol] || "other";
      if ((sectorCount[symbolSector] || 0) >= MAX_SECTOR_POSITIONS) {
        rejections.push({ asset: symbol, reason: `Sector cap: ${symbolSector} has ${sectorCount[symbolSector]} positions` });
        continue;
      }

      const strategyFamily = determineBestStrategy(enriched);
      const setups = generateSetups(enriched, direction);
      if (setups.length === 0) {
        rejections.push({ asset: symbol, reason: "No valid setup generated" });
        continue;
      }

      const setup = setups[0];

      // Final safety: reject if SL is on wrong side of entry
      if (direction === 'long' && setup.sl >= setup.entry) {
        rejections.push({ asset: symbol, reason: `Invalid SL for long: sl=${setup.sl} >= entry=${setup.entry}` });
        continue;
      }
      if (direction === 'short' && setup.sl <= setup.entry) {
        rejections.push({ asset: symbol, reason: `Invalid SL for short: sl=${setup.sl} <= entry=${setup.entry}` });
        continue;
      }

      const stopDist = Math.abs(setup.entry - setup.sl);
      if (stopDist <= 0) continue;

      const avgTarget = setup.targets.reduce((s: number, t: number) => s + t, 0) / setup.targets.length;
      const targetDist = Math.abs(avgTarget - setup.entry);
      const expectedR = +(targetDist / stopDist).toFixed(2);

      if (expectedR < min_r) {
        rejections.push({ asset: symbol, reason: `R:R ${expectedR} < ${min_r}` });
        continue;
      }

      // Validate stop distance (max 10%)
      if (stopDist / currentPrice > 0.10) {
        rejections.push({ asset: symbol, reason: `Stop distance ${((stopDist / currentPrice) * 100).toFixed(1)}% > 10%` });
        continue;
      }

      // ─── Compute all 11 subscores ───
      const subscores: Record<string, number> = {
        market_structure: computeMarketStructure(enriched),
        momentum: computeMomentum(enriched),
        volatility_suitability: computeVolatilitySuitability(enriched, strategyFamily),
        strategy_confluence: computeStrategyConfluence(enriched, strategyFamily),
        macro_context: vixScore,
        sentiment_flow: (() => {
          if (direction === 'short') {
            if (fearGreedScore <= 20) return 80;
            if (fearGreedScore <= 35) return 65;
            if (fearGreedScore <= 50) return 50;
            if (fearGreedScore <= 70) return 40;
            return 25;
          } else {
            if (fearGreedScore >= 80) return 80;
            if (fearGreedScore >= 65) return 65;
            if (fearGreedScore >= 50) return 50;
            if (fearGreedScore >= 30) return 40;
            return 25;
          }
        })(),
        risk_reward: computeRiskReward(expectedR, setup.targets, setup.entry, setup.sl),
        historical_performance: STRATEGY_PRIORS[strategyFamily] || 50,
        macd_confirmation: computeMacdConfirmation(enriched, direction),
        volume_confirmation: volumeConfirmation(enriched),
        sr_proximity: srProximityScore(enriched, direction),
      };

      // Blend historical performance with real data if available
      const perfKey = `${strategyFamily}:${regime}`;
      const perf = perfMap[perfKey] || perfMap[`${strategyFamily}:all`] || null;
      if (perf && Number(perf.total_trades || 0) >= 5) {
        const wr = Number(perf.win_rate || 0);
        const totalTrades = Number(perf.total_trades || 0);
        const blendWeight = Math.min(totalTrades / 30, 1.0);
        const prior = STRATEGY_PRIORS[strategyFamily] || 50;
        subscores.historical_performance = clamp(
          prior * (1 - blendWeight) + wr * blendWeight, 0, 100
        );
      }

      // Get weights (regime + asset-class adjusted)
      const weights = getWeightsForContext(regime, assetClass);

      // Override with user custom weights if set
      if (userWeights && userWeights.length > 0) {
        const uw = userWeights[0] as Record<string, unknown>;
        const totalUW =
          Number(uw.structure_weight || 0) + Number(uw.momentum_weight || 0) +
          Number(uw.volatility_weight || 0) + Number(uw.strategy_weight || 0) +
          Number(uw.macro_weight || 0) + Number(uw.sentiment_weight || 0) +
          Number(uw.rr_weight || 0) + Number(uw.historical_weight || 0);
        if (totalUW > 0) {
          weights.market_structure = Number(uw.structure_weight || 0) / totalUW;
          weights.momentum = Number(uw.momentum_weight || 0) / totalUW;
          weights.volatility_suitability = Number(uw.volatility_weight || 0) / totalUW;
          weights.strategy_confluence = Number(uw.strategy_weight || 0) / totalUW;
          weights.macro_context = Number(uw.macro_weight || 0) / totalUW;
          weights.sentiment_flow = Number(uw.sentiment_weight || 0) / totalUW;
          weights.risk_reward = Number(uw.rr_weight || 0) / totalUW;
          weights.historical_performance = Number(uw.historical_weight || 0) / totalUW;
        }
      }

      // Weighted average of subscores (subscores are 0-100, weights sum to ~1)
      let baseScore = 0;
      let totalWeight = 0;
      for (const [k, w] of Object.entries(weights)) {
        if (subscores[k] === undefined) continue;
        baseScore += w * subscores[k];
        totalWeight += w;
      }
      if (totalWeight > 0) baseScore = baseScore / totalWeight;

      // Apply modifiers
      const stratMod = computeStrategyModifier(perf);
      const regimeMod = computeRegimeModifier(Number(f.regime_confidence || 50));
      const histMod = computeHistoricalModifier(perf);

      const finalScore = clamp(baseScore + stratMod + regimeMod + histMod, 0, 100);

      if (finalScore < min_score) {
        rejections.push({ asset: symbol, reason: `Score ${finalScore.toFixed(1)} < ${min_score}` });
        continue;
      }

      const confidenceScore = computeConfidenceScore(enriched);

      if (confidenceScore < min_confidence) {
        rejections.push({ asset: symbol, reason: `Confidence ${confidenceScore.toFixed(1)} < ${min_confidence}` });
        continue;
      }

      // ─── AI Grading Filter (Anthropic Claude 3.5 Haiku) ───
      const aiResult = await gradeSignalWithAI(
        symbol, direction, strategyFamily, regime,
        subscores, finalScore, expectedR, enriched,
      );

      let aiGrade: string | null = null;
      let aiRationale: string | null = null;

      if (aiResult) {
        aiGrade = aiResult.grade;
        aiRationale = aiResult.rationale;

        if (aiResult.grade === "C") {
          rejections.push({ asset: symbol, reason: `AI Rejection (Grade C): ${aiResult.rationale}` });
          continue;
        }
      }
      // If aiResult is null (API down/no key), fail-open: approve mathematically

      // Build explanation
      const sortedSubscores = Object.entries(subscores).sort((a, b) => b[1] - a[1]);
      const explanation = {
        top_contributors: sortedSubscores.slice(0, 3).map(([k, v]) => ({ factor: k, score: +v.toFixed(1) })),
        modifiers: {
          strategy: { value: stratMod, reason: perf ? `Based on ${Number(perf.total_trades || 0)} historical trades` : "No historical data" },
          regime: { value: regimeMod, reason: `Regime: ${regime}, confidence: ${Number(f.regime_confidence || 0).toFixed(0)}%` },
          historical: { value: histMod, reason: perf ? `PF: ${Number(perf.profit_factor || 0).toFixed(2)}` : "Insufficient data" },
        },
        summary: `Signal for ${symbol} ${direction.toUpperCase()} | ${regime} regime | ${strategyFamily} strategy. Top: ${sortedSubscores[0][0]} (${sortedSubscores[0][1].toFixed(0)}).`,
      };

      // Build signal object — ONLY columns that exist in the signals table
      const signal: Record<string, unknown> = {
        user_id,
        asset: symbol,
        asset_class: assetClass,
        strategy_family: strategyFamily,
        market_regime: regime,
        direction,
        entry_price: +setup.entry.toFixed(4),
        stop_loss: +setup.sl.toFixed(4),
        targets: setup.targets,
        expected_r_multiple: expectedR,
        opportunity_score: +finalScore.toFixed(2),
        confidence_score: +confidenceScore.toFixed(2),
        score_breakdown: subscores,
        modifiers_applied: { strategy: stratMod, regime: regimeMod, historical: histMod },
        weight_profile_used: weights,
        reasoning: explanation.summary,
        explanation,
        status: "active",
        ai_grade: aiGrade,
        ai_rationale: aiRationale,
      };

      candidates.push({ signal, finalScore, confidenceScore });
    }

    // Sort by score descending
    candidates.sort((a, b) => b.finalScore - a.finalScore);

    // ANTI-OVERTRADING: Remove correlated signals (keep highest scored)
    const selectedSymbols: string[] = [];
    const filteredCandidates: typeof candidates = [];
    for (const c of candidates) {
      const symbol = String(c.signal.asset);
      let tooCorrelated = false;
      for (const existing of selectedSymbols) {
        const corr = correlationMap.get(`${symbol}:${existing}`) || 0;
        if (Math.abs(corr) > 0.75) {
          tooCorrelated = true;
          rejections.push({ asset: symbol, reason: `High correlation (${(corr * 100).toFixed(0)}%) with ${existing}` });
          break;
        }
      }
      if (!tooCorrelated) {
        filteredCandidates.push(c);
        selectedSymbols.push(symbol);
      }
    }

    // Take top N
    const finalCandidates = filteredCandidates.slice(0, max_signals);
    const generatedSignals = finalCandidates.map(c => c.signal);

    // Insert into DB
    if (generatedSignals.length > 0) {
      const { error: insertError } = await supabase.from("signals").insert(generatedSignals);
      if (insertError) {
        console.error("[signal-engine] Insert error:", insertError.message);
        // Return signals anyway even if insert fails
        return jsonRes({
          signals: generatedSignals,
          count: generatedSignals.length,
          rejected: rejections.length,
          rejections: rejections.slice(0, 20),
          insert_error: insertError.message,
          operator_mode,
          filters_applied: { min_score, min_r, min_confidence, max_signals },
          macro_context: { equity: equityMacro, crypto: cryptoMacro },
          universe_size: featuresData.length,
          sentiment: { fear_greed: fearGreedScore, vix_score: vixScore },
        });
      }
    }

    console.log(`[signal-engine] Generated ${generatedSignals.length} signals, rejected ${rejections.length}`);

    return jsonRes({
      signals: generatedSignals,
      count: generatedSignals.length,
      rejected: rejections.length,
      rejections: rejections.slice(0, 20),
      operator_mode,
      filters_applied: { min_score, min_r, min_confidence, max_signals },
      macro_context: { equity: equityMacro, crypto: cryptoMacro },
      universe_size: featuresData.length,
      watchlist_size: targetSymbols.length,
      universe_expanded: querySymbols.length > targetSymbols.length,
      sentiment: { fear_greed: fearGreedScore, vix_score: vixScore },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[signal-engine] Fatal error:", message);
    return jsonRes({ error: message, signals: [], count: 0, rejected: 0 }, 500);
  }
});
