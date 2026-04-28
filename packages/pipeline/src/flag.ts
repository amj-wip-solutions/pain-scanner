import type { FlagTier } from '@painradar/core';

export async function flag(): Promise<void> {
  // TODO: read WHERE status = 'scored', load source_configs.flag_thresholds,
  // map score → flag tier via tierForScore, write flag, advance status to 'flagged'
  // (or 'archived' if below the lowest threshold). Mirror flag onto cluster.flag.
}

export function tierForScore(
  score: number,
  thresholds: { hot: number; watchlist: number; logged: number },
): FlagTier {
  if (score >= thresholds.hot) return 'hot';
  if (score >= thresholds.watchlist) return 'watchlist';
  if (score >= thresholds.logged) return 'logged';
  return 'archive';
}
