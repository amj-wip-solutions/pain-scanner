import { describe, expect, test } from 'bun:test';
import { tierForScore } from './flag.js';

const thresholds = { hot: 80, watchlist: 60, logged: 40 };

describe('tierForScore', () => {
  test('hot tier at and above hot threshold', () => {
    expect(tierForScore(100, thresholds)).toBe('hot');
    expect(tierForScore(95, thresholds)).toBe('hot');
    expect(tierForScore(80, thresholds)).toBe('hot');
  });

  test('watchlist tier between watchlist and hot', () => {
    expect(tierForScore(79, thresholds)).toBe('watchlist');
    expect(tierForScore(70, thresholds)).toBe('watchlist');
    expect(tierForScore(60, thresholds)).toBe('watchlist');
  });

  test('logged tier between logged and watchlist', () => {
    expect(tierForScore(59, thresholds)).toBe('logged');
    expect(tierForScore(50, thresholds)).toBe('logged');
    expect(tierForScore(40, thresholds)).toBe('logged');
  });

  test('archive tier below logged threshold', () => {
    expect(tierForScore(39, thresholds)).toBe('archive');
    expect(tierForScore(0, thresholds)).toBe('archive');
  });

  test('honors custom thresholds from source_configs', () => {
    const custom = { hot: 90, watchlist: 70, logged: 50 };
    expect(tierForScore(80, custom)).toBe('watchlist');
    expect(tierForScore(70, custom)).toBe('watchlist');
    expect(tierForScore(60, custom)).toBe('logged');
    expect(tierForScore(45, custom)).toBe('archive');
  });
});
