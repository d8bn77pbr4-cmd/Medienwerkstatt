import type { Frames, MediaItem, Sequence } from '../types';
import { clipEnd, edit, gen, isLocked, maxTransition, type OpOpts } from './common';

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
  const available = maxTransition(seq.fps, media, l, r);
  const dur = Math.min(frames, available);
  if (dur < 1) return { seq, shortenedTo: 0 };
  const id = gen(opts)();
  const next = edit(seq, (d) => {
    d.transitions = d.transitions.filter((t) => !(t.leftClipId === leftId && t.rightClipId === rightId));
    d.transitions.push({ id, trackId: track.id, leftClipId: leftId, rightClipId: rightId, duration: dur, kind: track.kind === 'video' ? 'dissolve' : 'audioFade' });
  }, media);
  return dur < frames ? { seq: next, shortenedTo: dur } : { seq: next };
}
