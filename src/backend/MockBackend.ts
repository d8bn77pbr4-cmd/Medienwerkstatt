import type { Backend } from './Backend';
import type { AppState, Assignment, LoadResult, Measurements, MediaItem, Project } from './types';

/**
 * Browser-/Test-Backend. Spätere Tasks füllen die Methoden mit echtem
 * Verhalten; bis dahin liefern sie einfache Vorgabewerte.
 */
export class MockBackend implements Backend {
  private state: AppState | null = null;
  private projects = new Map<string, Project>();
  private geminiKey: string | null = null;

  async loadState(): Promise<LoadResult<AppState>> {
    return { value: this.state, restoredFromBackup: false };
  }
  async saveState(s: AppState): Promise<void> {
    this.state = s;
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
