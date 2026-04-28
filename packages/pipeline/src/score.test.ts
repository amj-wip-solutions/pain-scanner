import { describe, expect, test } from 'bun:test';
import { computeScore } from './score.js';
import type { ContextStats, ScoreWeights, SignalBundle } from '@painradar/core';

const weights: ScoreWeights = {
  frequency: 25,
  workaround: 30,
  b2b: 10,
  velocity: 15,
  uniqueness: 15,
  wtp_bonus: 10,
};

const zeroSignals: SignalBundle = {
  workaround_strength: 0,
  b2b_strength: 0,
  wtp_present: false,
  source_quality: 0,
  freshness_days: 0,
};

const minCtx: ContextStats = {
  cluster_member_count: 1,
  velocity_ratio: 1,
  tool_competitor_count: 5,
};

describe('computeScore', () => {
  test('floor: zero signals + minimum context = 0', () => {
    const r = computeScore(zeroSignals, weights, minCtx);
    expect(r.score).toBe(0);
  });

  test('ceiling: max signals + max context = 100 (capped)', () => {
    const r = computeScore(
      { ...zeroSignals, workaround_strength: 2, b2b_strength: 2, wtp_present: true },
      weights,
      { cluster_member_count: 10, velocity_ratio: 3, tool_competitor_count: 0 },
    );
    expect(r.score).toBe(100);
  });

  test('breakdown buckets present and non-negative', () => {
    const r = computeScore(zeroSignals, weights, minCtx);
    expect(r.breakdown).toHaveProperty('frequency');
    expect(r.breakdown).toHaveProperty('workaround');
    expect(r.breakdown).toHaveProperty('b2b');
    expect(r.breakdown).toHaveProperty('velocity');
    expect(r.breakdown).toHaveProperty('uniqueness');
    expect(r.breakdown).toHaveProperty('wtp_bonus');
    for (const v of Object.values(r.breakdown)) {
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  test('wtp bonus adds exactly weights.wtp_bonus when present', () => {
    const without = computeScore(zeroSignals, weights, minCtx);
    const withWtp = computeScore({ ...zeroSignals, wtp_present: true }, weights, minCtx);
    expect(withWtp.score - without.score).toBe(10);
  });

  test('vertical-tuned weights: workaround dominates over b2b at equal strength', () => {
    const onlyWorkaround = computeScore(
      { ...zeroSignals, workaround_strength: 2 },
      weights,
      minCtx,
    );
    const onlyB2B = computeScore({ ...zeroSignals, b2b_strength: 2 }, weights, minCtx);
    expect(onlyWorkaround.score).toBeGreaterThan(onlyB2B.score);
  });

  test('member_count scaling: more members -> higher frequency bucket', () => {
    const small = computeScore(zeroSignals, weights, { ...minCtx, cluster_member_count: 1 });
    const big = computeScore(zeroSignals, weights, { ...minCtx, cluster_member_count: 10 });
    expect(big.breakdown.frequency).toBeGreaterThan(small.breakdown.frequency);
  });

  test('uniqueness scaling: fewer competitors -> higher uniqueness bucket', () => {
    const crowded = computeScore(zeroSignals, weights, {
      ...minCtx,
      tool_competitor_count: 5,
    });
    const empty = computeScore(zeroSignals, weights, {
      ...minCtx,
      tool_competitor_count: 0,
    });
    expect(empty.breakdown.uniqueness).toBeGreaterThan(crowded.breakdown.uniqueness);
  });
});
