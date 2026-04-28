import { GoogleGenerativeAI, type Schema } from '@google/generative-ai';
import {
  CLASSIFIER_V1_RESPONSE_SCHEMA,
  CLASSIFIER_V1_SYSTEM,
  config,
  getDb,
  type ClassifierOutput,
} from '@painradar/core';

const BATCH = 20;
const PER_REQ_PAUSE_MS = 4_500;

export async function classify(): Promise<void> {
  if (!config.gemini.apiKey) {
    throw new Error('GEMINI_API_KEY missing');
  }
  const db = getDb();
  const ai = new GoogleGenerativeAI(config.gemini.apiKey);
  const model = ai.getGenerativeModel({
    model: config.gemini.classifierModel,
    systemInstruction: CLASSIFIER_V1_SYSTEM,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: CLASSIFIER_V1_RESPONSE_SCHEMA as unknown as Schema,
      temperature: 0,
    },
  });

  let totalDone = 0;
  let totalFailed = 0;

  for (;;) {
    const { data: rows, error } = await db
      .from('complaints')
      .select('id, title, body')
      .eq('status', 'raw')
      .order('id', { ascending: true })
      .limit(BATCH);
    if (error) throw new Error(`classify: select raw rows: ${error.message}`);
    if (!rows || rows.length === 0) break;

    for (const row of rows as Array<{ id: number; title: string | null; body: string }>) {
      const text = `${row.title ?? ''}\n\n${(row.body ?? '').slice(0, 4000)}`.trim();
      try {
        const result = await model.generateContent(text);
        const raw = result.response.text();
        const out = JSON.parse(raw) as ClassifierOutput;

        const update: Record<string, unknown> = {
          status: 'classified',
          classified_at: new Date().toISOString(),
          is_pain: out.is_pain,
          pain_type: out.pain_type,
          vertical_match: out.vertical_match,
          subject: out.subject ?? null,
          pain_phrase: out.pain_phrase ?? null,
          keywords: out.keywords ?? [],
          tools_mentioned: out.tools_mentioned ?? [],
          audience_role: out.audience_role ?? null,
          workaround_present: out.workaround_present,
          workaround_text: out.workaround_text ?? null,
          wtp_signal: out.wtp_signal,
          b2b_context: out.b2b_context,
          search_query: out.search_query ?? null,
          classifier_confidence: out.confidence,
          last_error: null,
        };

        const { error: upErr } = await db.from('complaints').update(update).eq('id', row.id);
        if (upErr) throw new Error(`update: ${upErr.message}`);
        totalDone += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await db
          .from('complaints')
          .update({ status: 'failed', last_error: `classify: ${msg.slice(0, 500)}` })
          .eq('id', row.id);
        totalFailed += 1;
      }
      await new Promise((r) => setTimeout(r, PER_REQ_PAUSE_MS));
    }
  }

  console.log(`classify: ${totalDone} done, ${totalFailed} failed`);
}
