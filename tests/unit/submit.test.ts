import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockBackend } from '../../src/backend/MockBackend';
import type { Backend } from '../../src/backend/Backend';
import type { Assignment, Segment } from '../../src/backend/types';
import { AVAILABLE_TYPES, generateAssignment, loadCatalogs } from '../../src/domain/assignments/generator';
import { account } from '../../src/domain/chef/account';
import { canCorrect, correctionBlockedText } from '../../src/domain/chef/correction';
import { evaluate } from '../../src/domain/chef/evaluate';
import { phraseFor } from '../../src/domain/chef/phrases';
import { loadRules } from '../../src/domain/chef/rules';
import { applicableCategories } from '../../src/domain/chef/types';
import type { Evaluation, EvaluationInput, ProjectFacts, VideoInput } from '../../src/domain/chef/types';
import type { Clock } from '../../src/domain/time';
import { newSequence } from '../../src/domain/timeline/sequence';
import type { Clip, ColorParams, MediaItem, Project, Sequence, TitleParams } from '../../src/domain/timeline/types';
import { exportDeliverable } from '../../src/state/exporter';
import { resetAppForTests, useApp } from '../../src/state/appStore';
import { resetProjectForTests } from '../../src/state/projectStore';
import { exportSegments, factsForExport, latestExport } from '../../src/state/submission';
import perfect from '../fixtures/measurements/perfect.json';

const rules = loadRules();
const HOUR = 3_600_000;
const t0 = Date.parse('2026-11-23T10:00:00+01:00');

const media: MediaItem = {
  id: 'm1', kind: 'video', durationSec: 60, width: 1920, height: 1080, fps: 25, hasAudio: true, hdr: false,
  videoCodec: 'h264', audioCodec: 'aac', rotation: 0, name: 'a.mp4', path: '/x/a.mp4', proxyPath: null, shotSize: 'totale',
};
const clip = (id: string, start: number, duration: number, over: Partial<Clip> = {}): Clip => ({
  id, trackId: 'V1', kind: 'media', mediaId: 'm1', start, duration, sourceIn: 0, linkId: null, gainDb: 0, fadeIn: 0, fadeOut: 0, color: null, title: null, ...over,
});
const COLOR: ColorParams = { exposure: 0.5, contrast: 0, highlights: 0, shadows: 0, temperature: 0, tint: 0, saturation: 0 };
const TITLE: TitleParams = { style: 'bauchbinde', line1: 'Anna', line2: 'Bäckerin', font: 'SF Pro', size: 40, color: '#ffffff', x: 0.1, y: 0.8, fadeIn: 0, fadeOut: 0 };

function seqWith(clips: Clip[], over: Partial<Sequence> = {}): Sequence {
  return { ...newSequence({ width: 1920, height: 1080, fps: 25, name: 'Film' }, () => 'seq1'), clips, ...over };
}
/** Auftrag #1 des Seeds „e2e-film“ ist ein Video-Auftrag (siehe E2E-Tests). */
const seedAssignment: Assignment = generateAssignment('e2e-film', 1, t0, 1, AVAILABLE_TYPES, loadCatalogs(), rules);
const generated = (): Assignment => seedAssignment;
const stubClock = (start = t0): Clock & { set(t: number): void } => {
  let t = start;
  return { now: () => t, set: (x) => void (t = x) };
};

describe('Einstellungen für die Messung', () => {
  const seq = seqWith([clip('c1', 0, 125), clip('c2', 125, 125, { sourceIn: 100 })], { inPoint: 75, outPoint: 200 });

  it('verschiebt auf den Exportbeginn (In-Punkt) und beschneidet auf den Exportbereich', () => {
    const range = { start: 3, end: 8 };
    expect(exportSegments(seq, [media], range)).toEqual<Segment[]>([
      { start: 0, end: 2 },
      { start: 2, end: 5 },
    ]);
    const facts = factsForExport(seq, [media], range);
    expect(facts.shots.map((s) => [s.start, s.end])).toEqual([[0, 2], [2, 5]]);
    expect(facts.longestShotSec).toBe(3);
  });

  it('ohne Bereich bleiben die Zeiten unverändert; Einstellungen außerhalb entfallen', () => {
    expect(exportSegments(seq, [media])).toEqual([{ start: 0, end: 5 }, { start: 5, end: 10 }]);
    expect(exportSegments(seq, [media], { start: 6, end: 9 })).toEqual([{ start: 0, end: 3 }]);
  });
});

describe('exportDeliverable', () => {
  type Call = { dir: string; rel: string; bytes: Uint8Array };
  function stub() {
    const writes: Call[] = [];
    const ffmpeg: { args: string[]; durationSec: number }[] = [];
    const backend = {
      writeFile: async (dir: string, rel: string, bytes: Uint8Array) => {
        writes.push({ dir, rel, bytes });
        return `${dir}/${rel}`;
      },
      runFfmpeg: async (args: string[], durationSec: number, onProgress: (p: number) => void) => {
        ffmpeg.push({ args, durationSec });
        onProgress(0.5);
        onProgress(1);
      },
    } as unknown as Backend;
    return { backend, writes, ffmpeg };
  }
  const asg = (): Assignment => {
    const a = generated();
    return a;
  };
  function project(seq: Sequence, exports: Project['exports'] = []): Project {
    return { version: 1, assignmentId: 'A01', media: [media], sequences: [seq], activeSequenceId: seq.id, exports };
  }

  it('schreibt LUT und Titel-PNG nach Cache/, die Datei nach Export/ und zählt die Version hoch', async () => {
    const a = asg();
    const del = a.deliverables.find((d) => d.kind === 'video')!;
    const seq = seqWith([
      clip('c1', 0, 125, { color: COLOR }),
      clip('c2', 125, 125, { color: COLOR }),
      { ...clip('t1', 0, 50), trackId: 'V2', kind: 'title', mediaId: undefined, title: TITLE },
    ]);
    const s = stub();
    const progress: number[] = [];
    const sizes: [number, number][] = [];
    const deps = {
      backend: s.backend, dir: '/p/A01', assignment: a, now: () => 1234, h264Encoder: 'libx264' as const,
      onProgress: (p: number) => progress.push(p),
      renderTitlePng: async (_t: TitleParams, w: number, h: number) => (sizes.push([w, h]), new Uint8Array([1, 2, 3])),
    };
    const rec1 = await exportDeliverable(project(seq), seq, del, 'social169', deps);
    expect(rec1).toMatchObject({ deliverableId: del.id, version: 1, presetId: 'social169', at: 1234, sequenceId: 'seq1' });
    expect(rec1.fileName).toMatch(/_v01_1080p25\.mp4$/);
    expect(rec1.path).toBe(`/p/A01/Export/${rec1.fileName}`);
    // Eine LUT für gleiche Farbparameter, ein Titel-PNG
    expect(s.writes.filter((w) => /^Cache\/lut-.*\.cube$/.test(w.rel))).toHaveLength(1);
    expect(s.writes.filter((w) => /^Cache\/title-.*\.png$/.test(w.rel))).toHaveLength(1);
    expect(s.writes.every((w) => w.dir === '/p/A01')).toBe(true);
    expect(sizes).toEqual([[1920, 1080]]);
    expect(s.ffmpeg[0].args.at(-1)).toBe(rec1.path);
    expect(s.ffmpeg[0].args).toContain('libx264');
    expect(s.ffmpeg[0].durationSec).toBeCloseTo(10);
    expect(progress).toEqual([0.5, 1]);

    const rec2 = await exportDeliverable(project(seq, [rec1, { ...rec1, deliverableId: 'anderes', version: 7 }]), seq, del, 'social169', deps);
    expect(rec2.version).toBe(2);
    expect(rec2.fileName).toMatch(/_v02_/);
  });

  it('rendert Titel in der Preset-Größe (9:16) und merkt sich den Exportbereich', async () => {
    const a = asg();
    const del = a.deliverables.find((d) => d.kind === 'video')!;
    const seq = seqWith([clip('c1', 0, 250), { ...clip('t1', 0, 50), trackId: 'V2', kind: 'title', mediaId: undefined, title: TITLE }], { inPoint: 25, outPoint: 125 });
    const s = stub();
    const sizes: [number, number][] = [];
    const rec = await exportDeliverable(project(seq), seq, del, 'social916', {
      backend: s.backend, dir: '/p', assignment: a, now: () => 1, h264Encoder: 'libx264',
      renderTitlePng: async (_t, w, h) => (sizes.push([w, h]), new Uint8Array([9])),
    });
    expect(sizes).toEqual([[1080, 1920]]);
    expect(rec.rangeSec).toEqual({ start: 1, end: 5 });
  });

  it('ProRes-Preset ersetzt die Dateiendung durch .mov', async () => {
    const a = asg();
    const del = a.deliverables.find((d) => d.kind === 'video')!;
    const seq = seqWith([clip('c1', 0, 50)]);
    const rec = await exportDeliverable(project(seq), seq, del, 'prores', { backend: stub().backend, dir: '/p', assignment: a, now: () => 1, h264Encoder: 'libx264' });
    expect(rec.fileName.endsWith('.mov')).toBe(true);
  });

  it('latestExport nimmt die höchste Version der Abgabe', () => {
    const base = { path: 'x', fileName: 'x', presetId: 'social169' as const, at: 1 };
    const p = project(seqWith([]), [
      { ...base, deliverableId: 'a', version: 1 }, { ...base, deliverableId: 'a', version: 3 }, { ...base, deliverableId: 'b', version: 9 }, { ...base, deliverableId: 'a', version: 2 },
    ]);
    expect(latestExport(p, 'a')?.version).toBe(3);
    expect(latestExport(p, 'zzz')).toBeNull();
    expect(latestExport(null, 'a')).toBeNull();
  });
});

describe('Regel-Chef: Übernahmen aus Aufgabe 4', () => {
  const facts: ProjectFacts = { shots: [{ start: 0, end: 5, mediaId: 'm1', shotSize: 'totale' }], hasJOrLCut: true, lowerThirds: 1, transitions: 0, audioCutsWithoutFade: 0, fpsMismatch: false, longestShotSec: 5 };
  const video = (a: Assignment): VideoInput => ({ measurements: perfect as VideoInput['measurements'], facts, fileName: a.deliverables[0].videoSpec!.fileName });

  it('Frühbonus nur, wenn mindestens eine Abgabe wirklich vorliegt', () => {
    const a = generated();
    const early = a.deadline - 48 * HOUR;
    const none: EvaluationInput = { assignment: a, submittedAt: early, videos: {}, research: {}, selfChecks: { hookDone: true }, isCorrection: false };
    expect(evaluate(none, rules).bonus.map((b) => b.ruleId)).not.toContain('early24h');
    const withVideo = { ...none, videos: { [a.deliverables[0].id]: video(a) } };
    expect(evaluate(withVideo, rules).bonus.map((b) => b.ruleId)).toContain('early24h');
  });

  it('Recherche-Auftrag: nur die Kategorie Auftrag gilt (Protokoll, Satz, Konto)', () => {
    const base = generated();
    const a: Assignment = {
      ...base, type: 'research', hook: { id: 'h', text: 'x', verify: 'self' },
      deliverables: [{ id: 'r1', kind: 'research', label: 'Exposé', researchTemplate: 'expose' }],
    };
    const e = evaluate({ assignment: a, submittedAt: a.deadline - HOUR, videos: {}, research: { r1: null }, selfChecks: { hookDone: true }, isCorrection: false }, rules);
    expect(applicableCategories(e)).toEqual(['auftrag']);
    expect(e.categories.technik.max).toBe(0);
    const text = phraseFor(e, rules);
    expect(text).toContain('Exposé');
    // Konto: ein max-0-Abzug in einer gesperrten Kategorie darf nie zählen
    const dirty: Evaluation = {
      ...e,
      categories: { ...e.categories, technik: { max: 0, points: 0, deductions: [{ ruleId: 'loudness', category: 'technik', label: 'Spuk', soll: '', ist: '', points: -5, fix: '' }] } },
    };
    expect(account([dirty], [], rules).frequent.map((f) => f.ruleId)).not.toContain('loudness');
    expect(phraseFor(dirty, rules)).not.toContain('Spuk');
  });
});

describe('Korrektur-Regeln', () => {
  const a = { ...generated(), status: 'evaluated' as const };
  const ev = (at: number): Evaluation => ({
    id: `${a.id}:${at}`, assignmentId: a.id, at, total: 60, phrase: '', bonus: [], late: null,
    categories: { technik: { max: 40, points: 30, deductions: [] }, gestaltung: { max: 35, points: 20, deductions: [] }, auftrag: { max: 25, points: 10, deductions: [] } },
  });
  const sub = (at: number, isCorrection: boolean) => ({ at, evaluationId: `${a.id}:${at}`, isCorrection });

  it('einmal, innerhalb von 24 h nach der ersten Bewertung', () => {
    const first = ev(t0);
    const one = { ...a, submissions: [sub(t0, false)] };
    expect(canCorrect(one, [first], t0 + 23 * HOUR, rules)).toEqual({ ok: true });
    expect(canCorrect(one, [first], t0 + 25 * HOUR, rules)).toEqual({ ok: false, reason: 'window' });
    const two = { ...a, submissions: [sub(t0, false), sub(t0 + HOUR, true)] };
    // Das Fenster zählt ab der ERSTEN Bewertung; „schon genutzt“ hat Vorrang vor „Frist“
    expect(canCorrect(two, [first, ev(t0 + HOUR)], t0 + 2 * HOUR, rules)).toEqual({ ok: false, reason: 'used' });
    expect(canCorrect(two, [first, ev(t0 + HOUR)], t0 + 30 * HOUR, rules)).toEqual({ ok: false, reason: 'used' });
    expect(correctionBlockedText('window', rules)).toMatch(/24/);
    expect(correctionBlockedText('used', rules)).toMatch(/einmal|eine/i);
  });
});

describe('Abgabe und Korrektur im App-Zustand', () => {
  const app = () => useApp.getState();
  const dirFor = (a: Assignment) => `/mock/Medienwerkstatt/${a.id}`;
  let backend: MockBackend;
  let clock: ReturnType<typeof stubClock>;

  beforeEach(async () => {
    localStorage.clear();
    resetAppForTests();
    resetProjectForTests();
    backend = new MockBackend();
    clock = stubClock();
    await app().init(backend, clock, { installId: 'e2e-film' });
    expect(app().state!.assignments[0].id).toBe(seedAssignment.id);
    const a = app().state!.assignments[0];
    const del = a.deliverables.find((d) => d.kind === 'video')!;
    const seq = seqWith([clip('c1', 0, 125), clip('c2', 125, 125, { sourceIn: 100 })]);
    const project: Project = {
      version: 1, assignmentId: a.id, media: [media], sequences: [seq], activeSequenceId: seq.id,
      exports: [{ deliverableId: del.id, path: `${dirFor(a)}/Export/x_v01.mp4`, fileName: 'x_v01.mp4', presetId: 'social169', version: 1, at: t0, sequenceId: seq.id }],
    };
    await backend.saveProject(dirFor(a), project);
  });
  afterEach(() => {
    vi.useRealTimers();
    resetAppForTests();
    resetProjectForTests();
  });

  it('2 Tage nach der Frist: Verspätung −20, Konto entsprechend, Status bewertet', async () => {
    const a = app().state!.assignments[0];
    clock.set(a.deadline + 36 * HOUR);
    const messages: string[] = [];
    const e = await app().submit(a.id, { hookDone: true }, (m) => messages.push(m));
    expect(e.late?.points).toBe(-20);
    expect(e.bonus).toEqual([]);
    const s = app().state!;
    expect(s.evaluations).toHaveLength(1);
    expect(s.assignments[0].status).toBe('evaluated');
    expect(s.assignments[0].submissions).toEqual([{ at: clock.now(), evaluationId: e.id, isCorrection: false }]);
    expect(account(s.evaluations, s.assignments, rules).points).toBe(e.total);
    expect(messages).toEqual(['Messe Ton …', 'Prüfe Belichtung …', 'Bewerte …']);
    // Der Export (Dateiname/Pfad) bleibt am Protokoll für die Showreel-Liste
    expect(e.exports).toEqual([{ deliverableId: a.deliverables[0].id, fileName: 'x_v01.mp4', path: expect.stringContaining('/Export/x_v01.mp4') }]);
  });

  it('fehlende Abgabe: Abgabe bleibt möglich, −15 je Abgabe', async () => {
    const a = app().state!.assignments[0];
    await backend.saveProject(dirFor(a), { version: 1, assignmentId: a.id, media: [media], sequences: [seqWith([])], activeSequenceId: 'seq1', exports: [] });
    clock.set(a.deadline - 2 * HOUR);
    const e = await app().submit(a.id, { hookDone: true });
    expect(e.categories.auftrag.deductions.some((d) => d.ruleId === 'missingDeliverable' && d.points === -15)).toBe(true);
    expect(e.bonus).toEqual([]);
  });

  it('Korrektur: einmal, gedeckelt auf 90, nach 25 h abgelehnt; die bessere Bewertung zählt', async () => {
    const a = app().state!.assignments[0];
    clock.set(a.deadline - 48 * HOUR);
    const first = await app().submit(a.id, { hookDone: true });

    // zu früh? nein: nach 2 h
    clock.set(clock.now() + 2 * HOUR);
    const r = await app().correction(a.id, { hookDone: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.evaluation.total).toBeLessThanOrEqual(90);
    expect(app().state!.evaluations).toHaveLength(2);
    expect(app().state!.assignments[0].submissions.map((x) => x.isCorrection)).toEqual([false, true]);
    const acc = account(app().state!.evaluations, app().state!.assignments, rules);
    expect(acc.points).toBe(Math.max(first.total, r.ok ? r.evaluation.total : 0));

    clock.set(clock.now() + HOUR);
    expect(await app().correction(a.id, { hookDone: true })).toEqual({ ok: false, reason: 'used' });
    expect(app().state!.evaluations).toHaveLength(2);
  });

  it('Korrektur nach 25 h wird abgelehnt', async () => {
    const a = app().state!.assignments[0];
    clock.set(a.deadline - 48 * HOUR);
    await app().submit(a.id, { hookDone: true });
    clock.set(clock.now() + 25 * HOUR);
    expect(await app().correction(a.id, { hookDone: true })).toEqual({ ok: false, reason: 'window' });
    expect(app().state!.evaluations).toHaveLength(1);
  });

  it('Showreel: nur Bewertungen ab showreelMinScore lassen sich merken', async () => {
    const a = app().state!.assignments[0];
    clock.set(a.deadline - 48 * HOUR);
    const e = await app().submit(a.id, { hookDone: true });
    app().toggleShowreel(e.id);
    expect(app().state!.showreel).toEqual(e.total >= rules.showreelMinScore ? [e.id] : []);
    if (e.total >= rules.showreelMinScore) {
      app().toggleShowreel(e.id);
      expect(app().state!.showreel).toEqual([]);
    }
    // Nicht vorhandene Bewertung: wirkungslos
    app().toggleShowreel('gibt-es-nicht');
    expect(app().state!.showreel).not.toContain('gibt-es-nicht');
  });
});
