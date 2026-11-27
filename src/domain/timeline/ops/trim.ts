import type { Clip, Frames, MediaItem, Sequence, TrackId } from '../types';
import { EPS, clipEnd, edit, groupOf, isLocked, shiftAfter, unlockedIds, type OpOpts } from './common';

type Bounds = { min: number; max: number };

/** Erlaubte delta-Spanne für den Rand eines Clips (Quelllänge, Mindestdauer, Nachbarn). */
function bounds(seq: Sequence, media: MediaItem[], c: Clip, edge: 'in' | 'out', ripple: boolean): Bounds {
  const m = c.kind === 'media' ? media.find((x) => x.id === c.mediaId) : undefined;
  const others = seq.clips.filter((o) => o.trackId === c.trackId && o.id !== c.id);
  const b: Bounds = { min: -Infinity, max: Infinity };
  if (edge === 'in') {
    b.max = c.duration - 1;
    if (c.kind === 'media') b.min = -Math.floor(c.sourceIn * seq.fps + EPS);
    if (!ripple) {
      const prevEnd = Math.max(0, ...others.filter((o) => clipEnd(o) <= c.start).map(clipEnd));
      b.min = Math.max(b.min, prevEnd - c.start);
    }
  } else {
    b.min = -(c.duration - 1);
    if (m && m.kind !== 'image') b.max = Math.floor((m.durationSec - c.sourceIn) * seq.fps + EPS) - c.duration;
    if (!ripple) {
      const nexts = others.filter((o) => o.start >= clipEnd(c)).map((o) => o.start);
      if (nexts.length) b.max = Math.min(b.max, Math.min(...nexts) - clipEnd(c));
    }
  }
  return b;
}

/**
 * Rand eines Clips um `delta` Bilder verschieben (positiv = später). Begrenzt durch Quelllänge und Nachbarn.
 * Verknüpfte Clips folgen, außer `ignoreLinks` (J-/L-Cut). 'ripple' rückt alles Folgende nach.
 */
export function trim(
  seq: Sequence,
  media: MediaItem[],
  clipId: string,
  edge: 'in' | 'out',
  delta: Frames,
  mode: 'normal' | 'ripple' = 'normal',
  opts: OpOpts = {},
): Sequence {
  const primary = seq.clips.find((c) => c.id === clipId);
  if (!primary || isLocked(seq, primary.trackId)) return seq;
  const group = groupOf(seq, [clipId], !!opts.ignoreLinks);
  const ripple = mode === 'ripple';
  let lo = -Infinity;
  let hi = Infinity;
  for (const c of group) {
    const b = bounds(seq, media, c, edge, ripple);
    lo = Math.max(lo, b.min);
    hi = Math.min(hi, b.max);
  }
  const dlt = lo > hi ? 0 : Math.round(Math.max(lo, Math.min(hi, delta)));
  if (dlt === 0) return seq;
  const ids = new Set(group.map((c) => c.id));
  const oldEnd = clipEnd(primary);
  return edit(seq, (d) => {
    for (const c of d.clips) {
      if (!ids.has(c.id)) continue;
      if (edge === 'in') {
        if (!ripple) c.start += dlt;
        if (c.kind === 'media') c.sourceIn += dlt / d.fps;
        c.duration -= dlt;
        c.fadeIn = 0;
      } else {
        c.duration += dlt;
        c.fadeOut = 0;
      }
    }
    if (ripple) shiftAfter(d, oldEnd, edge === 'out' ? dlt : -dlt, ids);
  }, media);
}

/**
 * Schnitt zwischen zwei aneinanderstoßenden Clips verschieben (Roll). Verknüpfte Partnerschnitte rollen mit,
 * außer `ignoreLinks` (⌥: nur die angegebene Spur → J-/L-Cut).
 */
export function roll(seq: Sequence, media: MediaItem[], leftId: string, rightId: string, delta: Frames, opts: OpOpts = {}): Sequence {
  const l = seq.clips.find((c) => c.id === leftId);
  const r = seq.clips.find((c) => c.id === rightId);
  if (!l || !r || l.trackId !== r.trackId || clipEnd(l) !== r.start || isLocked(seq, l.trackId)) return seq;
  const pairs: [Clip, Clip][] = [[l, r]];
  if (!opts.ignoreLinks && l.linkId && r.linkId) {
    for (const pl of seq.clips) {
      if (pl.id === l.id || pl.linkId !== l.linkId || isLocked(seq, pl.trackId)) continue;
      const pr = seq.clips.find((c) => c.id !== r.id && c.linkId === r.linkId && c.trackId === pl.trackId && c.start === clipEnd(pl));
      if (pr) pairs.push([pl, pr]);
    }
  }
  let lo = -Infinity;
  let hi = Infinity;
  for (const [pl, pr] of pairs) {
    const lb = bounds(seq, media, pl, 'out', true);
    const rb = bounds(seq, media, pr, 'in', true);
    lo = Math.max(lo, lb.min, rb.min);
    hi = Math.min(hi, lb.max, rb.max);
  }
  const dlt = lo > hi ? 0 : Math.round(Math.max(lo, Math.min(hi, delta)));
  if (dlt === 0) return seq;
  const left = new Set(pairs.map((p) => p[0].id));
  const right = new Set(pairs.map((p) => p[1].id));
  return edit(seq, (d) => {
    for (const c of d.clips) {
      if (left.has(c.id)) {
        c.duration += dlt;
        c.fadeOut = 0;
      } else if (right.has(c.id)) {
        c.start += dlt;
        c.duration -= dlt;
        if (c.kind === 'media') c.sourceIn += dlt / d.fps;
        c.fadeIn = 0;
      }
    }
  }, media);
}

/** Q/W: Kopf (prev) bzw. Ende (next) des Clips unter dem Abspielkopf bis zur Position wegschneiden und nachrücken. */
export function rippleTrimToPlayhead(
  seq: Sequence,
  media: MediaItem[],
  at: Frames,
  which: 'prev' | 'next',
  trackIds: TrackId[] = unlockedIds(seq),
  opts: OpOpts = {},
): Sequence {
  const targets = seq.clips.filter((c) => trackIds.includes(c.trackId) && c.start < at && clipEnd(c) > at && !isLocked(seq, c.trackId));
  const done = new Set<string>();
  let out = seq;
  for (const t of targets) {
    if (done.has(t.id)) continue;
    for (const g of groupOf(seq, [t.id], !!opts.ignoreLinks)) done.add(g.id);
    out = which === 'prev' ? trim(out, media, t.id, 'in', at - t.start, 'ripple', opts) : trim(out, media, t.id, 'out', at - clipEnd(t), 'ripple', opts);
  }
  return out;
}
