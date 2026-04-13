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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

// ─── Technical Indicators ───

function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  return values.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function ema(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let val = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) {
    val = values[i] * k + val * (1 - k);
  }
  return val;
}

function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function computeMACD(closes: number[]): { macd: number; signal: number; histogram: number } | null {
  if (closes.length < 35) return null;
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  if (ema12 === null || ema26 === null) return null;
  const macdLine = ema12 - ema26;
  // Build MACD line history for signal calculation
  const macdHistory: number[] = [];
  const k12 = 2 / 13, k26 = 2 / 27;
  let e12 = closes.slice(0, 12).reduce((a, b) => a + b, 0) / 12;
  let e26 = closes.slice(0, 26).reduce((a, b) => a + b, 0) / 26;
  for (let i = 26; i < closes.length; i++) {
    e12 = closes[i] * k12 + e12 * (1 - k12);
    e26 = closes[i] * k26 + e26 * (1 - k26);
    macdHistory.push(e12 - e26);
  }
  const signal = macdHistory.length >= 9
    ? ema(macdHistory, 9)
    : macdLine * 0.8;
  const sig = signal ?? macdLine * 0.8;
  return { macd: macdLine, signal: sig, histogram: macdLine - sig };
}

function atr(highs: number[], lows: number[], closes: number[], period = 14): number | null {
  if (highs.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    trs.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
  }
  if (trs.length < period) return null;
  let val = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) val = (val * (period - 1) + trs[i]) / period;
  return val;
}

function bollingerBands(closes: number[], period = 20, mult = 2) {
  const mid = sma(closes, period);
  if (mid === null) return null;
  const slice = closes.slice(-period);
  const std = Math.sqrt(slice.reduce((s, v) => s + Math.pow(v - mid, 2), 0) / period);
  return { upper: mid + mult * std, lower: mid - mult * std, mid };
}

// ─── Regime Detection ───

function detectTrend(closes: number[], s20: number | null, s50: number | null, s200: number | null) {
  if (!s20 || !s50 || closes.length < 5) return { direction: 'sideways', strength: 0 };
  const p = closes[closes.length - 1];
  const above20 = p > s20, above50 = p > s50, sma20Above50 = s20 > s50;

  if (above20 && above50 && sma20Above50) {
    const str = Math.min(100, Math.abs((p - s50) / s50) * 500);
    return { direction: 'uptrend', strength: str };
  }
  if (!above20 && !above50 && !sma20Above50) {
    const str = Math.min(100, Math.abs((s50 - p) / s50) * 500);
    return { direction: 'downtrend', strength: str };
  }
  // Check for transitional states
  if (above20 && !above50) return { direction: 'sideways', strength: 30 };
  if (!above20 && above50) return { direction: 'sideways', strength: 25 };
  return { direction: 'sideways', strength: 20 };
}

function detectVolatilityRegime(atrVal: number | null, price: number, bb: { upper: number; lower: number; mid: number } | null) {
  if (!atrVal || price <= 0) return 'normal';
  const atrPct = (atrVal / price) * 100;
  
  // Use Bollinger bandwidth for additional context
  let bbWidth = 0;
  if (bb) bbWidth = ((bb.upper - bb.lower) / bb.mid) * 100;

  if (atrPct > 5 || bbWidth > 10) return 'high';
  if (atrPct > 3 || bbWidth > 6) return 'elevated';
  if (atrPct < 0.8 && bbWidth < 2) return 'compressed';
  if (atrPct < 1.5) return 'low';
  return 'normal';
}

function detectMarketRegime(
  trend: { direction: string; strength: number },
  volRegime: string,
  rsiVal: number | null,
  macdVal: { histogram: number } | null,
  price: number,
  s200: number | null
) {
  // Strong trend with confirmation
  if (trend.direction === 'uptrend' && trend.strength > 50 && volRegime !== 'high') {
    return { regime: 'trending_bullish', confidence: Math.min(90, 60 + trend.strength * 0.3) };
  }
  if (trend.direction === 'downtrend' && trend.strength > 50 && volRegime !== 'high') {
    return { regime: 'trending_bearish', confidence: Math.min(90, 60 + trend.strength * 0.3) };
  }
  // Breakout detection
  if (volRegime === 'compressed' && macdVal && Math.abs(macdVal.histogram) > 0) {
    return { regime: 'pre_breakout', confidence: 55 };
  }
  // High volatility
  if (volRegime === 'high') {
    if (rsiVal && rsiVal < 25) return { regime: 'capitulation', confidence: 70 };
    if (rsiVal && rsiVal > 80) return { regime: 'euphoria', confidence: 65 };
    return { regime: 'volatile', confidence: 60 };
  }
  // Overbought/Oversold
  if (rsiVal && rsiVal > 75) return { regime: 'overbought', confidence: 65 };
  if (rsiVal && rsiVal < 25) return { regime: 'oversold', confidence: 65 };
  // Below key MA
  if (s200 && price < s200 * 0.95) return { regime: 'bear_market', confidence: 70 };
  if (s200 && price > s200 * 1.1) return { regime: 'bull_market', confidence: 70 };
  // Default
  return { regime: 'ranging', confidence: 45 };
}

function findSupportResistance(highs: number[], lows: number[], closes: number[]) {
  if (closes.length < 10) return { support: 0, resistance: 0 };
  // Use pivot points from recent data
  const recent = 20;
  const h = highs.slice(-recent), l = lows.slice(-recent), c = closes.slice(-recent);
  
  // Find local lows for support
  const localLows: number[] = [];
  const localHighs: number[] = [];
  for (let i = 1; i < h.length - 1; i++) {
    if (l[i] < l[i - 1] && l[i] < l[i + 1]) localLows.push(l[i]);
    if (h[i] > h[i - 1] && h[i] > h[i + 1]) localHighs.push(h[i]);
  }
  
  return {
    support: localLows.length > 0 ? localLows.reduce((a, b) => a + b, 0) / localLows.length : Math.min(...l),
    resistance: localHighs.length > 0 ? localHighs.reduce((a, b) => a + b, 0) / localHighs.length : Math.max(...h),
  };
}

// ─── OHLCV Fetchers ───

async function fetchHistoricalOHLCV(symbol: string, timeframe: string, apiKey: string): Promise<{ o: number; h: number; l: number; c: number; v: number; t: string }[]> {
  const interval = timeframe === '1d' ? '1day' : timeframe === '1h' ? '1h' : timeframe === '4h' ? '4h' : '1day';
  try {
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=200&apikey=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === 'error' || !data.values) return [];
    return data.values.reverse().map((v: Record<string, string>) => ({
      o: parseFloat(v.open), h: parseFloat(v.high), l: parseFloat(v.low),
      c: parseFloat(v.close), v: parseFloat(v.volume || '0'), t: v.datetime,
    }));
  } catch (e) {
    console.error(`OHLCV fetch ${symbol}:`, e);
    return [];
  }
}

// ─── Main Pipeline ───
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const { symbols, timeframe = '1d', force = false } = await req.json();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const twelveKey = Deno.env.get("TWELVE_DATA_API_KEY");
    const db = createClient(supabaseUrl, supabaseKey);

    const symbolList = symbols as string[];
    const results: Record<string, unknown> = {};
    const errors: string[] = [];
    let processed = 0;

    // Process symbols in batches of 4 (Twelve Data rate limits)
    const BATCH_SIZE = 4;
    for (let b = 0; b < symbolList.length; b += BATCH_SIZE) {
      const batch = symbolList.slice(b, b + BATCH_SIZE);

      // Add delay between batches to respect rate limits
      if (b > 0) await new Promise(r => setTimeout(r, 12000));

      await Promise.all(batch.map(async (symbol) => {
        try {
          // 1. Check if we have enough cached data
          let bars: { o: number; h: number; l: number; c: number; v: number; t: string }[] = [];

          if (!force) {
            const { data: cached } = await db
              .from('ohlcv_cache')
              .select('open, high, low, close, volume, timestamp')
              .eq('symbol', symbol)
              .eq('timeframe', timeframe)
              .order('timestamp', { ascending: true })
              .limit(200);

            if (cached && cached.length >= 50) {
              bars = cached.map(r => ({
                o: Number(r.open), h: Number(r.high), l: Number(r.low),
                c: Number(r.close), v: Number(r.volume), t: r.timestamp,
              }));
            }
          }

          // 2. Fetch fresh data if needed
          if (bars.length < 50 && twelveKey) {
            const fresh = await fetchHistoricalOHLCV(symbol, timeframe, twelveKey);
            if (fresh.length > 0) {
              bars = fresh;
              // Cache the data
              const rows = fresh.map(b => ({
                symbol, timeframe,
                open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v,
                timestamp: b.t.includes('T') ? b.t : b.t + 'T00:00:00Z',
                source: 'twelvedata',
                asset_type: symbol.includes('/') ? (symbol.includes('XA') || ['CL','NG','HG'].includes(symbol) ? 'commodity' : symbol.includes('USD') && !['BTC','ETH','SOL','BNB','ADA','XRP','DOGE','AVAX','DOT','LINK','MATIC','SHIB','UNI','ATOM','LTC','NEAR','SUI','APT','ARB','OP'].some(c => symbol.startsWith(c)) ? 'forex' : 'crypto') : 'stock',
              }));
              db.from('ohlcv_cache').upsert(rows, { onConflict: 'symbol,timeframe,timestamp' }).then(({ error }) => {
                if (error) console.error(`Cache ${symbol}:`, error.message);
              });
            }
          }

          if (bars.length < 20) {
            results[symbol] = { error: 'insufficient_data', bars: bars.length };
            return;
          }

          // 3. Compute all indicators
          const closes = bars.map(b => b.c);
          const highs = bars.map(b => b.h);
          const lows = bars.map(b => b.l);
          const price = closes[closes.length - 1];

          const s20 = sma(closes, 20);
          const s50 = sma(closes, 50);
          const s200 = sma(closes, 200);
          const e12 = ema(closes, 12);
          const e26 = ema(closes, 26);
          const rsi14 = rsi(closes, 14);
          const macdVal = computeMACD(closes);
          const atr14 = atr(highs, lows, closes, 14);
          const bb = bollingerBands(closes, 20);
          const trend = detectTrend(closes, s20, s50, s200);
          const volRegime = detectVolatilityRegime(atr14, price, bb);
          const regime = detectMarketRegime(trend, volRegime, rsi14, macdVal, price, s200);
          const sr = findSupportResistance(highs, lows, closes);
          const momentumScore = rsi14 != null ? Math.max(0, Math.min(100, rsi14)) : 50;

          const assetType = symbol.includes('/') 
            ? (['XAU','XAG'].some(c => symbol.startsWith(c)) || ['CL','NG','HG'].includes(symbol) ? 'commodity' 
              : ['BTC','ETH','SOL','BNB','ADA','XRP','DOGE','AVAX','DOT','LINK','MATIC','SHIB','UNI','ATOM','LTC','NEAR','SUI','APT','ARB','OP'].some(c => symbol.startsWith(c)) ? 'crypto' : 'forex')
            : 'stock';

          const features = {
            symbol, timeframe, asset_type: assetType,
            sma_20: s20, sma_50: s50, sma_200: s200,
            ema_12: e12, ema_26: e26,
            rsi_14: rsi14,
            macd: macdVal?.macd ?? null,
            macd_signal: macdVal?.signal ?? null,
            macd_histogram: macdVal?.histogram ?? null,
            momentum_score: momentumScore,
            atr_14: atr14,
            bollinger_upper: bb?.upper ?? null,
            bollinger_lower: bb?.lower ?? null,
            volatility_regime: volRegime,
            trend_direction: trend.direction,
            trend_strength: trend.strength,
            support_level: sr.support,
            resistance_level: sr.resistance,
            market_regime: regime.regime,
            regime_confidence: regime.confidence,
            computed_at: new Date().toISOString(),
          };

          results[symbol] = features;
          processed++;

          // 4. Detect regime change before upserting
          const { data: oldFeature } = await db
            .from('market_features')
            .select('market_regime')
            .eq('symbol', symbol)
            .eq('timeframe', timeframe)
            .single();

          const oldRegime = oldFeature?.market_regime;
          const newRegime = regime.regime;

          // 5. Persist to market_features
          await db.from('market_features').upsert(features, { onConflict: 'symbol,timeframe' });

          // 6. Log regime change if different
          if (oldRegime && oldRegime !== newRegime && oldRegime !== 'undefined') {
            await db.from('regime_changes').insert({
              symbol,
              asset_type: assetType,
              previous_regime: oldRegime,
              new_regime: newRegime,
              regime_confidence: regime.confidence,
            });
          }

        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Unknown';
          errors.push(`${symbol}: ${msg}`);
          console.error(`Pipeline ${symbol}:`, e);
        }
      }));
    }

    return new Response(JSON.stringify({ 
      features: results, 
      processed,
      total: symbolList.length,
      errors: errors.length > 0 ? errors : undefined,
    }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("data-intelligence error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
