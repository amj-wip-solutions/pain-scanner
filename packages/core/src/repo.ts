import type { RawComplaint } from './types.js';
import { getDb } from './db.js';

export type SourceConfigRow = {
  enabled: boolean;
  params: Record<string, unknown>;
  score_weights: Record<string, number>;
  flag_thresholds: Record<string, number>;
  classifier_prompt_key: string;
};

export async function getSourceConfig(source: string): Promise<SourceConfigRow | null> {
  const db = getDb();
  const { data, error } = await db
    .from('source_configs')
    .select('enabled, params, score_weights, flag_thresholds, classifier_prompt_key')
    .eq('source', source)
    .maybeSingle();
  if (error) throw new Error(`getSourceConfig(${source}): ${error.message}`);
  return data as SourceConfigRow | null;
}

export async function getLastSeenAtForSubreddit(
  source: string,
  subreddit: string,
): Promise<Date | null> {
  const db = getDb();
  const { data, error } = await db
    .from('complaints')
    .select('created_at')
    .eq('source', source)
    .filter('source_signals->>subreddit', 'eq', subreddit)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`getLastSeenAtForSubreddit(${source}, ${subreddit}): ${error.message}`);
  }
  if (!data) return null;
  return new Date((data as { created_at: string }).created_at);
}

export async function insertRawComplaints(
  rows: RawComplaint[],
): Promise<{ attempted: number }> {
  if (rows.length === 0) return { attempted: 0 };
  const db = getDb();
  const payload = rows.map((r) => ({
    source: r.source,
    source_id: r.source_id,
    url: r.url,
    author: r.author,
    title: r.title,
    body: r.body,
    created_at: r.created_at,
    source_signals: r.source_signals,
    status: 'raw',
  }));
  const { error } = await db
    .from('complaints')
    .upsert(payload, { onConflict: 'source,source_id', ignoreDuplicates: true });
  if (error) throw new Error(`insertRawComplaints: ${error.message}`);
  return { attempted: rows.length };
}
