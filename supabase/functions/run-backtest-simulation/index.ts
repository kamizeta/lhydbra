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

function calcRegime(bars: {close:number}[]): "bull" | "bear" | "choppy" {
  if (bars.length < 50) return "choppy";
  const closes = bars.map(b => b.close);
  const price = closes[closes.length - 1];
  const sma20val = sma(closes, 20) || price;
  const sma50val = sma(closes, 50) || price;
  const spread = Math.abs(sma20val - sma50val) / sma50val;
  if (spread < 0.015) return "choppy";
  if (price > sma50val && sma20val > sma50val) return "bull";
  if (price < sma50val && sma20val < sma50val) return "bear";
  return "choppy";
}

function getMacroRegime(
  spyBars: {close:number}[],
  btcBars: {close:number}[]
): { equityRegime: "bull" | "bear" | "choppy"; cryptoRegime: "bull" | "bear" | "choppy" } {
  return { equityRegime: calcRegime(spyBars), cryptoRegime: calcRegime(btcBars) };
}

const CRYPTO_SYMBOLS = ["BTC/USD", "ETH/USD", "SOL/USD", "XRP/USD"];

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
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });

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

    // Fetch macro reference bars (SPY for equities, BTC for crypto)
    const alpacaHdrs = { "APCA-API-KEY-ID": alpacaKeyId, "APCA-API-SECRET-KEY": alpacaSecret, "Accept": "application/json" };
    let spyBars: {open:number;high:number;low:number;close:number;volume:number;timestamp:string}[] = [];
    let btcBars: {open:number;high:number;low:number;close:number;volume:number;timestamp:string}[] = [];
    try {
      const spyRes = await fetch(`https://data.alpaca.markets/v2/stocks/SPY/bars?timeframe=1Day&start=${startStr}&end=${endStr}&limit=1000&adjustment=split&feed=iex`, { headers: alpacaHdrs, signal: AbortSignal.timeout(10000) });
      if (spyRes.ok) {
        const spyData = await spyRes.json();
        spyBars = (spyData.bars || []).map((b: Record<string,unknown>) => ({ open: Number(b.o), high: Number(b.h), low: Number(b.l), close: Number(b.c), volume: Number(b.v), timestamp: String(b.t).split('T')[0] }));
      }
    } catch (e) { console.warn("SPY macro fetch failed:", e); }
    try {
      const btcRes = await fetch(`https://data.alpaca.markets/v1beta3/crypto/us/bars?symbols=BTC%2FUSD&timeframe=1Day&start=${startStr}&end=${endStr}&limit=1000`, { headers: alpacaHdrs, signal: AbortSignal.timeout(10000) });
      if (btcRes.ok) {
        const btcData = await btcRes.json();
        btcBars = (btcData.bars?.["BTC/USD"] || []).map((b: Record<string,unknown>) => ({ open: Number(b.o), high: Number(b.h), low: Number(b.l), close: Number(b.c), volume: Number(b.v), timestamp: String(b.t).split('T')[0] }));
      }
    } catch (e) { console.warn("BTC macro fetch failed:", e); }
    console.log(`[backtest] Macro bars: SPY=${spyBars.length}, BTC=${btcBars.length}`);

    // ─── PHASE 1: Fetch all bars first ───
    const allTrades: Record<string, unknown>[] = [];
    const symbolSummaries: Record<string, unknown>[] = [];
    let totalCapital = initial_capital;
    const capitalPerSlot = initial_capital / max_concurrent_trades;

    const allBars: Record<string, {open:number;high:number;low:number;close:number;volume:number;timestamp:string}[]> = {};

    for (const sym of SYMBOLS) {
      try {
        const isForex = FOREX_SYMBOLS.includes(sym);
        const isCrypto = sym.includes("/") && !isForex;

        if (isForex) {
          symbolSummaries.push({
            symbol: sym, trades: 0, wins: 0, losses: 0,
            win_rate: 0, profit_factor: 0, total_pnl: 0, avg_r: 0,
            skipped: true, reason: "forex_not_supported_by_alpaca"
          });
          continue;
        }

        let bars: {open:number;high:number;low:number;close:number;volume:number;timestamp:string}[] = [];

        if (isCrypto) {
          const url = `https://data.alpaca.markets/v1beta3/crypto/us/bars?symbols=${encodeURIComponent(sym)}&timeframe=1Day&start=${startStr}&end=${endStr}&limit=1000`;
          const r = await fetch(url, { headers: alpacaHeaders, signal: AbortSignal.timeout(15000) });
          if (!r.ok) { console.warn(`${sym}: error ${r.status}`); continue; }
          const d = await r.json();
          const rawBars = d.bars?.[sym] || [];
          bars = rawBars.map((b: Record<string,unknown>) => ({
            open: Number(b.o), high: Number(b.h), low: Number(b.l),
            close: Number(b.c), volume: Number(b.v),
            timestamp: String(b.t).split('T')[0],
          }));
        } else {
          const stockUrl = `https://data.alpaca.markets/v2/stocks/bars?symbols=${encodeURIComponent(sym)}&timeframe=1Day&start=${startStr}&end=${endStr}&limit=1000&adjustment=split&feed=iex`;
          const r = await fetch(stockUrl, {
            headers: { "APCA-API-KEY-ID": alpacaKeyId, "APCA-API-SECRET-KEY": alpacaSecret, "Accept": "application/json" },
            signal: AbortSignal.timeout(15000),
          });
          if (!r.ok) { console.warn(`${sym}: stock fetch error ${r.status}`); continue; }
          const d = await r.json();
          const symBars = d.bars?.[sym] || [];
          bars = symBars.map((b: Record<string,unknown>) => ({
            open: Number(b.o), high: Number(b.h), low: Number(b.l),
            close: Number(b.c), volume: Number(b.v),
            timestamp: String(b.t).split('T')[0],
          }));
        }

        if (bars.length >= 60) {
          allBars[sym] = bars;
        } else {
          symbolSummaries.push({
            symbol: sym, trades: 0, wins: 0, losses: 0,
            win_rate: 0, profit_factor: 0, total_pnl: 0, avg_r: 0,
            skipped: true, reason: `insufficient_bars_${bars.length}`
          });
        }
      } catch (e) {
        console.error(`${sym} fetch error:`, e);
      }
    }

    // ─── PHASE 2: Day-based walk-forward ───
    const allDates = [...new Set(
      Object.values(allBars).flat().map((b) => b.timestamp)
    )].sort();

    const openPositions: Record<string, {
      entry: number; sl: number; tp: number; direction: string;
      entryDate: string; score: number; regime: string;
      macd_momentum: number; volume_ratio: number; sr_score: number;
      qty: number;
    }> = {};

    for (const date of allDates) {
      // ── CHECK EXITS FIRST ──
      for (const [sym, pos] of Object.entries(openPositions)) {
        const symBars = allBars[sym];
        if (!symBars) continue;
        const bar = symBars.find((b) => b.timestamp === date);
        if (!bar) continue;

        let exitPrice = 0;
        let outcome = "";

        // Stop loss with gap-through modeling
        if (pos.direction === "long") {
          if (bar.low <= pos.sl) { exitPrice = Math.min(pos.sl, bar.open); outcome = "stop_loss"; }
          else if (bar.high >= pos.tp) { exitPrice = pos.tp; outcome = "take_profit"; }
        } else {
          if (bar.high >= pos.sl) { exitPrice = Math.max(pos.sl, bar.open); outcome = "stop_loss"; }
          else if (bar.low <= pos.tp) { exitPrice = pos.tp; outcome = "take_profit"; }
        }

        if (outcome) {
          const slippagePct = 0.001;
          const feeRate = 0.0002;
          const stopDist = Math.abs(pos.entry - pos.sl);
          const grossPnl = pos.direction === "long"
            ? exitPrice - pos.entry
            : pos.entry - exitPrice;
          const entryFee = pos.entry * pos.qty * feeRate;
          const exitFee = exitPrice * pos.qty * feeRate;
          const netPnl = grossPnl * pos.qty - entryFee - exitFee;
          const rActual = stopDist > 0
            ? (exitPrice - pos.entry) * (pos.direction === "long" ? 1 : -1) / stopDist
            : 0;

          totalCapital += netPnl;

          allTrades.push({
            date_entry: pos.entryDate,
            date_exit: date,
            month: pos.entryDate.substring(0, 7),
            symbol: sym,
            direction: pos.direction,
            score: +pos.score.toFixed(1),
            entry_price: +pos.entry.toFixed(4),
            exit_price: +exitPrice.toFixed(4),
            stop_loss: +pos.sl.toFixed(4),
            take_profit: +pos.tp.toFixed(4),
            r_actual: +rActual.toFixed(2),
            pnl_dollars: +netPnl.toFixed(2),
            outcome,
            capital_after: +totalCapital.toFixed(2),
            macro_regime: pos.regime,
            macd_momentum: pos.macd_momentum,
            volume_ratio: pos.volume_ratio,
            sr_score: pos.sr_score,
          });
          delete openPositions[sym];
        }
      }

      // ── CHECK ENTRIES ──
      const openCount = Object.keys(openPositions).length;
      const availableSlots = max_concurrent_trades - openCount;
      if (availableSlots <= 0) continue;

      const candidates: {
        sym: string; score: number; direction: string;
        entry: number; sl: number; tp: number; r: number;
        regime: string; macd_momentum: number; volume_ratio: number; sr_score: number;
      }[] = [];

      for (const sym of SYMBOLS) {
        if (openPositions[sym]) continue;
        const symBars = allBars[sym];
        if (!symBars) continue;
        const idx = symBars.findIndex((b) => b.timestamp === date);
        if (idx < 50) continue;

        const isCryptoSym = CRYPTO_SYMBOLS.includes(sym);
        const macroSpySlice = spyBars.filter((b) => b.timestamp <= date);
        const macroBtcSlice = btcBars.filter((b) => b.timestamp <= date);
        const { equityRegime, cryptoRegime } = getMacroRegime(macroSpySlice, macroBtcSlice);
        const activeRegime = isCryptoSym ? cryptoRegime : equityRegime;

        if (activeRegime === "choppy") continue;

        const result = scoreDay(symBars.slice(0, idx + 1));
        if (!result.direction) continue;
        if (activeRegime === "bull" && result.direction === "short") continue;
        if (activeRegime === "bear" && result.direction === "long") continue;
        if (result.score < min_score || result.r < min_r) continue;
        if (Math.abs(result.entry - result.sl) / result.entry > 0.10) continue;

        candidates.push({
          sym, score: result.score, direction: result.direction,
          entry: result.entry, sl: result.sl, tp: result.tp, r: result.r,
          regime: activeRegime, macd_momentum: result.macd_momentum,
          volume_ratio: result.volume_ratio, sr_score: result.sr_score,
        });
      }

      candidates.sort((a, b) => b.score - a.score);
      for (const c of candidates.slice(0, availableSlots)) {
        // Apply slippage to entry
        const slippagePct = 0.001;
        const slippedEntry = c.entry * (1 + slippagePct * (c.direction === "long" ? 1 : -1));
        const entryStopDist = Math.abs(slippedEntry - c.sl);
        const entrySlotCapital = Math.min(capitalPerSlot, totalCapital / max_concurrent_trades);
        const entryRiskDollars = entrySlotCapital * (risk_pct / 100);
        const entryQty = entryStopDist > 0 ? entryRiskDollars / entryStopDist : 0;
        openPositions[c.sym] = {
          entry: slippedEntry, sl: c.sl, tp: c.tp, direction: c.direction,
          entryDate: date, score: c.score, regime: c.regime,
          macd_momentum: c.macd_momentum, volume_ratio: c.volume_ratio,
          sr_score: c.sr_score,
          qty: entryQty,
        };
      }
    }

    // Close remaining open positions at last available price
    for (const [sym, pos] of Object.entries(openPositions)) {
      const symBars = allBars[sym];
      if (!symBars || symBars.length === 0) continue;
      const lastBar = symBars[symBars.length - 1];
      const feeRate = 0.0002;
      const grossPnl = pos.direction === "long"
        ? lastBar.close - pos.entry
        : pos.entry - lastBar.close;
      const stopDist = Math.abs(pos.entry - pos.sl);
      const entryFee = pos.entry * pos.qty * feeRate;
      const exitFee = lastBar.close * pos.qty * feeRate;
      const netPnl = grossPnl * pos.qty - entryFee - exitFee;
      const rActual = stopDist > 0
        ? (lastBar.close - pos.entry) * (pos.direction === "long" ? 1 : -1) / stopDist
        : 0;
      totalCapital += netPnl;

      allTrades.push({
        date_entry: pos.entryDate,
        date_exit: lastBar.timestamp,
        month: pos.entryDate.substring(0, 7),
        symbol: sym,
        direction: pos.direction,
        score: +pos.score.toFixed(1),
        entry_price: +pos.entry.toFixed(4),
        exit_price: +lastBar.close.toFixed(4),
        stop_loss: +pos.sl.toFixed(4),
        take_profit: +pos.tp.toFixed(4),
        r_actual: +rActual.toFixed(2),
        pnl_dollars: +netPnl.toFixed(2),
        outcome: "timeout",
        capital_after: +totalCapital.toFixed(2),
        macro_regime: pos.regime,
        macd_momentum: pos.macd_momentum,
        volume_ratio: pos.volume_ratio,
        sr_score: pos.sr_score,
      });
    }

    // Build per-symbol summaries from allTrades
    for (const sym of SYMBOLS) {
      if (symbolSummaries.find((s: any) => s.symbol === sym)) continue;
      const symTrades = allTrades.filter((t) => t.symbol === sym);
      const wins = symTrades.filter((t) => t.outcome === "take_profit");
      const losses = symTrades.filter((t) => t.outcome === "stop_loss");
      const totalPnl = symTrades.reduce((s, t) => s + Number(t.pnl_dollars), 0);
      const gp = wins.reduce((s, t) => s + Number(t.pnl_dollars), 0);
      const gl = Math.abs(losses.reduce((s, t) => s + Number(t.pnl_dollars), 0));
      symbolSummaries.push({
        symbol: sym, trades: symTrades.length,
        wins: wins.length, losses: losses.length,
        win_rate: symTrades.length > 0 ? +((wins.length / symTrades.length) * 100).toFixed(1) : 0,
        profit_factor: gl > 0 ? +(gp / gl).toFixed(2) : gp > 0 ? 99.0 : 0,
        total_pnl: +totalPnl.toFixed(2),
        avg_r: symTrades.length > 0
          ? +(symTrades.reduce((s, t) => s + Number(t.r_actual), 0) / symTrades.length).toFixed(2)
          : 0,
      });
    }

    // Sort all trades by date
    allTrades.sort((a, b) => String(a.date_entry).localeCompare(String(b.date_entry)));

    // Monthly PnL breakdown
    const monthlyMap: Record<string, { pnl: number; trades: number; wins: number; capital_end: number; bull: number; bear: number }> = {};
    for (const t of allTrades) {
      const month = String(t.month || String(t.date_entry).substring(0, 7));
      if (!monthlyMap[month]) monthlyMap[month] = { pnl: 0, trades: 0, wins: 0, capital_end: 0, bull: 0, bear: 0 };
      monthlyMap[month].pnl += Number(t.pnl_dollars);
      monthlyMap[month].trades++;
      if (t.outcome === "take_profit") monthlyMap[month].wins++;
      if (t.macro_regime === "bull") monthlyMap[month].bull++;
      if (t.macro_regime === "bear") monthlyMap[month].bear++;
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
        bull_trades: d.bull,
        bear_trades: d.bear,
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
      config: { date_from: startStr, date_to: endStr, min_score, min_r, risk_pct, initial_capital, max_concurrent_trades, symbols: SYMBOLS, macro_filter: "Equity trades follow SPY SMA50 trend. Crypto trades follow BTC SMA50 trend. Choppy markets (SMA20/SMA50 spread < 1.5%) are skipped entirely." },
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
        profit_factor: gl2 > 0 ? +(gp2 / gl2).toFixed(2) : gp2 > 0 ? 99.0 : 0,
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
    }), { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });

  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
