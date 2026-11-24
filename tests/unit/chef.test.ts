import { describe, expect, it } from 'vitest';
import type { Measurements } from '../../src/backend/types';
import type { Assignment, Deliverable, VideoSpec } from '../../src/domain/assignments/types';
import { applyLate, evaluate } from '../../src/domain/chef/evaluate';
import { fmtDe } from '../../src/domain/chef/format';
import { phraseFor } from '../../src/domain/chef/phrases';
import type { ResearchDoc } from '../../src/domain/chef/research';
import { loadRules } from '../../src/domain/chef/rules';
import type { Deduction, Evaluation, EvaluationInput, ProjectFacts } from '../../src/domain/chef/types';
import black from '../fixtures/measurements/black.json';
import loud from '../fixtures/measurements/loud.json';
import overexposed from '../fixtures/measurements/overexposed.json';
import perfectM from '../fixtures/measurements/perfect.json';
import silent from '../fixtures/measurements/silent.json';

const rules = loadRules();
const H = 3_600_000;
const DEADLINE = Date.UTC(2026, 10, 26, 17, 0, 0);
const M = (x: unknown) => structuredClone(x) as Measurements;

const spec: VideoSpec = {
  aspect: '16:9', width: 1920, height: 1080, fps: 25, durationSec: 60, toleranceSec: 3, loudnessLufs: -14, truePeakMax: -1, codec: 'h264',
  fileName: 'A01_Test_v01_1080p25.mp4', minShots: 4, requiredShotSizes: ['totale', 'detail'], requireJCut: true, requireLowerThird: true,
};
const videoD = (id: string, s: VideoSpec = spec, label = 'Film'): Deliverable => ({ id, kind: 'video', label, videoSpec: s });
const assignment = (over: Partial<Assignment> = {}): Assignment => ({
  id: 'a1', number: 1, issuedAt: DEADLINE - 72 * H, deadline: DEADLINE, expiresAt: DEADLINE + 72 * H, level: 1, type: 'video',
  client: { name: 'Test', branche: 'x' }, occasion: 'x', title: 'x', briefing: 'x',
  hook: { id: 'h', text: 'Ohne gesprochenen Text', verify: 'self' }, deliverables: [videoD('v')], shootingNotes: [], status: 'open', submissions: [], ...over,
});
const goodFacts = (): ProjectFacts => ({
  shots: [0, 1, 2, 3, 4, 5, 6, 7].map(i => ({ start: i * 7.5, end: i * 7.5 + 7.5, mediaId: `m${i}`, shotSize: i === 0 ? 'totale' : i === 1 ? 'detail' : 'nah' })),
  hasJOrLCut: true, lowerThirds: 1, transitions: 3, audioCutsWithoutFade: 0, fpsMismatch: false, longestShotSec: 7.5,
});
const input = (m: unknown, over: Partial<EvaluationInput> = {}, facts: ProjectFacts = goodFacts(), a: Assignment = assignment()): EvaluationInput => ({
  assignment: a, submittedAt: DEADLINE - 1 * H, videos: { v: { measurements: M(m), facts, fileName: 'A01_Test_v02_1080p25.mp4' } }, research: {},
  selfChecks: { hookDone: true }, isCorrection: false, ...over,
});
const all = (e: Evaluation): Deduction[] => [...e.categories.technik.deductions, ...e.categories.gestaltung.deductions, ...e.categories.auftrag.deductions];
const find = (e: Evaluation, id: string): Deduction => {
  const d = all(e).find(x => x.ruleId === id);
  if (!d) throw new Error(`kein Abzug ${id}`);
  return d;
};
const has = (e: Evaluation, id: string) => all(e).some(x => x.ruleId === id);

describe('Format', () => {
  it('deutsch mit Minuszeichen', () => {
    expect(fmtDe(-9, 1)).toBe('−9,0');
    expect(fmtDe(-14, 0)).toBe('−14');
    expect(fmtDe(-0.04, 1)).toBe('0,0');
  });
});

describe('Technik', () => {
  it('perfekte Abgabe: keine Abzüge, 100 Punkte, Bonus allTechPerfect', () => {
    const e = evaluate(input(perfectM), rules);
    expect(all(e)).toEqual([]);
    expect(e.bonus.map(b => b.ruleId)).toEqual(['allTechPerfect']);
    expect(e.total).toBe(100);
  });
  it('zu laut: −9 LUFS bei Ziel −14 → −10 (max)', () => {
    expect(find(evaluate(input(loud), rules), 'loudness')).toMatchObject({ points: -10, soll: '−14 LUFS ±1', ist: '−9,0 LUFS', category: 'technik', tool: { area: 'werkstatt', panel: 'audio' } });
  });
  it('Lautheit: −15,5 → −4, innerhalb Toleranz kein Abzug', () => {
    const m = M(perfectM); m.audio.integratedLufs = -15.5;
    expect(find(evaluate(input(m), rules), 'loudness').points).toBe(-4);
    m.audio.integratedLufs = -14.9;
    expect(has(evaluate(input(m), rules), 'loudness')).toBe(false);
  });
  it('True Peak über −1 dBTP → −5', () => {
    expect(find(evaluate(input(loud), rules), 'truePeak')).toMatchObject({ points: -5, ist: '−0,2 dBTP' });
  });
  it('kein Ton → Lautheit max Abzug, kein Absturz, kein True-Peak-Abzug', () => {
    const e = evaluate(input(silent), rules);
    expect(find(e, 'loudness')).toMatchObject({ ist: 'kein Ton', points: -10 });
    expect(has(e, 'truePeak')).toBe(false);
  });
  it('Clipping → −5', () => {
    const m = M(perfectM); m.audio.clippedSamples = 12;
    expect(find(evaluate(input(m), rules), 'clipping').points).toBe(-5);
  });
  it('Schwarzbild: −3 je Fund', () => {
    const m = M(black); m.video.freeze = [{ start: 40, end: 42 }];
    const e = evaluate(input(m), rules);
    expect(all(e).filter(d => d.ruleId === 'blackOrFreeze').map(d => d.points)).toEqual([-3, -3]);
    expect(evaluate(input(black), rules).categories.technik.points).toBe(37);
  });
  it('Auflösung und Bildrate falsch', () => {
    const m = M(perfectM); m.format.width = 1280; m.format.height = 720; m.format.fps = 30;
    const e = evaluate(input(m), rules);
    expect(find(e, 'resolution')).toMatchObject({ points: -10, soll: '1920×1080', ist: '1280×720' });
    expect(find(e, 'fps').points).toBe(-8);
  });
  it('Auflösungs-Hinweis nennt die passende Export-Vorlage und die Sequenz-Einstellung', () => {
    const m = M(perfectM); m.format.width = 1920; m.format.height = 1080;
    const square: VideoSpec = { ...spec, aspect: '1:1', width: 1080, height: 1080 };
    const e = evaluate(input(m, {}, goodFacts(), assignment({ deliverables: [videoD('v', square)] })), rules);
    expect(find(e, 'resolution').fix).toBe('Wähle im Export die Vorlage „Social 1:1 (1080×1080, H.264, 12 Mbit/s)“ bzw. stelle die Sequenz (Inspektor → Reiter „Sequenz“) auf 1080×1080 (1:1).');
    const uhd: VideoSpec = { ...spec, width: 3840, height: 2160 };
    const e2 = evaluate(input(m, {}, goodFacts(), assignment({ deliverables: [videoD('v', uhd)] })), rules);
    expect(find(e2, 'resolution').fix).toContain('Vorlage „UHD 4K (H.264');
  });
  it('alle Technik-Hinweise zeigen auf vorhandene Bedienelemente', () => {
    const m = M(loud); m.format.width = 1280; m.format.fps = 30; m.audio.clippedSamples = 3; m.format.videoCodec = 'prores';
    const e = evaluate(input(m, {}, { ...goodFacts(), fpsMismatch: true }), rules);
    const hints = e.categories.technik.deductions.map((d) => `${d.ruleId}: ${d.fix}`);
    for (const h of hints) {
      expect(h).not.toMatch(/Ton-Inspektor|Master-Pegel|Wandle|umwandeln|Codec .* im Export/);
    }
    expect(find(e, 'loudness').fix).toContain('„Pegel (Gain)“');
    expect(find(e, 'loudness').fix).toContain('Reiter „Clip“');
    expect(find(e, 'truePeak').fix).toContain('„Sicherheits-Limiter (−2 dBFS)“');
    expect(find(e, 'clipping').fix).toContain('„Pegel (Gain)“');
    expect(find(e, 'mixedFps').fix).toContain('Drehe am Handy mit 25 fps');
    expect(find(e, 'fps').fix).toContain('Reiter „Sequenz“');
    expect(find(e, 'codecOrFileName').fix).toContain('Vorlage „Social 16:9');
  });
  it('Bildraten gemischt → −4', () => {
    expect(find(evaluate(input(perfectM, {}, { ...goodFacts(), fpsMismatch: true }), rules), 'mixedFps').points).toBe(-4);
  });
  it('Länge: Toleranz, −2 je angefangene Sekunde, max −10', () => {
    const m = M(perfectM);
    m.format.durationSec = 63; expect(has(evaluate(input(m), rules), 'length')).toBe(false);
    m.format.durationSec = 64.2; expect(find(evaluate(input(m), rules), 'length').points).toBe(-4);
    m.format.durationSec = 90; expect(find(evaluate(input(m), rules), 'length').points).toBe(-10);
  });
  it('Codec oder Dateiname, Version egal', () => {
    const m = M(perfectM); m.format.videoCodec = 'prores';
    expect(find(evaluate(input(m), rules), 'codecOrFileName').points).toBe(-2);
    const i = input(perfectM); i.videos.v!.fileName = 'film_final.mp4';
    expect(find(evaluate(i, rules), 'codecOrFileName').points).toBe(-2);
    const j = input(perfectM); j.videos.v!.fileName = 'A01_Test_v123_1080p25.mp4';
    expect(has(evaluate(j, rules), 'codecOrFileName')).toBe(false);
  });
});

describe('Gestaltung', () => {
  it('überbelichtet: −3 je Einstellung, max −9', () => {
    const e = evaluate(input(overexposed), rules);
    expect(find(e, 'overexposed')).toMatchObject({ points: -6, category: 'gestaltung' });
    const m = M(overexposed); m.video.segments.forEach(s => (s.highlightsPct = 9));
    expect(find(evaluate(input(m), rules), 'overexposed').points).toBe(-9);
  });
  it('unterbelichtet analog', () => {
    const m = M(perfectM); m.video.segments[0].shadowsPct = 20;
    expect(find(evaluate(input(m), rules), 'underexposed').points).toBe(-3);
  });
  it('Einstellungslänge außerhalb → −2 je, max −8', () => {
    const f = goodFacts();
    f.shots[0] = { ...f.shots[0], start: 0, end: 0.3 };
    f.shots[1] = { ...f.shots[1], start: 1, end: 13 };
    expect(find(evaluate(input(perfectM, {}, f), rules), 'shotLength').points).toBe(-4);
    const g = goodFacts(); g.shots.forEach(s => (s.end = s.start + 0.1));
    expect(find(evaluate(input(perfectM, {}, g), rules), 'shotLength').points).toBe(-8);
  });
  it('Haken longShot8s: lange Einstellung erlaubt, sonst Pflicht', () => {
    const a = assignment({ hook: { id: 'h', text: 'Eine Einstellung ≥ 8 s', verify: 'auto', autoRule: 'longShot8s' } });
    const f = goodFacts(); f.shots[2] = { ...f.shots[2], start: 20, end: 33 }; f.longestShotSec = 13;
    const e = evaluate(input(perfectM, {}, f, a), rules);
    expect(has(e, 'shotLength')).toBe(false);
    expect(has(e, 'hookNotMet')).toBe(false);
    const e2 = evaluate(input(perfectM, {}, goodFacts(), a), rules);
    expect(find(e2, 'hookNotMet').points).toBe(-8);
  });
  it('Pflicht-Einstellungsgröße fehlt → −4 je', () => {
    const f = goodFacts(); f.shots.forEach(s => (s.shotSize = 'nah'));
    const e = evaluate(input(perfectM, {}, f), rules);
    expect(all(e).filter(d => d.ruleId === 'missingShotSize').map(d => d.points)).toEqual([-4, -4]);
  });
  it('Farbsprung → −2 je, max −6', () => {
    const m = M(perfectM); m.video.segments[2].meanLuma = 0.7;
    expect(find(evaluate(input(m), rules), 'colorJump').points).toBe(-4);
    const n = M(perfectM); n.video.segments[1].meanU = 0.1;
    expect(find(evaluate(input(n), rules), 'colorJump').points).toBe(-4);
    const o = M(perfectM); o.video.segments.forEach((s, i) => (s.meanLuma = i % 2 ? 0.8 : 0.2));
    expect(find(evaluate(input(o), rules), 'colorJump').points).toBe(-6);
  });
  it('Tonschnitt ohne Blende → −1 je, max −5', () => {
    expect(find(evaluate(input(perfectM, {}, { ...goodFacts(), audioCutsWithoutFade: 3 }), rules), 'audioCutNoFade').points).toBe(-3);
    expect(find(evaluate(input(perfectM, {}, { ...goodFacts(), audioCutsWithoutFade: 9 }), rules), 'audioCutNoFade').points).toBe(-5);
  });
});

describe('Auftrag', () => {
  it('Abgabe fehlt → −15', () => {
    const e = evaluate(input(perfectM, { videos: { v: null } }), rules);
    expect(find(e, 'missingDeliverable').points).toBe(-15);
    expect(e.bonus.map(b => b.ruleId)).not.toContain('allTechPerfect');
  });
  it('Pflicht-Elemente fehlen → −5 je', () => {
    const f = { ...goodFacts(), hasJOrLCut: false, lowerThirds: 0 };
    f.shots = f.shots.slice(0, 2);
    expect(all(evaluate(input(perfectM, {}, f), rules)).filter(d => d.ruleId === 'missingElement').map(d => d.points)).toEqual([-5, -5, -5]);
  });
  it('Haken (selbst bestätigt) nicht gesetzt → −8', () => {
    expect(find(evaluate(input(perfectM, { selfChecks: { hookDone: false } }), rules), 'hookNotMet').points).toBe(-8);
  });
  it('bothFormats: zweites Video fehlt, mehrere Videos bekommen Präfix', () => {
    const spec2 = { ...spec, aspect: '9:16' as const, width: 1080, height: 1920, fileName: 'A01_Test_9x16_v01_1080p25.mp4' };
    const a = assignment({ hook: { id: 'h', text: 'beide', verify: 'auto', autoRule: 'bothFormats' }, deliverables: [videoD('v', spec, 'Querformat'), videoD('w', spec2, 'Hochformat')] });
    const e = evaluate(input(perfectM, {}, goodFacts(), a), rules);
    expect(find(e, 'missingDeliverable').label).toContain('Hochformat');
    const m = M(loud);
    const i = input(perfectM, {}, goodFacts(), a);
    i.videos.w = { measurements: m, facts: goodFacts(), fileName: 'A01_Test_9x16_v01_1080p25.mp4' };
    m.format.width = 1080; m.format.height = 1920;
    const e2 = evaluate(i, rules);
    expect(find(e2, 'loudness').label).toBe('Hochformat: Ton zu laut');
  });
  it('einziger Film fehlt: Technik und Gestaltung 0, höchstens 10 Punkte', () => {
    const e = evaluate(input(perfectM, { videos: { v: null } }), rules);
    expect(e.categories.technik).toMatchObject({ points: 0, deductions: [{ ruleId: 'noVideoTechnik', points: -40, label: 'Kein Film abgegeben', ist: 'fehlt' }] });
    expect(e.categories.gestaltung).toMatchObject({ points: 0, deductions: [{ ruleId: 'noVideoGestaltung', points: -35 }] });
    expect(e.total).toBeLessThanOrEqual(10);
  });
  it('bothFormats, ein Film fehlt: vorhandener wird bewertet, −15 Auftrag, kein allTechPerfect', () => {
    const spec2 = { ...spec, aspect: '9:16' as const, width: 1080, height: 1920 };
    const a = assignment({ hook: { id: 'h', text: 'beide', verify: 'auto', autoRule: 'bothFormats' }, deliverables: [videoD('v', spec, 'Querformat'), videoD('w', spec2, 'Hochformat')] });
    const e = evaluate(input(perfectM, {}, goodFacts(), a), rules);
    expect(e.categories.technik.points).toBe(40);
    expect(e.categories.auftrag.points).toBe(10);
    expect(e.bonus.map(b => b.ruleId)).not.toContain('allTechPerfect');
  });
  const researchA = () => assignment({ type: 'research', deliverables: [{ id: 'r', kind: 'research', label: 'Exposé', researchTemplate: 'expose' }] });
  const researchIn = (doc: ResearchDoc | null, a = researchA()): EvaluationInput => ({ ...input(perfectM, {}, goodFacts(), a), videos: {}, research: { r: doc } });
  const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');
  const goodDoc = (): ResearchDoc => ({ templateId: 'expose', fields: { arbeitstitel: 'T', logline: words(20), zielgruppe: 'Z', inhalt: words(120), gestaltung: words(60), laenge: '90 s' }, sources: ['https://a.de/x', 'https://b.de/y'] });
  it('Recherche-only: perfekt → 100, Technik/Gestaltung nicht anwendbar', () => {
    const e = evaluate(researchIn(goodDoc()), rules);
    expect(e.categories.technik).toEqual({ max: 0, points: 0, deductions: [] });
    expect(e.categories.gestaltung).toEqual({ max: 0, points: 0, deductions: [] });
    expect(e.categories.auftrag.max).toBe(100);
    expect(e.total).toBe(100);
  });
  it('Recherche-only: ein leeres Pflichtfeld → 88', () => {
    const d = goodDoc(); d.fields.zielgruppe = '';
    expect(evaluate(researchIn(d), rules).total).toBe(88);
  });
  it('Recherche-only: Abgabe fehlt → 0', () => {
    expect(evaluate(researchIn(null), rules).total).toBe(0);
  });
  it('Kombi: Recherche-Regel bleibt −3', () => {
    const a = assignment({ type: 'kombi', deliverables: [videoD('v'), { id: 'r', kind: 'research', label: 'Exposé', researchTemplate: 'expose' }] });
    const d = goodDoc(); d.fields.zielgruppe = '';
    const e = evaluate({ ...input(perfectM, {}, goodFacts(), a), research: { r: d } }, rules);
    expect(find(e, 'researchEmptyField').points).toBe(-3);
  });
});

describe('Gesamt', () => {
  it('perfekte Abgabe 24 h vor Frist → 100 inkl. Bonus gedeckelt', () => {
    const e = evaluate(input(perfectM, { submittedAt: DEADLINE - 24 * H }), rules);
    expect(e.bonus.map(b => b.points)).toEqual([3, 2]);
    expect(e.total).toBe(100);
  });
  it('Bonus gleicht Abzüge aus, Deckel 100', () => {
    const m = M(perfectM); m.audio.clippedSamples = 1;
    expect(evaluate(input(m, { submittedAt: DEADLINE - 30 * H }), rules).total).toBe(98);
  });
  it('2 Tage zu spät → −20', () => {
    const e = evaluate(input(perfectM, { submittedAt: DEADLINE + 36 * H }), rules);
    expect(e.late).toMatchObject({ points: -20, category: 'frist' });
    expect(e.total).toBe(80);
  });
  it('Verspätung höchstens 3 Tage, Gesamt nie unter 0', () => {
    expect(applyLate(assignment(), DEADLINE + 10 * 24 * H, rules)?.points).toBe(-30);
    expect(applyLate(assignment(), DEADLINE, rules)).toBeNull();
    expect(applyLate(assignment(), DEADLINE + 1, rules)?.points).toBe(-10);
    const harsh = { ...rules, frist: { ...rules.frist, perDay: -100 } };
    expect(evaluate(input(perfectM, { submittedAt: DEADLINE + 5 * 24 * H }), harsh).total).toBe(0);
  });
  it('Korrektur höchstens 90', () => {
    expect(evaluate(input(perfectM, { isCorrection: true }), rules).total).toBe(90);
  });
  it('Kategorie wird nie negativ', () => {
    const m = M(loud);
    m.format.width = 640; m.format.height = 360; m.format.fps = 30; m.format.videoCodec = 'prores'; m.format.durationSec = 120; m.audio.clippedSamples = 5;
    m.video.black = [{ start: 1, end: 2 }, { start: 3, end: 4 }];
    const e = evaluate(input(m, {}, { ...goodFacts(), fpsMismatch: true }), rules);
    expect(e.categories.technik.points).toBe(0);
    expect(e.categories.technik.deductions.reduce((s, d) => s + d.points, 0)).toBeLessThan(-40);
  });
  it('id und Zeitpunkt', () => {
    const e = evaluate(input(perfectM), rules);
    expect(e).toMatchObject({ id: `a1:${DEADLINE - H}`, assignmentId: 'a1', at: DEADLINE - H });
  });
  it('jeder Abzug hat einen Hinweis', () => {
    const e = evaluate(input(loud, { selfChecks: { hookDone: false } }, { ...goodFacts(), audioCutsWithoutFade: 2, fpsMismatch: true }), rules);
    for (const d of all(e)) expect(d.fix.length).toBeGreaterThan(10);
  });
});

describe('Satz des Chefs', () => {
  it('Tonlage nach Punkten und zwei größte Abzüge', () => {
    const e = evaluate(input(loud), rules);
    expect(e.phrase).toBe('Kann so zum Kunden. Ton zu laut (−9,0 LUFS statt −14). True Peak zu hoch (−0,2 dBTP statt ≤ −1 dBTP).');
    expect(phraseFor({ ...e, total: 65 }, rules).startsWith('Brauchbar, aber da geht mehr.')).toBe(true);
    expect(phraseFor({ ...e, total: 30 }, rules).startsWith('So geht das nicht raus.')).toBe(true);
  });
  it('ohne Abzüge nur der Grundsatz', () => {
    expect(evaluate(input(perfectM), rules).phrase).toBe('Kann so zum Kunden.');
  });
});
