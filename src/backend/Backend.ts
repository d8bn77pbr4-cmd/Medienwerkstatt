import type { AppState, LoadResult, Measurements, MediaItem, Project, Segment, VersionInfo } from './types';

export interface Backend {
  loadState(): Promise<LoadResult<AppState>>;
  saveState(s: AppState): Promise<void>;
  /** Projektordner `folder` unter dem Projekt-Stamm (wird bei Bedarf angelegt); gibt den Pfad zurück. */
  projectDir(folder: string): Promise<string>;
  loadProject(dir: string): Promise<LoadResult<Project>>;
  saveProject(dir: string, p: Project): Promise<void>;
  /** Kopiert das gespeicherte Projekt nach `Auto-Save/<name>` (Name `JJJJ-MM-TT HH-MM-SS.json`, Ortszeit); die neuesten 20 bleiben. */
  saveProjectVersion(dir: string, name: string): Promise<void>;
  /** Versionen des Projekts, neueste zuerst. */
  listProjectVersions(dir: string): Promise<VersionInfo[]>;
  /** Liest eine Version (schreibt nichts). */
  restoreProjectVersion(dir: string, name: string): Promise<Project>;
  /** Wie `saveProjectVersion` für den App-Zustand (Ordner `Auto-Save/` neben der Zustandsdatei). */
  saveStateVersion(name: string): Promise<void>;
  pickMediaFiles(): Promise<string[]>;
  importMedia(dir: string, paths: string[], mode: 'copy' | 'link'): Promise<MediaItem[]>;
  createProxy(dir: string, m: MediaItem, onProgress: (p: number) => void): Promise<string>;
  mediaUrl(path: string): string;
  writeFile(dir: string, rel: string, bytes: Uint8Array): Promise<string>;
  runFfmpeg(args: string[], durationSec: number, onProgress: (p: number) => void): Promise<void>;
  analyze(path: string, segments: Segment[]): Promise<Measurements>;
  extractFrames(path: string, times: number[], maxWidth: number): Promise<string[]>;
  gemini: {
    hasKey(): Promise<boolean>;
    setKey(k: string | null): Promise<void>;
    listModels(): Promise<string[]>;
    generate(model: string, prompt: string, imagePaths: string[], schema: object): Promise<string>;
  };
  revealInFinder(path: string): Promise<void>;
  /** Dateien per Drag & Drop aufs Fenster (nur im Tauri-Fenster; im Browser nie). Gibt den Abmelder zurück. */
  onFileDrop(h: { over(on: boolean): void; drop(paths: string[]): void }): () => void;
}
