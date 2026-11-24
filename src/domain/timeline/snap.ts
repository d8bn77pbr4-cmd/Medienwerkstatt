import type { Frames, Sequence } from './types';

/** Magnetpunkte: Clip-Anfänge und -Enden aller Spuren, Marken, Ein-/Ausstieg, Abspielkopf, 0. */
export function snapTargets(seq: Sequence, playhead: Frames): Frames[] {
  const set = new Set<Frames>([0, playhead]);
  for (const c of seq.clips) {
    set.add(c.start);
    set.add(c.start + c.duration);
  }
  for (const m of seq.markers) set.add(m.frame);
  if (seq.inPoint !== null) set.add(seq.inPoint);
  if (seq.outPoint !== null) set.add(seq.outPoint);
  return [...set].sort((a, b) => a - b);
}

/** Nächstes Ziel innerhalb der Schwelle, sonst die Position selbst. */
export function snap(frame: Frames, targets: Frames[], thresholdFrames: Frames): Frames {
  let best = frame;
  let bestDist = Infinity;
  for (const t of targets) {
    const dist = Math.abs(t - frame);
    if (dist <= thresholdFrames && dist < bestDist) {
      best = t;
      bestDist = dist;
    }
  }
  return best;
}
