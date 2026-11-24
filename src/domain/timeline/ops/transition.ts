import type { Frames, MediaItem, Sequence } from '../types';
import { EPS, clipEnd, edit, gen, isLocked, type OpOpts } from './common';

/**
 * Überblendung mittig auf dem Schnitt zwischen zwei aneinanderstoßenden Clips.
 * Wird auf die verfügbaren Überhänge gekürzt (`shortenedTo`); ohne Überhang bleibt die Sequenz unverändert (`shortenedTo: 0`).
 */
export function addTransition(
  seq: Sequence,
  media: MediaItem[],
  leftId: string,
  rightId: string,
  frames: Frames,
  opts: OpOpts = {},
): { seq: Sequence; shortenedTo?: Frames } {
  const l = seq.clips.find((c) => c.id === leftId);
  const r = seq.clips.find((c) => c.id === rightId);
  if (!l || !r || l.trackId !== r.trackId || clipEnd(l) !== r.start || isLocked(seq, l.trackId) || frames < 1) return { seq };
  const track = seq.tracks.find((t) => t.id === l.trackId)!;
  const src = (c: typeof l) => (c.kind === 'media' ? media.find((m) => m.id === c.mediaId) : undefined);
  const tailOf = (c: typeof l) => {
    const m = src(c);
    return !m || m.kind === 'image' ? Infinity : Math.floor((m.durationSec - c.sourceIn - c.duration / seq.fps) * seq.fps + EPS);
  };
  const headOf = (c: typeof l) => (c.kind === 'title' ? Infinity : Math.floor(c.sourceIn * seq.fps + EPS));
  const handles = Math.max(0, Math.min(tailOf(l), headOf(r)));
  const available = Math.min(handles * 2, 2 * Math.min(l.duration, r.duration));
  const dur = Math.min(frames, available);
  if (dur < 1) return { seq, shortenedTo: 0 };
  const id = gen(opts)();
  const next = edit(seq, (d) => {
    d.transitions = d.transitions.filter((t) => !(t.leftClipId === leftId && t.rightClipId === rightId));
    d.transitions.push({ id, trackId: track.id, leftClipId: leftId, rightClipId: rightId, duration: dur, kind: track.kind === 'video' ? 'dissolve' : 'audioFade' });
  });
  return dur < frames ? { seq: next, shortenedTo: dur } : { seq: next };
}
