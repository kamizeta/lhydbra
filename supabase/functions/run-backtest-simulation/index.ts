import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FOREX_SYMBOLS = ["EUR/USD","GBP/USD","USD/JPY","XAU/USD","USD/MXN","USD/CAD","USD/CHF"];

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
  const ag = gains / period, al = losses / period;
  return al === 0 ? 100 : 100 - 100 / (1 + ag / al);
}

function atrCalc(bars: {high:number;low:number;close:number}[], period = 14): number {
  if (bars.length < period + 1) return bars[bars.length-1]?.close * 0.02 || 1;
  let sum = 0;
  for (let i = bars.length - period; i < bars.length; i++) {
    sum += Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i-1].close),
      Math.abs(bars[i].low - bars[i-1].close)
    );
  }
  return sum / period;
}

function ema(values: number[], period: number): number {
  if (values.length === 0) return 0;
  const k = 2 / (period + 1);
  let emaVal = values[0];
  for (let i = 1; i < values.length; i++) {
    emaVal = values[i] * k + emaVal * (1 - k);
  }
  return emaVal;
}

function macdHistogram(closes: number[]): number {
  if (closes.length < 35) return 0;
  const recent = closes.slice(-60);
  const macdLine = ema(recent, 12) - ema(recent, 26);
  const older = closes.slice(-63, -3);
  const macdOld = ema(older, 12) - ema(older, 26);
  return macdLine - macdOld;
}

function volumeRatio(bars: {volume:number}[]): number {
  if (bars.length < 21) return 1;
  const recent = bars[bars.length - 1].volume;
  const avg20 = bars.slice(-21, -1).reduce((s, b) => s + b.volume, 0) / 20;
  return avg20 > 0 ? recent / avg20 : 1;
}

function srProximity(bars: {high:number;low:number;close:number}[], direction: string): number {
  if (bars.length < 20) return 0;
  const price = bars[bars.length - 1].close;
  const lookback = bars.slice(-20);
  const recentHighs = lookback.map(b => b.high).sort((a, b) => b - a).slice(0, 3);
  const recentLows = lookback.map(b => b.low).sort((a, b) => a - b).slice(0, 3);
  const nearestResistance = recentHighs[0];
  const nearestSupport = recentLows[0];
  const distToResistance = (nearestResistance - price) / price;
  const distToSupport = (price - nearestSupport) / price;
  let proximityScore = 0;
  if (direction === "long") {
    if (distToSupport < 0.02) proximityScore += 10;
    if (distToResistance < 0.015) proximityScore -= 20;
    if (distToResistance < 0.005) proximityScore -= 15;
  } else {
    if (distToResistance < 0.02) proximityScore += 10;
    if (distToSupport < 0.015) proximityScore -= 20;
    if (distToSupport < 0.005) proximityScore -= 15;
  }
  return proximityScore;
}

function scoreDay(bars: {open:number;high:number;low:number;close:number;volume:number}[]): {
  score: number; direction: string | null; entry: number; sl: number; tp: number; r: number;
  macd_momentum: number; volume_ratio: number; sr_score: number;
} {
  const empty = { score: 0, direction: null, entry: 0, sl: 0, tp: 0, r: 0, macd_momentum: 0, volume_ratio: 1, sr_score: 0 };
  if (bars.length < 50) return empty;
  const closes = bars.map(b => b.close);
  const price = closes[closes.length - 1];
  const rsiVal = rsi(closes);
  const sma20 = sma(closes, 20) || price;
  const sma50 = sma(closes, 50) || price;
  const atrVal = atrCalc(bars);
  const strength = Math.abs(sma20 - sma50) / sma50;
  if (strength < 0.005) return empty;
  const trendUp = sma20 > sma50;
  let lScore = 0, sScore = 0;
  if (trendUp) lScore += 2; else sScore += 2;
  if (rsiVal > 55) lScore++; else if (rsiVal < 45) sScore++;
  if (Math.abs(lScore - sScore) < 2) return empty;
  const direction = lScore > sScore ? "long" : "short";
  let score = 50;
  if ((trendUp && direction === "long") || (!trendUp && direction === "short")) score += 15;
  if (direction === "long" && rsiVal > 50 && rsiVal < 70) score += 12;
  else if (direction === "short" && rsiVal < 50 && rsiVal > 30) score += 12;
  score += Math.min(15, strength * 1000);

  // Factor 1: MACD Histogram Confirmation
  const macdMomentum = macdHistogram(closes);
  if (direction === "long" && macdMomentum < -0.01) score -= 15;
  if (direction === "short" && macdMomentum > 0.01) score -= 15;
  if (direction === "long" && macdMomentum > 0.01) score += 10;
  if (direction === "short" && macdMomentum < -0.01) score += 10;

  // Factor 2: Volume Confirmation
  const volRatio = volumeRatio(bars);
  if (volRatio > 1.5) score += 8;
  if (volRatio < 0.7) score -= 12;
  if (volRatio < 0.5) score -= 10;

  // Factor 3: Support/Resistance Proximity
  const srScore = srProximity(bars, direction);
  score += srScore;

  const entry = price;
  const sl = direction === "long"
    ? Math.max(sma20 - atrVal * 0.5, entry - atrVal * 1.5)
    : Math.min(sma20 + atrVal * 0.5, entry + atrVal * 1.5);
  const stopDist = Math.abs(entry - sl);
  if (stopDist <= 0) return empty;
  const tp = direction === "long" ? entry + stopDist * 2 : entry - stopDist * 2;
  return { score: Math.min(100, score), direction, entry, sl, tp, r: Math.abs(tp - entry) / stopDist,
    macd_momentum: +macdMomentum.toFixed(4), volume_ratio: +volRatio.toFixed(2), sr_score: srScore };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const {
      min_score = 72,
      min_r = 1.5,
      initial_capital = 10000,
      risk_pct = 1,
      date_from,
      date_to,
      max_concurrent_trades = 3,
    } = await req.json().catch(() => ({}));

    const alpacaKeyId = Deno.env.get("ALPACA_API_KEY_ID") ?? "";
    const alpacaSecret = Deno.env.get("ALPACA_API_SECRET_KEY") ?? "";
    if (!alpacaKeyId || !alpacaSecret) throw new Error("Alpaca credentials not set");

    const alpacaHeaders = {
      "APCA-API-KEY-ID": alpacaKeyId,
      "APCA-API-SECRET-KEY": alpacaSecret,
    };

    // Get user's watchlist from user_settings
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get user from JWT
    const userRes = await supabaseClient.auth.getUser(authHeader.replace("Bearer ", ""));
    const userId = userRes.data.user?.id;

    const DEFAULT_SYMBOLS = [
      "AAPL", "MSFT", "NVDA", "TSLA", "SPY", "QQQ",
      "BTC/USD", "ETH/USD"
    ];
    let SYMBOLS = [...DEFAULT_SYMBOLS];
    if (userId) {
      const { data: settings } = await supabaseClient
        .from("user_settings")
        .select("watchlist")
        .eq("user_id", userId)
        .maybeSingle();
      if (Array.isArray(settings?.watchlist) && settings.watchlist.length > 0) {
        SYMBOLS = settings.watchlist.filter((s: string) =>
          !FOREX_SYMBOLS.includes(s)
        );
        if (SYMBOLS.length === 0) SYMBOLS = [...DEFAULT_SYMBOLS];
      }
    }
    console.log(`[backtest] Processing ${SYMBOLS.length} symbols:`, SYMBOLS);

    // Date range: default last 180 days, supports up to 3 years
    const endDate = date_to ? new Date(date_to) : new Date();
    const startDate = date_from
      ? new Date(date_from)
      : new Date(endDate.getTime() - 180 * 24 * 60 * 60 * 1000);

    // Cap at 3 years max
    const maxMs = 3 * 365 * 24 * 60 * 60 * 1000;
    const actualStart = endDate.getTime() - startDate.getTime() > maxMs
      ? new Date(endDate.getTime() - maxMs)
      : startDate;

    const startStr = actualStart.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    // Fetch bars per symbol and run walk-forward
    const allTrades: Record<string, unknown>[] = [];
    const symbolSummaries: Record<string, unknown>[] = [];
    let totalCapital = initial_capital;
    let openTradesCount = 0;
    const openTradesBySymbol: Record<string, boolean> = {};

    for (const sym of SYMBOLS) {
      try {
        const isForex = FOREX_SYMBOLS.includes(sym);
        const isCrypto = sym.includes("/") && !isForex;
        let bars: {open:number;high:number;low:number;close:number;volume:number;timestamp:string}[] = [];

        if (isForex) {
          symbolSummaries.push({
            symbol: sym, trades: 0, wins: 0, losses: 0,
            win_rate: 0, profit_factor: 0, total_pnl: 0, avg_r: 0,
            skipped: true, reason: "forex_not_supported_by_alpaca"
          });
          continue;
        }

        if (isCrypto) {
          const cryptoSym = sym;
          const url = `https://data.alpaca.markets/v1beta3/crypto/us/bars?symbols=${encodeURIComponent(cryptoSym)}&timeframe=1Day&start=${startStr}&end=${endStr}&limit=1000`;
          const r = await fetch(url, { headers: alpacaHeaders, signal: AbortSignal.timeout(15000) });
          if (!r.ok) { console.warn(`${sym}: error ${r.status}`); continue; }
          const d = await r.json();
          const rawBars = d.bars?.[cryptoSym] || d.bars?.[sym] || [];
          bars = rawBars.map((b: Record<string,unknown>) => ({
            open: Number(b.o), high: Number(b.h), low: Number(b.l),
            close: Number(b.c), volume: Number(b.v),
            timestamp: String(b.t).split('T')[0],
          }));
        } else {
          const stockUrl = `https://data.alpaca.markets/v2/stocks/bars?symbols=${encodeURIComponent(sym)}&timeframe=1Day&start=${startStr}&end=${endStr}&limit=1000&adjustment=split&feed=iex`;
          const r = await fetch(stockUrl, {
            headers: {
              "APCA-API-KEY-ID": alpacaKeyId,
              "APCA-API-SECRET-KEY": alpacaSecret,
              "Accept": "application/json",
            },
            signal: AbortSignal.timeout(15000),
          });
          if (!r.ok) {
            const errText = await r.text();
            console.warn(`${sym}: stock fetch error ${r.status} - ${errText}`);
            continue;
          }
          const d = await r.json();
          const symBars = d.bars?.[sym] || [];
          bars = symBars.map((b: Record<string,unknown>) => ({
            open: Number(b.o), high: Number(b.h), low: Number(b.l),
            close: Number(b.c), volume: Number(b.v),
            timestamp: String(b.t).split('T')[0],
          }));
        }

        if (bars.length < 60) {
          console.warn(`${sym}: insufficient bars (${bars.length})`);
          continue;
        }

        // Need extra lookback for indicators (50 bars minimum)
        const simStartIdx = Math.max(50, bars.length - Math.ceil((endDate.getTime() - actualStart.getTime()) / (24 * 60 * 60 * 1000)));
        const symTrades: Record<string,unknown>[] = [];
        let inTrade = false;
        let tradeEntry = 0, tradeSL = 0, tradeTP = 0;
        let tradeDir = "", tradeDate = "", tradeScore = 0;
        let tradeMacd = 0, tradeVolRatio = 1, tradeSrScore = 0;

        for (let i = simStartIdx; i < bars.length; i++) {
          if (!inTrade) {
            // Respect max concurrent trades limit
            if (openTradesCount >= max_concurrent_trades) continue;
            if (openTradesBySymbol[sym]) continue;

            const { score, direction, entry, sl, tp, r, macd_momentum, volume_ratio: vr, sr_score: sr } = scoreDay(bars.slice(0, i + 1));
            if (score >= min_score && direction && r >= min_r && Math.abs(entry - sl) / entry <= 0.10) {
              inTrade = true;
              openTradesCount++;
              openTradesBySymbol[sym] = true;
              tradeEntry = entry; tradeSL = sl; tradeTP = tp;
              tradeDir = direction; tradeDate = bars[i].timestamp; tradeScore = score;
              tradeMacd = macd_momentum; tradeVolRatio = vr; tradeSrScore = sr;
            }
          } else {
            const bar = bars[i];
            let exitPrice = 0, outcome = "";

            if (tradeDir === "long") {
              if (bar.low <= tradeSL) { exitPrice = tradeSL; outcome = "stop_loss"; }
              else if (bar.high >= tradeTP) { exitPrice = tradeTP; outcome = "take_profit"; }
            } else {
              if (bar.high >= tradeSL) { exitPrice = tradeSL; outcome = "stop_loss"; }
              else if (bar.low <= tradeTP) { exitPrice = tradeTP; outcome = "take_profit"; }
            }

            if (outcome) {
              const stopDist = Math.abs(tradeEntry - tradeSL);
              // Fix: r_actual sign based on outcome
              const rawPnl = tradeDir === "long"
                ? exitPrice - tradeEntry
                : tradeEntry - exitPrice;
              const rActual = outcome === "take_profit" ? 2.0
                : outcome === "stop_loss" ? -1.0
                : stopDist > 0 ? rawPnl / stopDist : 0;

              const riskDollars = totalCapital * (risk_pct / 100);
              const qty = stopDist > 0 ? riskDollars / stopDist : 0;
              const pnlDollars = rawPnl * qty;
              totalCapital += pnlDollars;

              const trade = {
                date_entry: tradeDate,
                date_exit: bar.timestamp,
                month: tradeDate.substring(0, 7),
                symbol: sym,
                direction: tradeDir,
                score: +tradeScore.toFixed(1),
                entry_price: +tradeEntry.toFixed(4),
                exit_price: +exitPrice.toFixed(4),
                stop_loss: +tradeSL.toFixed(4),
                take_profit: +tradeTP.toFixed(4),
                r_actual: rActual,
                pnl_dollars: +pnlDollars.toFixed(2),
                outcome,
                capital_after: +totalCapital.toFixed(2),
                macd_momentum: tradeMacd,
                volume_ratio: tradeVolRatio,
                sr_score: tradeSrScore,
              };
              symTrades.push(trade);
              allTrades.push(trade);
              inTrade = false;
              openTradesCount = Math.max(0, openTradesCount - 1);
              delete openTradesBySymbol[sym];
            }
          }
        }

        const wins = symTrades.filter(t => t.outcome === "take_profit");
        const losses = symTrades.filter(t => t.outcome === "stop_loss");
        const totalPnl = symTrades.reduce((s, t) => s + Number(t.pnl_dollars), 0);
        const gp = wins.reduce((s, t) => s + Number(t.pnl_dollars), 0);
        const gl = Math.abs(losses.reduce((s, t) => s + Number(t.pnl_dollars), 0));

        symbolSummaries.push({
          symbol: sym, trades: symTrades.length,
          wins: wins.length, losses: losses.length,
          win_rate: symTrades.length > 0 ? +((wins.length / symTrades.length) * 100).toFixed(1) : 0,
          profit_factor: gl > 0 ? +(gp / gl).toFixed(2) : gp > 0 ? 999 : 0,
          total_pnl: +totalPnl.toFixed(2),
          avg_r: symTrades.length > 0
            ? +(symTrades.reduce((s, t) => s + Number(t.r_actual), 0) / symTrades.length).toFixed(2)
            : 0,
        });
      } catch (e) {
        console.error(`${sym}:`, e);
      }
    }

    // Sort all trades by date
    allTrades.sort((a, b) => String(a.date_entry).localeCompare(String(b.date_entry)));

    // Monthly PnL breakdown
    const monthlyMap: Record<string, { pnl: number; trades: number; wins: number; capital_end: number }> = {};
    for (const t of allTrades) {
      const month = String(t.month || String(t.date_entry).substring(0, 7));
      if (!monthlyMap[month]) monthlyMap[month] = { pnl: 0, trades: 0, wins: 0, capital_end: 0 };
      monthlyMap[month].pnl += Number(t.pnl_dollars);
      monthlyMap[month].trades++;
      if (t.outcome === "take_profit") monthlyMap[month].wins++;
      monthlyMap[month].capital_end = Number(t.capital_after);
    }
    const monthly = Object.entries(monthlyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, d]) => ({
        month,
        pnl: +d.pnl.toFixed(2),
        trades: d.trades,
        wins: d.wins,
        win_rate: d.trades > 0 ? +((d.wins / d.trades) * 100).toFixed(1) : 0,
        capital_end: d.capital_end,
      }));

    // Global metrics
    const allWins = allTrades.filter(t => t.outcome === "take_profit");
    const allLosses = allTrades.filter(t => t.outcome === "stop_loss");
    const globalPnl = totalCapital - initial_capital;
    const gp2 = allWins.reduce((s, t) => s + Number(t.pnl_dollars), 0);
    const gl2 = Math.abs(allLosses.reduce((s, t) => s + Number(t.pnl_dollars), 0));
    let maxDD = 0, peak = initial_capital;
    for (const t of allTrades) {
      const cap = Number(t.capital_after);
      if (cap > peak) peak = cap;
      maxDD = Math.max(maxDD, ((peak - cap) / peak) * 100);
    }
    const months = monthly.length || 1;
    const avgMonthlyPnl = globalPnl / months;

    return new Response(JSON.stringify({
      config: { date_from: startStr, date_to: endStr, min_score, min_r, risk_pct, initial_capital, max_concurrent_trades, symbols: SYMBOLS },
      summary: {
        initial_capital,
        final_capital: +totalCapital.toFixed(2),
        total_pnl: +globalPnl.toFixed(2),
        total_return_pct: +((globalPnl / initial_capital) * 100).toFixed(1),
        avg_monthly_pnl: +avgMonthlyPnl.toFixed(2),
        months_simulated: months,
        total_trades: allTrades.length,
        wins: allWins.length,
        losses: allLosses.length,
        win_rate: allTrades.length > 0 ? +((allWins.length / allTrades.length) * 100).toFixed(1) : 0,
        profit_factor: gl2 > 0 ? +(gp2 / gl2).toFixed(2) : gp2 > 0 ? 999 : 0,
        max_drawdown_pct: +maxDD.toFixed(2),
        avg_r: allTrades.length > 0
          ? +(allTrades.reduce((s, t) => s + Number(t.r_actual), 0) / allTrades.length).toFixed(2)
          : 0,
        symbols_tested: SYMBOLS.length,
        symbols_with_trades: symbolSummaries.filter((s: Record<string, unknown>) => Number(s.trades) > 0).length,
      },
      monthly,
      by_symbol: symbolSummaries,
      trade_log: allTrades,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
