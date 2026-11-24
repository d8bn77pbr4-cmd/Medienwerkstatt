import type { Sequence, Track } from './types';

export type SequenceFormat = { width: number; height: number; fps: number };

export type IdGen = () => string;
export const defaultIdGen: IdGen = () => crypto.randomUUID();

export const DEFAULT_TRACKS: Track[] = [
  { id: 'V1', kind: 'video', name: 'V1', locked: false, muted: false },
  { id: 'V2', kind: 'video', name: 'V2', locked: false, muted: false },
  { id: 'A1', kind: 'audio', name: 'A1', locked: false, muted: false },
  { id: 'A2', kind: 'audio', name: 'A2', locked: false, muted: false },
  { id: 'A3', kind: 'audio', name: 'A3', locked: false, muted: false },
  { id: 'A4', kind: 'audio', name: 'A4', locked: false, muted: false },
];

/** Neue leere Sequenz mit V1, V2, A1–A4 (stabile Ids). */
export function newSequence(o: { width: number; height: number; fps: number; name: string }, idGen: IdGen = defaultIdGen): Sequence {
  return {
    id: idGen(),
    name: o.name,
    width: o.width,
    height: o.height,
    fps: o.fps,
    tracks: DEFAULT_TRACKS.map((t) => ({ ...t })),
    clips: [],
    transitions: [],
    markers: [],
    inPoint: null,
    outPoint: null,
  };
}

/**
 * Auflösung und Bildrate ändern. Bei neuer Bildrate werden alle Bild-Angaben umgerechnet, damit die
 * Zeiten in Sekunden gleich bleiben (Anfang und Ende je Clip einzeln gerundet: Stöße bleiben Stöße).
 */
export function withFormat(seq: Sequence, f: SequenceFormat): Sequence {
  if (seq.width === f.width && seq.height === f.height && seq.fps === f.fps) return seq;
  if (seq.fps === f.fps) return { ...seq, width: f.width, height: f.height };
  const k = f.fps / seq.fps;
  const r = (x: number) => Math.round(x * k);
  return {
    ...seq,
    width: f.width,
    height: f.height,
    fps: f.fps,
    clips: seq.clips.map((c) => {
      const start = r(c.start);
      const duration = Math.max(1, r(c.start + c.duration) - start);
      return {
        ...c,
        start,
        duration,
        fadeIn: Math.min(duration, r(c.fadeIn)),
        fadeOut: Math.min(duration, r(c.fadeOut)),
        title: c.title ? { ...c.title, fadeIn: r(c.title.fadeIn), fadeOut: r(c.title.fadeOut) } : null,
      };
    }),
    transitions: seq.transitions.map((t) => ({ ...t, duration: Math.max(1, r(t.duration)) })),
    markers: seq.markers.map((m) => ({ ...m, frame: r(m.frame) })),
    inPoint: seq.inPoint === null ? null : r(seq.inPoint),
    outPoint: seq.outPoint === null ? null : r(seq.outPoint),
  };
}
