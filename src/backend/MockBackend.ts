import type { Backend } from './Backend';
import { isValidState } from './schema';
import type { AppState, Assignment, LoadResult, Measurements, MediaItem, Project, Segment } from './types';

/**
 * Browser-/Test-Backend. Spätere Tasks füllen die Methoden mit echtem
 * Verhalten; bis dahin liefern sie einfache Vorgabewerte.
 */
const KEY = 'mw-state';
const BAK1 = 'mw-state.bak1';
const PROJECT_KEY = (dir: string) => `mw-project:${dir}`;
/** Testmedien des Vite-Dev-Servers (`tests/fixtures/media/` unter `/fixtures/`). */
const FIXTURES = ['/fixtures/e2e-clip.webm', '/fixtures/e2e-clip2.webm'];
const PROXY_STEPS = [0.25, 0.5, 0.75, 1];
const PROXY_STEP_MS = 40;
/** Export im Mock-Modus: Fortschritt über etwa 1 s. */
const EXPORT_STEPS = [0.2, 0.4, 0.6, 0.8, 1];
const EXPORT_STEP_MS = 200;

/** Fixture-Messwerte im Mock-Modus: `?messung=perfekt|zu-laut` (Standard: perfekt). */
export type MockMeasurement = 'perfekt' | 'zu-laut';
function measurementFromUrl(): MockMeasurement {
  try {
    return new URLSearchParams(window.location.search).get('messung') === 'zu-laut' ? 'zu-laut' : 'perfekt';
  } catch {
    return 'perfekt';
  }
}

function readItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
function parseState(raw: string | null): AppState | null {
  if (raw === null) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (isValidState(v)) return v;
  } catch {
    /* defekt */
  }
  return null;
}

export class MockBackend implements Backend {
  /** Nur Rückfall, wenn localStorage nicht zur Verfügung steht. */
  private memory: AppState | null = null;
  private projects = new Map<string, Project>();
  private geminiKey: string | null = null;
  /** Einmal beim Start gelesen: Navigation in der App verliert den Suchparameter. */
  private messung: MockMeasurement = measurementFromUrl();

  setMeasurement(m: MockMeasurement): void {
    this.messung = m;
  }

  async loadState(): Promise<LoadResult<AppState>> {
    const raw = readItem(KEY);
    const current = parseState(raw);
    if (current) return { value: current, restoredFromBackup: false };
    const backup = parseState(readItem(BAK1));
    if (backup) return { value: backup, restoredFromBackup: true };
    if (raw === null && this.memory) return { value: this.memory, restoredFromBackup: false };
    return { value: null, restoredFromBackup: false };
  }
  async saveState(s: AppState): Promise<void> {
    this.memory = s;
    const previous = readItem(KEY);
    // Nur eine gültige Vorgängerversion wird zur Sicherung; ein defekter Stand überschreibt sie nicht.
    if (previous !== null && parseState(previous)) writeItem(BAK1, previous);
    writeItem(KEY, JSON.stringify(s));
  }
  async projectDir(a: Assignment): Promise<string> {
    return `/mock/Medienwerkstatt/${a.id}`;
  }
  async loadProject(dir: string): Promise<LoadResult<Project>> {
    const raw = readItem(PROJECT_KEY(dir));
    if (raw !== null) {
      try {
        return { value: JSON.parse(raw) as Project, restoredFromBackup: false };
      } catch {
        /* defekt: wie ohne Projekt */
      }
    }
    return { value: this.projects.get(dir) ?? null, restoredFromBackup: false };
  }
  async saveProject(dir: string, p: Project): Promise<void> {
    // Synchron vor dem ersten await: Sichern beim Verlassen der Seite (pagehide) greift sofort.
    this.projects.set(dir, p);
    writeItem(PROJECT_KEY(dir), JSON.stringify(p));
  }
  async pickMediaFiles(): Promise<string[]> {
    return [...FIXTURES];
  }
  async importMedia(_dir: string, paths: string[]): Promise<MediaItem[]> {
    // Pfade bleiben unverändert (der Dev-Server liefert sie aus); Probe-Daten wie die WebM-Fixtures.
    return paths.map((path) => ({
      kind: 'video',
      durationSec: 5,
      width: 1280,
      height: 720,
      fps: 25,
      hasAudio: true,
      hdr: false,
      videoCodec: 'vp9',
      audioCodec: 'opus',
      rotation: 0,
      id: crypto.randomUUID(),
      name: path.split('/').pop() || path,
      path,
      proxyPath: null,
      shotSize: null,
    }));
  }
  async createProxy(_dir: string, m: MediaItem, onProgress: (p: number) => void): Promise<string> {
    for (const p of PROXY_STEPS) {
      await new Promise((r) => setTimeout(r, PROXY_STEP_MS));
      onProgress(p);
    }
    return m.path;
  }
  mediaUrl(path: string): string {
    // Pfade unter /fixtures/ (Testmedien des Vite-Dev-Servers) und alle anderen bleiben unverändert.
    return path;
  }
  async writeFile(dir: string, rel: string): Promise<string> {
    return `${dir}/${rel}`;
  }
  async runFfmpeg(_args: string[], _durationSec: number, onProgress: (p: number) => void): Promise<void> {
    for (const p of EXPORT_STEPS) {
      await new Promise((r) => setTimeout(r, EXPORT_STEP_MS));
      onProgress(p);
    }
  }
  /**
   * Fixture statt Messung: 1920×1080, 25 fps, H.264/AAC, Länge = Ende der letzten Einstellung, Belichtung neutral.
   * „perfekt“: −14 LUFS, True Peak −2 dBTP; „zu-laut“: −9,0 LUFS, True Peak −0,5 dBTP.
   */
  async analyze(_path: string, segments: Segment[] = []): Promise<Measurements> {
    const loud = this.messung === 'zu-laut';
    return {
      format: { width: 1920, height: 1080, fps: 25, durationSec: Math.max(0, ...segments.map((s) => s.end)), videoCodec: 'h264', audioCodec: 'aac' },
      audio: { integratedLufs: loud ? -9.0 : -14.0, truePeakDbtp: loud ? -0.5 : -2.0, clippedSamples: 0, silences: [] },
      video: {
        black: [],
        freeze: [],
        detectedCuts: segments.slice(1).map((s) => s.start),
        segments: segments.map((s) => ({ start: s.start, end: s.end, meanLuma: 0.45, highlightsPct: 1, shadowsPct: 1, meanU: 0, meanV: 0 })),
      },
    };
  }
  async extractFrames(): Promise<string[]> {
    return [];
  }
  gemini = {
    hasKey: async (): Promise<boolean> => this.geminiKey !== null,
    setKey: async (k: string | null): Promise<void> => {
      this.geminiKey = k;
    },
    listModels: async (): Promise<string[]> => [],
    generate: async (): Promise<string> => '{}',
  };
  async revealInFinder(): Promise<void> {}
  onFileDrop(): () => void {
    return () => {};
  }
}
