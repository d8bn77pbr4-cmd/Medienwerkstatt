import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { projectFolderFor } from '../domain/assignments/naming';
import type { Backend } from './Backend';
import { isValidState } from './schema';
import type { AppState, Assignment, LoadResult, Measurements, MediaItem, Project, Segment } from './types';

/** Fehler eines Tauri-Befehls: `code` ist einer von tool_missing, tool_failed, io, parse, invalid_key, rate_limited, offline, invalid_path. */
export class CommandError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'CommandError';
    this.code = code;
  }
}

function toError(e: unknown): Error {
  if (e instanceof Error) return e;
  if (e && typeof e === 'object' && 'message' in e) {
    const o = e as { code?: unknown; message: unknown };
    return new CommandError(typeof o.code === 'string' ? o.code : 'io', String(o.message));
  }
  return new CommandError('io', String(e));
}

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    throw toError(e);
  }
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Führt `run(jobId)` aus und meldet die Fortschrittsereignisse (`mw://progress`) dieses Auftrags. */
async function withProgress<T>(onProgress: (p: number) => void, run: (jobId: string) => Promise<T>): Promise<T> {
  const jobId = crypto.randomUUID();
  const unlisten = await listen<{ jobId: string; p: number }>('mw://progress', e => {
    if (e.payload.jobId === jobId) onProgress(e.payload.p);
  });
  try {
    return await run(jobId);
  } finally {
    unlisten();
  }
}

/** Echtes Backend im Tauri-Fenster: jede Methode ist genau ein Rust-Befehl. */
export class TauriBackend implements Backend {
  async loadState(): Promise<LoadResult<AppState>> {
    const r = await call<LoadResult<unknown>>('load_state');
    if (r.value !== null && isValidState(r.value)) return { value: r.value, restoredFromBackup: r.restoredFromBackup };
    return { value: null, restoredFromBackup: false };
  }
  saveState(s: AppState): Promise<void> {
    return call('save_state', { state: s });
  }
  projectDir(a: Assignment): Promise<string> {
    return call('project_dir', { folder: projectFolderFor(a) });
  }
  loadProject(dir: string): Promise<LoadResult<Project>> {
    return call('load_project', { dir });
  }
  saveProject(dir: string, p: Project): Promise<void> {
    return call('save_project', { dir, project: p });
  }
  pickMediaFiles(): Promise<string[]> {
    return call('pick_media_files');
  }
  importMedia(dir: string, paths: string[], mode: 'copy' | 'link'): Promise<MediaItem[]> {
    return call('import_media', { dir, paths, mode });
  }
  createProxy(dir: string, m: MediaItem, onProgress: (p: number) => void): Promise<string> {
    return withProgress(onProgress, jobId => call<string>('create_proxy', { dir, mediaId: m.id, path: m.path, jobId }));
  }
  mediaUrl(path: string): string {
    return convertFileSrc(path);
  }
  writeFile(dir: string, rel: string, bytes: Uint8Array): Promise<string> {
    return call('write_file', { dir, rel, bytes: toBase64(bytes) });
  }
  runFfmpeg(args: string[], durationSec: number, onProgress: (p: number) => void): Promise<void> {
    return withProgress(onProgress, jobId => call<void>('run_ffmpeg', { args, durationSec, jobId }));
  }
  analyze(path: string, segments: Segment[]): Promise<Measurements> {
    return call('analyze', { path, segments });
  }
  extractFrames(path: string, times: number[], maxWidth: number): Promise<string[]> {
    return call('extract_frames', { path, times, maxWidth });
  }
  gemini = {
    hasKey: (): Promise<boolean> => call('has_gemini_key'),
    setKey: (k: string | null): Promise<void> => call('set_gemini_key', { key: k }),
    listModels: (): Promise<string[]> => call('gemini_list_models'),
    generate: (model: string, prompt: string, imagePaths: string[], schema: object): Promise<string> =>
      call('gemini_generate', { model, prompt, imagePaths, schema }),
  };
  revealInFinder(path: string): Promise<void> {
    return call('reveal_in_finder', { path });
  }
  onFileDrop(h: { over(on: boolean): void; drop(paths: string[]): void }): () => void {
    let off: (() => void) | null = null;
    let closed = false;
    void import('@tauri-apps/api/webview')
      .then(({ getCurrentWebview }) =>
        getCurrentWebview().onDragDropEvent((e) => {
          const p = e.payload;
          if (p.type === 'enter' || p.type === 'over') h.over(true);
          else if (p.type === 'leave') h.over(false);
          else {
            h.over(false);
            if (p.paths.length) h.drop(p.paths);
          }
        }),
      )
      .then((unlisten) => {
        if (closed) unlisten();
        else off = unlisten;
      })
      .catch(() => undefined);
    return () => {
      closed = true;
      off?.();
    };
  }
}
