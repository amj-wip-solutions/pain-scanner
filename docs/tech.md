# PAINRADAR — Technical Specification

## Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript everywhere |
| Runtime + package manager | Bun (workspaces) |
| Database | Supabase Postgres (free tier) with pgvector |
| Pipeline runtime | GitHub Actions cron |
| LLM | Gemini 2.0 Flash (classifier), `text-embedding-004` (clustering) |
| Email | Resend (free tier) |
| Frontend | Next.js 15 + React + Tailwind + Recharts |
| Hosting frontend | Vercel Hobby with Password Protection |
| Hosting pipeline | GitHub Actions |

Total recurring cost: 0 EUR/month at expected volume.

## Repository layout

```
pain-scanner/
├── .github/
│   └── workflows/
│       ├── collect-reddit.yml
│       ├── process.yml
│       └── brief.yml
├── packages/
│   ├── core/
│   │   └── src/
│   │       ├── types.ts          # RawComplaint, Complaint, Cluster, Brief
│   │       ├── config.ts         # tunables with env override
│   │       ├── db.ts             # Supabase client factory
│   │       └── prompts/
│   │           └── classifier_v1.ts
│   ├── collectors/
│   │   └── src/
│   │       ├── index.ts          # registry { reddit: redditCollector }
│   │       └── reddit.ts         # implements Collector
│   ├── pipeline/
│   │   └── src/
│   │       ├── classify.ts
│   │       ├── cluster.ts
│   │       ├── score.ts
│   │       ├── flag.ts
│   │       ├── brief.ts
│   │       └── adapters/
│   │           └── reddit.ts     # source-specific signal mapping
│   └── web/                       # Next.js dashboard
├── supabase/
│   └── migrations/
│       └── 0001_init.sql
├── docs/
│   ├── product.md
│   └── tech.md
├── bun.lock
└── package.json
```

## Pipeline

### State machine

A row in `complaints` carries a `status` enum:

```
raw → classified → clustered → scored → flagged → briefed
                                     └→ archived  (below threshold)
                                     └→ failed    (any stage error)
```

Each stage filters by entry status, advances on success, leaves status untouched on failure (next run retries). All stage operations are idempotent.

### Workflows

| Workflow | Schedule | Job |
|----------|----------|-----|
| `collect-reddit.yml` | Every 6 hours | Pull new posts from each configured subreddit, insert as `complaints` with `status='raw'` |
| `process.yml` | Daily 02:00 UTC | Run CLASSIFY → CLUSTER → SCORE → FLAG over rows in pre-final statuses |
| `brief.yml` | Sundays 06:00 UTC (08:00 Europe/Paris) | Pick top 10 clusters by composite score since last `briefs.sent_at`, render HTML, send via Resend, write `briefs` row |

Adding a new source: drop a new collector file in `packages/collectors/src/`, add `.github/workflows/collect-<source>.yml`, add a row to `source_configs`. No changes to `process.yml` or `brief.yml`.

## Data model

### Tables (Day 1)

```sql
create extension if not exists vector;

create type complaint_status as enum (
  'raw', 'classified', 'clustered', 'scored', 'flagged',
  'briefed', 'archived', 'failed'
);

create type flag_tier as enum ('hot', 'watchlist', 'logged', 'archive');

create table clusters (
  id              bigserial primary key,
  canonical_title text not null,
  pain_phrase     text not null,
  summary         text,
  centroid        vector(768) not null,
  member_count    int not null default 1,
  sources_present text[] not null default '{}',
  tools_present   text[] not null default '{}',
  score_aggregate int,
  flag            flag_tier,
  first_seen      timestamptz not null,
  last_seen       timestamptz not null,
  best_member_confidence numeric not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index clusters_centroid_idx on clusters
  using ivfflat (centroid vector_cosine_ops)
  with (lists = 10);

create table complaints (
  id            bigserial primary key,
  source        text not null,
  source_id     text not null,
  url           text not null,
  author        text,
  title         text,
  body          text not null,
  created_at    timestamptz not null,
  fetched_at    timestamptz not null default now(),
  source_signals jsonb not null default '{}'::jsonb,
  status        complaint_status not null default 'raw',
  -- classifier output
  is_pain               boolean,
  pain_type             text,
  vertical_match        boolean,
  subject               text,
  pain_phrase           text,
  keywords              text[],
  tools_mentioned       text[],
  audience_role         text,
  workaround_present    boolean,
  workaround_text       text,
  wtp_signal            boolean,
  b2b_context           boolean,
  search_query          text,
  classifier_confidence numeric,
  classified_at         timestamptz,
  -- embedding + clustering
  embedding     vector(768),
  cluster_id    bigint references clusters(id),
  clustered_at  timestamptz,
  -- scoring
  score             int,
  signal_breakdown  jsonb,
  flag              flag_tier,
  scored_at         timestamptz,
  briefed_at        timestamptz,
  -- error tracking
  last_error    text,
  unique (source, source_id)
);

create index complaints_status_idx on complaints (status);
create index complaints_cluster_idx on complaints (cluster_id);
create index complaints_keywords_idx  on complaints using gin (keywords);
create index complaints_tools_idx     on complaints using gin (tools_mentioned);

create table source_configs (
  source                 text primary key,
  enabled                boolean not null default true,
  params                 jsonb not null,                   -- { subreddits: [...], keywords: [...] }
  score_weights          jsonb not null,                   -- { frequency: 25, workaround: 30, ... }
  flag_thresholds        jsonb not null default
    '{"hot": 80, "watchlist": 60, "logged": 40}'::jsonb,
  classifier_prompt_key  text not null default 'classifier_v1',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table briefs (
  id            bigserial primary key,
  sent_at       timestamptz not null default now(),
  recipient     text not null,
  cluster_ids   bigint[] not null,
  complaint_ids bigint[] not null,
  markdown      text not null,
  html          text not null
);
```

### Phase 2 tables (deferred)

`learning_events`, `pipeline_events`, `velocity_baselines`, `prompt_templates`, `scoring_formulas`, `community_seeds`, `scouting_briefs`, `deepdive_reports`. Each has a defined trigger in the product roadmap.

## Contracts

### Collector

```ts
export type RawComplaint = {
  source: string;
  source_id: string;
  url: string;
  author: string | null;
  title: string | null;
  body: string;
  created_at: string;        // ISO 8601
  source_signals: Record<string, number | string | boolean>;
};

export interface Collector {
  name: string;
  collect(opts: { since: Date; config: SourceConfigParams }): AsyncIterable<RawComplaint>;
}
```

Collector responsibility ends at producing `RawComplaint`. Normalization, classification, scoring, and clustering are downstream.

### Score adapter (per-source)

```ts
export interface ScoreAdapter {
  source: string;
  toSignals(row: ComplaintRow): SignalBundle;
}

export type SignalBundle = {
  workaround_strength: 0 | 1 | 2;
  b2b_strength: 0 | 1 | 2;
  wtp_present: boolean;
  source_quality: number;       // upvote ratio, review stars, etc.
  freshness_days: number;
  // additional source-aware values; never includes the source name itself
};
```

The aggregator is source-blind: it calls `adapters[row.source].toSignals(row)` and never branches on source identity.

### Score formula

Composite score = sum of weighted bucket values, capped at 100.

```ts
function computeScore(
  signals: SignalBundle,
  weights: ScoreWeights,
  contextStats: ContextStats,
): { score: number; breakdown: object } {
  const buckets = {
    frequency:  weights.frequency  * frequencyValue(contextStats.cluster_member_count),
    workaround: weights.workaround * workaroundValue(signals.workaround_strength),
    b2b:        weights.b2b        * b2bValue(signals.b2b_strength),
    velocity:   weights.velocity   * velocityValue(contextStats.velocity_ratio),
    uniqueness: weights.uniqueness * uniquenessValue(contextStats.tool_competitor_count),
  };
  const wtp_bonus = signals.wtp_present ? weights.wtp_bonus : 0;
  const total = Object.values(buckets).reduce((a, b) => a + b, 0) + wtp_bonus;
  return { score: Math.min(100, Math.round(total)), breakdown: { ...buckets, wtp_bonus } };
}
```

Each `*Value()` helper is a deterministic 0..1 mapping (e.g. `workaroundValue`: 0 if absent, 0.5 if mentioned, 1.0 if explicit spreadsheet/manual workaround). Lives in `pipeline/src/score.ts`.

## Classifier

| Setting | Value |
|---------|-------|
| Model | Gemini 2.0 Flash |
| Mode | JSON mode (`responseMimeType: application/json`, `responseSchema`) |
| Pass count | Two — pass 1 classifies; pass 2 (embed + score) only on `is_pain=true` |
| Prompt location | `packages/core/src/prompts/classifier_v1.ts` (versioned filename) |
| Inputs | Title + body (truncated to 4000 chars) |
| Strategy | Zero-shot, strict rubric, 3 negative examples in system instruction |

Output schema:

```json
{
  "is_pain": true,
  "pain_type": "manual_workaround",
  "vertical_match": true,
  "subject": "ATS candidate tagging",
  "pain_phrase": "Greenhouse tag dropdown forces re-entry every tab switch",
  "keywords": ["greenhouse", "tagging", "dropdown", "tab-switch", "re-entry"],
  "tools_mentioned": ["Greenhouse"],
  "audience_role": "recruiter",
  "workaround_present": true,
  "workaround_text": "tracking tags in a Google Sheet",
  "wtp_signal": true,
  "b2b_context": true,
  "search_query": "greenhouse tagging dropdown",
  "confidence": 0.82
}
```

`pain_type` enum: `workflow_friction | missing_feature | reliability | cost | integration | manual_workaround | other`.
`audience_role` enum (recruiting vertical): `recruiter | sourcer | ta_lead | hr_generalist | other`.

## Clustering

| Setting | Value | Override env var |
|---------|-------|-----------------|
| Embedding model | Gemini `text-embedding-004` (768-dim) | n/a |
| Embed input | `${pain_phrase} | ${tools_mentioned.join(", ")}` | n/a |
| Similarity threshold | 0.85 cosine | `CLUSTER_SIMILARITY_THRESHOLD` |
| Tool overlap required | true | `CLUSTER_TOOL_OVERLAP_REQUIRED` |
| Keyword overlap min | 2 | `CLUSTER_KEYWORD_OVERLAP_MIN` |

Algorithm (per row, online, after CLASSIFY):

```
embedding = gemini.embed(pain_phrase + " | " + tools_mentioned.join(", "))

nearest = SELECT id, centroid, tools_present, keywords, member_count, best_member_confidence
          FROM clusters
          ORDER BY centroid <=> embedding
          LIMIT 1

similarity = 1 - (nearest.centroid <=> embedding)

attach = (similarity >= THRESHOLD) AND (
           (TOOL_OVERLAP_REQUIRED AND intersect(tools_mentioned, nearest.tools_present).length >= 1)
           OR
           intersect(keywords, nearest.keywords).length >= KEYWORD_OVERLAP_MIN
         )

if attach:
   recompute centroid = avg(member embeddings)
   union tools_present, sources_present
   member_count += 1
   last_seen = now()
   if classifier_confidence > best_member_confidence:
     canonical_title = pain_phrase
     best_member_confidence = classifier_confidence
else:
   create new cluster, this row is the seed
```

## Brief generation

Triggered by `brief.yml` Sundays 06:00 UTC.

1. `last_sent = SELECT max(sent_at) FROM briefs` (fallback: 7 days ago)
2. For each cluster, `score_aggregate = max(member.score)` over members updated since `last_sent`
3. Filter clusters with `score_aggregate >= 60` (watchlist+) whose `id` is not already in any prior `briefs.cluster_ids`
4. Take top 10 by `score_aggregate`
5. Render markdown then HTML (markdown-it)
6. Send via Resend to `BRIEF_RECIPIENT`
7. Insert `briefs` row with markdown, html, cluster_ids, complaint_ids

Brief markdown skeleton:

```
# PAINRADAR — Week of <date>

## Hot 🔴

### <canonical_title>
- Score: 85
- Sources: r/recruiting, r/sourcing
- Tools: Greenhouse
- Members: 7
- Pain: <pain_phrase>
- Workaround: <workaround_text>
- WTP: yes
- Links:
  - https://reddit.com/...
  - https://reddit.com/...

## Watchlist 🟡
...
```

## Hosting and deploy

| Component | Host | Notes |
|-----------|------|-------|
| Postgres | Supabase free tier | 500 MB DB, pgvector enabled |
| Pipeline | GitHub Actions | All workflows scheduled via cron |
| Dashboard | Vercel Hobby | Read-only Next.js, password-protected via Vercel UI |
| Email | Resend free tier | Single recipient, custom domain optional |

No Vercel cron used (Hobby's 1/day limit avoided).

## Environment variables

GitHub Actions secrets:

```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
GEMINI_API_KEY
REDDIT_CLIENT_ID
REDDIT_CLIENT_SECRET
REDDIT_USER_AGENT              # required by Reddit, format: PAINRADAR/0.1 by u/<username>
RESEND_API_KEY
BRIEF_RECIPIENT
CLUSTER_SIMILARITY_THRESHOLD   # optional override, default 0.85
CLUSTER_KEYWORD_OVERLAP_MIN    # optional override, default 2
CLUSTER_TOOL_OVERLAP_REQUIRED  # optional override, default true
```

Vercel env vars (read-only subset):

```
SUPABASE_URL
SUPABASE_ANON_KEY              # RLS-protected
```

## Local development

```bash
bun install
cp .env.example .env.local
supabase start                              # local Postgres on :54322
supabase db reset                           # apply migrations
bun --filter @painradar/web dev             # next.js on :3000 (when web pkg lands)
bun --filter @painradar/pipeline test
```

Run a collector locally:

```bash
bun --filter @painradar/collectors run reddit
```

Type-check:

```bash
cd packages/<pkg> && bun run typecheck
```

## Idempotency rules

| Stage | Mechanism |
|-------|-----------|
| Collect | `UNIQUE(source, source_id)` constraint; `INSERT ... ON CONFLICT DO NOTHING` |
| Classify | Status check `WHERE status = 'raw'`; sets `'classified'` atomically |
| Cluster | Status check `WHERE status = 'classified' AND is_pain = true`; non-pain rows go to `'archived'` |
| Score | Status check `WHERE status = 'clustered'` |
| Flag | Status check `WHERE status = 'scored'` |
| Brief | Cluster IDs not present in any prior `briefs.cluster_ids` array |

Failed runs leave rows at last-success status. Next workflow execution picks up from there.

## Observability

Day 1:

- GitHub Action default email notifications on workflow failure
- Heartbeat: presence of new `briefs` row each Sunday confirms end-to-end pipeline health
- `complaints.last_error` text column stores last error per row

Phase 2 (when above proves insufficient):

- `pipeline_events` table for structured stage-level logs
- Optional healthcheck endpoint pinged by external monitor

## Free-tier capacity model

| Resource | Limit | Day 1 expected | Headroom |
|----------|-------|----------------|----------|
| Reddit OAuth req/min | 60 | ~10/poll | 6× |
| Gemini Flash req/day | 1500 | ~300 | 5× |
| Gemini embedding req/day | 1500 | ~50 | 30× |
| Supabase DB | 500 MB | ~100 KB after 30 days | 5000× |
| GitHub Actions min/month | 2000 | ~200 | 10× |
| Resend mails/day | 100 | 1 | 100× |
| Vercel Hobby bandwidth | 100 GB/mo | <1 GB | 100× |

Volume can grow ~10× before any tier flips.

## Phase 2 deferral list (with triggers)

| Capability | Trigger to graduate |
|-----------|---------------------|
| `learning_events` table + feedback loop | After 3+ briefs and false-positive marking starts |
| `pipeline_events` table | When GitHub Action logs prove insufficient |
| `velocity_baselines` table | When the on-read window-function velocity calc gets slow |
| `prompt_templates` DB rows | When non-engineer needs to edit prompts |
| `scoring_formulas` DB rows | When running multiple formula variants in parallel |
| `community_seeds` table | When automating new-community discovery |
| `scouting_briefs` table | When the discovery feature ships |
| `deepdive_reports` table + workflow | When zoom-in on top clusters is automated |
| Discord collector | When validation shows Reddit-only signal too narrow |
| G2 / Capterra scraper | After Discord active |
| Cross-source flag rule | After 2+ sources active |
| Job-board correlation flag | After G2 active |
| Competitor auto-detection | After 5+ briefs |
| Config UI | When tweaking via Supabase SQL editor becomes annoying |
| Trend visualization | After 8+ weeks of data |
