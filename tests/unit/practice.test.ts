import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockBackend } from '../../src/backend/MockBackend';
import { isValidState } from '../../src/backend/schema';
import type { Assignment } from '../../src/backend/types';
import { account } from '../../src/domain/chef/account';
import { canCorrect, correctionDeadline } from '../../src/domain/chef/correction';
import { evaluatePractice, practiceSpec } from '../../src/domain/chef/practice';
import { loadRules } from '../../src/domain/chef/rules';
import { PRACTICE_ASSIGNMENT_ID, applicableCategories, countedEvaluations, type Evaluation, type VideoInput } from '../../src/domain/chef/types';
import { PROJECT_FORMATS } from '../../src/domain/projects';
import type { Clip, MediaItem } from '../../src/domain/timeline/types';
import { accountSummary, resetAppForTests, useApp } from '../../src/state/appStore';
import { exportFreeProject } from '../../src/state/exportRun';
import { resetProjectForTests, useProject } from '../../src/state/projectStore';
import perfect from '../fixtures/measurements/perfect.json';

const rules = loadRules();
const t0 = Date.parse('2026-11-24T10:00:00+01:00');
const format = PROJECT_FORMATS[0].format;

const video = (over: Partial<VideoInput> = {}): VideoInput => ({
  measurements: perfect as VideoInput['measurements'],
  facts: { shots: [{ start: 0, end: 4, mediaId: 'm', shotSize: null }, { start: 4, end: 8, mediaId: 'm', shotSize: null }], hasJOrLCut: false, lowerThirds: 0, transitions: 0, audioCutsWithoutFade: 0, fpsMismatch: false, longestShotSec: 4 },
  fileName: 'Mein-Film_v01_1080p25.mp4',
  ...over,
});
const practice = (v: VideoInput = video(), at = 5): Evaluation => evaluatePractice({ freeProjectId: 'p-1', format, at, video: v }, rules);
const graded = (assignmentId: string, total: number, at = 1): Evaluation => ({
  id: `${assignmentId}:${at}`, assignmentId, at, total, phrase: '', bonus: [], late: null,
  categories: { technik: { max: 40, points: 30, deductions: [] }, gestaltung: { max: 35, points: 30, deductions: [] }, auftrag: { max: 25, points: 20, deductions: [] } },
});
const asg = (id: string, status: Assignment['status'] = 'evaluated'): Assignment => ({ id, status, submissions: [] } as unknown as Assignment);

describe('Übungsvorgabe aus dem Projektformat', () => {
  it('−14 LUFS, True Peak −1, H.264, keine Pflichten, Länge und Name der Datei sind das Soll', () => {
    const s = practiceSpec({ width: 1080, height: 1920, fps: 30 }, 42.5, 'x.mp4');
    expect(s).toMatchObject({ aspect: '9:16', width: 1080, height: 1920, fps: 30, loudnessLufs: -14, truePeakMax: -1, codec: 'h264', minShots: 0, requiredShotSizes: [], requireJCut: false, requireLowerThird: false, durationSec: 42.5, toleranceSec: 0, fileName: 'x.mp4' });
    expect(practiceSpec({ width: 1080, height: 1080, fps: 30 }, 1, 'x').aspect).toBe('1:1');
  });
});

describe('evaluatePractice', () => {
  it('perfekte Messung: 100 von 100, nur Technik und Gestaltung, kein Bonus, keine Verspätung', () => {
    const e = practice();
    expect(e).toMatchObject({ practice: true, freeProjectId: 'p-1', assignmentId: PRACTICE_ASSIGNMENT_ID, total: 100, late: null, bonus: [] });
    expect(applicableCategories(e)).toEqual(['technik', 'gestaltung']);
    expect(e.categories.auftrag).toEqual({ max: 0, points: 0, deductions: [] });
  });
  it('Länge der Datei und fehlende Pflicht-Einstellungsgrößen kosten nichts', () => {
    const long = { ...perfect, format: { ...perfect.format, durationSec: 600 } } as VideoInput['measurements'];
    const e = practice(video({ measurements: long }));
    expect(e.total).toBe(100);
  });
  it('zu laute Datei: Abzug in Technik, Ergebnis unter 100, trotzdem keine Auftrags-Abzüge', () => {
    const loud = { ...perfect, audio: { ...perfect.audio, integratedLufs: -9, truePeakDbtp: -0.5 } } as VideoInput['measurements'];
    const e = practice(video({ measurements: loud }));
    expect(e.categories.technik.deductions.map((d) => d.ruleId)).toContain('loudness');
    expect(e.total).toBeLessThan(100);
    expect(e.categories.auftrag.deductions).toEqual([]);
  });
  it('falsche Auflösung gegenüber dem Projektformat wird bemängelt', () => {
    const small = { ...perfect, format: { ...perfect.format, width: 1280, height: 720 } } as VideoInput['measurements'];
    expect(practice(video({ measurements: small })).categories.technik.deductions.map((d) => d.ruleId)).toContain('resolution');
  });
});

describe('Übungen zählen nirgends mit', () => {
  const real = [graded('a', 70), graded('b', 90, 2)];
  const assignments = [asg('a'), asg('b')];
  const p = practice(video(), 99);

  it('Punktekonto, Stufe und häufige Abzüge bleiben gleich', () => {
    expect(account([...real, p], assignments, rules)).toEqual(account(real, assignments, rules));
    expect(account([p], [], rules)).toEqual(account([], [], rules));
    const big = { ...p, total: 5000 };
    expect(account([...real, big], assignments, rules).points).toBe(160);
  });
  it('Korrektur-Logik sieht keine Übung', () => {
    const a = asg('a', 'open');
    expect(canCorrect(a, [p], t0, rules)).toEqual({ ok: false, reason: 'window' });
    expect(correctionDeadline(a, [p], rules)).toBeNull();
    expect(canCorrect(a, [graded('a', 50, t0), p], t0, rules)).toEqual({ ok: true });
  });
  it('countedEvaluations filtert Übungen heraus', () => {
    expect(countedEvaluations([...real, p])).toEqual(real);
  });
});

describe('Speicherformat', () => {
  const base = { version: 1, installId: 'x', createdAt: 1, schedule: { nextIssueAt: 1, nextNumber: 1, vacations: [] }, assignments: [], settings: {} };
  it('ältere Stände ohne practice laden; Stände mit Übung laden und behalten die Felder', () => {
    expect(isValidState({ ...base, evaluations: [graded('a', 70)] })).toBe(true);
    const state = { ...base, evaluations: [graded('a', 70), practice()] };
    expect(isValidState(state)).toBe(true);
    expect(JSON.parse(JSON.stringify(state)).evaluations[1]).toMatchObject({ practice: true, freeProjectId: 'p-1' });
  });
});

describe('reviewPractice im App-Zustand', () => {
  const media: MediaItem = {
    id: 'm1', kind: 'video', durationSec: 60, width: 1920, height: 1080, fps: 25, hasAudio: true, hdr: false,
    videoCodec: 'h264', audioCodec: 'aac', rotation: 0, name: 'a.mp4', path: '/x/a.mp4', proxyPath: null, shotSize: null,
  };
  const clip: Clip = { id: 'c1', trackId: 'V1', kind: 'media', mediaId: 'm1', start: 0, duration: 50, sourceIn: 0, linkId: null, gainDb: 0, fadeIn: 0, fadeOut: 0, color: null, title: null };

  beforeEach(() => {
    localStorage.clear();
    resetAppForTests();
    resetProjectForTests();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    resetProjectForTests();
    resetAppForTests();
  });

  it('legt eine Übung ab; Konto, Aufträge, Showreel und TopBar-Punkte bleiben unberührt', async () => {
    const b = new MockBackend();
    await useApp.getState().init(b, { now: () => t0 }, { installId: 'x' });
    const free = useApp.getState().createProject('Mein Film', format)!;
    await useProject.getState().open({ kind: 'free', project: free }, b);
    useProject.setState({ project: { ...useProject.getState().project!, media: [media] } });
    useProject.getState().apply((s) => ({ ...s, clips: [clip] }));
    const run = exportFreeProject(free.name, { sequenceId: useProject.getState().seq!.id, presetId: 'social169' }, { backend: b, dir: useProject.getState().dir!, now: () => t0, h264Encoder: 'libx264' });
    await vi.runAllTimersAsync();
    await run;

    // Eine echte Bewertung, damit das Konto etwas zu verändern hätte.
    useApp.setState({ state: { ...useApp.getState().state!, evaluations: [graded('a', 80)], showreel: ['a:1'] } });
    const before = useApp.getState().state!;
    const pointsBefore = accountSummary({ state: before });

    const r = useApp.getState().reviewPractice(free.id, useProject.getState().project);
    await vi.runAllTimersAsync();
    const e = await r;

    const after = useApp.getState().state!;
    expect(e).toMatchObject({ practice: true, freeProjectId: free.id, assignmentId: PRACTICE_ASSIGNMENT_ID });
    expect(e.exports).toHaveLength(1);
    expect(after.evaluations).toHaveLength(2);
    expect(after.evaluations[1]).toEqual(e);
    expect(accountSummary({ state: after })).toEqual(pointsBefore);
    expect(after.assignments).toEqual(before.assignments);
    expect(after.showreel).toEqual(['a:1']);

    // Auch mit 100 Punkten lässt sich eine Übung nicht fürs Showreel merken.
    useApp.getState().toggleShowreel(e.id);
    expect(useApp.getState().state!.showreel).toEqual(['a:1']);
    expect((await b.loadState()).value?.evaluations).toHaveLength(2);
  });

  it('ohne Export gibt es eine verständliche Fehlermeldung und keine Bewertung', async () => {
    const b = new MockBackend();
    await useApp.getState().init(b, { now: () => t0 }, { installId: 'x' });
    const free = useApp.getState().createProject('Leer', format)!;
    await useProject.getState().open({ kind: 'free', project: free }, b);
    await expect(useApp.getState().reviewPractice(free.id, useProject.getState().project)).rejects.toThrow(/Exportiere zuerst/);
    expect(useApp.getState().state!.evaluations).toHaveLength(0);
  });
});
