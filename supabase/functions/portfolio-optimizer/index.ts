import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Types ──────────────────────────────────────────────

interface Signal {
  id: string;
  symbol: string;
  asset_type: string;
  direction: string;
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  opportunity_score: number | null;
  confidence: number;
  expected_r_multiple?: number;
  risk_reward: number;
  strategy_family: string | null;
  market_regime: string | null;
  strategy: string;
}

interface Position {
  symbol: string;
  asset_type: string;
  direction: string;
  quantity: number;
  avg_entry: number;
  stop_loss: number | null;
  strategy_family: string | null;
}

interface Settings {
  current_capital: number;
  risk_per_trade: number;
  max_daily_risk: number;
  max_positions: number;
  max_single_asset: number;
  max_correlation: number;
}

interface StratPerf {
  strategy_family: string;
  win_rate: number | null;
  avg_r_multiple: number | null;
  total_trades: number;
}

interface Correlation {
  symbol_a: string;
  symbol_b: string;
  correlation: number;
}

// ── Helpers ────────────────────────────────────────────

function scoreMultiplier(score: number): number {
  if (score > 85) return 1.2;
  if (score >= 75) return 1.0;
  if (score >= 60) return 0.7;
  return 0.5;
}

function computeStrategyStrength(family: string | null, perfMap: Map<string, StratPerf>): number {
  if (!family) return 50;
  const p = perfMap.get(family);
  if (!p || p.total_trades < 3) return 50;
  // Normalize win_rate (0-100) and avg_r (typically 0-3) into 0-100
  const wrScore = Math.min(100, (p.win_rate || 0));
  const rScore = Math.min(100, ((p.avg_r_multiple || 0) / 2) * 100);
  return wrScore * 0.6 + rScore * 0.4;
}

function computePortfolioFit(
  signal: Signal,
  positions: Position[],
  exposureByType: Map<string, number>,
  exposureByStrategy: Map<string, number>,
  totalCapital: number,
  maxAssetPct: number,
): number {
  // Start at 100 (perfect fit), deduct for overlap
  let fit = 100;

  // Penalize if same asset type already concentrated
  const typeExposure = (exposureByType.get(signal.asset_type) || 0) / totalCapital * 100;
  if (typeExposure > maxAssetPct * 0.5) fit -= 20;
  if (typeExposure > maxAssetPct * 0.75) fit -= 20;

  // Penalize if same strategy is heavy
  const stratExposure = (exposureByStrategy.get(signal.strategy_family || "unknown") || 0) / totalCapital * 100;
  if (stratExposure > 30) fit -= 15;
  if (stratExposure > 50) fit -= 15;

  // Bonus if no position in this asset
  const hasPosition = positions.some(p => p.symbol === signal.symbol);
  if (!hasPosition) fit += 10;

  // Bonus for different direction than portfolio majority
  const longCount = positions.filter(p => p.direction === "long").length;
  const shortCount = positions.filter(p => p.direction === "short").length;
  if (signal.direction === "short" && longCount > shortCount * 2) fit += 10;

  return Math.max(0, Math.min(100, fit));
}

function getCorrelation(symbol: string, portfolio: string[], corrMap: Map<string, number>): number {
  if (portfolio.length === 0) return 0;
  let totalCorr = 0;
  let count = 0;
  for (const ps of portfolio) {
    const key1 = `${symbol}|${ps}`;
    const key2 = `${ps}|${symbol}`;
    const c = corrMap.get(key1) ?? corrMap.get(key2) ?? null;
    if (c !== null) {
      totalCorr += Math.abs(c);
      count++;
    }
  }
  // If no correlation data, use asset-class heuristic
  return count > 0 ? totalCorr / count : 0.3;
}

// ── Main ───────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);
    const userId = user.id;

    const body = await req.json().catch(() => ({}));
    const {
      min_opportunity = 60,
      min_confidence = 50,
      min_r_multiple = 1.5,
      max_risk_per_trade_pct,      // override
      max_total_risk_pct,           // override
      max_asset_class_pct,          // override
      max_strategy_pct = 40,
      max_cluster_pct = 25,
    } = body;

    // ── FETCH ALL DATA IN PARALLEL ─────────────────────

    const [signalsRes, positionsRes, settingsRes, perfRes, corrRes] = await Promise.all([
      supabase.from("trade_signals").select("*")
        .eq("user_id", userId).eq("status", "pending")
        .order("opportunity_score", { ascending: false }),
      supabase.from("positions").select("symbol, asset_type, direction, quantity, avg_entry, stop_loss, strategy_family")
        .eq("user_id", userId).eq("status", "open"),
      supabase.from("user_settings").select("*")
        .eq("user_id", userId).maybeSingle(),
      supabase.from("strategy_performance").select("strategy_family, win_rate, avg_r_multiple, total_trades")
        .eq("user_id", userId),
      supabase.from("correlation_matrix").select("symbol_a, symbol_b, correlation"),
    ]);

    const signals = (signalsRes.data || []) as Signal[];
    const positions = (positionsRes.data || []) as Position[];
    const settings: Settings = {
      current_capital: (settingsRes.data as any)?.current_capital || 10000,
      risk_per_trade: (settingsRes.data as any)?.risk_per_trade || 1.5,
      max_daily_risk: (settingsRes.data as any)?.max_daily_risk || 5,
      max_positions: (settingsRes.data as any)?.max_positions || 10,
      max_single_asset: (settingsRes.data as any)?.max_single_asset || 25,
      max_correlation: (settingsRes.data as any)?.max_correlation || 80,
    };
    const perfData = (perfRes.data || []) as StratPerf[];
    const corrData = (corrRes.data || []) as Correlation[];

    // Apply overrides
    const riskPerTrade = max_risk_per_trade_pct ?? settings.risk_per_trade;
    const maxTotalRisk = max_total_risk_pct ?? settings.max_daily_risk;
    const maxAssetClass = max_asset_class_pct ?? settings.max_single_asset;

    const totalCapital = settings.current_capital;
    const maxRiskBudget = totalCapital * (maxTotalRisk / 100);

    // Build lookup maps
    const perfMap = new Map<string, StratPerf>();
    perfData.forEach(p => perfMap.set(p.strategy_family, p));

    const corrMap = new Map<string, number>();
    corrData.forEach(c => corrMap.set(`${c.symbol_a}|${c.symbol_b}`, c.correlation));

    // Current exposure maps
    const exposureByType = new Map<string, number>();
    const exposureByStrategy = new Map<string, number>();
    let currentTotalRisk = 0;

    positions.forEach(p => {
      const val = p.quantity * p.avg_entry;
      exposureByType.set(p.asset_type, (exposureByType.get(p.asset_type) || 0) + val);
      const fam = p.strategy_family || "unknown";
      exposureByStrategy.set(fam, (exposureByStrategy.get(fam) || 0) + val);
      if (p.stop_loss) {
        currentTotalRisk += Math.abs(p.avg_entry - p.stop_loss) * p.quantity;
      }
    });

    const portfolioSymbols = positions.map(p => p.symbol);
    let remainingRiskBudget = maxRiskBudget - currentTotalRisk;
    let remainingCapital = totalCapital - positions.reduce((s, p) => s + p.quantity * p.avg_entry, 0);

    // ── STEP 1: SIGNAL FILTERING ──────────────────────

    const filtered: Signal[] = [];
    const rejected: Array<{ signal_id: string; symbol: string; reason: string }> = [];

    for (const sig of signals) {
      const oppScore = sig.opportunity_score || 0;
      const confScore = sig.confidence || 0;
      const rr = sig.risk_reward || 0;

      if (oppScore < min_opportunity) {
        rejected.push({ signal_id: sig.id, symbol: sig.symbol, reason: `Opportunity score ${oppScore} < ${min_opportunity}` });
        continue;
      }
      if (confScore < min_confidence) {
        rejected.push({ signal_id: sig.id, symbol: sig.symbol, reason: `Confidence ${confScore} < ${min_confidence}` });
        continue;
      }
      if (rr < min_r_multiple) {
        rejected.push({ signal_id: sig.id, symbol: sig.symbol, reason: `R:R ${rr.toFixed(2)} < ${min_r_multiple}` });
        continue;
      }
      // Reject if already have same-direction position
      if (positions.some(p => p.symbol === sig.symbol && p.direction === sig.direction)) {
        rejected.push({ signal_id: sig.id, symbol: sig.symbol, reason: `Already has open ${sig.direction} position` });
        continue;
      }
      filtered.push(sig);
    }

    // ── STEP 2 & 3: PRIORITY + CORRELATION ────────────

    const ranked = filtered.map(sig => {
      const oppNorm = (sig.opportunity_score || 0);
      const confNorm = sig.confidence;
      const stratStrength = computeStrategyStrength(sig.strategy_family, perfMap);
      const portFit = computePortfolioFit(sig, positions, exposureByType, exposureByStrategy, totalCapital, maxAssetClass);

      const allocationPriority =
        0.50 * oppNorm +
        0.20 * confNorm +
        0.15 * stratStrength +
        0.15 * portFit;

      // Step 3: Correlation adjustment
      const corrPenalty = getCorrelation(sig.symbol, portfolioSymbols, corrMap);
      const adjustedPriority = allocationPriority * (1 - corrPenalty);

      return {
        signal: sig,
        allocationPriority,
        strategyStrength: stratStrength,
        portfolioFit: portFit,
        correlationPenalty: corrPenalty,
        adjustedPriority,
      };
    });

    // Sort by adjusted priority descending
    ranked.sort((a, b) => b.adjustedPriority - a.adjustedPriority);

    // ── STEPS 4-6: SIZING + ALLOCATION + CONSTRAINTS ──

    const allocations: Array<{
      signal_id: string;
      symbol: string;
      asset_type: string;
      direction: string;
      strategy_family: string | null;
      opportunity_score: number;
      confidence_score: number;
      expected_r_multiple: number;
      allocation_priority: number;
      correlation_penalty: number;
      adjusted_priority: number;
      score_multiplier: number;
      allocated_capital: number;
      position_size: number;
      risk_used: number;
      risk_percent: number;
      final_weight: number;
      priority_rank: number;
      status: string;
      rejection_reason: string | null;
      explanation: Record<string, unknown>;
    }> = [];

    let rank = 0;

    for (const item of ranked) {
      rank++;
      const sig = item.signal;
      const stopDistance = Math.abs(sig.entry_price - sig.stop_loss);

      if (stopDistance <= 0) {
        allocations.push(makeAllocation(item, rank, 0, 0, 0, 0, 0, "rejected", "Invalid stop distance (0)", totalCapital));
        continue;
      }

      // Check position count limit
      if (positions.length + allocations.filter(a => a.status === "allocated").length >= settings.max_positions) {
        allocations.push(makeAllocation(item, rank, 0, 0, 0, 0, 0, "rejected", `Max positions (${settings.max_positions}) reached`, totalCapital));
        continue;
      }

      // Step 4: Risk-based position sizing
      const maxRiskDollars = Math.min(
        totalCapital * (riskPerTrade / 100),
        Math.max(0, remainingRiskBudget)
      );

      if (maxRiskDollars <= 0) {
        allocations.push(makeAllocation(item, rank, 0, 0, 0, 0, 0, "rejected", "Risk budget exhausted", totalCapital));
        continue;
      }

      let positionSize = maxRiskDollars / stopDistance;
      let capitalNeeded = positionSize * sig.entry_price;

      // Step 8: Score multiplier scaling
      const multiplier = scoreMultiplier(sig.opportunity_score || 0);
      positionSize *= multiplier;
      capitalNeeded = positionSize * sig.entry_price;

      // Step 5-6: Check constraints
      const newTypeExposure = (exposureByType.get(sig.asset_type) || 0) + capitalNeeded;
      const typeExposurePct = (newTypeExposure / totalCapital) * 100;
      if (typeExposurePct > maxAssetClass) {
        // Try to reduce
        const maxForType = totalCapital * (maxAssetClass / 100) - (exposureByType.get(sig.asset_type) || 0);
        if (maxForType <= 0) {
          allocations.push(makeAllocation(item, rank, 0, 0, 0, multiplier, 0, "rejected", `Asset class ${sig.asset_type} at max (${maxAssetClass}%)`, totalCapital));
          continue;
        }
        capitalNeeded = maxForType;
        positionSize = capitalNeeded / sig.entry_price;
      }

      // Strategy exposure
      const fam = sig.strategy_family || "unknown";
      const newStratExposure = (exposureByStrategy.get(fam) || 0) + capitalNeeded;
      const stratExposurePct = (newStratExposure / totalCapital) * 100;
      if (stratExposurePct > max_strategy_pct) {
        const maxForStrat = totalCapital * (max_strategy_pct / 100) - (exposureByStrategy.get(fam) || 0);
        if (maxForStrat <= 0) {
          allocations.push(makeAllocation(item, rank, 0, 0, 0, multiplier, 0, "rejected", `Strategy ${fam} at max (${max_strategy_pct}%)`, totalCapital));
          continue;
        }
        capitalNeeded = Math.min(capitalNeeded, maxForStrat);
        positionSize = capitalNeeded / sig.entry_price;
      }

      // Correlation cluster check
      const clusterCorr = getCorrelation(sig.symbol, portfolioSymbols, corrMap);
      if (clusterCorr > (settings.max_correlation / 100)) {
        // Reduce position by penalty factor
        const reductionFactor = 1 - (clusterCorr - (settings.max_correlation / 100));
        if (reductionFactor <= 0.2) {
          allocations.push(makeAllocation(item, rank, 0, 0, 0, multiplier, 0, "rejected", `High correlation (${(clusterCorr * 100).toFixed(0)}%) with portfolio`, totalCapital));
          continue;
        }
        positionSize *= reductionFactor;
        capitalNeeded = positionSize * sig.entry_price;
      }

      // Capital check
      if (capitalNeeded > remainingCapital) {
        if (remainingCapital > sig.entry_price) {
          capitalNeeded = remainingCapital;
          positionSize = capitalNeeded / sig.entry_price;
        } else {
          allocations.push(makeAllocation(item, rank, 0, 0, 0, multiplier, 0, "rejected", "Insufficient capital", totalCapital));
          continue;
        }
      }

      const riskUsed = stopDistance * positionSize;
      const riskPct = (riskUsed / totalCapital) * 100;

      // Commit allocation
      remainingRiskBudget -= riskUsed;
      remainingCapital -= capitalNeeded;
      exposureByType.set(sig.asset_type, (exposureByType.get(sig.asset_type) || 0) + capitalNeeded);
      exposureByStrategy.set(fam, (exposureByStrategy.get(fam) || 0) + capitalNeeded);
      portfolioSymbols.push(sig.symbol);

      allocations.push(makeAllocation(
        item, rank, capitalNeeded, positionSize, riskUsed,
        multiplier, riskPct, "allocated", null, totalCapital
      ));
    }

    // Add rejected signals from step 1
    for (const r of rejected) {
      allocations.push({
        signal_id: r.signal_id,
        symbol: r.symbol,
        asset_type: "unknown",
        direction: "unknown",
        strategy_family: null,
        opportunity_score: 0,
        confidence_score: 0,
        expected_r_multiple: 0,
        allocation_priority: 0,
        correlation_penalty: 0,
        adjusted_priority: 0,
        score_multiplier: 0,
        allocated_capital: 0,
        position_size: 0,
        risk_used: 0,
        risk_percent: 0,
        final_weight: 0,
        priority_rank: 0,
        status: "rejected",
        rejection_reason: r.reason,
        explanation: { filter_stage: "pre-ranking", reason: r.reason },
      });
    }

    // ── STEP 9: PORTFOLIO SCORE ────────────────────────

    const allocated = allocations.filter(a => a.status === "allocated");
    let portfolioScore = 0;
    let totalAllocatedCapital = 0;

    if (allocated.length > 0) {
      let weightedSum = 0;
      allocated.forEach(a => {
        weightedSum += a.opportunity_score * a.allocated_capital;
        totalAllocatedCapital += a.allocated_capital;
      });
      portfolioScore = totalAllocatedCapital > 0 ? weightedSum / totalAllocatedCapital : 0;

      // Diversification bonus
      const uniqueTypes = new Set(allocated.map(a => a.asset_type));
      const uniqueStrategies = new Set(allocated.filter(a => a.strategy_family).map(a => a.strategy_family));
      const diversificationBonus = Math.min(10, (uniqueTypes.size - 1) * 3 + (uniqueStrategies.size - 1) * 2);
      portfolioScore = Math.min(100, portfolioScore + diversificationBonus);
    }

    // ── PERSIST TO DB ──────────────────────────────────

    // Create allocation plan
    const { data: plan, error: planErr } = await supabase.from("allocation_plans").insert({
      user_id: userId,
      total_capital: totalCapital,
      allocated_capital: totalAllocatedCapital,
      free_capital: remainingCapital,
      status: "computed",
      allocations: {
        portfolio_score: Number(portfolioScore.toFixed(2)),
        total_signals: signals.length,
        filtered_count: filtered.length,
        allocated_count: allocated.length,
        rejected_count: rejected.length + allocations.filter(a => a.status === "rejected").length - rejected.length,
        remaining_risk_budget: Number(remainingRiskBudget.toFixed(2)),
        remaining_risk_pct: Number(((remainingRiskBudget / totalCapital) * 100).toFixed(2)),
      },
      risk_budget: {
        max_total_risk_pct: maxTotalRisk,
        risk_per_trade_pct: riskPerTrade,
        max_asset_class_pct: maxAssetClass,
        max_strategy_pct,
        max_cluster_pct,
        used_risk_pct: Number((((maxRiskBudget - remainingRiskBudget) / totalCapital) * 100).toFixed(2)),
      },
      constraints_applied: {
        min_opportunity,
        min_confidence,
        min_r_multiple,
        max_positions: settings.max_positions,
      },
    }).select("id").single();

    if (planErr || !plan) {
      console.error("Failed to create allocation plan:", planErr);
      return json({ error: "Failed to save allocation plan" }, 500);
    }

    // Insert allocation items
    if (allocations.length > 0) {
      const items = allocations.map(a => ({
        plan_id: plan.id,
        user_id: userId,
        signal_id: a.signal_id || null,
        symbol: a.symbol,
        asset_type: a.asset_type,
        direction: a.direction,
        strategy_family: a.strategy_family,
        opportunity_score: a.opportunity_score,
        confidence_score: a.confidence_score,
        expected_r_multiple: a.expected_r_multiple,
        allocation_priority: Number(a.allocation_priority.toFixed(4)),
        correlation_penalty: Number(a.correlation_penalty.toFixed(4)),
        adjusted_priority: Number(a.adjusted_priority.toFixed(4)),
        score_multiplier: a.score_multiplier,
        allocated_capital: Number(a.allocated_capital.toFixed(2)),
        position_size: Number(a.position_size.toFixed(6)),
        risk_used: Number(a.risk_used.toFixed(2)),
        risk_percent: Number(a.risk_percent.toFixed(4)),
        final_weight: a.final_weight,
        priority_rank: a.priority_rank,
        status: a.status,
        rejection_reason: a.rejection_reason,
        explanation: a.explanation,
      }));

      const { error: itemsErr } = await supabase.from("allocation_items").insert(items);
      if (itemsErr) {
        console.error("Failed to insert allocation items:", itemsErr);
      }
    }

    return json({
      success: true,
      plan_id: plan.id,
      portfolio_score: Number(portfolioScore.toFixed(2)),
      total_signals: signals.length,
      filtered: filtered.length,
      allocated: allocated.length,
      rejected: allocations.filter(a => a.status === "rejected").length,
      total_allocated_capital: Number(totalAllocatedCapital.toFixed(2)),
      remaining_capital: Number(remainingCapital.toFixed(2)),
      remaining_risk_budget: Number(remainingRiskBudget.toFixed(2)),
      allocations,
    });
  } catch (e) {
    console.error("Portfolio optimizer error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

// ── Allocation builder ─────────────────────────────────

function makeAllocation(
  item: {
    signal: Signal;
    allocationPriority: number;
    strategyStrength: number;
    portfolioFit: number;
    correlationPenalty: number;
    adjustedPriority: number;
  },
  rank: number,
  capital: number,
  size: number,
  risk: number,
  multiplier: number,
  riskPct: number,
  status: string,
  rejectionReason: string | null,
  totalCapital: number,
) {
  const sig = item.signal;
  return {
    signal_id: sig.id,
    symbol: sig.symbol,
    asset_type: sig.asset_type,
    direction: sig.direction,
    strategy_family: sig.strategy_family,
    opportunity_score: sig.opportunity_score || 0,
    confidence_score: sig.confidence,
    expected_r_multiple: sig.risk_reward || 0,
    allocation_priority: item.allocationPriority,
    correlation_penalty: item.correlationPenalty,
    adjusted_priority: item.adjustedPriority,
    score_multiplier: multiplier,
    allocated_capital: capital,
    position_size: size,
    risk_used: risk,
    risk_percent: riskPct,
    final_weight: totalCapital > 0 ? capital / totalCapital : 0,
    priority_rank: rank,
    status,
    rejection_reason: rejectionReason,
    explanation: {
      opportunity_score: sig.opportunity_score || 0,
      confidence: sig.confidence,
      strategy_strength: Number(item.strategyStrength.toFixed(2)),
      portfolio_fit: Number(item.portfolioFit.toFixed(2)),
      allocation_priority: Number(item.allocationPriority.toFixed(2)),
      correlation_penalty: Number((item.correlationPenalty * 100).toFixed(1)) + "%",
      adjusted_priority: Number(item.adjustedPriority.toFixed(2)),
      score_multiplier: multiplier,
      ...(rejectionReason ? { rejection: rejectionReason } : {}),
    },
  };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
