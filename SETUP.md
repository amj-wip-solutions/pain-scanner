# PAINRADAR Setup

End-to-end checklist to get a first brief delivered. Local-only Day 1; push to GitHub when you want the cron workflows to run on schedule.

## 1. Create the external accounts

| Service | What to create | Saves into |
|---------|----------------|-----------|
| Supabase | A free-tier project. After creation, in SQL editor enable extension and apply `supabase/migrations/0001_init.sql`. Grab `URL` and `service_role` key from Settings → API. | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| Reddit | A "script" type app at https://www.reddit.com/prefs/apps. Note the `client_id` (under the app name) and `client_secret`. | `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USER_AGENT` |
| Google AI Studio | An API key for Gemini at https://aistudio.google.com/apikey. Free tier is enough. | `GEMINI_API_KEY` |
| Resend | An API key at https://resend.com/api-keys. Use the default `onboarding@resend.dev` sender to start; add a custom domain later. | `RESEND_API_KEY`, `BRIEF_RECIPIENT` |

## 2. Local install

```bash
bun install
cp .env.example .env.local
# edit .env.local with the values from step 1
```

## 3. Apply the migration

Either via the Supabase SQL editor (paste the file), or with the Supabase CLI:

```bash
supabase link --project-ref <your-ref>
supabase db push
```

Verify pgvector is enabled and the four tables (`complaints`, `clusters`, `source_configs`, `briefs`) exist, plus the seed row in `source_configs` for `reddit`.

## 4. Run the pipeline locally (one stage at a time)

```bash
# load .env.local into the shell — Bun does not auto-load it for non-Next runs
set -a && source .env.local && set +a

# fetch ~last 6 hours from the seed subreddits
bun --filter @painradar/collectors run reddit

# classify, cluster, score, flag — all in one process
bun --filter @painradar/pipeline run process

# render and send a brief
bun --filter @painradar/pipeline run brief
```

## 5. Push to GitHub and add the secrets

```bash
git push -u origin main
```

In the GitHub repo, **Settings → Secrets and variables → Actions**, add:

```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
GEMINI_API_KEY
REDDIT_CLIENT_ID
REDDIT_CLIENT_SECRET
REDDIT_USER_AGENT          PAINRADAR/0.1 by u/your_username
RESEND_API_KEY
BRIEF_RECIPIENT            you@example.com
```

Optional **variables** (under the same screen, "Variables" tab) for clustering tunables:

```
CLUSTER_SIMILARITY_THRESHOLD   0.85
CLUSTER_KEYWORD_OVERLAP_MIN    2
CLUSTER_TOOL_OVERLAP_REQUIRED  true
```

## 6. Trigger the first workflow runs manually

- Actions → `collect-reddit` → Run workflow
- Wait until rows appear in `complaints` (status = `raw`)
- Actions → `process` → Run workflow
- Watch rows progress through `classified` → `clustered` → `scored` → `flagged`
- Actions → `brief` → Run workflow
- Check inbox for the first brief

After a successful manual run, the schedules take over: collector every 6 hours, process daily at 02:00 UTC, brief on Sundays at 06:00 UTC.

## 7. First-week sanity checks

- Are most rows getting `is_pain=false`? Tighten `CLASSIFIER_V1_SYSTEM` if too many false positives.
- Are clusters mostly singletons? Expected for week 1; clustering value compounds with volume.
- Did a brief send but feel weak? Lower `MIN_SCORE` in `packages/pipeline/src/brief.ts` to surface more, or extend the seed subreddit list in the `source_configs.params.subreddits` jsonb.

## 8. Phase 2 graduation triggers

See `docs/product.md` § Roadmap. Don't graduate a Phase 2 capability before its named trigger fires.
