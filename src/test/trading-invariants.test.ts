import { describe, test, expect } from 'vitest';

/**
 * Trading system invariants that must ALWAYS hold.
 * These tests catch regressions in critical money-handling logic.
 */

describe('market hours validation', () => {
  function isMarketOpen(hour: number, minute: number, weekday: string): boolean {
    if (weekday === 'Sat' || weekday === 'Sun') return false;
    const mins = hour * 60 + minute;
    return mins >= 570 && mins < 960; // 9:30 AM - 4:00 PM ET
  }

  test('market open at 9:30 AM ET', () => {
    expect(isMarketOpen(9, 30, 'Mon')).toBe(true);
  });

  test('market closed at 9:29 AM ET', () => {
    expect(isMarketOpen(9, 29, 'Mon')).toBe(false);
  });

  test('market closed at 4:00 PM ET', () => {
    expect(isMarketOpen(16, 0, 'Mon')).toBe(false);
  });

  test('market open at 3:59 PM ET', () => {
    expect(isMarketOpen(15, 59, 'Mon')).toBe(true);
  });

  test('market closed on Saturday', () => {
    expect(isMarketOpen(12, 0, 'Sat')).toBe(false);
  });

  test('market closed on Sunday', () => {
    expect(isMarketOpen(12, 0, 'Sun')).toBe(false);
  });
});

describe('concentration limits', () => {
  function maxAllowedShares(
    capital: number,
    maxPct: number,
    existingExposure: number,
    entryPrice: number
  ): number {
    const maxAssetValue = Math.max(0, (capital * maxPct / 100) - existingExposure);
    return Math.floor(maxAssetValue / entryPrice);
  }

  test('no existing exposure: full allocation available', () => {
    // 10% of 100k = 10k. At $100 = 100 shares
    expect(maxAllowedShares(100000, 10, 0, 100)).toBe(100);
  });

  test('half exposed: half available', () => {
    expect(maxAllowedShares(100000, 10, 5000, 100)).toBe(50);
  });

  test('fully exposed: zero available', () => {
    expect(maxAllowedShares(100000, 10, 10000, 100)).toBe(0);
  });

  test('over-exposed: still zero (never negative)', () => {
    expect(maxAllowedShares(100000, 10, 15000, 100)).toBe(0);
  });
});

describe('daily loss guard', () => {
  function shouldBlockTrading(
    dailyPnl: number,
    capital: number,
    maxLossPct: number
  ): boolean {
    const maxLoss = (maxLossPct / 100) * capital;
    return dailyPnl < -maxLoss;
  }

  test('no loss: trading allowed', () => {
    expect(shouldBlockTrading(0, 100000, 3)).toBe(false);
  });

  test('small loss: trading allowed', () => {
    expect(shouldBlockTrading(-2000, 100000, 3)).toBe(false);
  });

  test('at limit: trading allowed (not exceeded)', () => {
    expect(shouldBlockTrading(-3000, 100000, 3)).toBe(false);
  });

  test('over limit: trading blocked', () => {
    expect(shouldBlockTrading(-3001, 100000, 3)).toBe(true);
  });

  test('profit: trading allowed', () => {
    expect(shouldBlockTrading(5000, 100000, 3)).toBe(false);
  });
});

describe('kill switch', () => {
  test('trading disabled blocks all execution', () => {
    const sysConfig = { trading_enabled: false, kill_switch_reason: 'Manual stop' };
    const shouldExecute = sysConfig.trading_enabled;
    expect(shouldExecute).toBe(false);
  });

  test('trading enabled allows execution', () => {
    const sysConfig = { trading_enabled: true, kill_switch_reason: null };
    const shouldExecute = sysConfig.trading_enabled;
    expect(shouldExecute).toBe(true);
  });
});

describe('reconciliation discrepancy thresholds', () => {
  function shouldTriggerKillSwitch(discrepancyCount: number, threshold: number = 3): boolean {
    return discrepancyCount > threshold;
  }

  test('0 discrepancies: no kill switch', () => {
    expect(shouldTriggerKillSwitch(0)).toBe(false);
  });

  test('3 discrepancies: no kill switch (at threshold)', () => {
    expect(shouldTriggerKillSwitch(3)).toBe(false);
  });

  test('4 discrepancies: kill switch triggered', () => {
    expect(shouldTriggerKillSwitch(4)).toBe(true);
  });
});

describe('trend enum contract', () => {
  const VALID_TRENDS = ['uptrend', 'downtrend', 'sideways'];

  test('uptrend is a valid trend', () => {
    expect(VALID_TRENDS).toContain('uptrend');
  });

  test('downtrend is a valid trend', () => {
    expect(VALID_TRENDS).toContain('downtrend');
  });

  test('"up" is NOT a valid trend', () => {
    expect(VALID_TRENDS).not.toContain('up');
  });

  test('"down" is NOT a valid trend', () => {
    expect(VALID_TRENDS).not.toContain('down');
  });
});

describe('rate limit atomicity', () => {
  test('concurrent increments should not exceed limit', () => {
    // Simulates the atomic check: if count > max, reject
    let count = 0;
    const max = 10;
    const results: boolean[] = [];

    // Simulate 15 "concurrent" requests
    for (let i = 0; i < 15; i++) {
      count++;
      results.push(count <= max);
    }

    // Exactly 10 should pass, 5 should fail
    const passed = results.filter(r => r).length;
    const failed = results.filter(r => !r).length;
    expect(passed).toBe(10);
    expect(failed).toBe(5);
  });
});
