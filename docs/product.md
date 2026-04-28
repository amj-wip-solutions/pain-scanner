# PAINRADAR — Product Brief

## Problem

SaaS opportunities hide in public complaints. People describe broken workflows daily on Reddit, review sites, Discord, and Slack communities. No tool systematically captures, classifies, scores, and surfaces only the high-signal ones. Generic feed readers and keyword alert tools (Syften, Octolens) miss intent and context. GummySearch shut down December 2025. BigIdeasDB is static.

## Product

Automated pipeline that:

1. Collects public complaints from configured sources
2. Classifies each one with Gemini for genuine pain, vertical fit, and structured metadata
3. Embeds and clusters cross-source pains expressing the same underlying problem
4. Scores each cluster on six signal dimensions
5. Flags by threshold tier
6. Delivers a weekly Sunday-morning digest of the top 10 clusters

The output is a 15-minute brief, not a feed. Maximum 10 items per week.

## Target user

Solo founder or small team looking for the next product to build, focused on a vertical of buyers who pay for SaaS but cannot self-build.

## Vertical (Day 1)

Recruiting and talent acquisition.

Reasoning: recruiters depend on SaaS tools daily (ATS, sourcing, scheduling, outreach), cannot build their own, and have purchasing budget. Captive audience. Pain language is verbose ("tracking candidates in a spreadsheet"). Workaround signals are explicit. B2B context is universal.

Phase 2 expansions: sales operations, customer success, marketing operations, HR generalists. Each expansion is one new `source_configs` row, no architectural change.

## Differentiators

| Feature | PAINRADAR | Syften / Octolens | GummySearch | BigIdeasDB |
|---------|-----------|--------------------|-------------|-----------|
| Cross-source semantic clustering | Yes | No | No | No |
| AI-classified pain (not keyword match) | Yes | No | Partial | N/A |
| Vertical-specific scoring weights | Yes | No | No | No |
| Workaround-signal detection | Yes | No | No | No |
| Tools-mentioned extraction | Yes | No | No | No |
| Live pipeline | Yes | Yes | Discontinued | Static DB |
| Weekly digest, top-10 only | Yes | No (raw feed) | No | No |
| Pluggable architecture | Yes | N/A | N/A | N/A |

## Sources

Day 1, automated:

- Reddit, 6 subreddits in recruiting/TA vertical

Phase 2, semi-automated:

- Reddit, additional vertical-specific subs (sales ops, CS, marketing ops, etc.)
- G2 / Capterra reviews, 2–3 star filtered
- Discord, 10–15 targeted servers via bot
- Job boards, weekly scan for listings that imply a workaround

Phase 2, manual ingestion:

- Slack communities (paste threads into seed UI)

## Day 1 seed subreddits

| Subreddit | Approx. members |
|-----------|-----------------|
| r/recruiting | 270k |
| r/talentacquisition | 30k |
| r/HumanResources | 280k |
| r/AskHR | 120k |
| r/sourcing | 10k |
| r/recruiterhell | 50k |

## Scoring (0–100)

Vertical-tuned weights for recruiting/TA, stored in `source_configs.score_weights`:

| Signal | Range | Notes |
|--------|-------|-------|
| Frequency | 0–25 | Mentions of same pain/cluster in last 30 days |
| Workaround signal | 0–30 | Bumped — spreadsheet/Notion/Airtable usage is the strongest pain marker for non-technical roles |
| B2B context | 0–10 | Lowered — universal in vertical, weak signal |
| Velocity vs baseline | 0–15 | Recent rate vs source's 30-day average |
| Uniqueness | 0–15 | Inverse of competitor saturation, gauged via tools_mentioned overlap |
| Willingness-to-pay language | +10 bonus | Procurement, budget, "approved", "boss wants" |

Composite score is summed and capped at 100.

## Flag tiers

| Tier | Range | Treatment |
|------|-------|-----------|
| Hot 🔴 | 80–100 | Brief headline, act-now flag |
| Watchlist 🟡 | 60–79 | Brief, monitor 2 weeks |
| Logged 🟢 | 40–59 | Stored, monthly review |
| Archive ⬜ | 0–39 | Stored silent |

Cross-source escalation rules (active once a second source is added in Phase 2):

- 3+ mentions across 2+ platforms → upgrade one tier
- Job posting match on `tools_mentioned` → upgrade one tier
- All three (Reddit + G2 + job posting) → forced Hot

## Weekly brief

- Cadence: Sunday 08:00 Europe/Paris
- Recipient: configured email via Resend
- Content: top 10 clusters by composite score since last brief
- Format: HTML email, markdown source stored in `briefs.markdown` for reference
- Each entry: cluster title, score, flag tier, member count, sources, pain phrase, top tools, link list

## Day 1 success criteria

- Brief lands in inbox each Sunday
- ≥3 of 10 items per week feel non-obvious to the user (subjective)
- Pipeline runs without manual intervention for 30 consecutive days
- Adding a new source (Phase 2) requires only one collector file plus one `source_configs` row, with zero changes to aggregator/classifier/scorer

## Roadmap

Phase 2 capabilities are triggered by signals from real use, not scheduled.

| Capability | Trigger to graduate |
|-----------|---------------------|
| Feedback loop / `learning_events` table | After 3+ briefs and user starts marking false positives |
| Discord collector | When Reddit-only signal proves too narrow |
| G2 / Capterra scraper | After Discord is stable |
| Cross-source flag rule | After 2+ sources are active |
| Job-board correlation flag | After G2 is active |
| Competitor auto-detection (Gemini check on top clusters) | After 5+ briefs |
| Deep-dive workflow (re-issue `search_query` on top clusters) | After 3+ briefs |
| Config UI inside dashboard | When tweaking via Supabase SQL editor becomes annoying |
| Trend visualization (Recharts) | After 8+ weeks of data |
| Scouting brief (community discovery) | After Discord is active |
