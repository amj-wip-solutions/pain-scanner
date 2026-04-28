import {
  getLastSeenAtForSubreddit,
  getSourceConfig,
  insertRawComplaints,
  type RawComplaint,
} from '@painradar/core';
import { collectors } from './index.js';

function parseLookback(s: string): number {
  const m = s.match(/^(\d+)([dh])$/);
  if (!m) throw new Error(`invalid --lookback (use forms like 7d, 30d, 90d, 12h): ${s}`);
  const n = Number(m[1]);
  return m[2] === 'd' ? n * 24 * 60 * 60 * 1000 : n * 60 * 60 * 1000;
}

const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith('--')) ?? '';
const c = collectors[name];
if (!c) {
  console.error(`Unknown collector: ${name}`);
  console.error(`Available: ${Object.keys(collectors).join(', ')}`);
  process.exit(1);
}

const lookbackArg = args.find((a) => a.startsWith('--lookback='));
const lookbackOverrideMs = lookbackArg ? parseLookback(lookbackArg.split('=')[1] ?? '') : null;

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
const FIRST_RUN_BACKFILL_MS = 30 * 24 * 60 * 60 * 1000;

const FLUSH_AT = 50;
let totalAttempted = 0;

async function flush(buffer: RawComplaint[]): Promise<void> {
  if (buffer.length === 0) return;
  const batch = buffer.splice(0, buffer.length);
  const { attempted } = await insertRawComplaints(batch);
  totalAttempted += attempted;
}

if (lookbackOverrideMs !== null) {
  console.log(`backfill mode: lookback override = ${lookbackArg}`);
}

if (name === 'reddit') {
  const subs = (cfg.params.subreddits as string[]) ?? [];
  if (subs.length === 0) {
    console.error('reddit source_configs.params.subreddits is empty');
    process.exit(1);
  }

  for (const sub of subs) {
    let since: Date;
    if (lookbackOverrideMs !== null) {
      since = new Date(Date.now() - lookbackOverrideMs);
    } else {
      const lastSeen = await getLastSeenAtForSubreddit(name, sub);
      since = lastSeen
        ? new Date(lastSeen.getTime() - 60 * 60 * 1000)
        : new Date(Date.now() - FIRST_RUN_BACKFILL_MS);
    }

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
  const since =
    lookbackOverrideMs !== null
      ? new Date(Date.now() - lookbackOverrideMs)
      : new Date(Date.now() - DEFAULT_LOOKBACK_MS);
  const buffer: RawComplaint[] = [];
  for await (const row of c.collect({ since, config: cfg.params })) {
    buffer.push(row);
    if (buffer.length >= FLUSH_AT) await flush(buffer);
  }
  await flush(buffer);
}

console.log(`${name}: total upserts attempted=${totalAttempted} (duplicates ignored)`);
