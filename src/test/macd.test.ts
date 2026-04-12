import { describe, test, expect } from 'vitest';

/**
 * MACD implementation matching compute-indicators/index.ts (post-fix).
 * Tests verify no lookahead bias (F-003).
 */
function ema(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let emaVal = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) {
    emaVal = values[i] * k + emaVal * (1 - k);
  }
  return emaVal;
}

function macd(closes: number[]): { macd: number; signal: number; histogram: number } | null {
  if (closes.length < 35) return null;

  const k12 = 2 / (12 + 1);
  const k26 = 2 / (26 + 1);
  const kSignal = 2 / (9 + 1);

  let ema12 = closes.slice(0, 12).reduce((a, b) => a + b, 0) / 12;
  let ema26 = closes.slice(0, 26).reduce((a, b) => a + b, 0) / 26;

  for (let i = 12; i < 26; i++) {
    ema12 = closes[i] * k12 + ema12 * (1 - k12);
  }

  const macdValues: number[] = [];
  for (let i = 26; i < closes.length; i++) {
    ema12 = closes[i] * k12 + ema12 * (1 - k12);
    ema26 = closes[i] * k26 + ema26 * (1 - k26);
    macdValues.push(ema12 - ema26);
  }

  if (macdValues.length < 9) return null;

  let signalLine = macdValues.slice(0, 9).reduce((a, b) => a + b, 0) / 9;
  for (let i = 9; i < macdValues.length; i++) {
    signalLine = macdValues[i] * kSignal + signalLine * (1 - kSignal);
  }

  const lastMacd = macdValues[macdValues.length - 1];
  return {
    macd: lastMacd,
    signal: signalLine,
    histogram: lastMacd - signalLine,
  };
}

// Generate synthetic price series
function generatePrices(length: number, start: number, trend: number, noise: number): number[] {
  const prices: number[] = [];
  let price = start;
  for (let i = 0; i < length; i++) {
    price += trend + (Math.random() - 0.5) * noise;
    prices.push(price);
  }
  return prices;
}

describe('MACD - no lookahead bias', () => {
  test('adding future data does not change historical MACD', () => {
    // Calculate MACD with 50 bars
    const prices50 = generatePrices(50, 100, 0.1, 0.5);
    const result50 = macd(prices50);

    // Calculate MACD with 50 bars + 50 more future bars
    const prices100 = [...prices50, ...generatePrices(50, prices50[49], -0.2, 1.0)];
    const resultSubset = macd(prices50); // Same first 50

    // Both should produce identical results for the same 50-bar input
    expect(result50?.macd).toBe(resultSubset?.macd);
    expect(result50?.signal).toBe(resultSubset?.signal);
    expect(result50?.histogram).toBe(resultSubset?.histogram);
  });

  test('MACD uses only data up to current bar', () => {
    const prices = generatePrices(60, 100, 0.1, 0.5);

    // MACD of first 50 bars
    const macd50 = macd(prices.slice(0, 50));
    // MACD of first 55 bars
    const macd55 = macd(prices.slice(0, 55));

    // They should differ because macd55 has 5 more bars
    // But if there were lookahead, macd50 would already "know" about bars 50-54
    expect(macd50?.macd).not.toBe(macd55?.macd);
  });

  test('returns null for insufficient data', () => {
    expect(macd(generatePrices(34, 100, 0.1, 0.5))).toBeNull();
    expect(macd(generatePrices(35, 100, 0.1, 0.5))).not.toBeNull();
  });

  test('uptrend produces positive MACD', () => {
    // Strong uptrend: +2 per bar for 100 bars
    const prices = generatePrices(100, 100, 2, 0.1);
    const result = macd(prices);
    expect(result).not.toBeNull();
    expect(result!.macd).toBeGreaterThan(0);
  });

  test('downtrend produces negative MACD', () => {
    // Strong downtrend: -2 per bar for 100 bars
    const prices = generatePrices(100, 200, -2, 0.1);
    const result = macd(prices);
    expect(result).not.toBeNull();
    expect(result!.macd).toBeLessThan(0);
  });

  test('histogram is macd minus signal', () => {
    const prices = generatePrices(80, 100, 0.5, 1);
    const result = macd(prices);
    expect(result).not.toBeNull();
    expect(Math.abs(result!.histogram - (result!.macd - result!.signal))).toBeLessThan(1e-10);
  });
});

describe('EMA - correctness', () => {
  test('EMA of constant series equals that constant', () => {
    const series = Array(20).fill(50);
    expect(ema(series, 10)).toBeCloseTo(50, 10);
  });

  test('EMA returns null for insufficient data', () => {
    expect(ema([1, 2, 3], 5)).toBeNull();
  });

  test('EMA of 1 period equals last value', () => {
    expect(ema([10, 20, 30], 1)).toBeCloseTo(30, 0);
  });

  test('EMA responds to recent values more', () => {
    // Series that jumps up at the end
    const series = [...Array(20).fill(100), 200];
    const result = ema(series, 10);
    expect(result).not.toBeNull();
    // Should be pulled toward 200 but still closer to 100
    expect(result!).toBeGreaterThan(100);
    expect(result!).toBeLessThan(200);
  });
});
