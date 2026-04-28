import {
  getLastSeenAtForSubreddit,
  getSourceConfig,
  insertRawComplaints,
  type RawComplaint,
} from '@painradar/core';
import { collectors } from './index.js';

const name = process.argv[2];
const c = collectors[name];
if (!c) {
  console.error(`Unknown collector: ${name}`);
  console.error(`Available: ${Object.keys(collectors).join(', ')}`);
  process.exit(1);
}

const cfg = await getSourceConfig(name);
if (!cfg) {
  console.error(`No source_configs row for ${name}; insert one before running this collector`);
  process.exit(1);
}
if (!cfg.enabled) {
  console.log(`source ${name} disabled in source_configs, skipping`);
  process.exit(0);
}

const DEFAULT_LOOKBACK_MS = 6 * 60 * 60 * 1000;
const BACKFILL_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

const FLUSH_AT = 50;
let totalAttempted = 0;

async function flush(buffer: RawComplaint[]): Promise<void> {
  if (buffer.length === 0) return;
  const batch = buffer.splice(0, buffer.length);
  const { attempted } = await insertRawComplaints(batch);
  totalAttempted += attempted;
}

if (name === 'reddit') {
  const subs = (cfg.params.subreddits as string[]) ?? [];
  if (subs.length === 0) {
    console.error('reddit source_configs.params.subreddits is empty');
    process.exit(1);
  }

  for (const sub of subs) {
    const lastSeen = await getLastSeenAtForSubreddit(name, sub);
    const since = lastSeen
      ? new Date(lastSeen.getTime() - 60 * 60 * 1000)
      : new Date(Date.now() - BACKFILL_LOOKBACK_MS);

    const buffer: RawComplaint[] = [];
    for await (const row of c.collect({ since, config: { subreddits: [sub] } })) {
      buffer.push(row);
      if (buffer.length >= FLUSH_AT) await flush(buffer);
    }
    await flush(buffer);

    console.log(
      `reddit/${sub}: cursor=${since.toISOString()} cumulative_upserts=${totalAttempted}`,
    );
  }
} else {
  const since = new Date(Date.now() - DEFAULT_LOOKBACK_MS);
  const buffer: RawComplaint[] = [];
  for await (const row of c.collect({ since, config: cfg.params })) {
    buffer.push(row);
    if (buffer.length >= FLUSH_AT) await flush(buffer);
  }
  await flush(buffer);
}

console.log(`${name}: total upserts attempted=${totalAttempted} (duplicates ignored)`);
