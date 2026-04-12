import { describe, test, expect } from 'vitest';

/**
 * PnL calculation logic extracted from ClosePositionDialog.
 * These tests verify the fix for short PnL inversion (F-012).
 */
function calculatePnl(
  direction: 'long' | 'short',
  avgEntry: number,
  closePrice: number,
  quantity: number
): number {
  const diff = direction === 'long'
    ? closePrice - avgEntry
    : avgEntry - closePrice;
  return diff * Math.abs(quantity);
}

describe('PnL calculation - long positions', () => {
  test('long profit', () => {
    // Buy 10 @ $100, sell @ $110 = +$100
    expect(calculatePnl('long', 100, 110, 10)).toBe(100);
  });

  test('long loss', () => {
    // Buy 10 @ $100, sell @ $90 = -$100
    expect(calculatePnl('long', 100, 90, 10)).toBe(-100);
  });

  test('long breakeven', () => {
    expect(calculatePnl('long', 100, 100, 10)).toBe(0);
  });
});

describe('PnL calculation - short positions', () => {
  test('short profit (price drops)', () => {
    // Short 10 @ $100, cover @ $80 = +$200
    expect(calculatePnl('short', 100, 80, 10)).toBe(200);
  });

  test('short profit with negative quantity', () => {
    // Short -10 @ $100, cover @ $80 = +$200 (Math.abs handles negative qty)
    expect(calculatePnl('short', 100, 80, -10)).toBe(200);
  });

  test('short loss (price rises)', () => {
    // Short 10 @ $100, cover @ $120 = -$200
    expect(calculatePnl('short', 100, 120, 10)).toBe(-200);
  });

  test('short loss with negative quantity', () => {
    // Short -10 @ $100, cover @ $120 = -$200
    expect(calculatePnl('short', 100, 120, -10)).toBe(-200);
  });

  test('short breakeven', () => {
    expect(calculatePnl('short', 100, 100, 10)).toBe(0);
  });
});

describe('PnL - sign consistency', () => {
  test('winning long is always positive', () => {
    const pnl = calculatePnl('long', 50, 55, 100);
    expect(pnl).toBeGreaterThan(0);
  });

  test('losing long is always negative', () => {
    const pnl = calculatePnl('long', 50, 45, 100);
    expect(pnl).toBeLessThan(0);
  });

  test('winning short is always positive', () => {
    const pnl = calculatePnl('short', 50, 45, 100);
    expect(pnl).toBeGreaterThan(0);
  });

  test('losing short is always negative', () => {
    const pnl = calculatePnl('short', 50, 55, 100);
    expect(pnl).toBeLessThan(0);
  });

  test('sign is independent of quantity sign', () => {
    const pnlPos = calculatePnl('short', 100, 80, 10);
    const pnlNeg = calculatePnl('short', 100, 80, -10);
    expect(pnlPos).toBe(pnlNeg);
  });
});
