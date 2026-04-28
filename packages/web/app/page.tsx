import { getDb } from '@painradar/core';

export const dynamic = 'force-dynamic';

const STATUSES = [
  'raw',
  'classified',
  'clustered',
  'scored',
  'flagged',
  'briefed',
  'archived',
  'failed',
] as const;

type FlaggedRow = {
  id: number;
  source: string;
  title: string | null;
  pain_phrase: string | null;
  score: number | null;
  flag: string | null;
  url: string;
  cluster_id: number | null;
  tools_mentioned: string[] | null;
  created_at: string;
};

type BriefRow = {
  id: number;
  sent_at: string;
  recipient: string;
  cluster_ids: number[] | null;
};

async function loadData() {
  const db = getDb();
  const counts: Record<string, number> = {};
  for (const s of STATUSES) {
    const { count } = await db
      .from('complaints')
      .select('*', { count: 'exact', head: true })
      .eq('status', s);
    counts[s] = count ?? 0;
  }
  const { data: flagged } = await db
    .from('complaints')
    .select(
      'id, source, title, pain_phrase, score, flag, url, cluster_id, tools_mentioned, created_at',
    )
    .in('status', ['flagged', 'briefed'])
    .order('score', { ascending: false, nullsFirst: false })
    .limit(50);
  const { data: briefs } = await db
    .from('briefs')
    .select('id, sent_at, recipient, cluster_ids')
    .order('sent_at', { ascending: false })
    .limit(5);
  return {
    counts,
    flagged: (flagged as FlaggedRow[] | null) ?? [],
    briefs: (briefs as BriefRow[] | null) ?? [],
  };
}

export default async function DashboardPage() {
  const { counts, flagged, briefs } = await loadData();
  return (
    <>
      <h1>Pipeline status</h1>
      <div className="counts">
        {STATUSES.map((s) => (
          <div className={`card status-${s}`} key={s}>
            <div className="num">{counts[s] ?? 0}</div>
            <div className="lab">{s}</div>
          </div>
        ))}
      </div>

      <h2>Flagged complaints (top 50 by score)</h2>
      {flagged.length === 0 ? (
        <p className="meta">No flagged complaints yet. Run the pipeline.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Score</th>
              <th>Flag</th>
              <th>Tools</th>
              <th>Pain</th>
              <th>Source</th>
              <th>Cluster</th>
              <th>Link</th>
            </tr>
          </thead>
          <tbody>
            {flagged.map((c) => (
              <tr key={c.id}>
                <td>{c.score ?? '—'}</td>
                <td>{c.flag ?? '—'}</td>
                <td>{(c.tools_mentioned ?? []).join(', ') || '—'}</td>
                <td>{c.pain_phrase ?? c.title ?? '—'}</td>
                <td>{c.source}</td>
                <td>
                  {c.cluster_id != null ? (
                    <a href={`/clusters/${c.cluster_id}`}>#{c.cluster_id}</a>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  <a href={c.url} target="_blank" rel="noreferrer">
                    open
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Recent briefs</h2>
      {briefs.length === 0 ? (
        <p className="meta">No briefs sent yet.</p>
      ) : (
        <ul>
          {briefs.map((b) => (
            <li key={b.id}>
              {new Date(b.sent_at).toISOString().slice(0, 10)} → {b.recipient} (
              {(b.cluster_ids ?? []).length} clusters)
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
