import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  return values.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function rsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function atr(bars: { high: number; low: number; close: number }[], period = 14): number {
  if (bars.length < period + 1) return bars[bars.length - 1]?.close * 0.02 || 1;
  let sum = 0;
  for (let i = bars.length - period; i < bars.length; i++) {
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low - bars[i - 1].close)
    );
    sum += tr;
  }
  return sum / period;
}

function scoreSignal(bars: { open: number; high: number; low: number; close: number; volume: number }[]): {
  score: number; direction: string | null; entry: number; sl: number; tp: number; r: number;
} {
  if (bars.length < 50) return { score: 0, direction: null, entry: 0, sl: 0, tp: 0, r: 0 };

  const closes = bars.map(b => b.close);
  const currentPrice = closes[closes.length - 1];
  const rsiVal = rsi(closes);
  const sma20 = sma(closes, 20) || currentPrice;
  const sma50 = sma(closes, 50) || currentPrice;
  const atrVal = atr(bars);

  // Direction with conviction (mirrors determineDirection logic)
  const trendUp = sma20 > sma50;
  const rsiLong = rsiVal > 55;
  const rsiShort = rsiVal < 45;
  let longScore = 0, shortScore = 0;
  if (trendUp) longScore += 2; else shortScore += 2;
  if (rsiLong) longScore += 1; else if (rsiShort) shortScore += 1;
  const trendStrength = Math.abs(sma20 - sma50) / sma50;
  if (trendStrength < 0.005) return { score: 0, direction: null, entry: 0, sl: 0, tp: 0, r: 0 };
  const margin = Math.abs(longScore - shortScore);
  if (margin < 2) return { score: 0, direction: null, entry: 0, sl: 0, tp: 0, r: 0 };
  const direction = longScore > shortScore ? "long" : "short";

  // Score (simplified version of signal-engine scoring)
  let score = 50;
  // Market structure
  if (trendUp && direction === "long") score += 15;
  else if (!trendUp && direction === "short") score += 15;
  // Momentum
  if (direction === "long" && rsiVal > 50 && rsiVal < 70) score += 12;
  else if (direction === "short" && rsiVal < 50 && rsiVal > 30) score += 12;
  // Trend strength
  score += Math.min(15, trendStrength * 1000);

  // Setup
  const entry = currentPrice;
  const sl = direction === "long"
    ? Math.max(sma20 - atrVal * 0.5, entry - atrVal * 1.5)
    : Math.min(sma20 + atrVal * 0.5, entry + atrVal * 1.5);
  const stopDist = Math.abs(entry - sl);
  if (stopDist <= 0) return { score: 0, direction: null, entry: 0, sl: 0, tp: 0, r: 0 };
  const tp = direction === "long" ? entry + stopDist * 2 : entry - stopDist * 2;
  const r = stopDist > 0 ? (Math.abs(tp - entry) / stopDist) : 0;

  return { score: Math.min(100, score), direction, entry, sl, tp, r };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { symbol, lookback_days = 180, min_score = 65, min_r = 1.5 } = await req.json();
    if (!symbol) throw new Error("symbol required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch historical bars
    const { data: bars, error } = await supabase
      .from("ohlcv_cache")
      .select("open, high, low, close, volume, timestamp")
      .eq("symbol", symbol)
      .eq("timeframe", "1d")
      .order("timestamp", { ascending: true });

    if (error || !bars || bars.length < 60) {
      return new Response(JSON.stringify({
        error: `Insufficient data for ${symbol}. Got ${bars?.length || 0} bars. Run compute-indicators first.`
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const numericBars = bars.map(b => ({
      open: Number(b.open), high: Number(b.high),
      low: Number(b.low), close: Number(b.close),
      volume: Number(b.volume), timestamp: b.timestamp,
    }));

    // Walk-forward: simulate each trading day
    const startIdx = Math.max(50, numericBars.length - lookback_days);
    const trades: {
      date: string; symbol: string; direction: string; score: number;
      entry: number; sl: number; tp: number; r_planned: number;
      exit_price: number; pnl_pct: number; r_actual: number; outcome: string;
    }[] = [];

    for (let i = startIdx; i < numericBars.length - 1; i++) {
      const window = numericBars.slice(0, i + 1);
      const { score, direction, entry, sl, tp, r } = scoreSignal(window);

      if (score < min_score || !direction || r < min_r) continue;
      if (Math.abs(entry - sl) / entry > 0.10) continue;

      // Simulate next 10 bars for outcome
      let outcome = "open";
      let exitPrice = entry;
      let exitBar = i + 1;

      for (let j = i + 1; j < Math.min(i + 11, numericBars.length); j++) {
        const bar = numericBars[j];
        if (direction === "long") {
          if (bar.low <= sl) { exitPrice = sl; outcome = "stop_loss"; exitBar = j; break; }
          if (bar.high >= tp) { exitPrice = tp; outcome = "take_profit"; exitBar = j; break; }
        } else {
          if (bar.high >= sl) { exitPrice = sl; outcome = "stop_loss"; exitBar = j; break; }
          if (bar.low <= tp) { exitPrice = tp; outcome = "take_profit"; exitBar = j; break; }
        }
      }

      if (outcome === "open") {
        exitPrice = numericBars[Math.min(exitBar, numericBars.length - 1)].close;
        outcome = "timeout";
      }

      const pnlPct = direction === "long"
        ? (exitPrice - entry) / entry * 100
        : (entry - exitPrice) / entry * 100;
      const stopDist = Math.abs(entry - sl);
      const rActual = stopDist > 0 ? (direction === "long" ? exitPrice - entry : entry - exitPrice) / stopDist : 0;

      trades.push({
        date: numericBars[i].timestamp,
        symbol, direction, score,
        entry: +entry.toFixed(4), sl: +sl.toFixed(4), tp: +tp.toFixed(4),
        r_planned: +r.toFixed(2), exit_price: +exitPrice.toFixed(4),
        pnl_pct: +pnlPct.toFixed(3), r_actual: +rActual.toFixed(2),
        outcome,
      });
    }

    // Compute metrics
    const wins = trades.filter(t => t.outcome === "take_profit");
    const losses = trades.filter(t => t.outcome === "stop_loss");
    const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
    const grossProfit = wins.reduce((s, t) => s + t.pnl_pct, 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl_pct, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;
    const avgR = trades.length > 0 ? trades.reduce((s, t) => s + t.r_actual, 0) / trades.length : 0;
    let maxDD = 0, peak = 0, equity = 0;
    for (const t of trades) {
      equity += t.pnl_pct;
      if (equity > peak) peak = equity;
      maxDD = Math.max(maxDD, peak - equity);
    }

    return new Response(JSON.stringify({
      symbol, lookback_days, bars_available: bars.length,
      signals_generated: trades.length,
      wins: wins.length, losses: losses.length,
      timeouts: trades.filter(t => t.outcome === "timeout").length,
      win_rate: +winRate.toFixed(1),
      profit_factor: +profitFactor.toFixed(2),
      avg_r: +avgR.toFixed(2),
      max_drawdown_pct: +maxDD.toFixed(2),
      gross_profit_pct: +grossProfit.toFixed(2),
      gross_loss_pct: +grossLoss.toFixed(2),
      trade_log: trades,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
