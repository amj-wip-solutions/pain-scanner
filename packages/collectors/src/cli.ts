import { collectors } from './index.js';

const name = process.argv[2];
const c = collectors[name];
if (!c) {
  console.error(`Unknown collector: ${name}`);
  console.error(`Available: ${Object.keys(collectors).join(', ')}`);
  process.exit(1);
}

const since = new Date(Date.now() - 6 * 60 * 60 * 1000);
for await (const row of c.collect({ since, config: {} })) {
  console.log(JSON.stringify(row));
}
