# PAINRADAR Operations Runbook

Complete walkthrough for plugging in every third party, launching the pipeline, fast-tracking with historical data, adding new sources, troubleshooting, and tuning. Read top to bottom for first-time setup; jump to a section for ongoing operations.

---

## 1. Supabase project + database

1. Sign up at https://supabase.com and create a new project. Free tier is fine. Pick the region closest to where the GitHub Actions runners run (US-East-1 if you have no preference).
2. Wait for provisioning (~2 minutes).
3. **Settings → API**: copy three values into your secrets store
   - `Project URL` → `SUPABASE_URL`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server-only; never put in a client bundle)
   - `anon` key → `SUPABASE_ANON_KEY` (used by Vercel; harmless to expose with RLS)
4. **Database → Extensions**: enable `vector` (pgvector). One click.
5. **SQL Editor → New query**: paste the entire contents of `supabase/migrations/0001_init.sql` and run. You should see four tables (`complaints`, `clusters`, `source_configs`, `briefs`) and one seed row in `source_configs` for the `reddit` source.
6. Verify by running:
   ```sql
   select source, enabled, params->'subreddits' from source_configs;
   ```

CLI alternative if you have the Supabase CLI installed:
```bash
supabase link --project-ref <your-ref>
supabase db push
```

---

## 2. Reddit script app

1. Sign in with the Reddit account you want the bot to use (a dedicated one is fine).
2. Go to https://www.reddit.com/prefs/apps → **create another app**.
3. Fill in:
   - **name**: `painradar-collector`
   - **type**: `script`
   - **redirect uri**: `http://localhost:8080` (unused, but required)
4. After creating, you'll see two values:
   - The string under the app name (looks random) → `REDDIT_CLIENT_ID`
   - **secret** field → `REDDIT_CLIENT_SECRET`
5. Choose a `REDDIT_USER_AGENT`. Format must be `appname/version by u/yourusername`, e.g. `PAINRADAR/0.1 by u/yourusername`. Reddit blocks generic agents.
6. Test the credentials locally:
   ```bash
   set -a && source .env.local && set +a
   curl -X POST -d 'grant_type=client_credentials' \
     --user "$REDDIT_CLIENT_ID:$REDDIT_CLIENT_SECRET" \
     -A "$REDDIT_USER_AGENT" \
     https://www.reddit.com/api/v1/access_token
   ```
   You should get back JSON with `access_token` and `expires_in`.

Rate limit: 60 requests/minute on this grant. The collector self-paces at ~1 second between subreddit pages; well below the cap.

---

## 3. Gemini API key

1. Go to https://aistudio.google.com/apikey.
2. Create a new API key, attach it to a project (any project works for free tier).
3. Copy the key → `GEMINI_API_KEY`.
4. Free tier limits as of January 2026:
   - `gemini-2.0-flash`: 15 requests/minute, 1500 requests/day
   - `text-embedding-004`: 1500 requests/day
5. Test:
   ```bash
   curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=$GEMINI_API_KEY" \
     -H 'Content-Type: application/json' \
     -d '{"contents":[{"parts":[{"text":"reply with the word ok"}]}]}'
   ```

---

## 4. Resend email

1. Sign up at https://resend.com.
2. **API Keys → Create API Key**, full access, copy → `RESEND_API_KEY`.
3. **Domains → Add Domain** for the sender domain you want (e.g. `painradar.yourdomain.com`).
   - Resend gives you 4 DNS records: SPF (TXT), DKIM (CNAME × 2), and Return-Path (MX).
   - Add them to your DNS provider; verification takes 5–60 minutes.
4. Once verified, set `BRIEF_SENDER` to a sender on that domain, e.g.:
   ```
   PAINRADAR <painradar@painradar.yourdomain.com>
   ```
5. Set `BRIEF_RECIPIENT` to the email where you want the digest delivered.

If you skip step 3 and leave `BRIEF_SENDER` unset, the brief sends from `onboarding@resend.dev`. It works, but most inbox providers route it to spam. Verifying a domain is the difference between "I get the brief" and "I never see it".

---

## 5. GitHub repository setup

1. Create a private repository (or convert your local repo to GitHub).
2. Push the local repo:
   ```bash
   git remote add origin git@github.com:yourname/pain-scanner.git
   git push -u origin main
   ```
3. Repo → **Settings → Secrets and variables → Actions**:

   **Repository secrets** (8 required, 1 optional):

   | Secret | Where it came from |
   |--------|-------------------|
   | `SUPABASE_URL` | §1 |
   | `SUPABASE_SERVICE_ROLE_KEY` | §1 |
   | `GEMINI_API_KEY` | §3 |
   | `REDDIT_CLIENT_ID` | §2 |
   | `REDDIT_CLIENT_SECRET` | §2 |
   | `REDDIT_USER_AGENT` | §2 |
   | `RESEND_API_KEY` | §4 |
   | `BRIEF_RECIPIENT` | §4 |
   | `BRIEF_SENDER` *(optional)* | §4 |

   **Repository variables** (3 optional, for clustering tunables):

   | Variable | Default | When to override |
   |----------|---------|------------------|
   | `CLUSTER_SIMILARITY_THRESHOLD` | `0.85` | Lower (0.78–0.82) if too few merges; higher (0.88+) if false merges |
   | `CLUSTER_KEYWORD_OVERLAP_MIN` | `2` | Only relevant when `CLUSTER_TOOL_OVERLAP_REQUIRED=false` |
   | `CLUSTER_TOOL_OVERLAP_REQUIRED` | `true` | Set `false` to allow keyword-only matching (looser clusters) |

4. Confirm the four workflows show up in the **Actions** tab: `collect-reddit`, `process`, `brief`, `CI`.

---

## 6. Vercel dashboard deployment

1. https://vercel.com → **Add New → Project** → import your GitHub repo.
2. **Root Directory**: `packages/web`
3. **Framework Preset**: Next.js (auto-detected)
4. **Build & Output Settings**: leave defaults (Vercel handles Bun via the auto-detected `bun.lock`)
5. **Environment Variables** (Production + Preview):
   - `SUPABASE_URL` (same as GitHub)
   - `SUPABASE_SERVICE_ROLE_KEY` (same as GitHub)
6. Deploy. First build takes ~2 minutes.
7. **Settings → Deployment Protection**:
   - Enable **Vercel Authentication** (free) for SSO-gated access, or
   - Enable **Password Protection** ($) for a shared-password page.

If you skip this and the URL leaks, anyone can read the dashboard since it uses the service-role key under the hood. Pick one.

---

## 7. First-run sequence (manual)

Run the workflows in order via **Actions → Run workflow**:

1. **collect-reddit** — pulls last 30 days from each seed subreddit (first run is a backfill). Wait for completion, then in Supabase SQL editor:
   ```sql
   select status, count(*) from complaints group by status;
   ```
   Expect a few hundred rows in `status='raw'`.

2. **process** — classify, cluster, score, flag. This takes a while because the classifier self-paces at 4.5s/row to stay under Gemini's 15 req/min cap.
   - 200 rows ≈ 15 minutes
   - Watch progress with the same `count(*) group by status` query

3. **brief** — sends the first email.
   - If the `briefs` table receives a row but the email never arrives, check spam, then verify your Resend domain (§4)

After the first manual run succeeds, the schedule takes over:
- `collect-reddit`: every 6 hours
- `process`: daily at 02:00 UTC
- `brief`: Sundays at 06:00 UTC (08:00 Europe/Paris)

---

## 8. Fast-track: backfill 90 days of Reddit history

You don't have to wait 4 weeks for the system to accumulate signal. Reddit's `/new.json` endpoint lets you paginate up to ~1000 posts per subreddit. For the recruiting subs that's roughly:

| Subreddit | Posts/day | 1000 posts ≈ |
|-----------|-----------|--------------|
| r/recruiting | ~70 | ~14 days |
| r/HumanResources | ~40 | ~25 days |
| r/AskHR | ~30 | ~33 days |
| r/talentacquisition | ~5 | ~200 days |
| r/sourcing | ~2 | several years |
| r/recruiterhell | ~30 | ~33 days |

So for the smaller subs, 90 days of history is fully reachable. For the larger ones, you cap at ~1000 most-recent posts (Reddit's hard limit on `/new` pagination). Pushshift used to bypass this; it has been partially shut down since 2023.

### Run the backfill locally

The collector CLI accepts a `--lookback=Nd` flag. From the repo root:

```bash
set -a && source .env.local && set +a
bun packages/collectors/src/cli.ts reddit --lookback=90d
```

This bypasses the per-subreddit cursor and pulls everything created in the last 90 days from each seed sub, capped at Reddit's pagination limit.

For a smaller test run:

```bash
bun packages/collectors/src/cli.ts reddit --lookback=7d
```

### After backfill

Run the pipeline stages once to chew through the rows:

```bash
bun packages/pipeline/src/cli.ts process
bun packages/pipeline/src/cli.ts brief
```

Or trigger the GH Actions `process` and `brief` workflows manually. Be patient: a 90-day backfill across 6 subs can produce 1500–3000 raw rows. Classification at 4.5s each is the bottleneck (~3 hours wall clock). You can run multiple `process` workflow_dispatch invocations in parallel since each picks up a fresh batch of `status='raw'` rows.

### Quota warning during backfill

The classifier free tier is 1500 req/day. A 3000-row backfill will hit the daily cap and fail mid-run. Failed rows go to `status='failed'`. To resume the next day:

```sql
update complaints set status='raw', last_error=null
where status='failed' and last_error like 'classify:%';
```

Then re-run `process`.

---

## 9. Adding a new source (Phase 2)

All you need:

1. **One collector file** in `packages/collectors/src/<source>.ts` implementing the `Collector` interface.
2. **One adapter file** in `packages/pipeline/src/adapters/<source>.ts` implementing `ScoreAdapter` (translates source-specific signals to the source-blind `SignalBundle`).
3. **One workflow file** in `.github/workflows/collect-<source>.yml` (copy `collect-reddit.yml`, swap the run command).
4. **One row** in `source_configs`:
   ```sql
   insert into source_configs (source, enabled, params, score_weights)
   values (
     'discord',
     true,
     '{"servers": ["server_id_1", "server_id_2"], "vertical": "recruiting"}'::jsonb,
     '{"frequency": 25, "workaround": 30, "b2b": 10, "velocity": 15, "uniqueness": 15, "wtp_bonus": 10}'::jsonb
   );
   ```
5. Register it in `packages/collectors/src/index.ts`:
   ```ts
   export const collectors = { reddit: redditCollector, discord: discordCollector };
   ```
6. Register the score adapter in `packages/pipeline/src/score.ts` adapters map.

The architecture test (`architecture.test.ts`) catches accidental cross-pollination — pipeline files outside `adapters/` cannot import per-source modules.

---

## 10. Troubleshooting

### Find failures

```sql
select id, source, status, last_error, created_at
from complaints
where status='failed'
order by created_at desc
limit 50;
```

### Reset stuck rows

```sql
-- requeue rows that failed at a specific stage
update complaints set status='raw', last_error=null where status='failed' and last_error like 'classify:%';
update complaints set status='classified', last_error=null where status='failed' and last_error like 'cluster:%';
update complaints set status='clustered', last_error=null where status='failed' and last_error like 'score:%';
```

### Inspect classifier output for a row

```sql
select id, is_pain, vertical_match, pain_phrase, keywords, tools_mentioned, classifier_confidence, classified_at
from complaints
where id = 123;
```

### Inspect a cluster's members

```sql
select id, source, score, flag, pain_phrase, url
from complaints
where cluster_id = 5
order by score desc nulls last;
```

### Check brief contents

```sql
select id, sent_at, recipient, array_length(cluster_ids, 1) as cluster_count, length(markdown) as md_len
from briefs
order by sent_at desc;
```

### Force a fresh brief

```sql
-- delete the last briefs row to make those clusters re-eligible
delete from briefs where id = (select max(id) from briefs);
```
Then trigger the `brief` workflow again.

---

## 11. Tuning

### Loosen / tighten clustering

Repository variables (no redeploy needed):

```
CLUSTER_SIMILARITY_THRESHOLD = 0.80   # more merges
CLUSTER_TOOL_OVERLAP_REQUIRED = false # allow keyword-only merges
```

### Adjust scoring weights

Edit the jsonb directly:

```sql
update source_configs
set score_weights = '{
  "frequency": 20, "workaround": 35, "b2b": 5,
  "velocity": 15, "uniqueness": 15, "wtp_bonus": 10
}'::jsonb,
updated_at = now()
where source = 'reddit';
```

The next `process` run uses the new weights.

### Adjust flag thresholds

```sql
update source_configs
set flag_thresholds = '{"hot": 75, "watchlist": 55, "logged": 35}'::jsonb
where source = 'reddit';
```

### Add or remove subreddits

```sql
update source_configs
set params = jsonb_set(params, '{subreddits}', '[
  "recruiting","talentacquisition","HumanResources","AskHR","sourcing","recruiterhell","ATS"
]'::jsonb)
where source = 'reddit';
```

### Iterate the classifier prompt

1. Edit `packages/core/src/prompts/classifier_v1.ts`. If changes are minor, modify in place.
2. For larger changes, save as `classifier_v2.ts` and update `source_configs.classifier_prompt_key`.
3. The current code only loads `classifier_v1`; loading by key is a Phase 2 generalization (graduate when `prompt_templates` table lands).

---

## 12. Cost monitoring

Free-tier ceilings to watch:

| Resource | Limit | Where to check |
|----------|-------|----------------|
| Supabase DB size | 500 MB | Supabase dashboard → Project → Database → Storage |
| Supabase egress | 2 GB/mo | Same |
| Gemini req/day | 1500 (each model) | aistudio.google.com → API usage |
| Resend mails | 100/day, 3000/mo | resend.com dashboard |
| GitHub Actions minutes | 2000/mo (private repo) | repo Settings → Billing |
| Vercel bandwidth | 100 GB/mo (Hobby) | vercel.com → Usage |

At expected Day 1 volume (300 classifies/day, 50 embeds/day, 1 email/week), you stay within ~10× of every ceiling. The first thing to flip if you scale would be the Resend mail count if you broaden the recipient list.

---

## 13. Phase 2 graduation triggers (recap)

See `docs/product.md`. Don't graduate a Phase 2 capability before its named trigger. The biggest risk to PAINRADAR is spending 3 months building the instrument instead of using it.

| Capability | Trigger |
|-----------|---------|
| `learning_events` feedback loop | After 3+ briefs and false-positive marking starts |
| Discord collector | When Reddit-only signal proves too narrow |
| G2 / Capterra scraper | After Discord active |
| Cross-source flag rule | After 2+ sources active |
| Job-board correlation | After G2 active |
| Competitor auto-detection | After 5+ briefs |
| Deep-dive workflow (re-issue `search_query`) | After 3+ briefs |
| `prompt_templates` DB | When non-engineer needs to edit prompts |
| `velocity_baselines` table | When the on-read window-function calc gets slow |
| Config UI | When tweaking via Supabase SQL editor becomes annoying |
| Trend visualization | After 8+ weeks of data |
