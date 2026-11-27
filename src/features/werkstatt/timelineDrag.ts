import { clipEnd, groupOf, isLocked } from '../../domain/timeline/ops/common';
import { snapTargets } from '../../domain/timeline/snap';
import type { Frames, Sequence } from '../../domain/timeline/types';
import { snapDelta } from './timelineCanvas';

/**
 * Einrasten während eines Zuges (rein, ohne React). Ziele sind alle Kanten, Marken, In/Out, 0 und der
 * Abspielkopf – außer den Kanten der Clips, die die Operation selbst bewegt (verknüpfte Partner ohne ⌥,
 * beim Ripple-Trimmen alles Nachrückende). Sonst rastet ein Zug auf die alte Lage seines Partners zurück.
 */
export type Snapped = { delta: Frames; at: Frames | null };

function targetsWithout(seq: Sequence, moving: Set<string>, playhead: Frames): Frames[] {
  return snapTargets({ ...seq, clips: seq.clips.filter((c) => !moving.has(c.id)) }, playhead);
}

const idsOf = (seq: Sequence, ids: string[], ignoreLinks: boolean): Set<string> =>
  new Set([...ids, ...groupOf(seq, ids, ignoreLinks).map((c) => c.id)]);

export function trimSnap(
  seq: Sequence,
  d: { clipId: string; edge: 'in' | 'out'; mode: 'normal' | 'ripple'; ignoreLinks: boolean },
  raw: Frames,
  playhead: Frames,
  threshold: number,
): Snapped {
  const c = seq.clips.find((x) => x.id === d.clipId);
  if (!c) return { delta: raw, at: null };
  const moving = idsOf(seq, [c.id], d.ignoreLinks);
  if (d.mode === 'ripple') {
    // `trim` rückt alles ab dem alten Ende auf nicht gesperrten Spuren nach.
    const boundary = clipEnd(c);
    for (const o of seq.clips) if (o.start >= boundary && !isLocked(seq, o.trackId)) moving.add(o.id);
  }
  return snapDelta([d.edge === 'in' ? c.start : clipEnd(c)], raw, targetsWithout(seq, moving, playhead), threshold);
}

export function rollSnap(
  seq: Sequence,
  d: { leftId: string; rightId: string; cut: Frames; ignoreLinks: boolean },
  raw: Frames,
  playhead: Frames,
  threshold: number,
): Snapped {
  return snapDelta([d.cut], raw, targetsWithout(seq, idsOf(seq, [d.leftId, d.rightId], d.ignoreLinks), playhead), threshold);
}

export function moveSnap(
  seq: Sequence,
  d: { ids: string[]; primaryId: string; ignoreLinks: boolean },
  raw: Frames,
  playhead: Frames,
  threshold: number,
): Snapped {
  const p = seq.clips.find((x) => x.id === d.primaryId);
  if (!p) return { delta: raw, at: null };
  return snapDelta([p.start, clipEnd(p)], raw, targetsWithout(seq, idsOf(seq, [...d.ids, p.id], d.ignoreLinks), playhead), threshold);
}
