import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { Backend } from '../../src/backend/Backend';
import { MockBackend } from '../../src/backend/MockBackend';
import { AVAILABLE_TYPES, generateAssignment, loadCatalogs } from '../../src/domain/assignments/generator';
import type { Assignment } from '../../src/domain/assignments/types';
import { applyGemini } from '../../src/domain/gemini/apply';
import { defaultModel } from '../../src/domain/gemini/models';
import { selectFrameTimes } from '../../src/domain/gemini/frames';
import { buildGeminiPrompt } from '../../src/domain/gemini/prompt';
import { GEMINI_SCHEMA, parseGeminiResult, type GeminiResult } from '../../src/domain/gemini/schema';
import { evaluate } from '../../src/domain/chef/evaluate';
import { allDeductions, type Evaluation, type EvaluationInput } from '../../src/domain/chef/types';
import { loadRules } from '../../src/domain/chef/rules';
import type { Clock } from '../../src/domain/time';
import { newSequence } from '../../src/domain/timeline/sequence';
import type { Clip, MediaItem, Project } from '../../src/domain/timeline/types';
import { resetAppForTests, useApp } from '../../src/state/appStore';
import { resetProjectForTests } from '../../src/state/projectStore';
import perfect from '../fixtures/measurements/perfect.json';

const rules = loadRules();
const HOUR = 3_600_000;
const t0 = Date.parse('2026-11-23T10:00:00+01:00');
const asg: Assignment = generateAssignment('e2e-film', 1, t0, 1, AVAILABLE_TYPES, loadCatalogs(), rules);

/** Bewertung mit Luft nach oben in Gestaltung (20/35) und Auftrag (15/25), Technik 30/40. */
function base(over: Partial<Evaluation['categories']> = {}): Evaluation {
  const cat = (max: number, points: number) => ({ max, points, deductions: [] });
  return {
    id: 'e1', assignmentId: 'A01', at: t0, bonus: [], late: null, total: 65, phrase: 'x',
    categories: { technik: cat(40, 30), gestaltung: cat(35, 20), auftrag: cat(25, 15), ...over },
  };
}
const crit = (key: GeminiResult['criteria'][number]['key'], shift: number) => ({ key, verdict: 'v', reason: 'r', shift });
const result = (...c: GeminiResult['criteria']): GeminiResult => ({ criteria: c, summary: 's' });

describe('parseGeminiResult', () => {
  it('ungültige Antwort → null', () => {
    expect(parseGeminiResult('kein json')).toBeNull();
    expect(parseGeminiResult('{}')).toBeNull();
    expect(parseGeminiResult('{"criteria":[{"key":"unbekannt","verdict":"a","reason":"b","shift":1}],"summary":"s"}')).toBeNull();
    expect(parseGeminiResult('{"criteria":[{"key":"licht","verdict":"a","reason":"b","shift":11}],"summary":"s"}')).toBeNull();
  });
  it('gültige Antwort, auch in Codezaun', () => {
    const json = JSON.stringify(result(crit('licht', -3), crit('briefing', 2)));
    expect(parseGeminiResult(json)?.criteria).toHaveLength(2);
    expect(parseGeminiResult('```json\n' + json + '\n```')?.summary).toBe('s');
  });
  it('JSON-Schema nennt alle sechs Kriterien und den Bereich −10…10', () => {
    const s = JSON.stringify(GEMINI_SCHEMA);
    for (const k of ['bildaufbau', 'einstellungsgroessen', 'licht', 'farbe', 'briefing', 'inhalt']) expect(s).toContain(k);
    expect(s).toContain('-10');
  });
});

describe('applyGemini', () => {
  it('Verschiebungen +8 und +7 ergeben angewendet +10', () => {
    const e = base();
    const r = applyGemini(e, result(crit('licht', 8), crit('briefing', 7)), rules);
    expect(r.total - e.total).toBe(10);
    expect(r.categories.gestaltung.points - 20 + (r.categories.auftrag.points - 15)).toBe(10);
    expect(r.gemini?.summary).toBe('s');
  });
  it('Technik bleibt unverändert', () => {
    const e = base();
    const r = applyGemini(e, result(crit('licht', 8), crit('farbe', 8), crit('briefing', 8)), rules);
    expect(r.categories.technik).toEqual(e.categories.technik);
  });
  it('negativ: −8 und −7 → −10; Kategorie bleibt ≥ 0', () => {
    const e = base({ gestaltung: { max: 35, points: 2, deductions: [] }, auftrag: { max: 25, points: 25, deductions: [] } });
    const r = applyGemini(e, result(crit('licht', -8), crit('briefing', -7)), rules);
    expect(r.categories.gestaltung.points).toBeGreaterThanOrEqual(0);
    expect(r.categories.auftrag.points).toBeGreaterThanOrEqual(0);
    expect(r.total).toBeLessThan(e.total);
  });
  it('Kategorie bleibt ≤ max', () => {
    const e = base({ gestaltung: { max: 35, points: 33, deductions: [] } });
    const r = applyGemini(e, result(crit('licht', 8), crit('bildaufbau', 2)), rules);
    expect(r.categories.gestaltung.points).toBe(35);
  });
  it('Kategorien mit max 0 (Recherche-Auftrag) bleiben unberührt; nur Auftrag bewegt sich', () => {
    const zero = { max: 0, points: 0, deductions: [] };
    const e = base({ technik: zero, gestaltung: zero, auftrag: { max: 100, points: 70, deductions: [] } });
    const r = applyGemini(e, result(crit('licht', 8), crit('inhalt', 4)), rules);
    expect(r.categories.technik).toEqual(zero);
    expect(r.categories.gestaltung).toEqual(zero);
    expect(r.categories.auftrag.points).toBe(74);
  });
  it('Summe nutzt die bestehende Logik: Deckel 100, Verspätung, Korrektur 90', () => {
    const late = { ruleId: 'late', category: 'frist' as const, label: 'Zu spät', soll: '', ist: '', points: -10, fix: '' };
    const e = base({ gestaltung: { max: 35, points: 34, deductions: [] }, auftrag: { max: 25, points: 24, deductions: [] }, technik: { max: 40, points: 40, deductions: [] } });
    expect(applyGemini({ ...e, total: 98 }, result(crit('licht', 1), crit('briefing', 1)), rules).total).toBe(100);
    expect(applyGemini({ ...e, late, total: 88 }, result(crit('licht', 1), crit('briefing', 1)), rules).total).toBe(90);
    expect(applyGemini({ ...e, total: 98 }, result(crit('licht', 1), crit('briefing', 1)), rules, { isCorrection: true }).total).toBe(rules.correction.maxScore);
  });
  it('echte Bewertung aus evaluate bleibt konsistent (Summe der Kategorien + Bonus − Verspätung)', () => {
    const input: EvaluationInput = {
      assignment: asg, submittedAt: asg.deadline - 48 * HOUR, research: {}, selfChecks: { hookDone: true }, isCorrection: false,
      videos: Object.fromEntries(asg.deliverables.filter((d) => d.kind === 'video').map((d) => [d.id, { measurements: perfect as never, facts: { shots: [], hasJOrLCut: false, lowerThirds: 0, transitions: 0, audioCutsWithoutFade: 0, fpsMismatch: false, longestShotSec: 0 }, fileName: 'x.mp4' }])),
    };
    const e = evaluate(input, rules);
    const r = applyGemini(e, result(crit('licht', -3)), rules);
    expect(r.total).toBeLessThanOrEqual(e.total);
    expect(allDeductions(r).length).toBe(allDeductions(e).length);
  });
});

describe('selectFrameTimes', () => {
  const shots = (n: number, len = 3) => Array.from({ length: n }, (_, i) => ({ start: i * len, end: (i + 1) * len }));
  it('Mitte jeder Einstellung bei 8–12 Einstellungen', () => {
    expect(selectFrameTimes(shots(8), 24)).toEqual([1.5, 4.5, 7.5, 10.5, 13.5, 16.5, 19.5, 22.5]);
    expect(selectFrameTimes(shots(12), 36)).toHaveLength(12);
  });
  it('mehr als 12 Einstellungen → 12 gleichmäßig verteilt, aufsteigend', () => {
    const t = selectFrameTimes(shots(30), 90);
    expect(t).toHaveLength(12);
    expect([...t].sort((a, b) => a - b)).toEqual(t);
    expect(t[0]).toBe(1.5);
    expect(t.at(-1)).toBeGreaterThan(80);
  });
  it('weniger als 8 Einstellungen und längerer Film → gleichmäßig auffüllen bis 8', () => {
    const t = selectFrameTimes(shots(3, 10), 30);
    expect(t).toHaveLength(8);
    expect(new Set(t).size).toBe(8);
    expect(t.every((x) => x > 0 && x < 30)).toBe(true);
    expect([...t].sort((a, b) => a - b)).toEqual(t);
    for (const mid of [5, 15, 25]) expect(t).toContain(mid);
  });
  it('keine Einstellungen: gleichmäßig 8 Zeiten; Dauer 0: leer', () => {
    expect(selectFrameTimes([], 40)).toHaveLength(8);
    expect(selectFrameTimes([], 0)).toEqual([]);
  });
});

describe('defaultModel', () => {
  it('neuestes Flash-Modell nach Versionsnummern, dann alphabetisch', () => {
    expect(defaultModel(['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'])).toBe('gemini-2.5-flash');
    expect(defaultModel(['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-1.5-flash'])).toBe('gemini-2.5-flash');
    expect(defaultModel(['gemini-2.10-flash', 'gemini-2.9-flash'])).toBe('gemini-2.10-flash');
    expect(defaultModel(['models/gemini-3-flash', 'gemini-2.5-flash'])).toBe('models/gemini-3-flash');
  });
  it('ohne Flash-Modell → null', () => {
    expect(defaultModel(['gemini-2.5-pro'])).toBeNull();
    expect(defaultModel([])).toBeNull();
  });
});

describe('buildGeminiPrompt', () => {
  it('enthält Rolle, Briefing, Vorgaben, Haken, Abzüge, Bildliste und die Anweisungen', () => {
    const del = asg.deliverables.find((d) => d.kind === 'video')!;
    const input: EvaluationInput = {
      assignment: asg, submittedAt: t0, research: {}, selfChecks: { hookDone: true }, isCorrection: false,
      videos: { [del.id]: { measurements: perfect as never, facts: { shots: [], hasJOrLCut: false, lowerThirds: 0, transitions: 0, audioCutsWithoutFade: 0, fpsMismatch: false, longestShotSec: 0 }, fileName: 'x.mp4' } },
    };
    const ded = [{ ruleId: 'loudness', category: 'technik' as const, label: 'Lautheit daneben', soll: '−14 LUFS', ist: '−9 LUFS', points: -6, fix: '' }];
    const p = buildGeminiPrompt(asg, input, ded, [{ time: 1.5, shotSize: 'nah', deliverableId: del.id, path: '/x.jpg' }]);
    expect(p).toContain('erfahrener Producer und Ausbilder');
    expect(p).toContain(asg.briefing);
    expect(p).toContain(asg.hook.text);
    expect(p).toContain(String(del.videoSpec!.width));
    expect(p).toContain('Lautheit daneben');
    expect(p).toContain('1,5');
    expect(p).toMatch(/nah/i);
    expect(p).toMatch(/Technik/);
    expect(p).toContain('±10');
    expect(p).toMatch(/Deutsch/i);
  });
});

describe('Gemini im App-Zustand', () => {
  const app = () => useApp.getState();
  const dirFor = (a: Assignment) => `/mock/Medienwerkstatt/${a.id}`;
  let backend: MockBackend;
  let now = t0;
  const clock: Clock = { now: () => now };
  const media: MediaItem = {
    id: 'm1', kind: 'video', durationSec: 60, width: 1920, height: 1080, fps: 25, hasAudio: true, hdr: false,
    videoCodec: 'h264', audioCodec: 'aac', rotation: 0, name: 'a.mp4', path: '/x/a.mp4', proxyPath: null, shotSize: 'totale',
  };
  const clip = (id: string, start: number, duration: number): Clip => ({
    id, trackId: 'V1', kind: 'media', mediaId: 'm1', start, duration, sourceIn: 0, linkId: null, gainDb: 0, fadeIn: 0, fadeOut: 0, color: null, title: null,
  });
  const frames = [{ deliverableId: '', time: 1, shotSize: null, path: '/fixtures/frame.png' }];
  let spies: { [K in 'hasKey' | 'setKey' | 'listModels' | 'generate']: MockInstance<Backend['gemini'][K]> };

  beforeEach(async () => {
    localStorage.clear();
    resetAppForTests();
    resetProjectForTests();
    backend = new MockBackend();
    now = t0;
    await app().init(backend, clock, { installId: 'e2e-film' });
    const a = app().state!.assignments[0];
    const del = a.deliverables.find((d) => d.kind === 'video')!;
    frames[0].deliverableId = del.id;
    const seq = { ...newSequence({ width: 1920, height: 1080, fps: 25, name: 'F' }, () => 's1'), clips: [clip('c1', 0, 125), clip('c2', 125, 125)] };
    const project: Project = {
      version: 1, assignmentId: a.id, media: [media], sequences: [seq], activeSequenceId: 's1',
      exports: [{ deliverableId: del.id, path: `${dirFor(a)}/Export/x_v01.mp4`, fileName: 'x_v01.mp4', presetId: 'social169', version: 1, at: t0, sequenceId: 's1' }],
    };
    await backend.saveProject(dirFor(a), project);
    now = a.deadline - 48 * HOUR;
    spies = {
      hasKey: vi.spyOn(backend.gemini, 'hasKey'),
      setKey: vi.spyOn(backend.gemini, 'setKey'),
      listModels: vi.spyOn(backend.gemini, 'listModels'),
      generate: vi.spyOn(backend.gemini, 'generate'),
    };
  });
  afterEach(() => {
    resetAppForTests();
    resetProjectForTests();
  });
  const enable = async () => {
    await backend.gemini.setKey('test-key');
    app().setGeminiEnabled(true);
    app().setGeminiModel('gemini-2.5-flash');
    spies.setKey.mockClear();
    spies.hasKey.mockClear();
  };
  const submit = (gemini?: Parameters<ReturnType<typeof app>['submit']>[3]) => app().submit(app().state!.assignments[0].id, { hookDone: true }, undefined, gemini);

  it('Gemini aus: generate (und jede andere Gemini-Methode) wird nie aufgerufen, kein Vermerk', async () => {
    await backend.gemini.setKey('test-key');
    spies.setKey.mockClear();
    spies.hasKey.mockClear();
    const e = await submit({ consent: true, frames });
    expect(spies.generate).not.toHaveBeenCalled();
    expect(spies.listModels).not.toHaveBeenCalled();
    expect(spies.hasKey).not.toHaveBeenCalled();
    expect(e.gemini).toBeUndefined();
    expect(e.geminiNote).toBeUndefined();
  });

  it('Gemini an, Standard: ohne Entscheidung keine Anfrage', async () => {
    await enable();
    const e = await submit();
    expect(spies.generate).not.toHaveBeenCalled();
    expect(e.gemini).toBeUndefined();
  });

  it('ohne Einwilligung: nur Regeln mit Vermerk „Ohne Gemini abgegeben“', async () => {
    await enable();
    const e = await submit({ consent: false });
    expect(spies.generate).not.toHaveBeenCalled();
    expect(e.gemini).toBeUndefined();
    expect(e.geminiNote).toBe('Ohne Gemini abgegeben');
  });

  it('Fehler beim Aufruf: Bewertung nur mit Regeln und Vermerk „Gemini nicht erreichbar – nur Regeln“', async () => {
    await enable();
    spies.generate.mockRejectedValue({ code: 'offline', message: 'x' });
    const e = await submit({ consent: true, frames });
    expect(spies.generate).toHaveBeenCalledTimes(1);
    expect(e.gemini).toBeUndefined();
    expect(e.geminiNote).toBe('Gemini nicht erreichbar – nur Regeln');
    expect(app().state!.evaluations).toHaveLength(1);
  });

  it.each([
    ['rate_limited', 'Gemini-Limit erreicht – nur Regeln'],
    ['invalid_key', 'Gemini-Schlüssel ungültig – nur Regeln'],
    ['io', 'Gemini nicht erreichbar – nur Regeln'],
  ])('Fehlercode %s → Vermerk', async (code, note) => {
    await enable();
    spies.generate.mockRejectedValue({ code, message: 'x' });
    expect((await submit({ consent: true, frames })).geminiNote).toBe(note);
  });

  it('unlesbare Antwort → nur Regeln mit Vermerk', async () => {
    await enable();
    spies.generate.mockResolvedValue('kein json');
    const e = await submit({ consent: true, frames });
    expect(e.gemini).toBeUndefined();
    expect(e.geminiNote).toMatch(/nur Regeln/);
  });

  it('gültige Antwort: Gemini-Teil im Protokoll, Summe geklemmt, Prompt und Bilder gehen mit', async () => {
    await enable();
    const rulesOnly = await (async () => {
      const e = await submit({ consent: false });
      return e;
    })();
    // zweiter Lauf als Korrektur mit Gemini
    spies.generate.mockResolvedValue(JSON.stringify(result(crit('licht', 8), crit('briefing', 7))));
    now += HOUR;
    const r = await app().correction(app().state!.assignments[0].id, { hookDone: true }, undefined, { consent: true, frames });
    expect(r.ok).toBe(true);
    const [model, prompt, images, schema] = spies.generate.mock.calls[0];
    expect(model).toBe('gemini-2.5-flash');
    expect(prompt).toContain('Producer');
    expect(images).toEqual(['/fixtures/frame.png']);
    expect(schema).toEqual(GEMINI_SCHEMA);
    if (r.ok) {
      expect(r.evaluation.gemini?.criteria).toHaveLength(2);
      expect(r.evaluation.geminiNote).toBeUndefined();
      expect(r.evaluation.total).toBeLessThanOrEqual(rules.correction.maxScore);
      expect(r.evaluation.categories.technik).toEqual(rulesOnly.categories.technik);
    }
  });

  it('prepareGemini: nur wenn an, Schlüssel und Modell da; extrahiert Bilder aus dem Export', async () => {
    const id = app().state!.assignments[0].id;
    expect(await app().prepareGemini(id)).toBeNull();
    await enable();
    const extract = vi.spyOn(backend, 'extractFrames').mockResolvedValue(Array.from({ length: 8 }, (_, i) => `/fixtures/f${i}.png`));
    const prep = await app().prepareGemini(id);
    expect(extract).toHaveBeenCalledWith(expect.stringContaining('/Export/x_v01.mp4'), expect.any(Array), 768);
    expect(prep?.frames).toHaveLength(8);
    expect(prep!.frames.every((f) => f.deliverableId === frames[0].deliverableId)).toBe(true);
  });

  it('prepareGemini ohne Schlüssel → null (keine Anfrage)', async () => {
    app().setGeminiEnabled(true);
    app().setGeminiModel('gemini-2.5-flash');
    expect(await app().prepareGemini(app().state!.assignments[0].id)).toBeNull();
    expect(spies.generate).not.toHaveBeenCalled();
  });
});
