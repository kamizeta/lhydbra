import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Weight Profiles by Regime ───
const REGIME_WEIGHTS: Record<string, Record<string, number>> = {
  bullish:        { market_structure: 0.18, momentum: 0.12, volatility_suitability: 0.06, strategy_confluence: 0.14, macro_context: 0.07, sentiment_flow: 0.08, risk_reward: 0.09, historical_performance: 0.07, macd_confirmation: 0.07, volume_confirmation: 0.06, sr_proximity: 0.06 },
  bearish:        { market_structure: 0.18, momentum: 0.11, volatility_suitability: 0.08, strategy_confluence: 0.14, macro_context: 0.09, sentiment_flow: 0.06, risk_reward: 0.10, historical_performance: 0.05, macd_confirmation: 0.07, volume_confirmation: 0.06, sr_proximity: 0.06 },
  ranging:        { market_structure: 0.14, momentum: 0.06, volatility_suitability: 0.10, strategy_confluence: 0.16, macro_context: 0.08, sentiment_flow: 0.08, risk_reward: 0.12, historical_performance: 0.06, macd_confirmation: 0.06, volume_confirmation: 0.06, sr_proximity: 0.08 },
  volatile:       { market_structure: 0.12, momentum: 0.08, volatility_suitability: 0.13, strategy_confluence: 0.13, macro_context: 0.06, sentiment_flow: 0.10, risk_reward: 0.12, historical_performance: 0.06, macd_confirmation: 0.07, volume_confirmation: 0.06, sr_proximity: 0.07 },
  compression:    { market_structure: 0.16, momentum: 0.08, volatility_suitability: 0.11, strategy_confluence: 0.16, macro_context: 0.07, sentiment_flow: 0.06, risk_reward: 0.10, historical_performance: 0.06, macd_confirmation: 0.07, volume_confirmation: 0.06, sr_proximity: 0.07 },
  default:        { market_structure: 0.16, momentum: 0.09, volatility_suitability: 0.08, strategy_confluence: 0.15, macro_context: 0.07, sentiment_flow: 0.08, risk_reward: 0.10, historical_performance: 0.08, macd_confirmation: 0.06, volume_confirmation: 0.06, sr_proximity: 0.07 },
};

const ASSET_CLASS_ADJUSTMENTS: Record<string, Record<string, number>> = {
  crypto:     { sentiment_flow: 0.04, volatility_suitability: 0.03, macro_context: -0.04, market_structure: -0.03 },
  stock:      { macro_context: 0.04, market_structure: 0.03, sentiment_flow: -0.04, volatility_suitability: -0.03 },
  commodity:  { macro_context: 0.04, momentum: 0.03, sentiment_flow: -0.04, strategy_confluence: -0.03 },
  forex:      { macro_context: 0.03, volatility_suitability: 0.02, historical_performance: -0.03, sentiment_flow: -0.02 },
};

// ─── OPERATOR MODE: Regimes where trading is blocked ───
const UNCLEAR_REGIMES = new Set(['undefined', 'transitional']);

function clamp(val: number, min: number, max: number) { return Math.max(min, Math.min(max, val)); }

function getWeightsForContext(regime: string, assetClass: string): Record<string, number> {
  const base = { ...(REGIME_WEIGHTS[regime] || REGIME_WEIGHTS.default) };
  const adj = ASSET_CLASS_ADJUSTMENTS[assetClass] || {};
  for (const [k, v] of Object.entries(adj)) {
    base[k] = (base[k] || 0) + v;
  }
  const total = Object.values(base).reduce((s, v) => s + v, 0);
  for (const k of Object.keys(base)) base[k] /= total;
  return base;
}

// ─── Subscore Computations ───

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
  const volRegime = String(features.volatility_regime || 'normal');
  const atr = Number(features.atr_14 || 0);
  const price = Number(features.current_price || features.sma_20 || 1);
  const atrPercent = price > 0 ? (atr / price) * 100 : 2;
  
  const targetVol: Record<string, number> = {
    momentum: 2.5, breakout: 3.0, mean_reversion: 1.5, trend_following: 2.0, hybrid: 2.0,
  };
  const target = targetVol[strategyFamily] || 2.0;
  const K = 15;
  let score = 100 - Math.abs(atrPercent - target) * K;
  
  if (volRegime === 'extreme' && strategyFamily !== 'breakout') score -= 15;
  if (volRegime === 'low' && strategyFamily === 'breakout') score -= 10;
  return clamp(score, 0, 100);
}

function computeStrategyConfluence(features: Record<string, unknown>, strategyFamily: string): number {
  let score = 50;
  const regime = String(features.market_regime || 'undefined');
  const trendDir = String(features.trend_direction || 'sideways');
  
  const affinities: Record<string, string[]> = {
    momentum: ['bullish'], breakout: ['compression', 'ranging'], mean_reversion: ['ranging'],
    trend_following: ['bullish', 'bearish'], hybrid: ['bullish', 'ranging', 'volatile'],
  };
  if ((affinities[strategyFamily] || []).includes(regime)) score += 25;
  else score -= 10;
  
  if (strategyFamily === 'momentum' && trendDir === 'up') score += 10;
  if (strategyFamily === 'mean_reversion' && trendDir === 'sideways') score += 10;
  return clamp(score, 0, 100);
}

function computeRiskReward(expectedR: number, targets: number[], entryPrice: number, stopLoss: number): number {
  const rrBase = Math.min(100, (expectedR / 3.0) * 100) * 0.70;
  
  let targetRealism = 50;
  if (targets.length > 0) {
    const distances = targets.map(t => Math.abs(t - entryPrice));
    const stopDist = Math.abs(entryPrice - stopLoss);
    if (stopDist > 0) {
      const ratios = distances.map(d => d / stopDist);
      const avgRatio = ratios.reduce((s, r) => s + r, 0) / ratios.length;
      targetRealism = avgRatio >= 1.5 && avgRatio <= 5 ? 80 : avgRatio > 5 ? 40 : 60;
    }
  }
  return clamp(rrBase + targetRealism * 0.30, 0, 100);
}

function computeConfidenceScore(features: Record<string, unknown>, regime: string): number {
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

// ─── Modifiers ───

function computeStrategyModifier(strategyFamily: string, regime: string, perfData: Record<string, unknown> | null): number {
  let mod = 0;
  if (perfData) {
    const winRate = Number(perfData.win_rate || 0);
    const avgR = Number(perfData.avg_r_multiple || 0);
    if (winRate > 60 && avgR > 1.0) mod += 5;
    else if (winRate < 40) mod -= 5;
  }
  return clamp(mod, -8, 8);
}

function computeRegimeModifier(regime: string, regimeConfidence: number): number {
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

// ─── Validated Scoring Factors (backtest-proven) ───

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
  if (direction === 'long') {
    if (distToResistance < 0.005) return 20;
    if (distToResistance < 0.015) return 35;
    if (distToSupport < 0.02) return 80;
    return 55;
  } else {
    if (distToSupport < 0.005) return 20;
    if (distToSupport < 0.015) return 35;
    if (distToResistance < 0.02) return 80;
    return 55;
  }
}

// ─── Setup Generation ───

function generateSetups(features: Record<string, unknown>, direction: string): { entry: number; sl: number; targets: number[] }[] {
  const price = Number(features.current_price || features.sma_20 || 0);
  if (price <= 0) return [];
  
  const atr = Number(features.atr_14 || price * 0.02);
  const support = Number(features.support_level || price - atr * 2);
  const resistance = Number(features.resistance_level || price + atr * 2);
  
  const setups: { entry: number; sl: number; targets: number[] }[] = [];
  
  if (direction === 'long') {
    setups.push({
      entry: price,
      sl: Math.max(support, price - atr * 1.5),
      targets: [
        +(price + atr * 2).toFixed(4),
        +(price + atr * 3).toFixed(4),
        +(resistance).toFixed(4),
      ],
    });
  } else {
    setups.push({
      entry: price,
      sl: Math.min(resistance, price + atr * 1.5),
      targets: [
        +(price - atr * 2).toFixed(4),
        +(price - atr * 3).toFixed(4),
        +(support).toFixed(4),
      ],
    });
  }
  return setups;
}

function determineDirection(features: Record<string, unknown>): string | null {
  const trend = String(features.trend_direction || 'sideways');
  const rsi = Number(features.rsi_14 || 50);
  const macdHist = Number(features.macd_histogram || 0);
  const trendStrength = Number(features.trend_strength || 0);

  // Too weak to trade
  if (trendStrength < 0.2) return null;

  let longScore = 0, shortScore = 0;
  if (trend === 'up') longScore += 2; else if (trend === 'down') shortScore += 2;
  if (rsi > 55) longScore += 1; else if (rsi < 45) shortScore += 1;
  if (macdHist > 0) longScore += 1; else if (macdHist < 0) shortScore += 1;

  // Need clear conviction — margin of at least 2 votes
  const margin = Math.abs(longScore - shortScore);
  if (margin < 2) return null;

  return longScore > shortScore ? 'long' : 'short';
}

function determineBestStrategy(features: Record<string, unknown>): string {
  const regime = String(features.market_regime || 'undefined');
  const map: Record<string, string> = {
    bullish: 'momentum', bearish: 'trend_following', ranging: 'mean_reversion',
    volatile: 'breakout', compression: 'breakout',
  };
  return map[regime] || 'hybrid';
}

// ─── Real Macro & Sentiment Data ───

async function fetchFearGreedScore(): Promise<number> {
  try {
    const r = await fetch("https://api.alternative.me/fng/?limit=1", {
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) return 50;
    const d = await r.json();
    return parseInt(d?.data?.[0]?.value ?? "50");
  } catch { return 50; }
}

async function fetchVIXScore(apiKey: string): Promise<number> {
  try {
    const r = await fetch(
      `https://api.twelvedata.com/price?symbol=VIX&apikey=${apiKey}`,
      { signal: AbortSignal.timeout(3000) }
    );
    if (!r.ok) return 50;
    const d = await r.json();
    const vix = parseFloat(d?.price ?? "20");
    if (vix < 12) return 85;
    if (vix < 17) return 70;
    if (vix < 25) return 50;
    if (vix < 35) return 30;
    return 15;
  } catch { return 50; }
}

const SYMBOL_SECTORS: Record<string, string> = {
  'AAPL': 'tech', 'MSFT': 'tech', 'NVDA': 'tech', 'GOOGL': 'tech', 'META': 'tech',
  'AMZN': 'tech', 'TSLA': 'tech', 'AMD': 'tech',
  'QQQ': 'tech_etf', 'SOXX': 'tech_etf', 'SMH': 'tech_etf',
  'SPY': 'broad_etf', 'VOO': 'broad_etf', 'IWM': 'broad_etf',
  'JPM': 'finance', 'BAC': 'finance', 'GS': 'finance', 'XLF': 'finance',
  'XLE': 'energy', 'CVX': 'energy', 'XOM': 'energy',
  'GLD': 'commodity', 'XAU/USD': 'commodity',
  'BTC/USD': 'crypto', 'ETH/USD': 'crypto',
  'EUR/USD': 'forex', 'GBP/USD': 'forex', 'USD/JPY': 'forex',
};
const MAX_SECTOR_POSITIONS = 2;

const EXTENDED_UNIVERSE: Record<string, string[]> = {
  stock: ["AAPL","MSFT","NVDA","META","AMZN","TSLA","GOOGL","AMD","AVGO",
          "PLTR","NFLX","CRM","ORCL","ADBE","QCOM","MU","INTC","ARM",
          "JPM","GS","BAC","V","MA","PYPL",
          "SPY","QQQ","IWM","XLK","XLF","XLE","GLD"],
  crypto: ["BTC/USD","ETH/USD","SOL/USD","BNB/USD","XRP/USD","DOGE/USD"],
  forex: ["EUR/USD","GBP/USD","USD/JPY","XAU/USD"],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { 
      symbols, 
      user_id, 
      // OPERATOR MODE: Stricter defaults
      min_score = 70, 
      min_r = 1.8, 
      min_confidence = 60,
      max_signals = 3,
      operator_mode = false,
    } = await req.json();
    if (!user_id) throw new Error("user_id required");

    const twelveKey = Deno.env.get("TWELVE_DATA_API_KEY") ?? "";
    const [fearGreedScore, vixScore] = await Promise.all([
      fetchFearGreedScore(),
      fetchVIXScore(twelveKey),
    ]);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ─── Expire stale signals (older than 24h) ───
    const expiryThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await supabase
      .from("signals")
      .update({
        status: "invalidated",
        invalidation_reason: "Signal expired: market conditions may have changed (>24h old)",
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user_id)
      .eq("status", "active")
      .lt("created_at", expiryThreshold);

    const targetSymbols = symbols && symbols.length > 0 ? symbols : [];

    // Fetch open positions to avoid duplicating signals
    const { data: openPositions } = await supabase
      .from("positions")
      .select("symbol, direction")
      .eq("user_id", user_id)
      .eq("status", "open");
    const openPositionMap = new Map<string, string>();
    const sectorCount: Record<string, number> = {};
    for (const pos of (openPositions || [])) {
      openPositionMap.set(pos.symbol, pos.direction);
      const sector = SYMBOL_SECTORS[pos.symbol] || 'other';
      sectorCount[sector] = (sectorCount[sector] || 0) + 1;
    }

    // OPERATOR MODE: Check daily trade cap and cooldown
    let tradesToday = 0;
    let consecutiveLosses = 0;
    let maxTradesPerDay = 3;
    let lossCooldownCount = 2;
    
    if (operator_mode) {
      const { data: userSettings } = await supabase
        .from("user_settings")
        .select("max_trades_per_day, loss_cooldown_count, consecutive_losses, trades_today, last_trade_date")
        .eq("user_id", user_id)
        .maybeSingle();
      
      if (userSettings) {
        maxTradesPerDay = Number(userSettings.max_trades_per_day || 3);
        lossCooldownCount = Number(userSettings.loss_cooldown_count || 2);
        consecutiveLosses = Number(userSettings.consecutive_losses || 0);
        
        const today = new Date().toISOString().split('T')[0];
        tradesToday = userSettings.last_trade_date === today ? Number(userSettings.trades_today || 0) : 0;
      }

      // Block if cooldown active
      if (consecutiveLosses >= lossCooldownCount) {
        return new Response(JSON.stringify({ 
          signals: [], count: 0, rejected: 0,
          blocked: true,
          reason: `Loss cooldown active: ${consecutiveLosses} consecutive losses (limit: ${lossCooldownCount}). Wait for reset.`
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Block if daily cap reached
      if (tradesToday >= maxTradesPerDay) {
        return new Response(JSON.stringify({ 
          signals: [], count: 0, rejected: 0,
          blocked: true,
          reason: `Daily trade cap reached: ${tradesToday}/${maxTradesPerDay}`
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Fetch market features
    let featuresQuery = supabase.from("market_features").select("*").eq("timeframe", "1d");
    if (targetSymbols.length > 0) featuresQuery = featuresQuery.in("symbol", targetSymbols);
    const { data: allFeaturesData } = await featuresQuery;
    if (!allFeaturesData || allFeaturesData.length === 0) {
      return new Response(JSON.stringify({ signals: [], count: 0, message: "No market features available" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Filter out stale features (older than 26 hours — allows for overnight batch)
    const featuresCutoff = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
    const featuresData = allFeaturesData.filter(f =>
      f.computed_at && f.computed_at > featuresCutoff
    );
    const staleCount = allFeaturesData.length - featuresData.length;
    if (staleCount > 0) {
      console.warn(`[signal-engine] Filtered ${staleCount} stale features (>26h old). ${featuresData.length} fresh remaining.`);
    }
    if (featuresData.length === 0) {
      return new Response(JSON.stringify({
        signals: [], count: 0,
        message: `No fresh market features available (${staleCount} symbols have stale data >26h). Run compute-indicators first.`,
        stale_count: staleCount,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch prices
    const featureSymbols = featuresData.map((f: Record<string, unknown>) => String(f.symbol));
    const { data: priceData } = await supabase.from("market_cache").select("symbol, price").in("symbol", featureSymbols);
    const priceMap: Record<string, number> = {};
    for (const p of (priceData || [])) priceMap[p.symbol] = Number(p.price);

    // Fetch macro regime indicators
    const { data: spyFeatures } = await supabase
      .from("market_features")
      .select("sma_20, sma_50, trend_direction, trend_strength")
      .eq("symbol", "SPY")
      .eq("timeframe", "1d")
      .maybeSingle();

    const { data: btcFeatures } = await supabase
      .from("market_features")
      .select("sma_20, sma_50, trend_direction, trend_strength")
      .eq("symbol", "BTC/USD")
      .eq("timeframe", "1d")
      .maybeSingle();

    function getMacroRegime(feat: Record<string, unknown> | null): "bull" | "bear" | "choppy" {
      if (!feat) return "choppy";
      const sma20 = Number(feat.sma_20 || 0);
      const sma50 = Number(feat.sma_50 || 0);
      if (sma20 <= 0 || sma50 <= 0) return "choppy";
      const spread = Math.abs(sma20 - sma50) / sma50;
      if (spread < 0.015) return "choppy";
      return sma20 > sma50 ? "bull" : "bear";
    }

    const equityMacro = getMacroRegime(spyFeatures as Record<string, unknown> | null);
    const cryptoMacro = getMacroRegime(btcFeatures as Record<string, unknown> | null);

    // Fetch strategy performance
    const { data: perfData } = await supabase.from("strategy_performance").select("*").eq("user_id", user_id);
    const perfMap: Record<string, Record<string, unknown>> = {};
    for (const p of (perfData || [])) perfMap[`${p.strategy_family}:${p.market_regime}`] = p as Record<string, unknown>;

    // Fetch user scoring weights
    const { data: userWeights } = await supabase.from("scoring_weights").select("*").eq("user_id", user_id).eq("is_active", true).limit(1);

    // ANTI-OVERTRADING: Fetch correlation matrix for duplicate detection
    const { data: corrData } = await supabase.from("correlation_matrix").select("symbol_a, symbol_b, correlation");
    const correlationMap = new Map<string, number>();
    for (const c of (corrData || [])) {
      correlationMap.set(`${c.symbol_a}:${c.symbol_b}`, Number(c.correlation));
      correlationMap.set(`${c.symbol_b}:${c.symbol_a}`, Number(c.correlation));
    }

    const candidates: { signal: Record<string, unknown>; finalScore: number; confidenceScore: number }[] = [];
    const rejections: { asset: string; reason: string }[] = [];

    for (const feat of featuresData) {
      const symbol = String(feat.symbol);
      const assetClass = String(feat.asset_type || 'stock');
      const regime = String(feat.market_regime || 'undefined');
      const currentPrice = priceMap[symbol] || Number(feat.sma_20 || 0);
      if (currentPrice <= 0) continue;

      // OPERATOR MODE: Block unclear regimes
      if (operator_mode && UNCLEAR_REGIMES.has(regime)) {
        rejections.push({ asset: symbol, reason: `Unclear regime: ${regime}` });
        continue;
      }

      const enriched = { ...feat, current_price: currentPrice };
      const direction = determineDirection(enriched);
      if (!direction) {
        rejections.push({ asset: symbol, reason: 'No clear direction conviction (trendStrength or vote margin too low)' });
        continue;
      }

      // Macro regime filter
      const isCrypto = ['crypto'].includes(assetClass);
      const activeMacro = isCrypto ? cryptoMacro : equityMacro;

      if (activeMacro === "choppy") {
        rejections.push({ asset: symbol, reason: `Macro choppy (${isCrypto ? 'BTC' : 'SPY'} SMA20/50 spread < 1.5%)` });
        continue;
      }
      if (activeMacro === "bull" && direction === "short") {
        rejections.push({ asset: symbol, reason: `Counter-trend short blocked: ${isCrypto ? 'BTC' : 'SPY'} macro is bullish` });
        continue;
      }
      if (activeMacro === "bear" && direction === "long") {
        rejections.push({ asset: symbol, reason: `Counter-trend long blocked: ${isCrypto ? 'BTC' : 'SPY'} macro is bearish` });
        continue;
      }

      // Skip if already has position
      if (openPositionMap.has(symbol) && openPositionMap.get(symbol) === direction) {
        rejections.push({ asset: symbol, reason: `Already has open ${direction} position` });
        continue;
      }

      // Sector cap check
      const symbolSector = SYMBOL_SECTORS[symbol] || 'other';
      if ((sectorCount[symbolSector] || 0) >= MAX_SECTOR_POSITIONS) {
        rejections.push({ asset: symbol, reason: `Sector cap: ${symbolSector} already has ${sectorCount[symbolSector]} positions` });
        continue;
      }

      const strategyFamily = determineBestStrategy(enriched);
      const setups = generateSetups(enriched, direction);
      if (setups.length === 0) continue;

      const setup = setups[0];
      const stopDist = Math.abs(setup.entry - setup.sl);
      if (stopDist <= 0) continue;

      const avgTarget = setup.targets.reduce((s: number, t: number) => s + t, 0) / setup.targets.length;
      const targetDist = Math.abs(avgTarget - setup.entry);
      const expectedR = +(targetDist / stopDist).toFixed(2);

      if (expectedR < min_r) {
        rejections.push({ asset: symbol, reason: `R:R ${expectedR} < ${min_r}` });
        continue;
      }

      // Compute subscores
      const subscores: Record<string, number> = {
        market_structure: computeMarketStructure(enriched),
        momentum: computeMomentum(enriched),
        volatility_suitability: computeVolatilitySuitability(enriched, strategyFamily),
        strategy_confluence: computeStrategyConfluence(enriched, strategyFamily),
        macro_context: vixScore,
        sentiment_flow: fearGreedScore,
        risk_reward: computeRiskReward(expectedR, setup.targets, setup.entry, setup.sl),
        historical_performance: 50,
        macd_confirmation: (() => {
          const mom = macdMomentumDirection(enriched);
          if (direction === 'long') return mom > 0.01 ? 80 : mom < -0.01 ? 25 : 50;
          return mom < -0.01 ? 80 : mom > 0.01 ? 25 : 50;
        })(),
        volume_confirmation: volumeConfirmation(enriched),
        sr_proximity: srProximityScore(enriched, direction),
      };

      const STRATEGY_PRIORS: Record<string, number> = {
        momentum: 52,
        trend_following: 48,
        mean_reversion: 55,
        breakout: 45,
        hybrid: 50,
      };
      const perfKey = `${strategyFamily}:${regime}`;
      const perf = perfMap[perfKey] || perfMap[`${strategyFamily}:all`] || null;
      if (perf && Number(perf.total_trades || 0) >= 5) {
        const wr = Number(perf.win_rate || 0);
        const totalTrades = Number(perf.total_trades || 0);
        const blendWeight = Math.min(totalTrades / 30, 1.0);
        const prior = STRATEGY_PRIORS[strategyFamily] || 50;
        subscores.historical_performance = clamp(
          prior * (1 - blendWeight) + wr * blendWeight,
          0, 100
        );
      } else {
        subscores.historical_performance = STRATEGY_PRIORS[strategyFamily] || 50;
      }

      const weights = getWeightsForContext(regime, assetClass);

      if (userWeights && userWeights.length > 0) {
        const uw = userWeights[0];
        const totalUW = Number(uw.structure_weight) + Number(uw.momentum_weight) + Number(uw.volatility_weight) + Number(uw.strategy_weight) + Number(uw.macro_weight) + Number(uw.sentiment_weight) + Number(uw.rr_weight) + Number(uw.historical_weight);
        if (totalUW > 0) {
          weights.market_structure = Number(uw.structure_weight) / totalUW;
          weights.momentum = Number(uw.momentum_weight) / totalUW;
          weights.volatility_suitability = Number(uw.volatility_weight) / totalUW;
          weights.strategy_confluence = Number(uw.strategy_weight) / totalUW;
          weights.macro_context = Number(uw.macro_weight) / totalUW;
          weights.sentiment_flow = Number(uw.sentiment_weight) / totalUW;
          weights.risk_reward = Number(uw.rr_weight) / totalUW;
          weights.historical_performance = Number(uw.historical_weight) / totalUW;
        }
      }

      let baseScore = 0;
      let totalWeight = 0;
      for (const [k, w] of Object.entries(weights)) {
        if (subscores[k] === undefined) continue;
        baseScore += w * subscores[k];
        totalWeight += w;
      }
      if (totalWeight > 0) baseScore = (baseScore / totalWeight) * 100;

      const stratMod = computeStrategyModifier(strategyFamily, regime, perf);
      const regimeMod = computeRegimeModifier(regime, Number(feat.regime_confidence || 50));
      const histMod = computeHistoricalModifier(perf);

      const finalScore = clamp(baseScore + stratMod + regimeMod + histMod, 0, 100);

      if (finalScore < min_score) {
        rejections.push({ asset: symbol, reason: `Score ${finalScore.toFixed(1)} < ${min_score}` });
        continue;
      }

      // Validate stop distance
      if (stopDist / currentPrice > 0.10) {
        rejections.push({ asset: symbol, reason: `Stop distance ${((stopDist/currentPrice)*100).toFixed(1)}% > 10%` });
        continue;
      }

      const confidenceScore = computeConfidenceScore(enriched, regime);

      // OPERATOR MODE: Enforce min confidence
      if (confidenceScore < min_confidence) {
        rejections.push({ asset: symbol, reason: `Confidence ${confidenceScore.toFixed(1)} < ${min_confidence}` });
        continue;
      }

      const sortedSubscores = Object.entries(subscores).sort((a, b) => b[1] - a[1]);
      const explanation = {
        top_contributors: sortedSubscores.slice(0, 3).map(([k, v]) => ({ factor: k, score: +v.toFixed(1) })),
        modifiers: {
          strategy: { value: stratMod, reason: perf ? `Based on ${Number(perf.total_trades || 0)} historical trades` : 'No historical data' },
          regime: { value: regimeMod, reason: `Regime: ${regime}, confidence: ${Number(feat.regime_confidence || 0).toFixed(0)}%` },
          historical: { value: histMod, reason: perf ? `PF: ${Number(perf.profit_factor || 0).toFixed(2)}` : 'Insufficient data' },
        },
        summary: `Signal generated for ${symbol} ${direction.toUpperCase()} based on ${regime} regime with ${strategyFamily} strategy. Top factor: ${sortedSubscores[0][0]} (${sortedSubscores[0][1].toFixed(0)}).`,
      };

      const signal = {
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
        status: 'active',
        macro_regime: activeMacro,
        macro_filter_passed: true,
      };

      candidates.push({ signal, finalScore, confidenceScore });
    }

    // OPERATOR MODE: Sort by score and take only top N
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

    // Take top max_signals
    const finalCandidates = filteredCandidates.slice(0, max_signals);
    const generatedSignals = finalCandidates.map(c => c.signal);

    // Store valid signals
    if (generatedSignals.length > 0) {
      const { error: insertError } = await supabase.from("signals").insert(generatedSignals);
      if (insertError) throw new Error(`Insert error: ${insertError.message}`);
    }

    return new Response(
      JSON.stringify({
        signals: generatedSignals,
        count: generatedSignals.length,
        rejected: rejections.length,
        rejections: rejections.slice(0, 20),
        operator_mode,
        filters_applied: { min_score, min_r, min_confidence, max_signals },
        macro_context: { equity: equityMacro, crypto: cryptoMacro },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
