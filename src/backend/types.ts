import type { Assignment } from '../domain/assignments/types';
import type { ScheduleState } from '../domain/assignments/schedule';
import type { Evaluation } from '../domain/chef/types';
import type { ResearchDoc } from '../domain/chef/research';
import type { FreeProject, OpenedRef } from '../domain/projects';
import type { ExportPresetId, ExportRecord, MediaItem, Project } from '../domain/timeline/types';

export type { Project, MediaItem, ExportRecord, ExportPresetId };

/** TS-Spiegel des Rust-`MediaInfo` (camelCase-JSON). */
export type MediaInfo = {
  kind: 'video' | 'audio' | 'image';
  durationSec: number;
  width: number;
  height: number;
  fps: number | null;
  hasAudio: boolean;
  hdr: boolean;
  videoCodec: string | null;
  audioCodec: string | null;
  rotation: number;
};

export type LoadResult<T> = { value: T | null; restoredFromBackup: boolean };

/** Takt der Sicherungsversionen in Minuten. */
export const AUTOSAVE_CHOICES = [5, 10, 15, 30] as const;
export type AutosaveMinutes = (typeof AUTOSAVE_CHOICES)[number];
export const DEFAULT_AUTOSAVE_MINUTES: AutosaveMinutes = 10;

/** Eine Sicherungsversion im Ordner `Auto-Save/` (`savedAt` in ms seit 1970, `bytes` = Dateigröße). */
export type VersionInfo = { name: string; savedAt: number; bytes: number };

/** Ergebnis der Link-Prüfung (`check_urls`): erreichbar, Seite fehlt (404/410) oder keine Antwort. */
export type UrlCheck = { url: string; result: 'ok' | 'notFound' | 'unreachable' };

export type Settings = {
  theme: 'auto' | 'light' | 'dark';
  /** Alle so viele Minuten entsteht eine Sicherungsversion (nur bei Änderungen). Fehlt in älteren Ständen (= 10). */
  autosaveMinutes: AutosaveMinutes;
  gemini: { enabled: boolean; model: string | null };
  /** Entwickler-Zeitsimulation: wird auf die Systemuhr addiert. */
  devTimeOffsetMs: number;
};

export type AppState = {
  version: 1;
  installId: string;
  createdAt: number;
  schedule: ScheduleState;
  assignments: Assignment[];
  evaluations: Evaluation[];
  showreel: string[];
  settings: Settings;
  /** Abgehakte Vorgaben je Auftrag (Komfort in der Oberfläche, überlebt Neuladen). */
  checklist: Record<string, string[]>;
  /** Recherche-Entwürfe, Schlüssel `${assignmentId}/${deliverableId}`. */
  research: Record<string, ResearchDoc>;
  /** Freie Projekte (ohne Auftrag). Fehlt in älteren Ständen (= keine). */
  projects?: FreeProject[];
  /** Zuletzt in der Werkstatt geöffnetes Projekt; geht beim Start wieder auf. */
  lastOpened?: OpenedRef;
};
export type { Assignment, FreeProject, OpenedRef };
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
