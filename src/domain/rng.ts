/** FNV-1a (32 Bit) über die UTF-16-Codeeinheiten des Seeds. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministischer Zufall in [0, 1): FNV-1a-Hash des Seeds → mulberry32. */
export function rng(seed: string): () => number {
  let a = fnv1a(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(r: () => number, items: T[]): T {
  if (items.length === 0) throw new Error('pick: leere Liste');
  return items[Math.floor(r() * items.length)];
}

export function weighted<T>(r: () => number, items: [T, number][]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  if (!(total > 0)) throw new Error('weighted: Gesamtgewicht muss > 0 sein');
  let x = r() * total;
  for (const [item, w] of items) {
    if (w <= 0) continue;
    if (x < w) return item;
    x -= w;
  }
  return items.filter(([, w]) => w > 0).at(-1)![0];
}
