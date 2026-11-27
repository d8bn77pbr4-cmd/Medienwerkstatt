import type { Clip, MediaItem, Sequence } from './types';

/**
 * Wie weit Clips über ihren Schnitt hinausragen: Überblendungen liegen mittig auf dem Schnitt.
 * `head`/`tail` (Sekunden) sind auf die vorhandene Quelle begrenzt (vor `sourceIn`, nach dem Clip-Ende);
 * `fadeIn`/`fadeOut` (Sekunden) sind die tatsächlichen Überblendungslängen (Überstand rechts + links).
 * Export (`filtergraph.ts`) und Vorschau (`resolve.ts`) benutzen genau diese Berechnung.
 */
export type Overhang = { head: number; tail: number; fadeIn: number; fadeOut: number };
export const NO_OVERHANG: Overhang = { head: 0, tail: 0, fadeIn: 0, fadeOut: 0 };

export function transitionOverhangs(
  seq: Sequence,
  kind: 'dissolve' | 'audioFade',
  media: Map<string, MediaItem>,
): Map<string, Overhang> {
  const ext = new Map<string, Overhang>();
  const get = (id: string): Overhang => {
    let e = ext.get(id);
    if (!e) ext.set(id, (e = { ...NO_OVERHANG }));
    return e;
  };
  const clip = (id: string) => seq.clips.find((c) => c.id === id);
  const room = (c: Clip | undefined): { head: number; tail: number } => {
    const m = c?.mediaId ? media.get(c.mediaId) : undefined;
    if (!c || !m || m.kind === 'image') return { head: Infinity, tail: Infinity };
    return { head: Math.max(0, c.sourceIn), tail: Math.max(0, m.durationSec - c.sourceIn - c.duration / seq.fps) };
  };
  for (const t of seq.transitions) {
    if (t.kind !== kind) continue;
    const [l, r] = [clip(t.leftClipId), clip(t.rightClipId)];
    if (!l || !r) continue;
    const half = t.duration / seq.fps / 2;
    const tail = Math.min(half, room(l).tail);
    const head = Math.min(half, room(r).head);
    get(l.id).tail = tail;
    get(r.id).head = head;
    get(l.id).fadeOut = head + tail;
    get(r.id).fadeIn = head + tail;
  }
  return ext;
}
