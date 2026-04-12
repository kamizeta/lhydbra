import { describe, test, expect } from 'vitest';
import { calcPositionSize, calcRiskReward } from '@/lib/sizing';

const base = {
  capital: 100000, riskPct: 1, entryPrice: 100, stopLoss: 98,
  maxSingleAssetPct: 10, existingSymbolExposure: 0,
  existingTotalExposure: 0, maxLeverage: 2, isFractional: false,
};

describe('calcPositionSize - money safety edge cases', () => {
  test('existing exposure reduces allowed size', () => {
    // 10% of 100k = 10k max. Already have 5k exposed. Only 5k left = 50 shares at $100
    const result = calcPositionSize({ ...base, existingSymbolExposure: 5000 });
    expect(result).toBeLessThanOrEqual(50);
    expect(result).toBeGreaterThan(0);
  });

  test('existing exposure at limit returns 0', () => {
    // Already at 10% concentration limit
    const result = calcPositionSize({ ...base, existingSymbolExposure: 10000 });
    expect(result).toBe(0);
  });

  test('existing exposure over limit returns 0', () => {
    const result = calcPositionSize({ ...base, existingSymbolExposure: 15000 });
    expect(result).toBe(0);
  });

  test('leverage cap prevents over-leveraging', () => {
    // 2x leverage on 100k = 200k max. Already exposed 195k. Only 5k left = 50 shares
    const result = calcPositionSize({ ...base, existingTotalExposure: 195000, riskPct: 50 });
    expect(result).toBeLessThanOrEqual(50);
  });

  test('never returns NaN', () => {
    const result = calcPositionSize({ ...base, entryPrice: 0 });
    expect(result).toBe(0);
    expect(Number.isNaN(result)).toBe(false);
  });

  test('never returns Infinity', () => {
    const result = calcPositionSize({ ...base, stopLoss: 100 }); // zero risk per unit
    expect(Number.isFinite(result)).toBe(true);
  });

  test('negative capital returns 0', () => {
    expect(calcPositionSize({ ...base, capital: -5000 })).toBe(0);
  });

  test('fractional sizing for crypto - small account', () => {
    const result = calcPositionSize({
      ...base,
      capital: 1000,
      entryPrice: 60000,
      stopLoss: 58000,
      isFractional: true,
      maxSingleAssetPct: 100,
    });
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(1); // Can't afford a full BTC
  });

  test('very small stop distance does not create giant position', () => {
    // $0.01 stop on $100 entry = huge risk-based size, but capped by concentration
    const result = calcPositionSize({ ...base, stopLoss: 99.99 });
    // Max 10% of 100k = 10k. At $100/share = 100 shares max
    expect(result).toBeLessThanOrEqual(100);
  });
});

describe('calcRiskReward - edge cases', () => {
  test('short position RR', () => {
    // Short at 100, stop at 102, target at 96 = 2:1
    expect(calcRiskReward(100, 102, [96])).toBe(2);
  });

  test('negative target still calculates', () => {
    expect(calcRiskReward(100, 98, [90])).toBe(5);
  });

  test('zero stop distance returns 0', () => {
    expect(calcRiskReward(100, 100, [110])).toBe(0);
  });
});
