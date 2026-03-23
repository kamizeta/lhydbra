import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Technical Indicator Computations ───

function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(0, period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function ema(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let emaVal = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) {
    emaVal = values[i] * k + emaVal * (1 - k);
  }
  return emaVal;
}

function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function macd(closes: number[]): { macd: number; signal: number; histogram: number } | null {
  if (closes.length < 35) return null;
  const macdValues: number[] = [];
  for (let i = 0; i <= closes.length - 26; i++) {
    const slice = closes.slice(i, closes.length);
    const e12 = ema(slice, 12);
    const e26 = ema(slice, 26);
    if (e12 !== null && e26 !== null) {
      macdValues.push(e12 - e26);
    }
  }
  if (macdValues.length < 9) return null;
  const k = 2 / (9 + 1);
  let signalLine = macdValues.slice(0, 9).reduce((a, b) => a + b, 0) / 9;
  for (let i = 9; i < macdValues.length; i++) {
    signalLine = macdValues[i] * k + signalLine * (1 - k);
  }
  const currentMacd = macdValues[macdValues.length - 1];
  return {
    macd: currentMacd,
    signal: signalLine,
    histogram: currentMacd - signalLine,
  };
}

function atr(highs: number[], lows: number[], closes: number[], period = 14): number | null {
  if (highs.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trs.push(tr);
  }
  if (trs.length < period) return null;
  let atrVal = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) {
    atrVal = (atrVal * (period - 1) + trs[i]) / period;
  }
  return atrVal;
}

function bollingerBands(closes: number[], period = 20, mult = 2): { upper: number; lower: number } | null {
  const mid = sma(closes, period);
  if (mid === null) return null;
  const slice = closes.slice(0, period);
  const variance = slice.reduce((sum, v) => sum + Math.pow(v - mid, 2), 0) / period;
  const std = Math.sqrt(variance);
  return { upper: mid + mult * std, lower: mid - mult * std };
}

// ─── Regime Detection ───

function detectTrend(closes: number[], sma20: number | null, sma50: number | null): { direction: string; strength: number } {
  if (!sma20 || !sma50 || closes.length < 5) return { direction: 'sideways', strength: 0 };
  const price = closes[closes.length - 1];
  const aboveSma20 = price > sma20;
  const aboveSma50 = price > sma50;
  const sma20AboveSma50 = sma20 > sma50;

  if (aboveSma20 && aboveSma50 && sma20AboveSma50) {
    const strength = Math.min(100, ((price - sma50) / sma50) * 100 * 5);
    return { direction: 'uptrend', strength: Math.abs(strength) };
  }
  if (!aboveSma20 && !aboveSma50 && !sma20AboveSma50) {
    const strength = Math.min(100, ((sma50 - price) / sma50) * 100 * 5);
    return { direction: 'downtrend', strength: Math.abs(strength) };
  }
  return { direction: 'sideways', strength: 20 };
}

function detectVolatilityRegime(atrVal: number | null, price: number): string {
  if (!atrVal || price <= 0) return 'normal';
  const atrPct = (atrVal / price) * 100;
  if (atrPct > 4) return 'high';
  if (atrPct > 2) return 'elevated';
  if (atrPct < 0.5) return 'compressed';
  return 'normal';
}

function detectMarketRegime(trend: string, volatility: string, rsiVal: number | null, macdVal: { histogram: number } | null): { regime: string; confidence: number } {
  if (trend === 'uptrend' && volatility !== 'high') {
    return { regime: 'trending_bullish', confidence: 75 };
  }
  if (trend === 'downtrend' && volatility !== 'high') {
    return { regime: 'trending_bearish', confidence: 75 };
  }
  if (volatility === 'compressed') {
    return { regime: 'compression', confidence: 60 };
  }
  if (volatility === 'high') {
    return { regime: 'volatile', confidence: 70 };
  }
  if (rsiVal && rsiVal > 70) return { regime: 'overbought', confidence: 65 };
  if (rsiVal && rsiVal < 30) return { regime: 'oversold', confidence: 65 };
  return { regime: 'ranging', confidence: 50 };
}

function findSupportResistance(highs: number[], lows: number[], closes: number[]): { support: number; resistance: number } {
  if (closes.length < 5) return { support: 0, resistance: 0 };
  const recentLows = lows.slice(-20);
  const recentHighs = highs.slice(-20);
  return {
    support: Math.min(...recentLows),
    resistance: Math.max(...recentHighs),
  };
}

// ─── Main Handler ───
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    let { symbols, timeframe = '1d' } = body;
    const { scheduled = false } = body;

    // If called from cron or without symbols, load from all users' watchlists
    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      const db2 = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const { data: allSettings } = await db2
        .from("user_settings")
        .select("watchlist");

      const allSymbols = new Set<string>([
        // Always include these core symbols for macro regime detection
        "SPY", "QQQ", "BTC/USD", "ETH/USD",
        "AAPL", "MSFT", "NVDA", "TSLA", "META", "AMZN", "PLTR", "AMD", "AVGO", "NFLX"
      ]);
      for (const s of (allSettings || [])) {
        if (Array.isArray(s.watchlist)) {
          for (const sym of s.watchlist) allSymbols.add(String(sym));
        }
      }
      symbols = [...allSymbols];
      console.log(`[compute-indicators] Scheduled run: processing ${symbols.length} symbols`);
    }

    if (!symbols || symbols.length === 0) {
      return new Response(JSON.stringify({ error: "No symbols to process" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, supabaseKey);

    const results: Record<string, unknown> = {};

    for (const symbol of (symbols as string[])) {
      // Get OHLCV data from cache
      const { data: bars } = await db
        .from('ohlcv_cache')
        .select('open, high, low, close, volume, timestamp')
        .eq('symbol', symbol)
        .eq('timeframe', timeframe)
        .order('timestamp', { ascending: true })
        .limit(250);

      if (!bars || bars.length < 20) {
        results[symbol] = { error: 'insufficient_data', bars_found: bars?.length || 0 };
        continue;
      }

      const closes = bars.map(b => Number(b.close));
      const highs = bars.map(b => Number(b.high));
      const lows = bars.map(b => Number(b.low));
      const price = closes[closes.length - 1];

      // Compute all indicators
      const sma20 = sma(closes, 20);
      const sma50 = sma(closes, 50);
      const sma200 = closes.length >= 200
        ? sma(closes, 200)
        : closes.length >= 100
          ? sma(closes, Math.floor(closes.length * 0.8))
          : null;
      const ema12 = ema(closes, 12);
      const ema26 = ema(closes, 26);
      const rsi14 = rsi(closes, 14);
      const macdVal = macd(closes);
      const atr14 = atr(highs, lows, closes, 14);
      const bb = bollingerBands(closes, 20);
      const trend = detectTrend(closes, sma20, sma50);
      const volRegime = detectVolatilityRegime(atr14, price);
      const regime = detectMarketRegime(trend.direction, volRegime, rsi14, macdVal);
      const sr = findSupportResistance(highs, lows, closes);
      const momentumScore = rsi14 ? Math.max(0, Math.min(100, rsi14)) : 50;

      // Volume indicators
      const volumes = bars.map((b: any) => Number(b.volume || 0));
      const currentVolume = volumes.length > 0 ? volumes[volumes.length - 1] : 0;
      let volumeSma20: number | null = null;
      if (volumes.length >= 20) {
        const recent20 = volumes.slice(-20);
        volumeSma20 = recent20.reduce((a: number, b: number) => a + b, 0) / 20;
      }
      const volumeRatio = volumeSma20 && volumeSma20 > 0
        ? currentVolume / volumeSma20
        : 1.0;

      const features = {
        symbol,
        timeframe,
        asset_type: symbol.includes('/') ? (symbol.includes('XA') ? 'commodity' : 'forex') : 'stock',
        sma_20: sma20,
        sma_50: sma50,
        sma_200: sma200,
        ema_12: ema12,
        ema_26: ema26,
        rsi_14: rsi14,
        macd: macdVal?.macd || null,
        macd_signal: macdVal?.signal || null,
        macd_histogram: macdVal?.histogram || null,
        macd_histogram_prev: (() => {
          if (closes.length >= 36) {
            const prevCloses = closes.slice(0, -1);
            const prevMacd = macd(prevCloses);
            return prevMacd ? prevMacd.histogram : null;
          }
          return null;
        })(),
        momentum_score: momentumScore,
        atr_14: atr14,
        bollinger_upper: bb?.upper || null,
        bollinger_lower: bb?.lower || null,
        volatility_regime: volRegime,
        trend_direction: trend.direction,
        trend_strength: trend.strength,
        support_level: sr.support,
        resistance_level: sr.resistance,
        market_regime: regime.regime,
        regime_confidence: regime.confidence,
        volume: currentVolume,
        volume_sma_20: volumeSma20,
        volume_ratio: volumeRatio,
        computed_at: new Date().toISOString(),
      };

      results[symbol] = features;

      // Persist to market_features (fire-and-forget)
      db.from('market_features').upsert(features, { onConflict: 'symbol,timeframe' }).then(({ error }) => {
        if (error) console.error(`Features upsert ${symbol}:`, error.message);
      });
    }

    // ─── Update correlation matrix ───
    try {
      const processedSymbols = Object.keys(results);
      if (processedSymbols.length >= 2) {
        const { data: priceData } = await db
          .from("market_cache")
          .select("symbol, price, change_percent")
          .in("symbol", processedSymbols);

        if (priceData && priceData.length >= 2) {
          const correlations: {
            symbol_a: string; symbol_b: string; correlation: number;
            asset_class_a: string; asset_class_b: string;
            calculated_at: string; computed_at: string;
          }[] = [];

          const getAssetClass = (sym: string) => {
            if (sym.includes('/USD') && !sym.includes('EUR') && !sym.includes('GBP') && !sym.includes('XAU')) return 'crypto';
            if (['EUR/USD','GBP/USD','USD/JPY'].includes(sym)) return 'forex';
            if (sym === 'XAU/USD') return 'commodity';
            return 'stock';
          };

          for (let i = 0; i < priceData.length; i++) {
            for (let j = i + 1; j < priceData.length; j++) {
              const a = priceData[i];
              const b = priceData[j];
              const changePctA = Number(a.change_percent || 0);
              const changePctB = Number(b.change_percent || 0);

              let corr = 0;
              if (Math.abs(changePctA) > 0.5 && Math.abs(changePctB) > 0.5) {
                const sameDir = Math.sign(changePctA) === Math.sign(changePctB);
                corr = sameDir ? 0.5 : -0.3;
              }

              const pairKey = [a.symbol, b.symbol].sort().join(':');
              const HIGH_CORR_PAIRS: Record<string, number> = {
                'QQQ:SPY': 0.95, 'AAPL:MSFT': 0.80, 'AAPL:QQQ': 0.85,
                'MSFT:QQQ': 0.85, 'BTC/USD:ETH/USD': 0.88,
                'NVDA:QQQ': 0.82, 'TSLA:QQQ': 0.75,
                'EUR/USD:GBP/USD': 0.72,
              };
              if (HIGH_CORR_PAIRS[pairKey] !== undefined) {
                corr = HIGH_CORR_PAIRS[pairKey];
              }

              const sorted = [String(a.symbol), String(b.symbol)].sort();
              const now = new Date().toISOString();
              correlations.push({
                symbol_a: sorted[0],
                symbol_b: sorted[1],
                correlation: corr,
                asset_class_a: getAssetClass(sorted[0]),
                asset_class_b: getAssetClass(sorted[1]),
                calculated_at: now,
                computed_at: now,
              });
            }
          }

          if (correlations.length > 0) {
            await db.from("correlation_matrix").upsert(correlations, {
              onConflict: "symbol_a,symbol_b",
              ignoreDuplicates: false,
            });
            console.log(`[compute-indicators] Updated ${correlations.length} correlation pairs`);
          }
        }
      }
    } catch (corrErr) {
      console.error("Correlation update error:", corrErr);
    }

    // ─── Cache OHLCV history for backtest ───
    try {
      const twelveKey = Deno.env.get("TWELVE_DATA_API_KEY") ?? "";
      const processedSymbols = symbols as string[];
      if (twelveKey && processedSymbols && processedSymbols.length > 0) {
        for (const sym of processedSymbols.slice(0, 5)) {
          const { data: existingBars } = await db
            .from("ohlcv_cache")
            .select("timestamp")
            .eq("symbol", sym)
            .eq("timeframe", "1d")
            .order("timestamp", { ascending: false })
            .limit(1);

          const lastBar = existingBars?.[0]?.timestamp;
          const daysSince = lastBar
            ? (Date.now() - new Date(lastBar).getTime()) / 86400000
            : 999;

          if (daysSince < 1) continue;

          const r = await fetch(
            `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(sym)}&interval=1day&outputsize=365&apikey=${twelveKey}`,
            { signal: AbortSignal.timeout(8000) }
          );
          if (!r.ok) continue;
          const d = await r.json();
          if (!d.values || !Array.isArray(d.values)) continue;

          const bars = d.values.map((v: Record<string, string>) => ({
            symbol: sym,
            timeframe: "1d",
            timestamp: v.datetime,
            open: parseFloat(v.open),
            high: parseFloat(v.high),
            low: parseFloat(v.low),
            close: parseFloat(v.close),
            volume: parseFloat(v.volume || "0"),
          }));

          if (bars.length > 0) {
            await db.from("ohlcv_cache").upsert(bars, {
              onConflict: "symbol,timeframe,timestamp",
              ignoreDuplicates: true,
            });
            console.log(`[ohlcv_cache] ${sym}: ${bars.length} bars cached`);
          }
          await new Promise(resolve => setTimeout(resolve, 8000));
        }
      }
    } catch (ohlcvErr) {
      console.error("OHLCV cache error:", ohlcvErr);
    }

    return new Response(JSON.stringify({ features: results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("compute-indicators error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
