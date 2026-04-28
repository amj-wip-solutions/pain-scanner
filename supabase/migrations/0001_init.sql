-- PAINRADAR initial schema
-- 4 Day-1 tables: clusters, complaints, source_configs, briefs
-- Phase 2 tables (learning_events, pipeline_events, velocity_baselines,
-- prompt_templates, scoring_formulas, community_seeds, scouting_briefs,
-- deepdive_reports) graduate per docs/product.md roadmap triggers.

create extension if not exists vector;

create type complaint_status as enum (
  'raw',
  'classified',
  'clustered',
  'scored',
  'flagged',
  'briefed',
  'archived',
  'failed'
);

create type flag_tier as enum ('hot', 'watchlist', 'logged', 'archive');

create table clusters (
  id                     bigserial primary key,
  canonical_title        text not null,
  pain_phrase            text not null,
  summary                text,
  centroid               vector(768) not null,
  member_count           int not null default 1,
  sources_present        text[] not null default '{}',
  tools_present          text[] not null default '{}',
  score_aggregate        int,
  flag                   flag_tier,
  first_seen             timestamptz not null,
  last_seen              timestamptz not null,
  best_member_confidence numeric not null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index clusters_centroid_idx
  on clusters using ivfflat (centroid vector_cosine_ops)
  with (lists = 10);

create table complaints (
  id                    bigserial primary key,
  source                text not null,
  source_id             text not null,
  url                   text not null,
  author                text,
  title                 text,
  body                  text not null,
  created_at            timestamptz not null,
  fetched_at            timestamptz not null default now(),
  source_signals        jsonb not null default '{}'::jsonb,
  status                complaint_status not null default 'raw',
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
  embedding             vector(768),
  cluster_id            bigint references clusters(id),
  clustered_at          timestamptz,
  -- scoring
  score                 int,
  signal_breakdown      jsonb,
  flag                  flag_tier,
  scored_at             timestamptz,
  briefed_at            timestamptz,
  -- error tracking
  last_error            text,
  unique (source, source_id)
);

create index complaints_status_idx   on complaints (status);
create index complaints_cluster_idx  on complaints (cluster_id);
create index complaints_keywords_idx on complaints using gin (keywords);
create index complaints_tools_idx    on complaints using gin (tools_mentioned);

create table source_configs (
  source                text primary key,
  enabled               boolean not null default true,
  params                jsonb not null,
  score_weights         jsonb not null,
  flag_thresholds       jsonb not null default
    '{"hot": 80, "watchlist": 60, "logged": 40}'::jsonb,
  classifier_prompt_key text not null default 'classifier_v1',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
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

-- Seed: reddit collector for recruiting/TA vertical
insert into source_configs (source, enabled, params, score_weights) values (
  'reddit',
  true,
  '{
    "subreddits": [
      "recruiting",
      "talentacquisition",
      "HumanResources",
      "AskHR",
      "sourcing",
      "recruiterhell"
    ],
    "vertical": "recruiting"
  }'::jsonb,
  '{
    "frequency": 25,
    "workaround": 30,
    "b2b": 10,
    "velocity": 15,
    "uniqueness": 15,
    "wtp_bonus": 10
  }'::jsonb
);
