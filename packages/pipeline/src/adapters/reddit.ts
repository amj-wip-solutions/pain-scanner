import type { ComplaintRow, ScoreAdapter, SignalBundle } from '@painradar/core';

export const redditAdapter: ScoreAdapter = {
  source: 'reddit',
  toSignals(row: ComplaintRow): SignalBundle {
    const upvotes = Number(row.source_signals?.upvotes ?? 0);
    return {
      workaround_strength: row.workaround_present ? 2 : 0,
      b2b_strength: row.b2b_context ? 1 : 0,
      wtp_present: !!row.wtp_signal,
      source_quality: Math.min(1, upvotes / 50),
      freshness_days:
        (Date.now() - new Date(row.created_at).getTime()) / (1000 * 60 * 60 * 24),
    };
  },
};
