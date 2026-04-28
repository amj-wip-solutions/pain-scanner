const num = (v: string | undefined, fallback: number): number =>
  v === undefined || v === '' ? fallback : Number(v);

const bool = (v: string | undefined, fallback: boolean): boolean =>
  v === undefined || v === '' ? fallback : v.toLowerCase() === 'true';

export const config = {
  cluster: {
    similarityThreshold: num(process.env.CLUSTER_SIMILARITY_THRESHOLD, 0.85),
    keywordOverlapMin: num(process.env.CLUSTER_KEYWORD_OVERLAP_MIN, 2),
    toolOverlapRequired: bool(process.env.CLUSTER_TOOL_OVERLAP_REQUIRED, true),
  },
  reddit: {
    clientId: process.env.REDDIT_CLIENT_ID ?? '',
    clientSecret: process.env.REDDIT_CLIENT_SECRET ?? '',
    userAgent: process.env.REDDIT_USER_AGENT ?? 'PAINRADAR/0.1',
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY ?? '',
    classifierModel: 'gemini-2.0-flash',
    embeddingModel: 'text-embedding-004',
  },
  resend: {
    apiKey: process.env.RESEND_API_KEY ?? '',
    recipient: process.env.BRIEF_RECIPIENT ?? '',
  },
  supabase: {
    url: process.env.SUPABASE_URL ?? '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  },
} as const;
