import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockBackend } from '../../src/backend/MockBackend';
import { isValidState } from '../../src/backend/schema';
import type { AppState, Assignment } from '../../src/backend/types';
import { freeFileName, freeProjectFolder } from '../../src/domain/assignments/naming';
import type { Deliverable, VideoSpec } from '../../src/domain/assignments/types';
import { PROJECT_FORMATS, checkProjectName, folderOf, formatLabel, freeProjectsOf, newFreeProject, type FreeProject } from '../../src/domain/projects';
import { freePresetFor } from '../../src/domain/render/presets';
import type { Clock } from '../../src/domain/time';
import type { Clip, MediaItem } from '../../src/domain/timeline/types';
import { chooseTarget } from '../../src/features/werkstatt/chooseTarget';
import { resetAppForTests, useApp } from '../../src/state/appStore';
import { FREE_DELIVERABLE_ID, exportFreeProject } from '../../src/state/exportRun';
import { openTarget } from '../../src/state/openProject';
import { SWITCH_ERROR, currentKey, resetProjectForTests, targetKey, useProject, type OpenTarget } from '../../src/state/projectStore';

const t0 = Date.parse('2026-11-24T10:00:00+01:00');
const MIN = 60_000;
const store = () => useProject.getState();
const app = () => useApp.getState();

const spec: VideoSpec = {
  aspect: '9:16', width: 1080, height: 1920, fps: 30, durationSec: 30, toleranceSec: 3, loudnessLufs: -14, truePeakMax: -1,
  codec: 'h264', fileName: 'A03_X_v01_1080p30.mp4', minShots: 5, requiredShotSizes: [], requireJCut: false, requireLowerThird: false,
};
const film: Deliverable = { id: 'film', kind: 'video', label: 'Reel', videoSpec: spec };
const research: Deliverable = { id: 'recherche', kind: 'research', label: 'Exposé', researchTemplate: 'expose' };
function assignment(id: string, deliverables: Deliverable[] = [film], o: Partial<Assignment> = {}): Assignment {
  return {
    id, number: Number(id.slice(1)), issuedAt: 0, deadline: t0 + 72 * 60 * MIN, expiresAt: t0 + 96 * 60 * MIN, level: 1, type: 'video',
    client: { name: 'Café Mühle', branche: 'Gastro' }, occasion: 'Eröffnung', title: 'Reel', briefing: '',
    hook: { id: 'h', text: '', verify: 'self' }, deliverables, shootingNotes: [], status: 'open', submissions: [], ...o,
  };
}
const free = (name = 'Mein Film', id = 'p-3f9a2c11-aaaa-4bbb-8ccc-000000000001', format = PROJECT_FORMATS[0].format): FreeProject =>
  newFreeProject(name, format, t0, id);
const asFree = (project: FreeProject): OpenTarget => ({ kind: 'free', project });
const asAssignment = (a: Assignment): OpenTarget => ({ kind: 'assignment', assignment: a });

/** Gespeicherter Stand wie vor Phase 1.1: ohne `projects` und `lastOpened`. */
function oldState(): AppState {
  return {
    version: 1, installId: 'alt', createdAt: t0 - 1000, schedule: { nextIssueAt: t0 + 72 * 60 * MIN, nextNumber: 2, vacations: [] },
    assignments: [assignment('A01')], evaluations: [], showreel: [], settings: { theme: 'dark', gemini: { enabled: false, model: null }, devTimeOffsetMs: 0 },
    checklist: { A01: ['x'] }, research: {},
  };
}

beforeEach(() => {
  localStorage.clear();
  resetAppForTests();
  resetProjectForTests();
});
afterEach(() => {
  vi.useRealTimers();
  resetAppForTests();
  resetProjectForTests();
});

describe('Datenmodell: alte Stände und freie Projekte', () => {
  it('ein Stand ohne projects/lastOpened ist gültig und lädt mit leerer Projektliste, alles andere bleibt', async () => {
    const old = oldState();
    expect(isValidState(old)).toBe(true);
    localStorage.setItem('mw-state', JSON.stringify(old));
    await app().init(new MockBackend(), { now: () => t0 });
    const s = app().state!;
    expect(s.installId).toBe('alt');
    expect(s.projects).toEqual([]);
    expect(s.lastOpened).toBeUndefined();
    expect(s.checklist).toEqual({ A01: ['x'] });
    expect(s.settings.theme).toBe('dark');
    expect(app().restoredFromBackup).toBe(false);
  });

  it('gespeicherte Projekte und lastOpened überleben Speichern und Neuladen', async () => {
    const b = new MockBackend();
    await app().init(b, { now: () => t0 });
    const p = app().createProject('  Urlaubsfilm  ', PROJECT_FORMATS[2].format)!;
    app().noteOpened({ kind: 'free', id: p.id });
    await app().flush();
    resetAppForTests();
    await app().init(new MockBackend(), { now: () => t0 + MIN });
    expect(app().state!.projects).toEqual([{ ...p, name: 'Urlaubsfilm' }]);
    expect(app().state!.lastOpened).toEqual({ kind: 'free', id: p.id });
  });

  it('Schema: falsch geformte Einträge machen den Stand ungültig, unvollständige Einträge fallen beim Laden weg', () => {
    expect(isValidState({ ...oldState(), projects: [{ name: 'ohne ID' }] })).toBe(false);
    expect(isValidState({ ...oldState(), lastOpened: { kind: 'irgendwas', id: 'x' } })).toBe(false);
    const ok = free();
    expect(freeProjectsOf(undefined)).toEqual([]);
    expect(freeProjectsOf([ok, { id: 'p-x', name: 'ohne Format' }, { ...ok, id: 'p-y', openedAt: undefined }])).toEqual([ok, { ...ok, id: 'p-y', openedAt: ok.createdAt }]);
  });

  it('Name: getrimmt, 1–60 Zeichen', () => {
    expect(checkProjectName('  Film ')).toEqual({ ok: true, name: 'Film' });
    expect(checkProjectName('   ')).toMatchObject({ ok: false });
    expect(checkProjectName('x'.repeat(60))).toMatchObject({ ok: true });
    expect(checkProjectName('x'.repeat(61))).toMatchObject({ ok: false });
  });

  it('Formate: fünf Vorlagen, 16:9 25p ist Standard; Beschriftung', () => {
    expect(PROJECT_FORMATS.map((f) => f.label)).toEqual([
      '16:9 · 1920×1080 · 25p', '16:9 · 1920×1080 · 30p', '9:16 · 1080×1920 · 30p', '1:1 · 1080×1080 · 30p', '4K · 3840×2160 · 25p',
    ]);
    expect(formatLabel({ width: 1080, height: 1920, fps: 30 })).toBe('9:16 · 1080×1920 · 30p');
    expect(formatLabel({ width: 1280, height: 720, fps: 50 })).toBe('1280×720 · 50p');
  });
});

describe('Ordner und Dateinamen freier Projekte', () => {
  it('freeProjectFolder = F_<Slug>_<6 Zeichen der ID ohne p->', () => {
    expect(freeProjectFolder({ id: 'p-3f9a2c11-aaaa', name: 'Mein Film' })).toBe('F_Mein-Film_3f9a2c');
    expect(freeProjectFolder({ id: 'p-abcdef12', name: 'Bäckerei & Söhne' })).toBe('F_Baeckerei-und-Soehne_abcdef');
    expect(freeProjectFolder({ id: 'p-123456789', name: '!!!' })).toBe('F_Projekt_123456');
    // Ordnernamen, die der Rust-Befehl `project_dir` annimmt (kein /, \, .., kein Punkt am Anfang)
    expect(freeProjectFolder({ id: 'p-../..', name: '../../etc' })).not.toMatch(/\/|\\|\.\.|^\./);
  });

  it('Umbenennen ändert nur den Anzeigenamen, nicht den Ordner', async () => {
    await app().init(new MockBackend(), { now: () => t0 });
    const p = app().createProject('Erster Name', PROJECT_FORMATS[0].format)!;
    expect(app().renameProject(p.id, '  Zweiter Name ')).toBe(true);
    const renamed = app().state!.projects![0];
    expect(renamed.name).toBe('Zweiter Name');
    expect(folderOf(renamed)).toBe(folderOf(p));
    expect(folderOf(renamed)).toMatch(/^F_Erster-Name_/);
    expect(app().renameProject(p.id, '   ')).toBe(false);
    expect(app().renameProject('p-gibtsnicht', 'x')).toBe(false);
  });

  it('Exportname <Slug>_v<NN>_<kurze Seite>p<fps>.mp4', () => {
    expect(freeFileName('Mein Film', 1, { width: 1920, height: 1080, fps: 25 })).toBe('Mein-Film_v01_1080p25.mp4');
    expect(freeFileName('Hoch', 12, { width: 1080, height: 1920, fps: 30 })).toBe('Hoch_v12_1080p30.mp4');
    expect(freeFileName('4K', 3, { width: 3840, height: 2160, fps: 25 })).toBe('4K_v03_2160p25.mp4');
  });

  it('Export-Voreinstellung passt zum Projektformat', () => {
    expect(PROJECT_FORMATS.map((f) => freePresetFor(f.format))).toEqual(['social169', 'social169', 'social916', 'social11', 'uhd']);
  });
});

describe('projectStore.open mit freien Projekten', () => {
  it('neu: eine Sequenz im gewählten Format, benannt nach dem Projekt, sofort gesichert im F_-Ordner', async () => {
    const b = new MockBackend();
    const save = vi.spyOn(b, 'saveProject');
    const p = free('Mein Film', 'p-3f9a2c11', PROJECT_FORMATS[2].format);
    expect(await store().open(asFree(p), b)).toBe(true);
    expect(store().status).toBe('ready');
    expect(store().dir).toBe('/mock/Medienwerkstatt/F_Mein-Film_3f9a2c');
    expect(currentKey(store())).toBe(`free:${p.id}`);
    const project = store().project!;
    expect(project.freeProjectId).toBe(p.id);
    expect(project.assignmentId).toBeUndefined();
    expect(project.sequences).toHaveLength(1);
    expect([store().seq!.width, store().seq!.height, store().seq!.fps, store().seq!.name]).toEqual([1080, 1920, 30, 'Mein Film']);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('erneut öffnen lädt den gespeicherten Stand (auch nach Umbenennen: gleicher Ordner)', async () => {
    const p = free();
    await store().open(asFree(p), new MockBackend());
    store().apply((s) => ({ ...s, inPoint: 5 }));
    await store().flush();
    const seqId = store().seq!.id;
    resetProjectForTests();
    await store().open(asFree({ ...p, name: 'Neuer Name' }), new MockBackend());
    expect(store().seq!.id).toBe(seqId);
    expect(store().seq!.inPoint).toBe(5);
    expect(store().seq!.name).toBe('Mein Film');
  });

  it('Wechsel frei → Auftrag sichert vorher; Auftrag → frei ebenso', async () => {
    const b = new MockBackend();
    const save = vi.spyOn(b, 'saveProject');
    const p = free();
    await store().open(asFree(p), b);
    store().apply((s) => ({ ...s, inPoint: 3 }));
    const freeDir = store().dir!;
    expect(await store().open(asAssignment(assignment('A07')), b)).toBe(true);
    expect(store().target).toMatchObject({ kind: 'assignment', assignment: { id: 'A07' } });
    expect((await b.loadProject(freeDir)).value!.sequences[0].inPoint).toBe(3);
    store().apply((s) => ({ ...s, outPoint: 9 }));
    const aDir = store().dir!;
    expect(await store().open(asFree(p), b)).toBe(true);
    expect((await b.loadProject(aDir)).value!.sequences[0].outPoint).toBe(9);
    expect(store().seq!.inPoint).toBe(3);
    // neu (frei), Sichern vor dem Wechsel, neu (Auftrag), Sichern vor dem Wechsel zurück
    expect(save.mock.calls.map((c) => c[0])).toEqual([freeDir, freeDir, aDir, aDir]);
  });

  it('scheitert das Sichern vor dem Wechsel, bleibt das freie Projekt offen (switchError)', async () => {
    vi.useFakeTimers();
    const b = new MockBackend();
    const p = free();
    await store().open(asFree(p), b);
    vi.spyOn(b, 'saveProject').mockRejectedValue(new Error('voll'));
    store().apply((s) => ({ ...s, inPoint: 7 }));
    expect(await store().open(asAssignment(assignment('A02')), b)).toBe(false);
    expect(currentKey(store())).toBe(targetKey(asFree(p)));
    expect(store().switchError).toBe(SWITCH_ERROR);
    expect(store().seq!.inPoint).toBe(7);
  });

  it('Auftrag ohne Video bleibt „noVideo“; freie Projekte haben das nie', async () => {
    const b = new MockBackend();
    await store().open(asAssignment(assignment('A05', [research])), b);
    expect(store().status).toBe('noVideo');
    await store().open(asFree(free()), b);
    expect(store().status).toBe('ready');
  });
});

describe('Zuletzt geöffnet', () => {
  let now = t0;
  const clock: Clock = { now: () => now };

  it('openTarget setzt lastOpened und openedAt (frei) über den App-Speicherweg', async () => {
    const b = new MockBackend();
    // Seed „e2e-film“: Auftrag #1 ist ein Video-Auftrag.
    await app().init(b, clock, { installId: 'e2e-film' });
    const p = app().createProject('Film', PROJECT_FORMATS[0].format)!;
    now = t0 + 5 * MIN;
    expect(await openTarget(asFree(p), b)).toBe(true);
    expect(app().state!.lastOpened).toEqual({ kind: 'free', id: p.id });
    expect(app().state!.projects![0].openedAt).toBe(t0 + 5 * MIN);
    await app().flush();
    const saved = JSON.parse(localStorage.getItem('mw-state')!) as AppState;
    expect(saved.lastOpened).toEqual({ kind: 'free', id: p.id });

    const a = app().state!.assignments.find((x) => x.deliverables.some((d) => d.kind === 'video'))!;
    now = t0 + 9 * MIN;
    expect(await openTarget(asAssignment(a), b)).toBe(true);
    expect(app().state!.lastOpened).toEqual({ kind: 'assignment', id: a.id });
    expect(app().state!.projects![0].openedAt).toBe(t0 + 5 * MIN);
  });

  it('ein Auftrag ohne Video wird nicht „zuletzt geöffnet“', async () => {
    const b = new MockBackend();
    await app().init(b, clock, { installId: 'x' });
    const p = app().createProject('Film', PROJECT_FORMATS[0].format)!;
    await openTarget(asFree(p), b);
    const r = assignment('A09', [research]);
    useApp.setState({ state: { ...app().state!, assignments: [...app().state!.assignments, r] } });
    await openTarget(asAssignment(r), b);
    expect(store().status).toBe('noVideo');
    expect(app().state!.lastOpened).toEqual({ kind: 'free', id: p.id });
  });
});

describe('Werkstatt: was öffnet `/`?', () => {
  const p = free('Film', 'p-111111');
  const video = assignment('A01');
  const reco = assignment('A02', [research]);
  const base = (o: Partial<AppState> = {}): AppState => ({ ...oldState(), assignments: [video, reco], projects: [p], ...o });
  const none = { target: null, status: 'idle' as const };
  const keyOf = (t: OpenTarget | null) => (t ? targetKey(t) : null);

  it('ausdrückliche Wahl gewinnt (auch ein Recherche-Auftrag – nur so ist „noVideo“ erreichbar)', () => {
    expect(keyOf(chooseTarget(base(), { assignmentId: 'A02' }, none))).toBe('assignment:A02');
    expect(keyOf(chooseTarget(base(), { projectId: p.id }, { target: asAssignment(video), status: 'ready' }))).toBe(`free:${p.id}`);
  });

  it('sonst das offene Projekt (außer „noVideo“), dann lastOpened, sonst nichts (→ Übersicht)', () => {
    expect(keyOf(chooseTarget(base({ lastOpened: { kind: 'free', id: p.id } }), null, { target: asAssignment(video), status: 'ready' }))).toBe('assignment:A01');
    expect(keyOf(chooseTarget(base({ lastOpened: { kind: 'free', id: p.id } }), null, { target: asAssignment(reco), status: 'noVideo' }))).toBe(`free:${p.id}`);
    expect(keyOf(chooseTarget(base({ lastOpened: { kind: 'assignment', id: 'A01' } }), null, none))).toBe('assignment:A01');
    expect(chooseTarget(base(), null, none)).toBeNull();
  });

  it('der aktive Auftrag öffnet sich nicht mehr von selbst; verschwundene oder video-lose lastOpened werden übergangen', () => {
    expect(chooseTarget(base({ projects: [] }), null, none)).toBeNull();
    expect(chooseTarget(base({ lastOpened: { kind: 'assignment', id: 'A02' } }), null, none)).toBeNull();
    expect(chooseTarget(base({ lastOpened: { kind: 'free', id: 'p-weg' } }), null, none)).toBeNull();
    expect(chooseTarget(base(), { projectId: 'p-weg' }, none)).toBeNull();
  });

  it('löst das Ziel frisch aus dem Zustand auf (Umbenennen wirkt sofort auf die Überschrift)', () => {
    const t = chooseTarget(base({ projects: [{ ...p, name: 'Umbenannt' }] }), null, { target: asFree(p), status: 'ready' });
    expect(t).toMatchObject({ kind: 'free', project: { name: 'Umbenannt' } });
  });
});

describe('Export im freien Projekt', () => {
  const media: MediaItem = {
    id: 'm1', kind: 'video', durationSec: 60, width: 1920, height: 1080, fps: 25, hasAudio: true, hdr: false,
    videoCodec: 'h264', audioCodec: 'aac', rotation: 0, name: 'a.mp4', path: '/x/a.mp4', proxyPath: null, shotSize: null,
  };
  const clip: Clip = { id: 'c1', trackId: 'V1', kind: 'media', mediaId: 'm1', start: 0, duration: 50, sourceIn: 0, linkId: null, gainDb: 0, fadeIn: 0, fadeOut: 0, color: null, title: null };

  it('nutzt den Exporter mit Abgabe „frei“: Export-Ordner, Version zählt hoch, kein Auftrag im Zustand', async () => {
    vi.useFakeTimers();
    const b = new MockBackend();
    await app().init(b, { now: () => t0 }, { installId: 'x' });
    const before = app().state!.assignments.length;
    const p = app().createProject('Mein Film', PROJECT_FORMATS[0].format)!;
    await store().open(asFree(p), b);
    useProject.setState({ project: { ...store().project!, media: [media] } });
    store().apply((s) => ({ ...s, clips: [clip] }));
    const ffmpeg = vi.spyOn(b, 'runFfmpeg');
    const deps = { backend: b, dir: store().dir!, now: () => t0, h264Encoder: 'libx264' as const };
    const row = { sequenceId: store().seq!.id, presetId: 'social169' as const };
    const run1 = exportFreeProject(p.name, row, deps);
    await vi.runAllTimersAsync();
    const r1 = await run1;
    expect(r1).toMatchObject({ deliverableId: FREE_DELIVERABLE_ID, version: 1, fileName: 'Mein-Film_v01_1080p25.mp4', path: `${store().dir}/Export/Mein-Film_v01_1080p25.mp4` });
    expect(ffmpeg.mock.calls[0][0]).toContain(r1.path);
    const run2 = exportFreeProject(p.name, { ...row, presetId: 'prores' }, deps);
    await vi.runAllTimersAsync();
    const r2 = await run2;
    expect(r2.fileName).toBe('Mein-Film_v02_1080p25.mov');
    expect(store().project!.exports.map((e) => e.version)).toEqual([1, 2]);
    expect((await b.loadProject(store().dir!)).value!.exports).toHaveLength(2);
    expect(app().state!.assignments).toHaveLength(before);
  });
});
