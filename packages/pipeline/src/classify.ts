export async function classify(): Promise<void> {
  // TODO: read complaints WHERE status = 'raw' (paginated, batch ~20 to respect 15 req/min),
  // call Gemini 2.0 Flash in JSON mode with CLASSIFIER_V1_SYSTEM + CLASSIFIER_V1_RESPONSE_SCHEMA,
  // write classifier output columns + classified_at, advance status to 'classified' or 'failed'.
}
