import { notFound } from 'next/navigation';
import { getDb } from '@painradar/core';

export const dynamic = 'force-dynamic';

type ClusterRow = {
  id: number;
  canonical_title: string;
  pain_phrase: string;
  summary: string | null;
  member_count: number;
  sources_present: string[] | null;
  tools_present: string[] | null;
  score_aggregate: number | null;
  flag: string | null;
  first_seen: string;
  last_seen: string;
  best_member_confidence: number;
};

type MemberRow = {
  id: number;
  source: string;
  url: string;
  title: string | null;
  pain_phrase: string | null;
  score: number | null;
  flag: string | null;
  tools_mentioned: string[] | null;
  audience_role: string | null;
  workaround_text: string | null;
  wtp_signal: boolean | null;
  created_at: string;
};

async function loadCluster(id: number) {
  const db = getDb();
  const { data: cluster } = await db.from('clusters').select('*').eq('id', id).maybeSingle();
  if (!cluster) return null;
  const { data: members } = await db
    .from('complaints')
    .select(
      'id, source, url, title, pain_phrase, score, flag, tools_mentioned, audience_role, workaround_text, wtp_signal, created_at',
    )
    .eq('cluster_id', id)
    .order('score', { ascending: false, nullsFirst: false });
  return {
    cluster: cluster as ClusterRow,
    members: (members as MemberRow[] | null) ?? [],
  };
}

export default async function ClusterDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await loadCluster(Number(id));
  if (!data) notFound();
  const { cluster, members } = data;
  return (
    <>
      <h1>{cluster.canonical_title}</h1>
      <p className="meta">
        Score {cluster.score_aggregate ?? '—'} · Flag {cluster.flag ?? '—'} ·{' '}
        {cluster.member_count} members · Tools:{' '}
        {(cluster.tools_present ?? []).join(', ') || '—'} · Sources:{' '}
        {(cluster.sources_present ?? []).join(', ') || '—'}
      </p>
      <p>
        Pain phrase: <em>{cluster.pain_phrase}</em>
      </p>
      <h2>Members</h2>
      <table>
        <thead>
          <tr>
            <th>Score</th>
            <th>Role</th>
            <th>Pain</th>
            <th>Workaround</th>
            <th>WTP</th>
            <th>Tools</th>
            <th>Source</th>
            <th>Link</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id}>
              <td>{m.score ?? '—'}</td>
              <td>{m.audience_role ?? '—'}</td>
              <td>{m.pain_phrase ?? m.title ?? '—'}</td>
              <td>{m.workaround_text ?? '—'}</td>
              <td>{m.wtp_signal ? 'yes' : 'no'}</td>
              <td>{(m.tools_mentioned ?? []).join(', ') || '—'}</td>
              <td>{m.source}</td>
              <td>
                <a href={m.url} target="_blank" rel="noreferrer">
                  open
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
