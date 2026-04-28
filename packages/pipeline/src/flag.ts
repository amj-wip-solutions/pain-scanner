import { getDb, getSourceConfig, type FlagTier } from '@painradar/core';

const BATCH = 100;

type ScoredRow = {
  id: number;
  source: string;
  cluster_id: number | null;
  score: number | null;
};

export async function flag(): Promise<void> {
  const db = getDb();
  const thresholdsCache = new Map<string, { hot: number; watchlist: number; logged: number }>();

  async function thresholdsFor(
    source: string,
  ): Promise<{ hot: number; watchlist: number; logged: number }> {
    let t = thresholdsCache.get(source);
    if (t) return t;
    const cfg = await getSourceConfig(source);
    if (!cfg) throw new Error(`source_configs row missing for ${source}`);
    t = cfg.flag_thresholds as unknown as typeof t;
    thresholdsCache.set(source, t!);
    return t!;
  }

  let flagged = 0;

  for (;;) {
    const { data: rows, error } = await db
      .from('complaints')
      .select('id, source, cluster_id, score')
      .eq('status', 'scored')
      .order('id', { ascending: true })
      .limit(BATCH);
    if (error) throw new Error(`flag select: ${error.message}`);
    if (!rows || rows.length === 0) break;

    for (const row of rows as ScoredRow[]) {
      const t = await thresholdsFor(row.source);
      const tier = tierForScore(row.score ?? 0, t);
      const nextStatus = tier === 'archive' ? 'archived' : 'flagged';
      await db
        .from('complaints')
        .update({ flag: tier, status: nextStatus })
        .eq('id', row.id);

      if (row.cluster_id != null) {
        await db
          .from('clusters')
          .update({ flag: tier, updated_at: new Date().toISOString() })
          .eq('id', row.cluster_id);
      }
      flagged += 1;
    }
  }

  console.log(`flag: ${flagged} processed`);
}

export function tierForScore(
  score: number,
  thresholds: { hot: number; watchlist: number; logged: number },
): FlagTier {
  if (score >= thresholds.hot) return 'hot';
  if (score >= thresholds.watchlist) return 'watchlist';
  if (score >= thresholds.logged) return 'logged';
  return 'archive';
}
