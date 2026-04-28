export async function brief(): Promise<void> {
  // TODO: load last briefs.sent_at (fallback 7 days ago).
  // Find clusters with score_aggregate >= 60 whose id is not in any prior
  // briefs.cluster_ids, ordered by score_aggregate desc, limit 10.
  // Render markdown then HTML via markdown-it.
  // Send via Resend to config.resend.recipient.
  // Insert briefs row with markdown, html, cluster_ids, complaint_ids,
  // and set status = 'briefed' on the included complaints.
}
