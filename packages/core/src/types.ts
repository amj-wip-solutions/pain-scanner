export type RawComplaint = {
  source: string;
  source_id: string;
  url: string;
  author: string | null;
  title: string | null;
  body: string;
  created_at: string;
  source_signals: Record<string, number | string | boolean>;
};

export type ComplaintStatus =
  | 'raw'
  | 'classified'
  | 'clustered'
  | 'scored'
  | 'flagged'
  | 'briefed'
  | 'archived'
  | 'failed';

export type FlagTier = 'hot' | 'watchlist' | 'logged' | 'archive';

export type PainType =
  | 'workflow_friction'
  | 'missing_feature'
  | 'reliability'
  | 'cost'
  | 'integration'
  | 'manual_workaround'
  | 'other';

export type AudienceRole = 'recruiter' | 'sourcer' | 'ta_lead' | 'hr_generalist' | 'other';

export type ClassifierOutput = {
  is_pain: boolean;
  pain_type: PainType;
  vertical_match: boolean;
  subject: string | null;
  pain_phrase: string | null;
  keywords: string[];
  tools_mentioned: string[];
  audience_role: AudienceRole | null;
  workaround_present: boolean;
  workaround_text: string | null;
  wtp_signal: boolean;
  b2b_context: boolean;
  search_query: string | null;
  confidence: number;
};

export type SignalBundle = {
  workaround_strength: 0 | 1 | 2;
  b2b_strength: 0 | 1 | 2;
  wtp_present: boolean;
  source_quality: number;
  freshness_days: number;
};

export type ScoreWeights = {
  frequency: number;
  workaround: number;
  b2b: number;
  velocity: number;
  uniqueness: number;
  wtp_bonus: number;
};

export type ContextStats = {
  cluster_member_count: number;
  velocity_ratio: number;
  tool_competitor_count: number;
};

export type SourceConfigParams = Record<string, unknown>;

export type ComplaintRow = {
  id: number;
  source: string;
  source_id: string;
  url: string;
  author: string | null;
  title: string | null;
  body: string;
  created_at: string;
  source_signals: Record<string, number | string | boolean>;
  status: ComplaintStatus;
  cluster_id: number | null;
  score: number | null;
  flag: FlagTier | null;
} & Partial<ClassifierOutput>;

export interface Collector {
  name: string;
  collect(opts: { since: Date; config: SourceConfigParams }): AsyncIterable<RawComplaint>;
}

export interface ScoreAdapter {
  source: string;
  toSignals(row: ComplaintRow): SignalBundle;
}
