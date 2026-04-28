import { getSourceConfig, insertRawComplaints, type RawComplaint } from '@painradar/core';
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

const lookbackMs = 6 * 60 * 60 * 1000;
const since = new Date(Date.now() - lookbackMs);

const buffer: RawComplaint[] = [];
const FLUSH_AT = 50;
let total = 0;

async function flush(): Promise<void> {
  if (buffer.length === 0) return;
  const batch = buffer.splice(0, buffer.length);
  const { attempted } = await insertRawComplaints(batch);
  total += attempted;
}

for await (const row of c.collect({ since, config: cfg.params })) {
  buffer.push(row);
  if (buffer.length >= FLUSH_AT) await flush();
}
await flush();

console.log(`${name}: attempted ${total} upserts (duplicates ignored)`);
