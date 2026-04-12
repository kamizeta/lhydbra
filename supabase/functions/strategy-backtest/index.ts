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

interface OHLCVBar {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: string;
}

interface BacktestTrade {
  entry_price: number;
  exit_price: number;
  direction: string;
  entry_bar: number;
  exit_bar: number;
  pnl: number;
  r_multiple: number;
  entry_reason: string;
  exit_reason: string;
}

// ─── Strategy Logic Evaluators ───

function evaluateTrendFollowing(bars: OHLCVBar[], params: Record<string, number>): BacktestTrade[] {
  const trades: BacktestTrade[] = [];
  const fastPeriod = params.fast_period || 20;
  const slowPeriod = params.slow_period || 50;
  const atrPeriod = params.atr_period || 14;
  const atrMultiplier = params.stop_atr_multiplier || 2;
  const targetR = params.target_r_multiple || 2;

  if (bars.length < slowPeriod + 10) return trades;

  // Compute SMAs
  const smaFast: number[] = [];
  const smaSlow: number[] = [];
  const atr: number[] = [];

  for (let i = 0; i < bars.length; i++) {
    if (i >= fastPeriod - 1) {
      const slice = bars.slice(i - fastPeriod + 1, i + 1);
      smaFast[i] = slice.reduce((s, b) => s + b.close, 0) / fastPeriod;
    }
    if (i >= slowPeriod - 1) {
      const slice = bars.slice(i - slowPeriod + 1, i + 1);
      smaSlow[i] = slice.reduce((s, b) => s + b.close, 0) / slowPeriod;
    }
    if (i >= atrPeriod) {
      let sum = 0;
      for (let j = i - atrPeriod + 1; j <= i; j++) {
        const tr = Math.max(bars[j].high - bars[j].low, Math.abs(bars[j].high - bars[j - 1].close), Math.abs(bars[j].low - bars[j - 1].close));
        sum += tr;
      }
      atr[i] = sum / atrPeriod;
    }
  }

  let inTrade = false;
  let entry = 0, sl = 0, tp = 0, entryBar = 0;

  for (let i = slowPeriod; i < bars.length; i++) {
    if (!inTrade) {
      if (smaFast[i] > smaSlow[i] && smaFast[i - 1] <= smaSlow[i - 1] && atr[i]) {
        const slippagePct = 0.001;
        entry = bars[i].close * (1 + slippagePct); // long slippage
        sl = entry - atr[i] * atrMultiplier;
        const risk = entry - sl;
        tp = entry + risk * targetR;
        entryBar = i;
        inTrade = true;
      }
    } else {
      const feeRate = 0.0002;
      const stopDist = Math.abs(entry - sl);
      if (bars[i].low <= sl) {
        const exitP = Math.min(sl, bars[i].open); // gap through stop
        const grossPnl = exitP - entry;
        const fees = entry * feeRate + exitP * feeRate;
        const netPnl = grossPnl - fees;
        const rMult = stopDist > 0 ? (exitP - entry) / stopDist : 0;
        trades.push({ entry_price: entry, exit_price: exitP, direction: 'long', entry_bar: entryBar, exit_bar: i, pnl: netPnl, r_multiple: +rMult.toFixed(2), entry_reason: 'SMA crossover', exit_reason: 'Stop Loss' });
        inTrade = false;
      } else if (bars[i].high >= tp) {
        const grossPnl = tp - entry;
        const fees = entry * feeRate + tp * feeRate;
        const netPnl = grossPnl - fees;
        const rMult = stopDist > 0 ? (tp - entry) / stopDist : 0;
        trades.push({ entry_price: entry, exit_price: tp, direction: 'long', entry_bar: entryBar, exit_bar: i, pnl: netPnl, r_multiple: +rMult.toFixed(2), entry_reason: 'SMA crossover', exit_reason: 'Take Profit' });
        inTrade = false;
      } else if (smaFast[i] < smaSlow[i]) {
        const exitP = bars[i].close;
        const grossPnl = exitP - entry;
        const fees = entry * feeRate + exitP * feeRate;
        const netPnl = grossPnl - fees;
        const rMult = stopDist > 0 ? (exitP - entry) / stopDist : 0;
        trades.push({ entry_price: entry, exit_price: exitP, direction: 'long', entry_bar: entryBar, exit_bar: i, pnl: netPnl, r_multiple: +rMult.toFixed(2), entry_reason: 'SMA crossover', exit_reason: 'SMA reverse cross' });
        inTrade = false;
      }
    }
  }
  return trades;
}

function evaluateBreakout(bars: OHLCVBar[], params: Record<string, number>): BacktestTrade[] {
  const trades: BacktestTrade[] = [];
  const period = params.period || 20;
  const atrMult = params.stop_atr_multiplier || 1.5;
  const targetR = params.target_r_multiple || 3;

  if (bars.length < period + 10) return trades;

  let inTrade = false;
  let entry = 0, sl = 0, tp = 0, entryBar = 0;

  for (let i = period; i < bars.length; i++) {
    const lookback = bars.slice(i - period, i);
    const high = Math.max(...lookback.map(b => b.high));
    const avgRange = lookback.reduce((s, b) => s + (b.high - b.low), 0) / period;

    if (!inTrade) {
      if (bars[i].close > high) {
        const slippagePct = 0.001;
        entry = bars[i].close * (1 + slippagePct);
        sl = entry - avgRange * atrMult;
        const risk = entry - sl;
        tp = entry + risk * targetR;
        entryBar = i;
        inTrade = true;
      }
    } else {
      const feeRate = 0.0002;
      const stopDist = Math.abs(entry - sl);
      if (bars[i].low <= sl) {
        const exitP = Math.min(sl, bars[i].open);
        const grossPnl = exitP - entry;
        const fees = entry * feeRate + exitP * feeRate;
        const rMult = stopDist > 0 ? (exitP - entry) / stopDist : 0;
        trades.push({ entry_price: entry, exit_price: exitP, direction: 'long', entry_bar: entryBar, exit_bar: i, pnl: grossPnl - fees, r_multiple: +rMult.toFixed(2), entry_reason: 'Breakout', exit_reason: 'Stop Loss' });
        inTrade = false;
      } else if (bars[i].high >= tp) {
        const grossPnl = tp - entry;
        const fees = entry * feeRate + tp * feeRate;
        const rMult = stopDist > 0 ? (tp - entry) / stopDist : 0;
        trades.push({ entry_price: entry, exit_price: tp, direction: 'long', entry_bar: entryBar, exit_bar: i, pnl: grossPnl - fees, r_multiple: +rMult.toFixed(2), entry_reason: 'Breakout', exit_reason: 'Take Profit' });
        inTrade = false;
      }
    }
  }
  return trades;
}

function evaluateMeanReversion(bars: OHLCVBar[], params: Record<string, number>): BacktestTrade[] {
  const trades: BacktestTrade[] = [];
  const rsiPeriod = params.rsi_period || 14;
  const oversold = params.oversold || 30;
  const overbought = params.overbought || 70;
  const atrMult = params.stop_atr_multiplier || 1;
  const targetR = params.target_r_multiple || 1.5;

  if (bars.length < rsiPeriod + 10) return trades;

  // Compute RSI
  const rsi: number[] = [];
  for (let i = rsiPeriod; i < bars.length; i++) {
    let gains = 0, losses = 0;
    for (let j = i - rsiPeriod + 1; j <= i; j++) {
      const change = bars[j].close - bars[j - 1].close;
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }
    const avgGain = gains / rsiPeriod;
    const avgLoss = losses / rsiPeriod;
    rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }

  let inTrade = false;
  let entry = 0, sl = 0, tp = 0, entryBar = 0;

  for (let i = rsiPeriod + 1; i < bars.length; i++) {
    if (!inTrade) {
      if (rsi[i] < oversold && rsi[i - 1] >= oversold) {
        const slippagePct = 0.001;
        entry = bars[i].close * (1 + slippagePct);
        const avgRange = bars.slice(Math.max(0, i - 14), i).reduce((s, b) => s + (b.high - b.low), 0) / 14;
        sl = entry - avgRange * atrMult;
        const risk = entry - sl;
        tp = entry + risk * targetR;
        entryBar = i;
        inTrade = true;
      }
    } else {
      const feeRate = 0.0002;
      const stopDist = Math.abs(entry - sl);
      if (bars[i].low <= sl) {
        const exitP = Math.min(sl, bars[i].open);
        const grossPnl = exitP - entry;
        const fees = entry * feeRate + exitP * feeRate;
        const rMult = stopDist > 0 ? (exitP - entry) / stopDist : 0;
        trades.push({ entry_price: entry, exit_price: exitP, direction: 'long', entry_bar: entryBar, exit_bar: i, pnl: grossPnl - fees, r_multiple: +rMult.toFixed(2), entry_reason: 'RSI oversold', exit_reason: 'Stop Loss' });
        inTrade = false;
      } else if (bars[i].high >= tp) {
        const grossPnl = tp - entry;
        const fees = entry * feeRate + tp * feeRate;
        const rMult = stopDist > 0 ? (tp - entry) / stopDist : 0;
        trades.push({ entry_price: entry, exit_price: tp, direction: 'long', entry_bar: entryBar, exit_bar: i, pnl: grossPnl - fees, r_multiple: +rMult.toFixed(2), entry_reason: 'RSI oversold', exit_reason: 'Take Profit' });
        inTrade = false;
      } else if (rsi[i] > overbought) {
        const exitP = bars[i].close;
        const grossPnl = exitP - entry;
        const fees = entry * feeRate + exitP * feeRate;
        const rMult = stopDist > 0 ? (exitP - entry) / stopDist : 0;
        trades.push({ entry_price: entry, exit_price: exitP, direction: 'long', entry_bar: entryBar, exit_bar: i, pnl: grossPnl - fees, r_multiple: +rMult.toFixed(2), entry_reason: 'RSI oversold', exit_reason: 'RSI overbought' });
        inTrade = false;
      }
    }
  }
  return trades;
}

function runBacktest(family: string, bars: OHLCVBar[], params: Record<string, number>): BacktestTrade[] {
  switch (family) {
    case 'trend_following': return evaluateTrendFollowing(bars, params);
    case 'breakout': return evaluateBreakout(bars, params);
    case 'mean_reversion': return evaluateMeanReversion(bars, params);
    case 'momentum_rotation': return evaluateTrendFollowing(bars, { ...params, fast_period: 10, slow_period: 30 });
    case 'liquidity_sweep': return evaluateMeanReversion(bars, { ...params, oversold: 25, target_r_multiple: 3 });
    default: return evaluateTrendFollowing(bars, params);
  }
}

function computeMetrics(trades: BacktestTrade[]) {
  if (trades.length === 0) return { total_trades: 0, winning_trades: 0, losing_trades: 0, win_rate: 0, total_pnl: 0, expectancy: 0, profit_factor: 0, max_drawdown: 0, sharpe_estimate: 0, avg_r_multiple: 0 };

  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl <= 0);
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));

  // Max drawdown
  let peak = 0, maxDD = 0, equity = 0;
  for (const t of trades) {
    equity += t.pnl;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDD) maxDD = dd;
  }

  // Sharpe estimate (simplified)
  const avgPnl = totalPnl / trades.length;
  const variance = trades.reduce((s, t) => s + Math.pow(t.pnl - avgPnl, 2), 0) / trades.length;
  const stdDev = Math.sqrt(variance);
  const sharpe = stdDev > 0 ? (avgPnl / stdDev) * Math.sqrt(252) : 0;

  return {
    total_trades: trades.length,
    winning_trades: wins.length,
    losing_trades: losses.length,
    win_rate: (wins.length / trades.length) * 100,
    total_pnl: totalPnl,
    expectancy: avgPnl,
    profit_factor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99.0 : 0,
    max_drawdown: maxDD,
    sharpe_estimate: sharpe,
    avg_r_multiple: trades.reduce((s, t) => s + t.r_multiple, 0) / trades.length,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });

  try {
    const body = await req.json();
    const { strategy_id, variant_id, symbol, strategy_family, parameters, timeframe, user_id_override } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    const isServiceRole = authHeader === `Bearer ${serviceKey}`;

    // Authenticate caller
    let userId: string;
    if (user_id_override && isServiceRole) {
      userId = user_id_override;
    } else {
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
      if (claimsErr || !claimsData?.claims?.sub) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      userId = claimsData.claims.sub as string;
    }

    const db = createClient(supabaseUrl, serviceKey);

    // Fetch OHLCV from cache
    const tf = timeframe || '1d';
    const { data: ohlcvData, error: ohlcvErr } = await db
      .from('ohlcv_cache')
      .select('open, high, low, close, volume, timestamp')
      .eq('symbol', symbol)
      .eq('timeframe', tf)
      .order('timestamp', { ascending: true });

    if (ohlcvErr) throw new Error(`OHLCV fetch error: ${ohlcvErr.message}`);
    if (!ohlcvData || ohlcvData.length < 30) {
      return new Response(JSON.stringify({ error: `Insufficient OHLCV data for ${symbol}. Need at least 30 bars, got ${ohlcvData?.length || 0}.` }), {
        status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }
      });
    }

    const bars: OHLCVBar[] = ohlcvData.map(d => ({
      open: Number(d.open), high: Number(d.high), low: Number(d.low),
      close: Number(d.close), volume: Number(d.volume), timestamp: d.timestamp,
    }));

    // Run backtest
    const family = strategy_family || 'trend_following';
    const params = parameters || {};
    const trades = runBacktest(family, bars, params);
    const metrics = computeMetrics(trades);

    // Store results
    const result = {
      user_id: userId,
      strategy_id: strategy_id || null,
      variant_id: variant_id || null,
      symbol,
      timeframe: tf,
      period_start: bars[0]?.timestamp,
      period_end: bars[bars.length - 1]?.timestamp,
      ...metrics,
      trade_log: trades.slice(0, 100), // cap stored trades
      status: 'completed',
    };

    const { data: inserted, error: insertErr } = await db.from('backtest_results').insert(result).select().single();
    if (insertErr) console.error('Insert backtest error:', insertErr.message);

    return new Response(JSON.stringify({
      ...metrics,
      trades: trades.length,
      trade_log: trades,
      id: inserted?.id,
    }), { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });

  } catch (e) {
    console.error("backtest error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }
    });
  }
});
