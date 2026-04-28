import { getDb } from '@painradar/core';

export const dynamic = 'force-dynamic';

type ClusterRow = {
  id: number;
  canonical_title: string;
  pain_phrase: string;
  member_count: number;
  sources_present: string[] | null;
  tools_present: string[] | null;
  score_aggregate: number | null;
  flag: string | null;
  last_seen: string;
};

async function loadClusters(): Promise<ClusterRow[]> {
  const db = getDb();
  const { data } = await db
    .from('clusters')
    .select(
      'id, canonical_title, pain_phrase, member_count, sources_present, tools_present, score_aggregate, flag, last_seen',
    )
    .order('score_aggregate', { ascending: false, nullsFirst: false })
    .limit(50);
  return (data as ClusterRow[] | null) ?? [];
}

export default async function ClustersPage() {
  const clusters = await loadClusters();
  return (
    <>
      <h1>Clusters by score</h1>
      {clusters.length === 0 ? (
        <p className="meta">No clusters yet. Run the cluster stage.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Score</th>
              <th>Flag</th>
              <th>Members</th>
              <th>Title</th>
              <th>Tools</th>
              <th>Sources</th>
              <th>Last seen</th>
            </tr>
          </thead>
          <tbody>
            {clusters.map((c) => (
              <tr key={c.id}>
                <td>
                  <a href={`/clusters/${c.id}`}>#{c.id}</a>
                </td>
                <td>{c.score_aggregate ?? '—'}</td>
                <td>{c.flag ?? '—'}</td>
                <td>{c.member_count}</td>
                <td>{c.canonical_title}</td>
                <td>{(c.tools_present ?? []).join(', ') || '—'}</td>
                <td>{(c.sources_present ?? []).join(', ') || '—'}</td>
                <td>{new Date(c.last_seen).toISOString().slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
