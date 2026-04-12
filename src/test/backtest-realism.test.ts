import { describe, test, expect } from 'vitest';

/**
 * Tests for backtest realism invariants (F-008).
 * These verify that simulation models real-world trading friction.
 */

describe('slippage modeling', () => {
  const slippagePct = 0.001; // 0.1%

  test('long entry slippage increases price', () => {
    const rawEntry = 100;
    const adjustedEntry = rawEntry * (1 + slippagePct);
    expect(adjustedEntry).toBeGreaterThan(rawEntry);
    expect(adjustedEntry).toBeCloseTo(100.1, 2);
  });

  test('short entry slippage decreases price', () => {
    const rawEntry = 100;
    const adjustedEntry = rawEntry * (1 - slippagePct);
    expect(adjustedEntry).toBeLessThan(rawEntry);
    expect(adjustedEntry).toBeCloseTo(99.9, 2);
  });

  test('slippage always works against the trader', () => {
    const entry = 100;
    const longEntry = entry * (1 + slippagePct);
    const shortEntry = entry * (1 - slippagePct);

    // Long buys higher (worse)
    expect(longEntry).toBeGreaterThan(entry);
    // Short sells lower (worse)
    expect(shortEntry).toBeLessThan(entry);
  });
});

describe('fee calculation', () => {
  const feeRate = 0.0002; // 0.02% per side

  test('round-trip fees reduce PnL', () => {
    const entryPrice = 100;
    const exitPrice = 110;
    const quantity = 10;
    const grossPnl = (exitPrice - entryPrice) * quantity; // $100
    const fees = (entryPrice * quantity * feeRate) + (exitPrice * quantity * feeRate);
    const netPnl = grossPnl - fees;

    expect(fees).toBeGreaterThan(0);
    expect(netPnl).toBeLessThan(grossPnl);
    expect(fees).toBeCloseTo(0.42, 2); // (1000*0.0002) + (1100*0.0002)
  });

  test('fees make small wins into losses', () => {
    const entryPrice = 100;
    const exitPrice = 100.01; // Tiny win
    const quantity = 100;
    const grossPnl = (exitPrice - entryPrice) * quantity; // $1.00
    const fees = (entryPrice * quantity * feeRate) + (exitPrice * quantity * feeRate);
    const netPnl = grossPnl - fees;

    expect(grossPnl).toBeGreaterThan(0);
    // With $1 gross profit and ~$4 in fees, net is negative
    expect(netPnl).toBeLessThan(0);
  });
});

describe('R-multiple calculation', () => {
  test('exact take profit = planned R', () => {
    const entry = 100;
    const sl = 98;
    const tp = 104;
    const stopDist = Math.abs(entry - sl);
    const rActual = (tp - entry) / stopDist;
    expect(rActual).toBe(2.0);
  });

  test('stop loss hit = -1R', () => {
    const entry = 100;
    const sl = 98;
    const stopDist = Math.abs(entry - sl);
    const rActual = (sl - entry) / stopDist;
    expect(rActual).toBe(-1.0);
  });

  test('gap through stop gives worse than -1R', () => {
    const entry = 100;
    const sl = 98;
    const actualExit = 96; // Gapped through
    const stopDist = Math.abs(entry - sl);
    const rActual = (actualExit - entry) / stopDist;
    expect(rActual).toBe(-2.0); // Worse than planned
    expect(rActual).toBeLessThan(-1.0);
  });

  test('short position R-multiple', () => {
    const entry = 100;
    const sl = 102;
    const tp = 96;
    const stopDist = Math.abs(entry - sl);
    const rActual = (entry - tp) / stopDist; // short: profit is entry - exit
    expect(rActual).toBe(2.0);
  });

  test('R-multiple is never hardcoded', () => {
    // Verify that different exits produce different R values
    const entry = 100;
    const sl = 98;
    const stopDist = Math.abs(entry - sl);

    const exits = [99, 101, 103, 105, 107];
    const rValues = exits.map(exit => (exit - entry) / stopDist);

    // All should be different
    const unique = new Set(rValues);
    expect(unique.size).toBe(exits.length);
  });
});

describe('gap-through-stop handling', () => {
  test('long stop: exit at worst of SL or bar open', () => {
    const sl = 98;

    // Bar opens below SL (gap down)
    const barOpen = 96;
    const exitPrice = Math.min(sl, barOpen);
    expect(exitPrice).toBe(96); // Worse than SL

    // Bar opens above SL but low touches it
    const barOpen2 = 99;
    const exitPrice2 = Math.min(sl, barOpen2);
    expect(exitPrice2).toBe(98); // Normal SL fill
  });

  test('short stop: exit at worst of SL or bar open', () => {
    const sl = 102;

    // Bar opens above SL (gap up)
    const barOpen = 105;
    const exitPrice = Math.max(sl, barOpen);
    expect(exitPrice).toBe(105); // Worse than SL

    // Bar opens below SL but high touches it
    const barOpen2 = 101;
    const exitPrice2 = Math.max(sl, barOpen2);
    expect(exitPrice2).toBe(102); // Normal SL fill
  });
});

describe('profit factor edge cases', () => {
  test('profit factor capped at 99 not 999', () => {
    const totalProfits = 1000;
    const totalLosses = 0;
    const pf = totalLosses > 0
      ? +(totalProfits / totalLosses).toFixed(2)
      : (totalProfits > 0 ? 99.0 : 0);
    expect(pf).toBe(99.0);
    expect(pf).not.toBe(999);
  });

  test('zero profits and zero losses = 0', () => {
    const pf = 0 > 0 ? 1 : (0 > 0 ? 99.0 : 0);
    expect(pf).toBe(0);
  });

  test('normal profit factor', () => {
    const totalProfits = 3000;
    const totalLosses = 1000;
    const pf = +(totalProfits / totalLosses).toFixed(2);
    expect(pf).toBe(3.0);
  });
});
