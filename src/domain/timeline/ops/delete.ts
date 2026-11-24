import type { Frames, Sequence, TrackId } from '../types';
import { clearRange, clipEnd, edit, gen, groupOf, isLocked, shiftAfter, type OpOpts } from './common';

/** Löschen ohne Nachrücken (Lift). */
export function liftDelete(seq: Sequence, clipIds: string[], opts: OpOpts = {}): Sequence {
  const del = new Set(groupOf(seq, clipIds, !!opts.ignoreLinks).map((c) => c.id));
  if (!del.size) return seq;
  return edit(seq, (d) => {
    d.clips = d.clips.filter((c) => !del.has(c.id));
  });
}

/**
 * Löschen mit Nachrücken: schließt die Lücke auf allen nicht gesperrten Spuren,
 * soweit sie dort frei ist (stoppt am ersten Hindernis).
 */
export function rippleDelete(seq: Sequence, clipIds: string[], opts: OpOpts = {}): Sequence {
  const group = groupOf(seq, clipIds, !!opts.ignoreLinks);
  if (!group.length) return seq;
  const del = new Set(group.map((c) => c.id));
  const ranges: [Frames, Frames][] = [];
  for (const [s, e] of group.map((c) => [c.start, clipEnd(c)] as [Frames, Frames]).sort((x, y) => x[0] - y[0])) {
    const last = ranges[ranges.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else ranges.push([s, e]);
  }
  return edit(seq, (d) => {
    d.clips = d.clips.filter((c) => !del.has(c.id));
    for (const [a, b] of ranges.reverse()) {
      let limit = b - a;
      for (const c of d.clips) {
        if (isLocked(d, c.trackId) || clipEnd(c) <= a || c.start >= b) continue;
        limit = Math.min(limit, Math.max(c.start, a) - a);
      }
      shiftAfter(d, b, -(b - a), new Set(), limit);
    }
  });
}

/** Clips verschieben (Ziel wird überschrieben). deltaTrack gilt für die gewählten Clips, Partner folgen nur zeitlich. */
export function moveClips(seq: Sequence, clipIds: string[], deltaFrames: Frames, deltaTrack: number, opts: OpOpts = {}): Sequence {
  const group = groupOf(seq, clipIds, !!opts.ignoreLinks);
  if (!group.length || (deltaFrames === 0 && deltaTrack === 0)) return seq;
  if (clipIds.some((id) => seq.clips.some((c) => c.id === id && isLocked(seq, c.trackId)))) return seq;
  const delta = Math.max(deltaFrames, -Math.min(...group.map((c) => c.start)));
  const selected = new Set(clipIds);
  const targetTrack = (trackId: TrackId, move: boolean): TrackId | null => {
    if (!move || deltaTrack === 0) return trackId;
    const kind = seq.tracks.find((t) => t.id === trackId)?.kind;
    const same = seq.tracks.filter((t) => t.kind === kind);
    const t = same[same.findIndex((x) => x.id === trackId) + deltaTrack];
    return t && !t.locked ? t.id : null;
  };
  const moves = group.map((c) => ({ id: c.id, trackId: targetTrack(c.trackId, selected.has(c.id)), start: c.start + delta, c }));
  if (moves.some((m) => m.trackId === null)) return seq;
  if (delta === 0 && moves.every((m) => m.trackId === m.c.trackId)) return seq;
  const idGen = gen(opts);
  return edit(seq, (d) => {
    const ids = new Set(moves.map((m) => m.id));
    const moved = d.clips.filter((c) => ids.has(c.id));
    d.clips = d.clips.filter((c) => !ids.has(c.id));
    for (const m of moves) clearRange(d, m.trackId!, m.start, m.start + m.c.duration, idGen);
    for (const c of moved) {
      const m = moves.find((x) => x.id === c.id)!;
      c.trackId = m.trackId!;
      c.start = m.start;
      d.clips.push(c);
    }
  });
}
