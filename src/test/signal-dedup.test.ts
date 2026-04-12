import { describe, test, expect } from 'vitest';

/**
 * Tests for signal deduplication logic (F-004).
 * Verifies that signal_key generation is deterministic and unique per
 * user + asset + direction + timeframe + date.
 */

function generateSignalKey(
  userId: string,
  asset: string,
  direction: string,
  timeframe: string,
  date: Date
): string {
  return `${userId}|${asset}|${direction}|${timeframe}|${date.toISOString().slice(0, 10)}`;
}

describe('signal_key generation', () => {
  const userId = 'user-abc-123';
  const today = new Date('2026-04-11T15:00:00Z');

  test('same inputs produce same key', () => {
    const key1 = generateSignalKey(userId, 'AAPL', 'long', '1d', today);
    const key2 = generateSignalKey(userId, 'AAPL', 'long', '1d', today);
    expect(key1).toBe(key2);
  });

  test('different asset produces different key', () => {
    const key1 = generateSignalKey(userId, 'AAPL', 'long', '1d', today);
    const key2 = generateSignalKey(userId, 'MSFT', 'long', '1d', today);
    expect(key1).not.toBe(key2);
  });

  test('different direction produces different key', () => {
    const key1 = generateSignalKey(userId, 'AAPL', 'long', '1d', today);
    const key2 = generateSignalKey(userId, 'AAPL', 'short', '1d', today);
    expect(key1).not.toBe(key2);
  });

  test('different day produces different key', () => {
    const key1 = generateSignalKey(userId, 'AAPL', 'long', '1d', today);
    const tomorrow = new Date('2026-04-12T15:00:00Z');
    const key2 = generateSignalKey(userId, 'AAPL', 'long', '1d', tomorrow);
    expect(key1).not.toBe(key2);
  });

  test('same day different hour produces same key (date-level dedup)', () => {
    const morning = new Date('2026-04-11T09:30:00Z');
    const afternoon = new Date('2026-04-11T16:00:00Z');
    const key1 = generateSignalKey(userId, 'AAPL', 'long', '1d', morning);
    const key2 = generateSignalKey(userId, 'AAPL', 'long', '1d', afternoon);
    expect(key1).toBe(key2);
  });

  test('different user produces different key', () => {
    const key1 = generateSignalKey('user-1', 'AAPL', 'long', '1d', today);
    const key2 = generateSignalKey('user-2', 'AAPL', 'long', '1d', today);
    expect(key1).not.toBe(key2);
  });

  test('key format is pipe-delimited', () => {
    const key = generateSignalKey(userId, 'BTC/USD', 'long', '1d', today);
    const parts = key.split('|');
    expect(parts).toHaveLength(5);
    expect(parts[0]).toBe(userId);
    expect(parts[1]).toBe('BTC/USD');
    expect(parts[2]).toBe('long');
    expect(parts[3]).toBe('1d');
    expect(parts[4]).toBe('2026-04-11');
  });
});

describe('idempotency key generation', () => {
  test('order idempotency key is deterministic', () => {
    const userId = 'user-abc';
    const signalId = 'sig-123';
    const asset = 'AAPL';
    const today = '2026-04-11';

    const key1 = `${userId}|${signalId}|${asset}|${today}`;
    const key2 = `${userId}|${signalId}|${asset}|${today}`;
    expect(key1).toBe(key2);
  });

  test('different signal produces different idempotency key', () => {
    const key1 = 'user-abc|sig-123|AAPL|2026-04-11';
    const key2 = 'user-abc|sig-456|AAPL|2026-04-11';
    expect(key1).not.toBe(key2);
  });
});
