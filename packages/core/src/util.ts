export function intersectCount(a: string[] | null, b: string[] | null): number {
  if (!a || !b) return 0;
  const setB = new Set(b.map((s) => s.toLowerCase()));
  let n = 0;
  for (const x of a) {
    if (setB.has(x.toLowerCase())) n += 1;
  }
  return n;
}

export function unionLowercase(a: string[] | null, b: string[] | null): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of [a ?? [], b ?? []]) {
    for (const x of list) {
      const key = x.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(x);
      }
    }
  }
  return out;
}
