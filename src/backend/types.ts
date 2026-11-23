// Platzhalter-Typen: spätere Tasks füllen sie mit den echten Feldern.

export type LoadResult<T> = { value: T | null; restoredFromBackup: boolean };

export type AppState = { version: 1 };
export type { Assignment } from '../domain/assignments/types';
export type Project = { version: 1 };
export type MediaItem = { id: string; path: string };
export type Segment = { start: number; end: number };
export type Interval = { start: number; end: number };
/** Luma 0–1, Prozentwerte 0–100, U/V −0,5…0,5. */
export type SegmentStats = {
  start: number;
  end: number;
  meanLuma: number;
  highlightsPct: number;
  shadowsPct: number;
  meanU: number;
  meanV: number;
};
export type Measurements = {
  format: { width: number; height: number; fps: number; durationSec: number; videoCodec: string; audioCodec: string | null };
  audio: { integratedLufs: number | null; truePeakDbtp: number | null; clippedSamples: number; silences: Interval[] };
  video: { black: Interval[]; freeze: Interval[]; detectedCuts: number[]; segments: SegmentStats[] };
};
