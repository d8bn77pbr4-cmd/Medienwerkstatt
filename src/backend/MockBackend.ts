import type { Backend } from './Backend';
import { isValidState } from './schema';
import type { AppState, Assignment, LoadResult, Measurements, MediaItem, Project } from './types';

/**
 * Browser-/Test-Backend. Spätere Tasks füllen die Methoden mit echtem
 * Verhalten; bis dahin liefern sie einfache Vorgabewerte.
 */
const KEY = 'mw-state';
const BAK1 = 'mw-state.bak1';

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
    return { value: this.projects.get(dir) ?? null, restoredFromBackup: false };
  }
  async saveProject(dir: string, p: Project): Promise<void> {
    this.projects.set(dir, p);
  }
  async pickMediaFiles(): Promise<string[]> {
    return [];
  }
  async importMedia(): Promise<MediaItem[]> {
    return [];
  }
  async createProxy(_dir: string, m: MediaItem, onProgress: (p: number) => void): Promise<string> {
    onProgress(1);
    return m.path;
  }
  mediaUrl(path: string): string {
    return path;
  }
  async writeFile(dir: string, rel: string): Promise<string> {
    return `${dir}/${rel}`;
  }
  async runFfmpeg(_args: string[], _durationSec: number, onProgress: (p: number) => void): Promise<void> {
    onProgress(1);
  }
  async analyze(): Promise<Measurements> {
    return {
      format: { width: 1920, height: 1080, fps: 25, durationSec: 0, videoCodec: 'h264', audioCodec: null },
      audio: { integratedLufs: null, truePeakDbtp: null, clippedSamples: 0, silences: [] },
      video: { black: [], freeze: [], detectedCuts: [], segments: [] },
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
}
