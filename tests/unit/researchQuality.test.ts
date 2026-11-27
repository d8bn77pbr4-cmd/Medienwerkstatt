import { describe, expect, it } from 'vitest';
import { AVAILABLE_TYPES, generateAssignment, loadCatalogs } from '../../src/domain/assignments/generator';
import { assignmentKeywords, keywordStem } from '../../src/domain/assignments/keywords';
import type { Assignment, Deliverable } from '../../src/domain/assignments/types';
import { evaluate, SOURCE_NOTE_OFFLINE } from '../../src/domain/chef/evaluate';
import { GIBBERISH_PHRASE } from '../../src/domain/chef/phrases';
import type { ResearchDoc } from '../../src/domain/chef/research';
import { loadRules } from '../../src/domain/chef/rules';
import { isGibberish } from '../../src/domain/chef/textQuality';
import type { Deduction, Evaluation, EvaluationInput, ProjectFacts } from '../../src/domain/chef/types';
import { applyGemini } from '../../src/domain/gemini/apply';
import type { Measurements } from '../../src/backend/types';
import perfectM from '../fixtures/measurements/perfect.json';
import exposeFixture from '../fixtures/research/expose-schreinerei.json';

const rules = loadRules();
const H = 3_600_000;
const DEADLINE = Date.UTC(2026, 10, 26, 17, 0, 0);
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

const researchD: Deliverable = { id: 'r', kind: 'research', label: 'Exposé', researchTemplate: 'expose' };
const videoD: Deliverable = {
  id: 'v', kind: 'video', label: 'Film',
  videoSpec: { aspect: '16:9', width: 1920, height: 1080, fps: 25, durationSec: 60, toleranceSec: 3, loudnessLufs: -14, truePeakMax: -1, codec: 'h264', fileName: 'A01_Test_v01_1080p25.mp4', minShots: 4, requiredShotSizes: ['totale', 'detail'], requireJCut: true, requireLowerThird: true },
};
/** Recherche-Auftrag wie vom Generator: Exposé für die Schreinerei zum Jubiläum. */
const assignment = (over: Partial<Assignment> = {}): Assignment => ({
  id: 'A01', number: 1, issuedAt: DEADLINE - 72 * H, deadline: DEADLINE, expiresAt: DEADLINE + 72 * H, level: 1, type: 'research',
  client: { name: 'Schreinerei Holzwerk Brandt', branche: 'Handwerk' }, occasion: 'Recherche: Exposé', title: 'Exposé für Schreinerei Holzwerk Brandt',
  briefing: 'Schreinerei Holzwerk Brandt (Handwerk) braucht von dir ein Exposé. Es geht um einen Film zu einem anstehenden Jubiläum. Besonderheit: Ohne Musik.',
  hook: { id: 'h', text: 'Ohne Musik', verify: 'self' }, deliverables: [researchD], shootingNotes: [], status: 'open', submissions: [], ...over,
});
const goodFacts = (): ProjectFacts => ({
  shots: [0, 1, 2, 3, 4, 5, 6, 7].map(i => ({ start: i * 7.5, end: i * 7.5 + 7.5, mediaId: `m${i}`, shotSize: i === 0 ? 'totale' : i === 1 ? 'detail' : 'nah' })),
  hasJOrLCut: true, lowerThirds: 1, transitions: 3, audioCutsWithoutFade: 0, fpsMismatch: false, longestShotSec: 7.5,
});
const input = (doc: ResearchDoc | null, over: Partial<EvaluationInput> = {}, a: Assignment = assignment()): EvaluationInput => ({
  assignment: a, submittedAt: DEADLINE - 1 * H, videos: {}, research: { r: doc }, selfChecks: { hookDone: true }, isCorrection: false, ...over,
});
const kombi = (): Assignment => assignment({ type: 'kombi', occasion: 'Website: Imagefilm', title: 'Imagefilm – Schreinerei Holzwerk Brandt', deliverables: [videoD, researchD] });
const kombiInput = (doc: ResearchDoc, over: Partial<EvaluationInput> = {}): EvaluationInput =>
  input(doc, { videos: { v: { measurements: clone(perfectM) as Measurements, facts: goodFacts(), fileName: 'A01_Test_v02_1080p25.mp4' } }, ...over }, kombi());
const ded = (e: Evaluation): Deduction[] => [...e.categories.technik.deductions, ...e.categories.gestaltung.deductions, ...e.categories.auftrag.deductions];
const ruleIds = (e: Evaluation) => ded(e).map(d => d.ruleId);

/** Tastatursalat wie beim Nutzer: zufällige Buchstaben in Wortlänge, deterministisch. */
function mash(words: number, seed: number): string {
  const keys = 'asdfghjklöqwertzuiopyxcvbnm';
  let x = seed;
  const next = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
  return Array.from({ length: words }, () => Array.from({ length: 3 + Math.floor(next() * 6) }, () => keys[Math.floor(next() * keys.length)]).join('')).join(' ');
}
/** Alle sechs Felder Tastatursalat, lang genug für die Wortgrenzen; zwei gültige Links. */
const mashExpose = (): ResearchDoc => ({
  templateId: 'expose',
  fields: { arbeitstitel: 'asdf jklö', logline: mash(20, 1), zielgruppe: 'fjdks ghfjd', inhalt: mash(120, 2), gestaltung: mash(60, 3), laenge: 'hgfd' },
  sources: ['https://de.wikipedia.org/wiki/Tischler', 'https://www.handwerk.de/berufe/tischler'],
});
const good = (): ResearchDoc => clone(exposeFixture) as ResearchDoc;
const allOk = (doc: ResearchDoc) => Object.fromEntries(doc.sources.map(s => [s, 'ok' as const]));

describe('Abnahme 3a: Recherche ehrlich bewerten', () => {
  it('Nutzerfall: Exposé aus Tastatursalat mit zwei gültigen Links → höchstens 15 Punkte, Abzüge und Chef-Satz sichtbar', () => {
    const doc = mashExpose();
    for (const [k, t] of Object.entries(doc.fields)) expect(isGibberish(t), k).toBe(true);
    const e = evaluate(input(doc, { sourceCheck: allOk(doc) }), rules);
    expect(e.total).toBeLessThanOrEqual(15);
    expect(e.total).toBe(15);
    const gib = ded(e).filter(d => d.ruleId === 'researchGibberish');
    expect(gib).toHaveLength(6);
    expect(gib.map(d => d.points)).toEqual(Array(6).fill(rules.deductions.researchOnly.emptyField));
    expect(gib[1].label).toBe('Exposé: Pflichtfeld „Logline“ ist kein verständlicher Text');
    const cap = ded(e).find(d => d.ruleId === 'researchGibberishCap');
    expect(cap).toMatchObject({ label: 'Exposé: Recherche auf höchstens 15 Punkte gedeckelt', ist: '6 von 6 Pflichtfeldern unverständlich', points: -13 });
    expect(e.phrase.startsWith(GIBBERISH_PHRASE)).toBe(true);
    expect(e.capTotal).toBe(15);
  });
  it('Nutzerfall früh abgegeben: kein Frühbonus für Tastatursalat, bleibt bei 15', () => {
    const e = evaluate(input(mashExpose(), { submittedAt: DEADLINE - 30 * H }), rules);
    expect(e.bonus).toEqual([]);
    expect(e.total).toBe(15);
  });
  it('echtes Exposé mit zwei verschiedenen, erreichbaren Quellen → ≥ 85, kein Abzug der neuen Regeln', () => {
    const doc = good();
    const e = evaluate(input(doc, { sourceCheck: allOk(doc) }), rules);
    expect(ded(e)).toEqual([]);
    expect(e.total).toBeGreaterThanOrEqual(85);
    expect(e.total).toBe(100);
    expect(e.phrase).toBe('Kann so zum Kunden.');
  });
  it('example.com + example.com/2 → zu wenige Quellen und Platzhalter-Abzüge', () => {
    const doc = good();
    doc.sources = ['https://example.com', 'https://example.com/2'];
    const e = evaluate(input(doc), rules);
    const ro = rules.deductions.researchOnly;
    const q = rules.researchQuality.researchOnly;
    expect(ded(e).map(d => [d.ruleId, d.points])).toEqual([
      ['researchSources', ro.tooFewSources],
      ['researchPlaceholderSource', q.placeholderSource],
      ['researchPlaceholderSource', q.placeholderSource],
    ]);
    expect(e.total).toBe(100 + ro.tooFewSources + 2 * q.placeholderSource);
  });
  it('offline: true → kein Link-Abzug, neutraler Hinweis im Protokoll', () => {
    const doc = good();
    const unreachable = Object.fromEntries(doc.sources.map(s => [s, 'unreachable' as const]));
    const e = evaluate(input(doc, { sourceCheck: { ...unreachable, [doc.sources[0]]: 'notFound' }, sourcesOffline: true }), rules);
    expect(ded(e)).toEqual([]);
    expect(e.total).toBe(100);
    expect(e.sourceNote).toBe(SOURCE_NOTE_OFFLINE);
  });
  it('online: 404 und „nicht erreichbar“ (wenn ein anderer Link ging) kosten Punkte', () => {
    const doc = good();
    doc.sources = [...doc.sources, 'https://www.zdf.de/weg'];
    const e = evaluate(input(doc, { sourceCheck: { [doc.sources[0]]: 'ok', [doc.sources[1]]: 'notFound', [doc.sources[2]]: 'unreachable' } }), rules);
    const q = rules.researchQuality.researchOnly;
    expect(ded(e).map(d => [d.ruleId, d.points])).toEqual([['researchSourceNotFound', q.sourceNotFound], ['researchSourceUnreachable', q.sourceUnreachable]]);
    expect(e.sourceNote).toBeUndefined();
  });
});

describe('Deckel bei Unsinn', () => {
  it('genau die Hälfte der Pflichtfelder Unsinn: Deckel greift; weniger als die Hälfte: nicht', () => {
    const half = good();
    half.fields.arbeitstitel = 'asdf';
    half.fields.zielgruppe = 'qwertz';
    half.fields.laenge = 'xxx';
    const e = evaluate(input(half), rules);
    expect(ruleIds(e)).toContain('researchGibberishCap');
    expect(e.total).toBe(15);
    const two = good();
    two.fields.arbeitstitel = 'asdf';
    two.fields.laenge = 'xxx';
    const f = evaluate(input(two), rules);
    expect(ruleIds(f)).not.toContain('researchGibberishCap');
    expect(f.total).toBe(100 + 2 * rules.deductions.researchOnly.emptyField);
  });
  it('schon unter dem Deckel: Zeile bleibt im Protokoll (0 Punkte), Gesamt unverändert', () => {
    const doc = mashExpose();
    doc.sources = [];
    const e = evaluate(input(doc), rules);
    const cap = ded(e).find(d => d.ruleId === 'researchGibberishCap');
    expect(cap?.points).toBe(0);
    const ro = rules.deductions.researchOnly;
    expect(e.total).toBe(100 + 6 * ro.emptyField + ro.tooFewSources);
    expect(e.phrase.startsWith(GIBBERISH_PHRASE)).toBe(true);
  });
  it('Gemini hebt den Deckel nicht auf', () => {
    const e = evaluate(input(mashExpose()), rules);
    const g = applyGemini(e, { criteria: [{ key: 'briefing', verdict: 'v', reason: 'r', shift: 10 }], summary: 's' }, rules);
    expect(g.total).toBe(15);
  });
  it('Kombi: Recherche-Anteil fällt auf 0 (kostet so viel wie eine fehlende Abgabe), Film bleibt unberührt', () => {
    const doc = good();
    doc.fields.arbeitstitel = 'asdf';
    doc.fields.zielgruppe = 'qwertz';
    doc.fields.laenge = 'xxx';
    const e = evaluate(kombiInput(doc), rules);
    const research = e.categories.auftrag.deductions.filter(d => d.label.startsWith('Exposé:'));
    expect(research.map(d => d.ruleId)).toEqual(['researchGibberish', 'researchGibberish', 'researchGibberish', 'researchGibberishCap']);
    expect(research.reduce((s, d) => s + d.points, 0)).toBe(rules.deductions.auftrag.missingDeliverable);
    expect(research[3]).toMatchObject({ label: 'Exposé: Recherche zählt nicht', points: -6 });
    expect(e.categories.technik.points).toBe(40);
    expect(e.capTotal).toBeUndefined();
    expect(e.phrase.startsWith(GIBBERISH_PHRASE)).toBe(true);
  });
  it('Kombi mit echter Recherche: keine neuen Abzüge (Kombi-Abgaben bleiben wie bisher)', () => {
    const doc = good();
    const e = evaluate(kombiInput(doc, { sourceCheck: allOk(doc) }), rules);
    expect(e.categories.auftrag.deductions).toEqual([]);
    expect(e.total).toBe(100);
  });
  it('Kombi: Punkte der Textprüfung sind die kleinen Kombi-Werte', () => {
    const doc = good();
    doc.sources = ['https://example.com', 'https://www.handwerk.de/a'];
    const e = evaluate(kombiInput(doc), rules);
    expect(e.categories.auftrag.deductions.map(d => [d.ruleId, d.points])).toEqual([
      ['researchSources', rules.deductions.auftrag.researchTooFewSources],
      ['researchPlaceholderSource', rules.researchQuality.kombi.placeholderSource],
    ]);
  });
});

describe('Schlagwörter aus dem Auftrag', () => {
  it('Kundenname, Branche, Nomen aus Anlass, Titel und Thema; ohne Stoppwörter und kurze Wörter', () => {
    expect(assignmentKeywords(assignment())).toEqual(['schreinerei', 'holzwerk', 'brandt', 'handwerk', 'jubiläum']);
    const k = assignmentKeywords({
      client: { name: 'Bäckerei Korn & Kruste', branche: 'Bäckerei' },
      occasion: 'Instagram-Reel: Eröffnungs-Reel',
      title: 'Eröffnungs-Reel – Bäckerei Korn & Kruste',
      briefing: 'Bäckerei Korn & Kruste (Bäckerei) braucht einen Reel zur Neueröffnung.',
    });
    expect(k).toEqual(['bäckerei', 'korn', 'krust', 'instagram', 'reel', 'eröffnung']);
    expect(assignmentKeywords({ client: { name: 'Kistenkraft', branche: 'Start-up für Lagersoftware' }, occasion: 'Recherche: Drehplan', title: 'Drehplan für Kistenkraft', briefing: '' })).toEqual(['kistenkraft', 'start', 'lagersoftwar']);
  });
  it('Stämme: eine Endung ab, mindestens vier Buchstaben bleiben', () => {
    expect(keywordStem('Kruste')).toBe('krust');
    expect(keywordStem('Korn')).toBe('korn');
    expect(keywordStem('Eröffnungs')).toBe('eröffnung');
    expect(keywordStem('Jubiläum')).toBe('jubiläum');
  });
  it('jeder generierte Recherche-Auftrag hat Schlagwörter, darunter der Kunde', () => {
    const catalogs = loadCatalogs();
    for (let n = 1; n <= 40; n++) {
      const a = generateAssignment('kw', n, DEADLINE, 2, AVAILABLE_TYPES, catalogs, rules);
      const k = assignmentKeywords(a);
      expect(k.length, a.title).toBeGreaterThan(0);
      expect(k.some(w => a.client.name.toLowerCase().includes(w)), a.title).toBe(true);
    }
  });
});
