import type { Sequence, Track } from './types';

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
