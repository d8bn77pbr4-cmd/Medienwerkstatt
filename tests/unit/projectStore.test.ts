import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockBackend } from '../../src/backend/MockBackend';
import type { Assignment, Deliverable, VideoSpec } from '../../src/domain/assignments/types';
import { insertEdit } from '../../src/domain/timeline/ops';
import type { Sequence } from '../../src/domain/timeline/types';
import { PROJECT_SAVE_DEBOUNCE_MS, projectSetting, resetProjectForTests, useProject, type OpenTarget } from '../../src/state/projectStore';

const spec = (o: Partial<VideoSpec> = {}): VideoSpec => ({
  aspect: '9:16',
  width: 1080,
  height: 1920,
  fps: 30,
  durationSec: 30,
  toleranceSec: 3,
  loudnessLufs: -14,
  truePeakMax: -1,
  codec: 'h264',
  fileName: 'A03_X_v01_1080p30.mp4',
  minShots: 5,
  requiredShotSizes: [],
  requireJCut: false,
  requireLowerThird: false,
  ...o,
});

function assignment(deliverables: Deliverable[], id = 'A03'): Assignment {
  return {
    id,
    // Nummer aus der ID (A03 → 3): Der Projektordner hängt an der Nummer.
    number: Number(id.slice(1)),
    issuedAt: 0,
    deadline: 1,
    expiresAt: 2,
    level: 1,
    type: 'video',
    client: { name: 'Café Mühle', branche: 'Gastro' },
    occasion: 'Eröffnung',
    title: 'Reel',
    briefing: '',
    hook: { id: 'h', text: '', verify: 'self' },
    deliverables,
    shootingNotes: [],
    status: 'open',
    submissions: [],
  };
}
const film = (o: Partial<VideoSpec> = {}): Deliverable => ({ id: 'film', kind: 'video', label: 'Reel', videoSpec: spec(o) });
const research: Deliverable = { id: 'recherche', kind: 'research', label: 'Exposé', researchTemplate: 'expose' };

const store = () => useProject.getState();
/** Ziel „Projekt des Auftrags“ für `open`. */
const at = (a: Assignment): OpenTarget => ({ kind: 'assignment', assignment: a });
const DIR_A03 = '/mock/Medienwerkstatt/A03_Cafe-Muehle';
const seq = (): Sequence => {
  const s = store().seq;
  if (!s) throw new Error('keine Sequenz');
  return s;
};

beforeEach(() => {
  localStorage.clear();
  resetProjectForTests();
});
afterEach(() => {
  vi.useRealTimers();
  resetProjectForTests();
});

describe('open', () => {
  it('legt ohne gespeichertes Projekt eine Sequenz nach der ersten Video-Abgabe an und sichert sofort', async () => {
    const b = new MockBackend();
    const save = vi.spyOn(b, 'saveProject');
    await store().open(at(assignment([research, film()])), b);
    expect(store().status).toBe('ready');
    expect(store().dir).toBe(DIR_A03);
    const s = seq();
    expect([s.width, s.height, s.fps, s.name]).toEqual([1080, 1920, 30, 'Reel']);
    expect(s.tracks.map((t) => t.name)).toEqual(['V1', 'V2', 'A1', 'A2', 'A3', 'A4']);
    const p = store().project!;
    expect(p.assignmentId).toBe('A03');
    expect(p.activeSequenceId).toBe(s.id);
    expect(p.media).toEqual([]);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toBe(DIR_A03);
    expect(store().canUndo).toBe(false);
  });

  it('lädt ein vorhandenes Projekt (auch nach Neuladen der Seite)', async () => {
    await store().open(at(assignment([film()])), new MockBackend());
    await store().import(['/fixtures/e2e-clip.webm']);
    const id = seq().id;
    await store().flush();
    resetProjectForTests();
    await store().open(at(assignment([film()])), new MockBackend());
    expect(seq().id).toBe(id);
    expect(store().project!.media.map((m) => m.name)).toEqual(['e2e-clip.webm']);
  });

  it('reiner Recherche-Auftrag braucht keine Werkstatt', async () => {
    const b = new MockBackend();
    const save = vi.spyOn(b, 'saveProject');
    await store().open(at(assignment([research])), b);
    expect(store().status).toBe('noVideo');
    expect(store().project).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });

  it('Ladefehler: Status error mit Meldung, nichts wird überschrieben', async () => {
    const b = new MockBackend();
    vi.spyOn(b, 'loadProject').mockRejectedValueOnce(new Error('Platte weg'));
    const save = vi.spyOn(b, 'saveProject');
    await store().open(at(assignment([film()])), b);
    expect(store().status).toBe('error');
    expect(store().loadError).toContain('Platte weg');
    expect(save).not.toHaveBeenCalled();
  });

  it('doppeltes open (StrictMode) teilt sich die Arbeit; gleicher Auftrag bleibt offen', async () => {
    const b = new MockBackend();
    const save = vi.spyOn(b, 'saveProject');
    const a = assignment([film()]);
    await Promise.all([store().open(at(a), b), store().open(at(a), b)]);
    expect(save).toHaveBeenCalledTimes(1);
    store().apply((s) => ({ ...s, inPoint: 5 }));
    await store().open(at(a), b);
    expect(seq().inPoint).toBe(5);
    expect(store().canUndo).toBe(true);
  });
});

describe('apply / undo / redo', () => {
  it('legt Verlaufsschritte an und stellt sie wieder her', async () => {
    await store().open(at(assignment([film()])), new MockBackend());
    const [m] = await store().import(['/fixtures/e2e-clip.webm']);
    const before = seq();
    expect(store().apply((s, media) => insertEdit(s, media.find((x) => x.id === m.id)!, 0, 5, 0, { video: 'V1', audio: 'A1' }, 'insert'))).toBe(true);
    expect(seq().clips).toHaveLength(2);
    expect(store().canUndo).toBe(true);
    expect(store().project!.sequences[0]).toBe(seq());
    store().undo();
    expect(seq()).toBe(before);
    expect(store().canRedo).toBe(true);
    store().redo();
    expect(seq().clips).toHaveLength(2);
  });

  it('unveränderte Sequenz legt keinen Schritt an', async () => {
    await store().open(at(assignment([film()])), new MockBackend());
    expect(store().apply((s) => s)).toBe(false);
    expect(store().canUndo).toBe(false);
  });

  it('zusammengefasste Schritte (Regler ziehen) ergeben einen Verlaufsschritt', async () => {
    await store().open(at(assignment([film()])), new MockBackend());
    const before = seq();
    for (const f of [1, 2, 3]) store().apply((s) => ({ ...s, inPoint: f }), { coalesce: 'in' });
    store().endGesture();
    store().apply((s) => ({ ...s, inPoint: 9 }), { coalesce: 'in' });
    expect(seq().inPoint).toBe(9);
    store().undo();
    expect(seq().inPoint).toBe(3);
    store().undo();
    expect(seq()).toBe(before);
  });
});

describe('Autosave', () => {
  it('ist 2 s entprellt', async () => {
    vi.useFakeTimers();
    const b = new MockBackend();
    await store().open(at(assignment([film()])), b);
    const save = vi.spyOn(b, 'saveProject');
    store().apply((s) => ({ ...s, inPoint: 4 }));
    await vi.advanceTimersByTimeAsync(PROJECT_SAVE_DEBOUNCE_MS - 10);
    expect(save).not.toHaveBeenCalled();
    store().apply((s) => ({ ...s, outPoint: 40 }));
    await vi.advanceTimersByTimeAsync(PROJECT_SAVE_DEBOUNCE_MS - 10);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(20);
    expect(save).toHaveBeenCalledTimes(1);
    const saved = save.mock.calls[0][1];
    expect(saved.sequences[0].inPoint).toBe(4);
    expect(saved.sequences[0].outPoint).toBe(40);
  });

  it('Fehler: Hinweis, neuer Versuch nach 2 s, danach gelöscht', async () => {
    vi.useFakeTimers();
    const b = new MockBackend();
    await store().open(at(assignment([film()])), b);
    const save = vi.spyOn(b, 'saveProject').mockRejectedValueOnce(new Error('voll'));
    store().apply((s) => ({ ...s, inPoint: 7 }));
    await vi.advanceTimersByTimeAsync(PROJECT_SAVE_DEBOUNCE_MS);
    expect(save).toHaveBeenCalledTimes(1);
    expect(store().saveError).toBe(true);
    await vi.advanceTimersByTimeAsync(PROJECT_SAVE_DEBOUNCE_MS);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][1].sequences[0].inPoint).toBe(7);
    expect(store().saveError).toBe(false);
  });

  it('flush speichert sofort', async () => {
    const b = new MockBackend();
    await store().open(at(assignment([film()])), b);
    const save = vi.spyOn(b, 'saveProject');
    store().apply((s) => ({ ...s, inPoint: 2 }));
    await store().flush();
    expect(save).toHaveBeenCalledTimes(1);
    await store().flush();
    expect(save).toHaveBeenCalledTimes(1);
  });
});

describe('Medien', () => {
  it('import übernimmt Probe-Daten, erstellt Proxies und meldet Fortschritt', async () => {
    const b = new MockBackend();
    await store().open(at(assignment([film()])), b);
    const seen: number[] = [];
    const unsub = useProject.subscribe((s) => {
      for (const p of Object.values(s.proxyProgress)) seen.push(p);
    });
    const items = await store().import(await b.pickMediaFiles());
    unsub();
    expect(items.map((m) => m.name)).toEqual(['e2e-clip.webm', 'e2e-clip2.webm']);
    expect(items[0]).toMatchObject({ kind: 'video', durationSec: 5, width: 1280, height: 720, fps: 25, hasAudio: true, hdr: false, path: '/fixtures/e2e-clip.webm', shotSize: null });
    await vi.waitFor(() => expect(store().proxyProgress).toEqual({}));
    expect(seen.length).toBeGreaterThan(0);
    expect(store().project!.media).toHaveLength(2);
  });

  it('setShotSize beschriftet den Clip und wird gespeichert', async () => {
    const b = new MockBackend();
    await store().open(at(assignment([film()])), b);
    const [m] = await store().import(['/fixtures/e2e-clip.webm']);
    store().setShotSize(m.id, 'halbnah');
    expect(store().project!.media[0].shotSize).toBe('halbnah');
    await store().flush();
    const loaded = await b.loadProject(store().dir!);
    expect(loaded.value!.media[0].shotSize).toBe('halbnah');
  });

  it('Proxies laufen in einer Warteschlange mit höchstens 2 gleichzeitig; Wartende sind markiert', async () => {
    const b = new MockBackend();
    await store().open(at(assignment([film()])), b);
    let running = 0;
    let maxRunning = 0;
    const started: string[] = [];
    const release = new Map<string, () => void>();
    vi.spyOn(b, 'importMedia').mockImplementation(async (_dir, paths) =>
      paths.map((path, i) => ({
        id: `m${i}`, name: path, path, proxyPath: null, shotSize: null, kind: 'video' as const, durationSec: 5, width: 1920, height: 1080,
        fps: 25, hasAudio: true, hdr: false, videoCodec: 'h264', audioCodec: 'aac', rotation: 0,
      })),
    );
    vi.spyOn(b, 'createProxy').mockImplementation((_dir, m, progress) => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      started.push(m.id);
      progress(0.5);
      return new Promise<string>((res) =>
        release.set(m.id, () => {
          running--;
          res(`/proxy/${m.id}.mp4`);
        }),
      );
    });
    await store().import(['/a.mov', '/b.mov', '/c.mov', '/d.mov', '/e.mov']);
    expect(started).toEqual(['m0', 'm1']);
    expect(store().proxyQueue).toEqual(['m2', 'm3', 'm4']);
    expect(store().proxyProgress).toEqual({ m0: 0.5, m1: 0.5 });
    release.get('m0')!();
    await vi.waitFor(() => expect(started).toEqual(['m0', 'm1', 'm2']));
    expect(store().proxyQueue).toEqual(['m3', 'm4']);
    release.get('m1')!();
    release.get('m2')!();
    await vi.waitFor(() => expect(started).toHaveLength(5));
    release.get('m3')!();
    release.get('m4')!();
    await vi.waitFor(() => expect(store().proxyProgress).toEqual({}));
    expect(maxRunning).toBe(2);
    expect(store().proxyQueue).toEqual([]);
    expect(store().project!.media.map((m) => m.proxyPath)).toEqual(['/proxy/m0.mp4', '/proxy/m1.mp4', '/proxy/m2.mp4', '/proxy/m3.mp4', '/proxy/m4.mp4']);
  });

  it('Projekt-Einstellung Sicherheits-Limiter: standardmäßig an, Änderung wird gespeichert', async () => {
    const b = new MockBackend();
    await store().open(at(assignment([film()])), b);
    expect(projectSetting(store().project, 'safetyLimiter')).toBe(true);
    store().setProjectSetting('safetyLimiter', false);
    await store().flush();
    const loaded = await b.loadProject(store().dir!);
    expect(loaded.value!.settings).toEqual({ safetyLimiter: false });
    expect(projectSetting(loaded.value, 'safetyLimiter')).toBe(false);
  });

  it('import ohne offenes Projekt tut nichts', async () => {
    expect(await store().import(['/fixtures/e2e-clip.webm'])).toEqual([]);
  });
});

describe('Auftragswechsel', () => {
  it('scheitert das Sichern vor dem Wechsel, bleibt das alte Projekt offen und nichts geht verloren', async () => {
    vi.useFakeTimers();
    const b = new MockBackend();
    await store().open(at(assignment([film()], 'A03')), b);
    const save = vi.spyOn(b, 'saveProject').mockRejectedValue(new Error('voll'));
    store().apply((s) => ({ ...s, inPoint: 7 }));
    expect(await store().open(at(assignment([film()], 'A04')), b)).toBe(false);
    expect(store().target).toMatchObject({ kind: 'assignment', assignment: { id: 'A03' } });
    expect(store().status).toBe('ready');
    expect(store().seq!.inPoint).toBe(7);
    expect(store().saveError).toBe(true);
    expect(store().switchError).toBe('Wechsel nicht möglich – Projekt konnte nicht gespeichert werden');
    // die Wiederholung läuft weiter
    const calls = save.mock.calls.length;
    await vi.advanceTimersByTimeAsync(PROJECT_SAVE_DEBOUNCE_MS);
    expect(save.mock.calls.length).toBe(calls + 1);
    expect(store().saveError).toBe(true);
    // Platte wieder frei: Wechsel gelingt, der alte Stand ist gesichert
    save.mockRestore();
    expect(await store().open(at(assignment([film()], 'A04')), b)).toBe(true);
    expect(store().target).toMatchObject({ kind: 'assignment', assignment: { id: 'A04' } });
    expect(store().switchError).toBeNull();
    expect((await b.loadProject(DIR_A03)).value!.sequences[0].inPoint).toBe(7);
  });
});
