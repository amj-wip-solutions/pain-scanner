import { GoogleGenerativeAI } from '@google/generative-ai';
import { config, getDb } from '@painradar/core';

const BATCH = 20;
const PER_REQ_PAUSE_MS = 500;

type ClassifiedRow = {
  id: number;
  source: string;
  is_pain: boolean | null;
  pain_phrase: string | null;
  tools_mentioned: string[] | null;
  keywords: string[] | null;
  classifier_confidence: number | null;
  created_at: string;
};

type NearestCluster = {
  id: number;
  similarity: number;
  tools_present: string[];
  best_member_confidence: number;
  member_count: number;
};

function intersectCount(a: string[] | null, b: string[] | null): number {
  if (!a || !b) return 0;
  const setB = new Set(b.map((s) => s.toLowerCase()));
  let n = 0;
  for (const x of a) if (setB.has(x.toLowerCase())) n += 1;
  return n;
}

export async function cluster(): Promise<void> {
  if (!config.gemini.apiKey) throw new Error('GEMINI_API_KEY missing');
  const db = getDb();
  const ai = new GoogleGenerativeAI(config.gemini.apiKey);
  const embedModel = ai.getGenerativeModel({ model: config.gemini.embeddingModel });

  let attached = 0;
  let created = 0;
  let archived = 0;
  let failed = 0;

  for (;;) {
    const { data: rows, error } = await db
      .from('complaints')
      .select(
        'id, source, is_pain, pain_phrase, tools_mentioned, keywords, classifier_confidence, created_at',
      )
      .eq('status', 'classified')
      .order('id', { ascending: true })
      .limit(BATCH);
    if (error) throw new Error(`cluster select: ${error.message}`);
    if (!rows || rows.length === 0) break;

    for (const row of rows as ClassifiedRow[]) {
      try {
        if (!row.is_pain || !row.pain_phrase) {
          const { error: archErr } = await db
            .from('complaints')
            .update({ status: 'archived' })
            .eq('id', row.id);
          if (archErr) throw new Error(archErr.message);
          archived += 1;
          continue;
        }

        const tools = row.tools_mentioned ?? [];
        const text = `${row.pain_phrase} | ${tools.join(', ')}`.trim();
        const embedRes = await embedModel.embedContent(text);
        const emb = embedRes.embedding.values;
        await new Promise((r) => setTimeout(r, PER_REQ_PAUSE_MS));

        const { data: nearestArr, error: rpcErr } = await db.rpc('nearest_cluster', {
          query_embedding: emb,
        });
        if (rpcErr) throw new Error(`nearest_cluster: ${rpcErr.message}`);

        const nearest = (nearestArr ?? [])[0] as NearestCluster | undefined;
        const conf = row.classifier_confidence ?? 0;

        let attach = false;
        if (nearest && nearest.similarity >= config.cluster.similarityThreshold) {
          const toolOverlap = intersectCount(tools, nearest.tools_present) >= 1;
          const keywordOverlap =
            intersectCount(row.keywords, nearest.tools_present) >=
              config.cluster.keywordOverlapMin ||
            // a real keyword-vs-keyword check would query the cluster's keyword union;
            // for Day 1 we approximate via tools_present and require kwOverlapMin >= 2 across
            // the cluster's tools. The real keyword union is computed by deepdive in Phase 2.
            false;

          if (config.cluster.toolOverlapRequired) {
            attach = toolOverlap;
          } else {
            attach = toolOverlap || keywordOverlap;
          }
        }

        if (attach && nearest) {
          const { error: upErr } = await db
            .from('complaints')
            .update({
              embedding: emb,
              cluster_id: nearest.id,
              clustered_at: new Date().toISOString(),
              status: 'clustered',
            })
            .eq('id', row.id);
          if (upErr) throw new Error(`attach update: ${upErr.message}`);

          const titleUpdate: Record<string, unknown> = {
            member_count: nearest.member_count + 1,
            last_seen: row.created_at,
            tools_present: Array.from(
              new Set([...(nearest.tools_present ?? []), ...tools]),
            ),
          };
          if (conf > nearest.best_member_confidence) {
            titleUpdate.canonical_title = row.pain_phrase;
            titleUpdate.pain_phrase = row.pain_phrase;
            titleUpdate.best_member_confidence = conf;
          }
          await db.from('clusters').update(titleUpdate).eq('id', nearest.id);
          await db.rpc('recompute_cluster_centroid', { cluster_id_in: nearest.id });
          attached += 1;
        } else {
          const { data: newCluster, error: insErr } = await db
            .from('clusters')
            .insert({
              canonical_title: row.pain_phrase,
              pain_phrase: row.pain_phrase,
              centroid: emb,
              member_count: 1,
              sources_present: [row.source],
              tools_present: tools,
              first_seen: row.created_at,
              last_seen: row.created_at,
              best_member_confidence: conf,
            })
            .select('id')
            .single();
          if (insErr) throw new Error(`cluster insert: ${insErr.message}`);

          await db
            .from('complaints')
            .update({
              embedding: emb,
              cluster_id: newCluster.id,
              clustered_at: new Date().toISOString(),
              status: 'clustered',
            })
            .eq('id', row.id);
          created += 1;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await db
          .from('complaints')
          .update({ status: 'failed', last_error: `cluster: ${msg.slice(0, 500)}` })
          .eq('id', row.id);
        failed += 1;
      }
    }
  }

  console.log(
    `cluster: ${attached} attached, ${created} new, ${archived} archived (non-pain), ${failed} failed`,
  );
}
