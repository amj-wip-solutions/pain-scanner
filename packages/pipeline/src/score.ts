import {
  config,
  getDb,
  getSourceConfig,
  type ContextStats,
  type ScoreWeights,
  type SignalBundle,
} from '@painradar/core';
import { redditAdapter } from './adapters/reddit.js';
import type { ScoreAdapter, ComplaintRow } from '@painradar/core';

const adapters: Record<string, ScoreAdapter> = {
  reddit: redditAdapter,
};

const BATCH = 50;

type ClusteredRow = ComplaintRow & {
  cluster_id: number;
};

export async function score(): Promise<void> {
  const db = getDb();

  const weightsCache = new Map<string, ScoreWeights>();
  async function weightsFor(source: string): Promise<ScoreWeights> {
    let w = weightsCache.get(source);
    if (w) return w;
    const cfg = await getSourceConfig(source);
    if (!cfg) throw new Error(`source_configs row missing for ${source}`);
    w = cfg.score_weights as unknown as ScoreWeights;
    weightsCache.set(source, w);
    return w;
  }

  let scored = 0;
  let failed = 0;

  for (;;) {
    const { data: rows, error } = await db
      .from('complaints')
      .select('*')
      .eq('status', 'clustered')
      .order('id', { ascending: true })
      .limit(BATCH);
    if (error) throw new Error(`score select: ${error.message}`);
    if (!rows || rows.length === 0) break;

    for (const row of rows as ClusteredRow[]) {
      try {
        const adapter = adapters[row.source];
        if (!adapter) throw new Error(`no score adapter for source=${row.source}`);
        const signals = adapter.toSignals(row);
        const weights = await weightsFor(row.source);

        const { data: clusterMeta } = await db
          .from('clusters')
          .select('member_count, tools_present')
          .eq('id', row.cluster_id)
          .single();

        const memberCount = clusterMeta?.member_count ?? 1;
        const toolCompetitors =
          (clusterMeta?.tools_present ?? []).length > 0
            ? (clusterMeta?.tools_present ?? []).length - 1
            : 0;

        const context: ContextStats = {
          cluster_member_count: memberCount,
          velocity_ratio: 1,
          tool_competitor_count: Math.max(0, toolCompetitors),
        };

        const { score: scoreVal, breakdown } = computeScore(signals, weights, context);

        const { error: upErr } = await db
          .from('complaints')
          .update({
            status: 'scored',
            score: scoreVal,
            signal_breakdown: breakdown,
            scored_at: new Date().toISOString(),
          })
          .eq('id', row.id);
        if (upErr) throw new Error(upErr.message);

        const { data: agg } = await db
          .from('complaints')
          .select('score')
          .eq('cluster_id', row.cluster_id)
          .not('score', 'is', null);
        const aggMax = (agg ?? [])
          .map((r: { score: number | null }) => r.score ?? 0)
          .reduce((a: number, b: number) => (a > b ? a : b), 0);
        await db
          .from('clusters')
          .update({ score_aggregate: aggMax, updated_at: new Date().toISOString() })
          .eq('id', row.cluster_id);

        scored += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await db
          .from('complaints')
          .update({ status: 'failed', last_error: `score: ${msg.slice(0, 500)}` })
          .eq('id', row.id);
        failed += 1;
      }
    }
  }

  console.log(`score: ${scored} scored, ${failed} failed`);
}

export function computeScore(
  signals: SignalBundle,
  weights: ScoreWeights,
  ctx: ContextStats,
): { score: number; breakdown: Record<string, number> } {
  const buckets = {
    frequency: weights.frequency * frequencyValue(ctx.cluster_member_count),
    workaround: weights.workaround * workaroundValue(signals.workaround_strength),
    b2b: weights.b2b * b2bValue(signals.b2b_strength),
    velocity: weights.velocity * velocityValue(ctx.velocity_ratio),
    uniqueness: weights.uniqueness * uniquenessValue(ctx.tool_competitor_count),
  };
  const wtp_bonus = signals.wtp_present ? weights.wtp_bonus : 0;
  const total = Object.values(buckets).reduce((a, b) => a + b, 0) + wtp_bonus;
  return {
    score: Math.min(100, Math.round(total)),
    breakdown: { ...buckets, wtp_bonus },
  };
}

function frequencyValue(memberCount: number): number {
  return Math.min(1, Math.max(0, (memberCount - 1) / 9));
}
function workaroundValue(s: 0 | 1 | 2): number {
  return s / 2;
}
function b2bValue(s: 0 | 1 | 2): number {
  return s / 2;
}
function velocityValue(r: number): number {
  return Math.min(1, Math.max(0, (r - 1) / 2));
}
function uniquenessValue(c: number): number {
  return Math.min(1, Math.max(0, 1 - c / 5));
}
