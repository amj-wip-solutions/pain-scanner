import { describe, expect, test } from 'bun:test';
import { Glob } from 'bun';

const FORBIDDEN_IMPORT = /from ['"][^'"]*\/(reddit|discord|g2|capterra|slack)['"]/;

describe('architecture: source-blind aggregator', () => {
  test('pipeline files outside adapters/ do not import per-source modules', async () => {
    const srcDir = import.meta.dir;
    const glob = new Glob('**/*.ts');
    const violations: { file: string; lines: string[] }[] = [];

    for await (const rel of glob.scan({ cwd: srcDir })) {
      if (rel.startsWith('adapters/')) continue;
      if (rel.endsWith('.test.ts')) continue;
      const abs = `${srcDir}/${rel}`;
      const content = await Bun.file(abs).text();
      const offending = content
        .split('\n')
        .filter((line) => FORBIDDEN_IMPORT.test(line) && !line.trim().startsWith('//'));
      if (offending.length > 0) {
        violations.push({ file: rel, lines: offending });
      }
    }

    if (violations.length > 0) {
      console.error('source-blind violations:', JSON.stringify(violations, null, 2));
    }
    expect(violations).toEqual([]);
  });
});
