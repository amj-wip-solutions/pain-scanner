import { describe, expect, test } from 'bun:test';
import { intersectCount, unionLowercase } from './util.js';

describe('intersectCount', () => {
  test('null inputs return 0', () => {
    expect(intersectCount(null, ['a'])).toBe(0);
    expect(intersectCount(['a'], null)).toBe(0);
    expect(intersectCount(null, null)).toBe(0);
  });

  test('empty arrays return 0', () => {
    expect(intersectCount([], ['a'])).toBe(0);
    expect(intersectCount(['a'], [])).toBe(0);
  });

  test('case-insensitive match', () => {
    expect(intersectCount(['Greenhouse'], ['greenhouse'])).toBe(1);
    expect(intersectCount(['LEVER'], ['Lever'])).toBe(1);
  });

  test('counts each match once', () => {
    expect(intersectCount(['a', 'b', 'c'], ['b', 'c', 'd'])).toBe(2);
  });

  test('duplicates in left counted as separate matches', () => {
    expect(intersectCount(['a', 'a', 'b'], ['a'])).toBe(2);
  });
});

describe('unionLowercase', () => {
  test('combines and dedupes case-insensitively, preserves first-seen casing', () => {
    expect(unionLowercase(['Greenhouse', 'Lever'], ['lever', 'Workday'])).toEqual([
      'Greenhouse',
      'Lever',
      'Workday',
    ]);
  });

  test('null inputs treated as empty', () => {
    expect(unionLowercase(null, ['a'])).toEqual(['a']);
    expect(unionLowercase(['a'], null)).toEqual(['a']);
    expect(unionLowercase(null, null)).toEqual([]);
  });
});
