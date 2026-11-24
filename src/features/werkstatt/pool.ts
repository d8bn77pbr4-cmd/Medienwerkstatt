/** Zwischenspeicher für Medien-Elemente: gibt ersetzte und veraltete Einträge frei. */
export class Pool<T> {
  private items = new Map<string, { el: T; url: string; lastUsed: number }>();

  constructor(
    private create: (url: string) => T,
    private release: (el: T) => void,
  ) {}

  /** Liefert den Eintrag zu `key`; ändert sich die URL, wird der alte freigegeben und ein neuer angelegt. */
  get(key: string, url: string, now: number): T {
    const have = this.items.get(key);
    if (have && have.url === url) {
      have.lastUsed = now;
      return have.el;
    }
    if (have) this.release(have.el);
    const el = this.create(url);
    this.items.set(key, { el, url, lastUsed: now });
    return el;
  }

  /** Entfernt (und gibt frei) Einträge, die nicht mehr `live` sind oder länger als `maxIdleMs` ungenutzt blieben. */
  prune(live: (key: string) => boolean, now: number, maxIdleMs: number): string[] {
    const gone: string[] = [];
    for (const [key, it] of this.items) {
      if (!live(key) || now - it.lastUsed > maxIdleMs) {
        this.release(it.el);
        this.items.delete(key);
        gone.push(key);
      }
    }
    return gone;
  }

  entries(): IterableIterator<[string, { el: T; url: string; lastUsed: number }]> {
    return this.items.entries();
  }
  keys(): IterableIterator<string> {
    return this.items.keys();
  }
  get size(): number {
    return this.items.size;
  }
  clear(): void {
    for (const it of this.items.values()) this.release(it.el);
    this.items.clear();
  }
}

/** Höchstens so viele gleichzeitig sichtbare Clips je Medium bekommen ein eigenes Element. */
export const SLOTS_PER_MEDIA = 2;

/**
 * Plätze (0…SLOTS_PER_MEDIA−1) je sichtbarer Ebene: Clips desselben Mediums, die gleichzeitig sichtbar
 * sind (z. B. Überblendung zwischen zwei Teilen eines Interviews), bekommen verschiedene Elemente.
 * Bisherige Plätze bleiben erhalten, solange sie frei sind (kein Springen des Elements).
 */
export function assignSlots(
  layers: { clipId: string; mediaId: string }[],
  prev: Map<string, { mediaId: string; slot: number }>,
): Map<string, number> {
  const out = new Map<string, number>();
  const taken = new Set<string>();
  const key = (mediaId: string, slot: number) => `${mediaId}#${slot}`;
  for (const l of layers) {
    const p = prev.get(l.clipId);
    if (p && p.mediaId === l.mediaId && !taken.has(key(l.mediaId, p.slot))) {
      out.set(l.clipId, p.slot);
      taken.add(key(l.mediaId, p.slot));
    }
  }
  for (const l of layers) {
    if (out.has(l.clipId)) continue;
    let slot = 0;
    while (slot < SLOTS_PER_MEDIA - 1 && taken.has(key(l.mediaId, slot))) slot++;
    out.set(l.clipId, slot);
    taken.add(key(l.mediaId, slot));
  }
  return out;
}
