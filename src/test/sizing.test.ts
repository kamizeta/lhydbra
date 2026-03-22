import { describe, test, expect } from 'vitest';
import { calcPositionSize, calcRiskReward } from '@/lib/sizing';

const base = {
  capital: 10000, riskPct: 1, entryPrice: 100, stopLoss: 98,
  maxSingleAssetPct: 25, existingSymbolExposure: 0,
  existingTotalExposure: 0, maxLeverage: 2, isFractional: false,
};

describe('calcPositionSize', () => {
  test('1% risk on $10k, $2 stop, capped by 25% concentration = 25 shares', () => {
    expect(calcPositionSize(base)).toBe(25);
  });
  test('concentration cap at 25%', () => {
    expect(calcPositionSize({ ...base, riskPct: 50 })).toBe(25);
  });
  test('existing exposure reduces room', () => {
    expect(calcPositionSize({ ...base, existingSymbolExposure: 2000, riskPct: 50 })).toBe(5);
  });
  test('zero if stop equals entry', () => {
    expect(calcPositionSize({ ...base, stopLoss: 100 })).toBe(0);
  });
  test('zero if capital is zero', () => {
    expect(calcPositionSize({ ...base, capital: 0 })).toBe(0);
  });
  test('fractional for crypto', () => {
    const p = { ...base, isFractional: true, entryPrice: 50000, stopLoss: 49000 };
    expect(calcPositionSize(p)).toBe(0.05);
  });
  test('leverage cap', () => {
    expect(calcPositionSize({ ...base, existingTotalExposure: 19000, riskPct: 50 })).toBe(10);
  });
});

describe('calcRiskReward', () => {
  test('2:1 RR', () => { expect(calcRiskReward(100, 98, [104])).toBe(2); });
  test('averaged targets', () => { expect(calcRiskReward(100, 98, [104, 106])).toBe(2.5); });
  test('zero with no targets', () => { expect(calcRiskReward(100, 98, [])).toBe(0); });
});
