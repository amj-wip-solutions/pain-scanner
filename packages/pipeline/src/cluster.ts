export async function cluster(): Promise<void> {
  // TODO: read WHERE status = 'classified'.
  // For is_pain = false: set status = 'archived'.
  // For is_pain = true: embed `${pain_phrase} | ${tools_mentioned.join(', ')}` via
  // text-embedding-004, find nearest cluster centroid via pgvector cosine,
  // attach if similarity >= config.cluster.similarityThreshold AND
  //   (config.cluster.toolOverlapRequired ? overlap(tools_mentioned, cluster.tools_present) >= 1
  //    : intersect(keywords, cluster.keywords).length >= config.cluster.keywordOverlapMin),
  // else create new cluster with this row as seed.
  // Update centroid as average of member embeddings; bump member_count, last_seen,
  // canonical_title if classifier_confidence > best_member_confidence.
  // Advance status to 'clustered'.
}
