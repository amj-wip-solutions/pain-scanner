import type { ContextStats, ScoreWeights, SignalBundle } from '@painradar/core';

export async function score(): Promise<void> {
  // TODO: read WHERE status = 'clustered', load source_configs.score_weights,
  // compute ContextStats per row (cluster_member_count, velocity_ratio,
  // tool_competitor_count), call computeScore(), write score + signal_breakdown,
  // advance status to 'scored'. Update cluster.score_aggregate = max(member.score).
}

export function computeScore(
  signals: SignalBundle,
  weights: ScoreWeights,
  context: ContextStats,
): { score: number; breakdown: Record<string, number> } {
  const buckets = {
    frequency: weights.frequency * frequencyValue(context.cluster_member_count),
    workaround: weights.workaround * workaroundValue(signals.workaround_strength),
    b2b: weights.b2b * b2bValue(signals.b2b_strength),
    velocity: weights.velocity * velocityValue(context.velocity_ratio),
    uniqueness: weights.uniqueness * uniquenessValue(context.tool_competitor_count),
  };
  const wtp_bonus = signals.wtp_present ? weights.wtp_bonus : 0;
  const total = Object.values(buckets).reduce((a, b) => a + b, 0) + wtp_bonus;
  return {
    score: Math.min(100, Math.round(total)),
    breakdown: { ...buckets, wtp_bonus },
  };
}

function frequencyValue(memberCount: number): number {
  // 1 member = 0.0, 10+ members = 1.0
  return Math.min(1, Math.max(0, (memberCount - 1) / 9));
}

function workaroundValue(strength: 0 | 1 | 2): number {
  return strength / 2;
}

function b2bValue(strength: 0 | 1 | 2): number {
  return strength / 2;
}

function velocityValue(ratio: number): number {
  // ratio = recent rate / baseline. 1.0 = baseline, 3.0+ = max.
  return Math.min(1, Math.max(0, (ratio - 1) / 2));
}

function uniquenessValue(competitorCount: number): number {
  // 0 competitors = 1.0, 5+ competitors = 0.0
  return Math.min(1, Math.max(0, 1 - competitorCount / 5));
}
