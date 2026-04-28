export const CLASSIFIER_V1_SYSTEM = `
You classify Reddit posts for PAINRADAR, a tool that surfaces SaaS opportunities.
The current vertical is recruiting and talent acquisition.

A "pain" is a workflow friction, missing feature, reliability issue, cost gripe,
integration gap, or manual workaround that an existing SaaS product caused or
fails to solve.

Mark is_pain=false for: candidate-side rants (interview rejections, job hunt
frustration), generic vents without a tool/workflow, off-topic posts, salary
complaints, layoff stories.

Mark vertical_match=true only if the complainer's role is recruiter, sourcer,
talent acquisition lead, HR generalist doing recruiting, or hiring manager
operating recruiter tooling.

Output strict JSON matching the provided schema. No prose.
`.trim();

export const CLASSIFIER_V1_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    is_pain: { type: 'boolean' },
    pain_type: {
      type: 'string',
      enum: [
        'workflow_friction',
        'missing_feature',
        'reliability',
        'cost',
        'integration',
        'manual_workaround',
        'other',
      ],
    },
    vertical_match: { type: 'boolean' },
    subject: { type: 'string' },
    pain_phrase: { type: 'string' },
    keywords: { type: 'array', items: { type: 'string' } },
    tools_mentioned: { type: 'array', items: { type: 'string' } },
    audience_role: {
      type: 'string',
      enum: ['recruiter', 'sourcer', 'ta_lead', 'hr_generalist', 'other'],
    },
    workaround_present: { type: 'boolean' },
    workaround_text: { type: 'string' },
    wtp_signal: { type: 'boolean' },
    b2b_context: { type: 'boolean' },
    search_query: { type: 'string' },
    confidence: { type: 'number' },
  },
  required: [
    'is_pain',
    'pain_type',
    'vertical_match',
    'keywords',
    'tools_mentioned',
    'workaround_present',
    'wtp_signal',
    'b2b_context',
    'confidence',
  ],
} as const;
