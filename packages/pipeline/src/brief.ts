import MarkdownIt from 'markdown-it';
import { Resend } from 'resend';
import { config, getDb } from '@painradar/core';

const TOP_N = 10;
const MIN_SCORE = 60;

type ClusterRow = {
  id: number;
  canonical_title: string;
  pain_phrase: string;
  score_aggregate: number | null;
  flag: string | null;
  member_count: number;
  sources_present: string[];
  tools_present: string[];
};

type ComplaintLite = {
  id: number;
  url: string;
  title: string | null;
  pain_phrase: string | null;
  workaround_text: string | null;
  wtp_signal: boolean | null;
  cluster_id: number | null;
};

const FLAG_LABEL: Record<string, string> = {
  hot: 'Hot 🔴',
  watchlist: 'Watchlist 🟡',
  logged: 'Logged 🟢',
  archive: 'Archive ⬜',
};

export async function brief(): Promise<void> {
  if (!config.resend.apiKey) throw new Error('RESEND_API_KEY missing');
  if (!config.resend.recipient) throw new Error('BRIEF_RECIPIENT missing');

  const db = getDb();

  const { data: lastBrief } = await db
    .from('briefs')
    .select('sent_at, cluster_ids')
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const alreadyBriefed: Set<number> = new Set(
    (lastBrief?.cluster_ids as number[] | undefined) ?? [],
  );

  const { data: clusters, error } = await db
    .from('clusters')
    .select('id, canonical_title, pain_phrase, score_aggregate, flag, member_count, sources_present, tools_present')
    .gte('score_aggregate', MIN_SCORE)
    .order('score_aggregate', { ascending: false })
    .limit(TOP_N * 3);
  if (error) throw new Error(`brief select clusters: ${error.message}`);

  const fresh = (clusters as ClusterRow[] | null ?? []).filter(
    (c) => !alreadyBriefed.has(c.id),
  );
  const top = fresh.slice(0, TOP_N);

  if (top.length === 0) {
    console.log('brief: nothing meets threshold; skipping send');
    return;
  }

  const ids = top.map((c) => c.id);
  const { data: complaints } = await db
    .from('complaints')
    .select('id, url, title, pain_phrase, workaround_text, wtp_signal, cluster_id')
    .in('cluster_id', ids)
    .eq('status', 'flagged');
  const byCluster = new Map<number, ComplaintLite[]>();
  for (const r of (complaints as ComplaintLite[] | null) ?? []) {
    if (r.cluster_id == null) continue;
    const list = byCluster.get(r.cluster_id) ?? [];
    list.push(r);
    byCluster.set(r.cluster_id, list);
  }

  const md = renderMarkdown(top, byCluster);
  const html = new MarkdownIt({ html: false, linkify: true }).render(md);

  const resend = new Resend(config.resend.apiKey);
  const { error: sendErr } = await resend.emails.send({
    from: config.resend.sender,
    to: config.resend.recipient,
    subject: `PAINRADAR — ${top.length} pains, week of ${new Date().toISOString().slice(0, 10)}`,
    html,
    text: md,
  });
  if (sendErr) throw new Error(`Resend: ${sendErr.message}`);

  const briefedComplaintIds = ([] as number[]).concat(
    ...Array.from(byCluster.values()).map((arr) => arr.map((c) => c.id)),
  );

  const { error: insErr } = await db.from('briefs').insert({
    recipient: config.resend.recipient,
    cluster_ids: ids,
    complaint_ids: briefedComplaintIds,
    markdown: md,
    html,
  });
  if (insErr) throw new Error(`briefs insert: ${insErr.message}`);

  if (briefedComplaintIds.length > 0) {
    await db
      .from('complaints')
      .update({ status: 'briefed', briefed_at: new Date().toISOString() })
      .in('id', briefedComplaintIds);
  }

  console.log(`brief: sent ${top.length} clusters (${briefedComplaintIds.length} complaints)`);
}

function renderMarkdown(
  clusters: ClusterRow[],
  byCluster: Map<number, ComplaintLite[]>,
): string {
  const date = new Date().toISOString().slice(0, 10);
  const groups: Record<string, ClusterRow[]> = { hot: [], watchlist: [], logged: [] };
  for (const c of clusters) {
    const tier = (c.flag ?? 'logged').toString();
    if (tier in groups) groups[tier].push(c);
  }

  let md = `# PAINRADAR — Week of ${date}\n\n`;
  for (const tier of ['hot', 'watchlist', 'logged'] as const) {
    const group = groups[tier];
    if (group.length === 0) continue;
    md += `## ${FLAG_LABEL[tier]}\n\n`;
    for (const c of group) {
      const linked = byCluster.get(c.id) ?? [];
      md += `### ${c.canonical_title}\n\n`;
      md += `- Score: ${c.score_aggregate ?? '?'}\n`;
      md += `- Members: ${c.member_count}\n`;
      md += `- Sources: ${(c.sources_present ?? []).join(', ') || '—'}\n`;
      md += `- Tools: ${(c.tools_present ?? []).join(', ') || '—'}\n`;
      md += `- Pain: ${c.pain_phrase}\n`;
      const anyWorkaround = linked.find((x) => x.workaround_text)?.workaround_text;
      if (anyWorkaround) md += `- Workaround: ${anyWorkaround}\n`;
      const anyWtp = linked.some((x) => x.wtp_signal);
      if (anyWtp) md += `- WTP signal: yes\n`;
      if (linked.length > 0) {
        md += `- Links:\n`;
        for (const l of linked.slice(0, 5)) md += `  - ${l.url}\n`;
      }
      md += `\n`;
    }
  }
  return md;
}
