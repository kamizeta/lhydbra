import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYMBOLS = ["AAPL","MSFT","NVDA","TSLA","SPY","QQQ","BTC/USD","ETH/USD","EUR/USD","GBP/USD","USD/JPY","XAU/USD"];

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

function atr(bars: {high:number;low:number;close:number}[], period = 14): number {
  if (bars.length < period + 1) return bars[bars.length-1]?.close * 0.02 || 1;
  let sum = 0;
  for (let i = bars.length - period; i < bars.length; i++) {
    sum += Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - bars[i-1].close), Math.abs(bars[i].low - bars[i-1].close));
  }
  return sum / period;
}

function scoreDay(bars: {open:number;high:number;low:number;close:number;volume:number}[]): {
  score: number; direction: string | null; entry: number; sl: number; tp: number; r: number;
} {
  if (bars.length < 50) return { score: 0, direction: null, entry: 0, sl: 0, tp: 0, r: 0 };
  const closes = bars.map(b => b.close);
  const price = closes[closes.length - 1];
  const rsiVal = rsi(closes);
  const sma20 = sma(closes, 20) || price;
  const sma50 = sma(closes, 50) || price;
  const atrVal = atr(bars);
  const strength = Math.abs(sma20 - sma50) / sma50;
  if (strength < 0.005) return { score: 0, direction: null, entry: 0, sl: 0, tp: 0, r: 0 };
  const trendUp = sma20 > sma50;
  let lScore = 0, sScore = 0;
  if (trendUp) lScore += 2; else sScore += 2;
  if (rsiVal > 55) lScore++; else if (rsiVal < 45) sScore++;
  if (Math.abs(lScore - sScore) < 2) return { score: 0, direction: null, entry: 0, sl: 0, tp: 0, r: 0 };
  const direction = lScore > sScore ? "long" : "short";
  let score = 50;
  if ((trendUp && direction === "long") || (!trendUp && direction === "short")) score += 15;
  if (direction === "long" && rsiVal > 50 && rsiVal < 70) score += 12;
  else if (direction === "short" && rsiVal < 50 && rsiVal > 30) score += 12;
  score += Math.min(15, strength * 1000);
  const entry = price;
  const sl = direction === "long"
    ? Math.max(sma20 - atrVal * 0.5, entry - atrVal * 1.5)
    : Math.min(sma20 + atrVal * 0.5, entry + atrVal * 1.5);
  const stopDist = Math.abs(entry - sl);
  if (stopDist <= 0) return { score: 0, direction: null, entry: 0, sl: 0, tp: 0, r: 0 };
  const tp = direction === "long" ? entry + stopDist * 2 : entry - stopDist * 2;
  return { score: Math.min(100, score), direction, entry, sl, tp, r: Math.abs(tp - entry) / stopDist };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { min_score = 65, min_r = 1.5, initial_capital = 10000, risk_pct = 1 } = await req.json().catch(() => ({}));
    const twelveKey = Deno.env.get("TWELVE_DATA_API_KEY");
    if (!twelveKey) throw new Error("TWELVE_DATA_API_KEY not set");

    const allTrades: Record<string, unknown>[] = [];
    const symbolSummaries: Record<string, unknown>[] = [];
    let totalCapital = initial_capital;

    for (const sym of SYMBOLS) {
      try {
        const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(sym)}&interval=1day&outputsize=365&apikey=${twelveKey}`;
        const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!resp.ok) { console.warn(`${sym}: API error`); continue; }
        const json = await resp.json();
        if (!json.values || json.values.length < 60) { console.warn(`${sym}: insufficient data`); continue; }

        const bars = json.values.reverse().map((v: Record<string, string>) => ({
          open: parseFloat(v.open), high: parseFloat(v.high),
          low: parseFloat(v.low), close: parseFloat(v.close),
          volume: parseFloat(v.volume || "0"), timestamp: v.datetime,
        }));

        const startIdx = Math.max(50, bars.length - 180);
        const symTrades: Record<string, unknown>[] = [];
        let inTrade = false;
        let tradeEntry = 0, tradeSL = 0, tradeTP = 0, tradeDir = "", tradeDate = "", tradeScore = 0;

        for (let i = startIdx; i < bars.length; i++) {
          if (!inTrade) {
            const { score, direction, entry, sl, tp, r } = scoreDay(bars.slice(0, i + 1));
            if (score >= min_score && direction && r >= min_r && Math.abs(entry - sl) / entry <= 0.10) {
              inTrade = true;
              tradeEntry = entry; tradeSL = sl; tradeTP = tp;
              tradeDir = direction; tradeDate = bars[i].timestamp; tradeScore = score;
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
              const rActual = stopDist > 0 ? (tradeDir === "long" ? exitPrice - tradeEntry : tradeEntry - exitPrice) / stopDist : 0;
              const riskDollars = totalCapital * (risk_pct / 100);
              const qty = stopDist > 0 ? riskDollars / stopDist : 0;
              const pnlDollars = (tradeDir === "long" ? exitPrice - tradeEntry : tradeEntry - exitPrice) * qty;
              totalCapital += pnlDollars;
              const trade = {
                date_entry: tradeDate, date_exit: bar.timestamp,
                symbol: sym, direction: tradeDir, score: tradeScore,
                entry_price: +tradeEntry.toFixed(4), exit_price: +exitPrice.toFixed(4),
                stop_loss: +tradeSL.toFixed(4), take_profit: +tradeTP.toFixed(4),
                r_actual: +rActual.toFixed(2), pnl_dollars: +pnlDollars.toFixed(2),
                outcome, capital_after: +totalCapital.toFixed(2),
              };
              symTrades.push(trade);
              allTrades.push(trade);
              inTrade = false;
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
          avg_r: symTrades.length > 0 ? +(symTrades.reduce((s, t) => s + Number(t.r_actual), 0) / symTrades.length).toFixed(2) : 0,
        });

        await new Promise(r => setTimeout(r, 8000));
      } catch (e) { console.error(`${sym}:`, e); }
    }

    allTrades.sort((a, b) => String(a.date_entry).localeCompare(String(b.date_entry)));
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

    return new Response(JSON.stringify({
      summary: {
        initial_capital, final_capital: +totalCapital.toFixed(2),
        total_pnl: +globalPnl.toFixed(2),
        total_return_pct: +((globalPnl / initial_capital) * 100).toFixed(1),
        total_trades: allTrades.length, wins: allWins.length, losses: allLosses.length,
        win_rate: allTrades.length > 0 ? +((allWins.length / allTrades.length) * 100).toFixed(1) : 0,
        profit_factor: gl2 > 0 ? +(gp2 / gl2).toFixed(2) : gp2 > 0 ? 999 : 0,
        max_drawdown_pct: +maxDD.toFixed(2),
        avg_r: allTrades.length > 0 ? +(allTrades.reduce((s, t) => s + Number(t.r_actual), 0) / allTrades.length).toFixed(2) : 0,
        symbols_tested: SYMBOLS.length,
      },
      by_symbol: symbolSummaries,
      trade_log: allTrades,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
