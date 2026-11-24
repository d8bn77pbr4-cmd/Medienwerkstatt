import { beforeEach, describe, expect, it, vi } from 'vitest';

type Call = { cmd: string; args: Record<string, unknown> | undefined };
const calls: Call[] = [];
let handler: (cmd: string, args?: Record<string, unknown>) => unknown = () => null;
const listeners = new Map<string, Set<(e: { payload: unknown }) => void>>();
const unlistened: string[] = [];

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
    calls.push({ cmd, args });
    return handler(cmd, args);
  }),
  convertFileSrc: (p: string) => `asset://localhost/${encodeURIComponent(p)}`,
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (name: string, cb: (e: { payload: unknown }) => void) => {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name)!.add(cb);
    return () => {
      listeners.get(name)!.delete(cb);
      unlistened.push(name);
    };
  }),
}));

import { TauriBackend } from '../../src/backend/TauriBackend';
import type { AppState, Assignment, MediaItem, Project } from '../../src/backend/types';
import { projectFolderFor } from '../../src/domain/assignments/naming';

function emit(payload: unknown) {
  for (const cb of listeners.get('mw://progress') ?? []) cb({ payload });
}
const state = { version: 1, installId: 'i', createdAt: 1, schedule: { nextIssueAt: 1, nextNumber: 1, vacations: [] }, assignments: [], evaluations: [], showreel: [], settings: {}, checklist: {}, research: {} } as unknown as AppState;
const media = { id: 'm1', path: '/x/a.mov' } as MediaItem;

beforeEach(() => {
  calls.length = 0;
  listeners.clear();
  unlistened.length = 0;
  handler = () => null;
});

describe('TauriBackend', () => {
  it('bildet jede Backend-Methode auf genau einen Befehl ab', async () => {
    handler = cmd => {
      switch (cmd) {
        case 'load_state':
        case 'load_project':
          return { value: null, restoredFromBackup: false };
        case 'project_dir':
          return '/p';
        case 'pick_media_files':
        case 'import_media':
        case 'extract_frames':
        case 'gemini_list_models':
          return [];
        case 'create_proxy':
        case 'write_file':
          return '/out';
        case 'has_gemini_key':
          return true;
        case 'gemini_generate':
          return '{}';
        default:
          return null;
      }
    };
    const b = new TauriBackend();
    const a = { number: 7, client: { name: 'Bäckerei Korn' } } as unknown as Assignment;
    await b.loadState();
    await b.saveState(state);
    await b.projectDir(projectFolderFor(a));
    await b.loadProject('/p');
    await b.saveProject('/p', { version: 1 } as Project);
    await b.pickMediaFiles();
    await b.importMedia('/p', ['/a'], 'copy');
    await b.createProxy('/p', media, () => {});
    await b.writeFile('/p', 'Recherche/a.txt', new Uint8Array([1, 2, 3]));
    await b.runFfmpeg(['-i', 'x'], 10, () => {});
    await b.analyze('/a', []);
    await b.extractFrames('/a', [1], 320);
    await b.gemini.hasKey();
    await b.gemini.setKey('k');
    await b.gemini.setKey(null);
    await b.gemini.listModels();
    await b.gemini.generate('m', 'p', ['/i.jpg'], {});
    await b.revealInFinder('/a');
    expect(calls.map(c => c.cmd)).toEqual([
      'load_state', 'save_state', 'project_dir', 'load_project', 'save_project', 'pick_media_files',
      'import_media', 'create_proxy', 'write_file', 'run_ffmpeg', 'analyze', 'extract_frames',
      'has_gemini_key', 'set_gemini_key', 'set_gemini_key', 'gemini_list_models', 'gemini_generate',
      'reveal_in_finder',
    ]);
    expect(calls[2].args).toEqual({ folder: 'A07_Baeckerei-Korn' });
    expect(calls[8].args).toMatchObject({ dir: '/p', rel: 'Recherche/a.txt', bytes: 'AQID' });
    expect(calls[14].args).toEqual({ key: null });
  });

  it('ruft Gemini-Befehle nur über die gemini-Methoden auf', async () => {
    handler = () => [];
    const b = new TauriBackend();
    await b.loadState();
    await b.saveState(state);
    await b.pickMediaFiles();
    await b.importMedia('/p', [], 'link');
    await b.extractFrames('/a', [], 100);
    await b.runFfmpeg([], 0, () => {});
    expect(calls.filter(c => /gemini/.test(c.cmd))).toEqual([]);
  });

  it('filtert Fortschritt nach jobId und räumt den Hörer auf', async () => {
    let finish: (v: unknown) => void = () => {};
    handler = cmd => (cmd === 'run_ffmpeg' ? new Promise(r => (finish = r)) : null);
    const b = new TauriBackend();
    const seen: number[] = [];
    const p = b.runFfmpeg(['x'], 5, v => seen.push(v));
    await vi.waitFor(() => expect(calls.some(c => c.cmd === 'run_ffmpeg')).toBe(true));
    const jobId = calls.find(c => c.cmd === 'run_ffmpeg')!.args!.jobId as string;
    expect(typeof jobId).toBe('string');
    emit({ jobId: 'anderer', p: 0.9 });
    emit({ jobId, p: 0.25 });
    emit({ jobId, p: 0.5 });
    finish(null);
    await p;
    expect(seen).toEqual([0.25, 0.5]);
    expect(unlistened).toEqual(['mw://progress']);
  });

  it('räumt den Hörer auch bei Fehlern auf', async () => {
    handler = () => {
      throw { code: 'tool_failed', message: 'kaputt' };
    };
    const b = new TauriBackend();
    await expect(b.createProxy('/p', media, () => {})).rejects.toThrow('kaputt');
    expect(unlistened).toEqual(['mw://progress']);
  });

  it('wirft Befehlsfehler als Error mit code', async () => {
    handler = () => {
      throw { code: 'rate_limited', message: 'zu viele Anfragen' };
    };
    const b = new TauriBackend();
    const err = await b.gemini.generate('m', 'p', [], {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error & { code: string }).code).toBe('rate_limited');
    expect((err as Error).message).toBe('zu viele Anfragen');
  });

  it('mediaUrl nutzt convertFileSrc', () => {
    expect(new TauriBackend().mediaUrl('/a b.mov')).toBe('asset://localhost/' + encodeURIComponent('/a b.mov'));
  });

  it('behandelt einen ungültigen Zustand wie einen fehlenden', async () => {
    handler = () => ({ value: { version: 2 }, restoredFromBackup: true });
    const r = await new TauriBackend().loadState();
    expect(r).toEqual({ value: null, restoredFromBackup: false });
  });
});
