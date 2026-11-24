import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MockBackend } from '../../src/backend/MockBackend';
import type { Segment } from '../../src/backend/types';
import { AVAILABLE_TYPES, generateAssignment, loadCatalogs } from '../../src/domain/assignments/generator';
import type { Assignment } from '../../src/domain/assignments/types';
import { loadRules } from '../../src/domain/chef/rules';
import type { Clock } from '../../src/domain/time';
import { newSequence } from '../../src/domain/timeline/sequence';
import type { Clip, ExportRecord, MediaItem, Project, Sequence } from '../../src/domain/timeline/types';
import { resetAppForTests, useApp } from '../../src/state/appStore';
import { exportDeliverable } from '../../src/state/exporter';
import { exportRows } from '../../src/state/exportRun';
import { sequenceHash } from '../../src/state/hash';
import { resetProjectForTests, useProject } from '../../src/state/projectStore';
import { exportSnapshot, exportStale, factsForExport } from '../../src/state/submission';

const rules = loadRules();
const HOUR = 3_600_000;
const t0 = Date.parse('2026-11-23T10:00:00+01:00');
const seedA: Assignment = generateAssignment('e2e-film', 1, t0, 1, AVAILABLE_TYPES, loadCatalogs(), rules);
const bothA: Assignment = generateAssignment('e2e-6', 1, t0, 1, AVAILABLE_TYPES, loadCatalogs(), rules);

const media: MediaItem = {
  id: 'm1', kind: 'video', durationSec: 60, width: 1920, height: 1080, fps: 25, hasAudio: true, hdr: false,
  videoCodec: 'h264', audioCodec: 'aac', rotation: 0, name: 'a.mp4', path: '/x/a.mp4', proxyPath: null, shotSize: 'totale',
};
const clip = (id: string, start: number, duration: number, over: Partial<Clip> = {}): Clip => ({
  id, trackId: 'V1', kind: 'media', mediaId: 'm1', start, duration, sourceIn: 0, linkId: null, gainDb: 0, fadeIn: 0, fadeOut: 0, color: null, title: null, ...over,
});
const seqOf = (id: string, clips: Clip[], over: Partial<Sequence> = {}): Sequence => ({
  ...newSequence({ width: 1920, height: 1080, fps: 25, name: id }, () => id), clips, ...over,
});
const clockAt = (start: number): Clock & { set(t: number): void } => {
  let t = start;
  return { now: () => t, set: (x) => void (t = x) };
};
const rec = (a: Assignment, over: Partial<ExportRecord> = {}): ExportRecord => ({
  deliverableId: a.deliverables[0].id, path: '/p/Export/x_v01.mp4', fileName: 'x_v01.mp4', presetId: 'social169', version: 1, at: t0, ...over,
});

class SpyBackend extends MockBackend {
  calls: Segment[][] = [];
  failAnalyze: Error | null = null;
  failFfmpeg: Error | null = null;
  async analyze(path: string, segments: Segment[] = []) {
    this.calls.push(segments);
    if (this.failAnalyze) throw this.failAnalyze;
    return super.analyze(path, segments);
  }
  async runFfmpeg(args: string[], d: number, p: (x: number) => void) {
    if (this.failFfmpeg) throw this.failFfmpeg;
    return super.runFfmpeg(args, d, p);
  }
}

describe('Abgabe: Messung, Fehler, Schutz vor Doppelaufruf', () => {
  const app = () => useApp.getState();
  let backend: SpyBackend;
  let clock: ReturnType<typeof clockAt>;
  const dirOf = (a: Assignment) => `/mock/Medienwerkstatt/${a.id}`;
  const save = (a: Assignment, p: Project) => backend.saveProject(dirOf(a), p);

  beforeEach(async () => {
    localStorage.clear();
    resetAppForTests();
    resetProjectForTests();
    backend = new SpyBackend();
    clock = clockAt(t0);
    await app().init(backend, clock, { installId: 'e2e-film' });
  });
  afterEach(() => {
    resetAppForTests();
    resetProjectForTests();
  });

  const a = () => app().state!.assignments[0];
  const proj = (exports: ExportRecord[], seqs: Sequence[], active = seqs[0].id): Project => ({
    version: 1, assignmentId: seedA.id, media: [media], sequences: seqs, activeSequenceId: active, exports,
  });

  it('(a) analyze bekommt die verschobenen und beschnittenen Einstellungen (In/Out gesetzt, alter Eintrag)', async () => {
    const seq = seqOf('s1', [clip('c1', 0, 125), clip('c2', 125, 125, { sourceIn: 100 })], { inPoint: 75, outPoint: 200 });
    await save(a(), proj([rec(a())], [seq]));
    clock.set(a().deadline - 48 * HOUR);
    await app().submit(a().id, { hookDone: true });
    expect(backend.calls).toEqual([[{ start: 0, end: 2 }, { start: 2, end: 5 }]]);
  });

  it('Momentaufnahme im Export-Eintrag hat Vorrang vor dem aktuellen Stand der Sequenz', async () => {
    const seq = seqOf('s1', [clip('c1', 0, 250)]);
    const snap: Segment[] = [{ start: 0, end: 3 }, { start: 3, end: 7 }];
    const facts = { ...factsForExport(seq, [media]), shots: snap.map((s) => ({ ...s, mediaId: 'm1', shotSize: null })) };
    await save(a(), proj([rec(a(), { sequenceId: 's1', facts, segments: snap, sequenceHash: 'alt' })], [seq]));
    clock.set(a().deadline - 48 * HOUR);
    await app().submit(a().id, { hookDone: true });
    expect(backend.calls).toEqual([snap]);
  });

  it('Einstellungsgröße, die nach dem Export beschriftet wird, zählt (kein missingShotSize-Abzug)', async () => {
    const seq = seqOf('s1', [clip('c1', 0, 125), clip('c2', 125, 125, { sourceIn: 50 })]);
    const unlabeled = { ...media, shotSize: null };
    const facts = factsForExport(seq, [unlabeled]);
    expect(facts.shots.every((x) => x.shotSize === null)).toBe(true);
    const required = a().deliverables[0].videoSpec!.requiredShotSizes[0];
    const labeled = { ...media, shotSize: required };
    const p = { ...proj([rec(a(), { sequenceId: 's1', facts, segments: facts.shots.map((x) => ({ start: x.start, end: x.end })), sequenceHash: sequenceHash(seq) })], [seq]), media: [labeled] };
    expect(exportSnapshot(p, p.exports[0]).facts.shots.map((x) => x.shotSize)).toEqual([required, required]);
    await save(a(), p);
    clock.set(a().deadline - 48 * HOUR);
    const e = await app().submit(a().id, { hookDone: true });
    expect(e.categories.gestaltung.deductions.map((d) => d.ruleId)).not.toContain('missingShotSize');
  });

  it('(d) alter Eintrag ohne sequenceId: aktive Sequenz', async () => {
    const other = seqOf('s1', [clip('c1', 0, 50)]);
    const active = seqOf('s2', [clip('c1', 0, 100), clip('c2', 100, 100, { sourceIn: 50 })]);
    await save(a(), proj([rec(a())], [other, active], 's2'));
    clock.set(a().deadline - 48 * HOUR);
    await app().submit(a().id, { hookDone: true });
    expect(backend.calls).toEqual([[{ start: 0, end: 4 }, { start: 4, end: 8 }]]);
  });

  it('(b) analyze wirft: keine Bewertung, keine Abgabe, Status unverändert, Fehler kommt an, danach geht es wieder', async () => {
    await save(a(), proj([rec(a())], [seqOf('s1', [clip('c1', 0, 125)])]));
    clock.set(a().deadline - 48 * HOUR);
    backend.failAnalyze = new Error('Messung kaputt');
    await expect(app().submit(a().id, { hookDone: true })).rejects.toThrow('Messung kaputt');
    expect(app().state!.evaluations).toEqual([]);
    expect(a().status).toBe('open');
    expect(a().submissions).toEqual([]);
    backend.failAnalyze = null;
    await app().submit(a().id, { hookDone: true });
    expect(app().state!.evaluations).toHaveLength(1);
  });

  it('(4) zwei gleichzeitige submit-Aufrufe: genau eine Bewertung', async () => {
    await save(a(), proj([rec(a())], [seqOf('s1', [clip('c1', 0, 125)])]));
    clock.set(a().deadline - 48 * HOUR);
    const [x, y] = await Promise.all([app().submit(a().id, { hookDone: true }), app().submit(a().id, { hookDone: true })]);
    expect(x.id).toBe(y.id);
    expect(app().state!.evaluations).toHaveLength(1);
    expect(a().submissions).toHaveLength(1);
    expect(backend.calls).toHaveLength(1);
  });

  it('Korrektur nach der Frist: keine Verspätung, wenn die erste Abgabe pünktlich war', async () => {
    await save(a(), proj([rec(a())], [seqOf('s1', [clip('c1', 0, 125)])]));
    clock.set(a().deadline - 4 * HOUR);
    const first = await app().submit(a().id, { hookDone: true });
    expect(first.late).toBeNull();
    clock.set(a().deadline + 16 * HOUR);
    const r = await app().correction(a().id, { hookDone: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.evaluation.late).toBeNull();
  });

  it('zwei gleichzeitige correction-Aufrufe: genau eine zusätzliche Bewertung', async () => {
    await save(a(), proj([rec(a())], [seqOf('s1', [clip('c1', 0, 125)])]));
    clock.set(a().deadline - 48 * HOUR);
    await app().submit(a().id, { hookDone: true });
    clock.set(clock.now() + HOUR);
    const r = await Promise.all([app().correction(a().id, { hookDone: true }), app().correction(a().id, { hookDone: true })]);
    expect(r.every((x) => x.ok)).toBe(true);
    expect(app().state!.evaluations).toHaveLength(2);
    expect(a().submissions).toHaveLength(2);
  });
});

describe('Export: Momentaufnahme, veraltet, Fehler', () => {
  it('exportDeliverable legt Fakten, Segmente und Sequenz-Hash des Exports ab', async () => {
    const seq = seqOf('s1', [clip('c1', 0, 125), clip('c2', 125, 125, { sourceIn: 100 })], { inPoint: 75, outPoint: 200 });
    const project: Project = { version: 1, assignmentId: seedA.id, media: [media], sequences: [seq], activeSequenceId: 's1', exports: [] };
    const backend = { writeFile: async (d: string, r: string) => `${d}/${r}`, runFfmpeg: async () => {} } as unknown as MockBackend;
    const r = await exportDeliverable(project, seq, seedA.deliverables[0], 'social169', { backend, dir: '/p', assignment: seedA, now: () => 1, h264Encoder: 'libx264' });
    expect(r.segments).toEqual([{ start: 0, end: 2 }, { start: 2, end: 5 }]);
    expect(r.facts?.shots.map((s) => [s.start, s.end])).toEqual([[0, 2], [2, 5]]);
    expect(r.sequenceHash).toBe(sequenceHash(seq));
  });

  it('Sicherheits-Limiter: standardmäßig an, aus der Projekteinstellung abschaltbar', async () => {
    const seq = seqOf('s1', [clip('c1', 0, 125), clip('a1', 0, 125, { trackId: 'A1' })]);
    const graphs: string[] = [];
    const backend = {
      writeFile: async (d: string, r: string) => `${d}/${r}`,
      runFfmpeg: async (args: string[]) => void graphs.push(args[args.indexOf('-filter_complex') + 1]),
    } as unknown as MockBackend;
    const deps = { backend, dir: '/p', assignment: seedA, now: () => 1, h264Encoder: 'libx264' as const };
    const project: Project = { version: 1, assignmentId: seedA.id, media: [media], sequences: [seq], activeSequenceId: 's1', exports: [] };
    await exportDeliverable(project, seq, seedA.deliverables[0], 'social169', deps);
    await exportDeliverable({ ...project, settings: { safetyLimiter: false } }, seq, seedA.deliverables[0], 'social169', deps);
    await exportDeliverable({ ...project, settings: { safetyLimiter: true } }, seq, seedA.deliverables[0], 'social169', deps);
    expect(graphs.map((g) => g.includes('alimiter=limit=0.79:level=false'))).toEqual([true, false, true]);
  });

  it('Ausnahmen (Bild-Clip) landen exportbezogen verschoben und beschnitten in der Momentaufnahme', async () => {
    const img: MediaItem = { ...media, id: 'img', kind: 'image', fps: null, hasAudio: false };
    const seq = seqOf('s1', [clip('c1', 0, 100), clip('i1', 100, 100, { mediaId: 'img' })], { inPoint: 50, outPoint: 150 });
    const backend = { writeFile: async (d: string, r: string) => `${d}/${r}`, runFfmpeg: async () => {} } as unknown as MockBackend;
    const project: Project = { version: 1, assignmentId: seedA.id, media: [media, img], sequences: [seq], activeSequenceId: 's1', exports: [] };
    const r = await exportDeliverable(project, seq, seedA.deliverables[0], 'social169', { backend, dir: '/p', assignment: seedA, now: () => 1, h264Encoder: 'libx264' });
    expect(r.facts?.exemptIntervals).toEqual([{ start: 2, end: 4 }]);
  });

  it('(e) exportStale: erst nach einer Änderung der Sequenz; alte Einträge nie', () => {
    const seq = seqOf('s1', [clip('c1', 0, 125)]);
    const p: Project = { version: 1, assignmentId: 'x', media: [media], sequences: [seq], activeSequenceId: 's1', exports: [] };
    const r = rec(seedA, { sequenceId: 's1', sequenceHash: sequenceHash(seq) });
    expect(exportStale(p, r)).toBe(false);
    const edited = { ...p, sequences: [{ ...seq, clips: [clip('c1', 0, 100)] }] };
    expect(exportStale(edited, r)).toBe(true);
    expect(exportStale(edited, rec(seedA))).toBe(false);
  });

  describe('(c) runFfmpeg wirft', () => {
    beforeEach(() => {
      localStorage.clear();
      resetProjectForTests();
    });
    afterEach(() => resetProjectForTests());

    it('kein ExportRecord, Projekt unverändert; danach klappt es', async () => {
      const backend = new SpyBackend();
      await useProject.getState().open(seedA, backend);
      useProject.getState().apply((s) => ({ ...s, clips: [clip('c1', 0, 125)] }));
      useProject.setState({ project: { ...useProject.getState().project!, media: [media] } });
      const before = useProject.getState().project;
      const del = seedA.deliverables[0];
      const row = { deliverable: del, sequenceId: useProject.getState().seq!.id, presetId: 'social169' as const };
      const deps = { backend, dir: useProject.getState().dir!, now: () => 5, h264Encoder: 'libx264' as const };
      backend.failFfmpeg = new Error('ffmpeg kaputt');
      await expect(exportRows(seedA, [row], deps)).rejects.toThrow('ffmpeg kaputt');
      expect(useProject.getState().project).toBe(before);
      expect(useProject.getState().project!.exports).toEqual([]);
      backend.failFfmpeg = null;
      const out = await exportRows(seedA, [row], deps);
      expect(out).toHaveLength(1);
      expect(useProject.getState().project!.exports.map((e) => e.version)).toEqual([1]);
    });
  });
});

describe('Sequenzen im Projekt-Store', () => {
  beforeEach(async () => {
    localStorage.clear();
    resetProjectForTests();
    await useProject.getState().open(bothA, new MockBackend());
    useProject.setState({ project: { ...useProject.getState().project!, media: [media] } });
    useProject.getState().apply((s) => ({ ...s, clips: [clip('c1', 0, 125)] }));
  });
  afterEach(() => resetProjectForTests());
  const st = () => useProject.getState();

  it('wechselt die aktive Sequenz; Bearbeitung trifft nur sie; Rückgängig gilt projektweit', () => {
    const first = st().seq!.id;
    const id = st().addSequenceFor('Zweite', { width: 1920, height: 1080, fps: 25 })!;
    expect(st().seq!.id).toBe(first);
    st().switchSequence(id);
    expect(st().seq!.id).toBe(id);
    expect(st().project!.activeSequenceId).toBe(id);
    st().apply((s) => ({ ...s, clips: [] }));
    expect(st().seq!.clips).toHaveLength(0);
    st().switchSequence(first);
    expect(st().seq!.clips).toHaveLength(1);
    // Rückgängig nimmt die Änderung der anderen Sequenz zurück, die aktive bleibt
    st().undo();
    expect(st().seq!.id).toBe(first);
    expect(st().project!.sequences.find((s) => s.id === id)!.clips).toHaveLength(1);
    st().redo();
    expect(st().project!.sequences.find((s) => s.id === id)!.clips).toHaveLength(0);
    expect(st().project!.activeSequenceId).toBe(first);
  });

  it('„Neu aus aktiver Sequenz“ ersetzt Inhalt, behält Format, Name und ID', () => {
    const id = st().addSequenceFor('Hochformat', { width: 1080, height: 1920, fps: 25 })!;
    st().apply((s) => ({ ...s, clips: [clip('c1', 0, 125), clip('c2', 125, 50)] }));
    expect(st().refreshSequenceFromActive(id)).toBe(true);
    const copy = st().project!.sequences.find((s) => s.id === id)!;
    expect(copy.clips.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect([copy.width, copy.height, copy.name]).toEqual([1080, 1920, 'Hochformat']);
    expect(st().refreshSequenceFromActive(st().seq!.id)).toBe(false);
  });
});
