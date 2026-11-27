import { describe, expect, it } from 'vitest';
import { CatalogsSchema, MIN_THEMEN } from '../../src/domain/assignments/catalogs';
import { AVAILABLE_TYPES, drawWorld, generateAssignment, loadCatalogs } from '../../src/domain/assignments/generator';
import { isValidState } from '../../src/backend/schema';
import { fileNameFor, projectFolderFor } from '../../src/domain/assignments/naming';
import type { Assignment, ThemaKategorie, WorldId } from '../../src/domain/assignments/types';
import { loadRules, RulesSchema, type Level } from '../../src/domain/chef/rules';
import rulesJson from '../../rules.json';

const catalogs = loadCatalogs();
const rules = loadRules();
const NOW = 1_700_000_000_000;
const KATEGORIEN = Object.keys(MIN_THEMEN) as ThemaKategorie[];

/** Folge von Aufträgen mit Verlauf wie in der App. */
function series(install: string, count: number, level: Level = 2, from = 1, r = rules): Assignment[] {
  const list: Assignment[] = [];
  for (let n = from; n < from + count; n++) list.push(generateAssignment(install, n, NOW, level, AVAILABLE_TYPES, catalogs, r, list));
  return list;
}
const worldOf = (a: Assignment): WorldId => a.topic?.kategorie ?? 'betrieb';
/** Sätze: Punkte nach Ziffern („9. November“) enden keinen Satz. */
const sentences = (t: string) => t.split(/(?<=[^0-9][.!?])\s+/).filter(Boolean);

describe('Themenkatalog', () => {
  it('mindestens 60 Themen, je Kategorie die Mindestzahl, IDs eindeutig', () => {
    expect(catalogs.themen.length).toBeGreaterThanOrEqual(60);
    for (const k of KATEGORIEN) expect(catalogs.themen.filter(t => t.kategorie === k).length, k).toBeGreaterThanOrEqual(MIN_THEMEN[k]);
    expect(new Set(catalogs.themen.map(t => t.id)).size).toBe(catalogs.themen.length);
    expect(new Set(catalogs.themen.map(t => t.titel)).size).toBe(catalogs.themen.length);
  });
  it('jedes Thema: 2–3 Sätze Hintergrund, 3 Leitfragen, 4–8 Schlagwörter, 2–3 Quellenarten', () => {
    for (const t of catalogs.themen) {
      const n = sentences(t.hintergrund).length;
      expect(n, t.id).toBeGreaterThanOrEqual(2);
      expect(n, t.id).toBeLessThanOrEqual(3);
      expect(t.leitfragen, t.id).toHaveLength(3);
      for (const q of t.leitfragen) expect(q.endsWith('?'), `${t.id}: ${q}`).toBe(true);
      expect(t.schlagwoerter.length, t.id).toBeGreaterThanOrEqual(4);
      expect(t.schlagwoerter.length, t.id).toBeLessThanOrEqual(8);
      expect(t.einstieg.length, t.id).toBeGreaterThanOrEqual(2);
      expect(t.einstieg.length, t.id).toBeLessThanOrEqual(3);
    }
  });
  it('Titel ohne Punkt (das Briefing zitiert ihn), keine Links, keine Prozentangaben', () => {
    for (const t of catalogs.themen) {
      expect(t.titel, t.id).not.toContain('.');
      const all = [t.titel, t.hintergrund, ...t.leitfragen, ...t.einstieg].join(' ');
      expect(all, t.id).not.toMatch(/https?:|www\.|%/);
    }
  });
  it('Themen, deren Stand sich ändert, verweisen auf die aktuelle Recherche', () => {
    for (const id of ['ges-wehrdienst', 'ges-mieten', 'ges-tempolimit', 'ges-organspende', 'ges-cannabis', 'ges-ki-kennzeichnung']) {
      expect(catalogs.themen.find(t => t.id === id)!.hintergrund, id).toContain('Recherchiere den aktuellen Stand');
    }
    for (const t of catalogs.themen.filter(x => x.kategorie === 'gesellschaft')) expect(t.hintergrund, t.id).toContain('Recherchiere den aktuellen Stand');
  });
  it('Beispiele aus den Vorgaben sind enthalten', () => {
    const titel = catalogs.themen.map(t => t.titel.toLowerCase()).join(' | ');
    for (const w of ['ki-kennzeichnung', 'handyverbot', 'vier-tage-woche', 'wehrdienst', 'mieten', 'tempolimit', 'organspende', 'wahlalter', 'mauerfall', 'wirtschaftswunder', 'anwerbeabkommen', 'buchdruck', 'frauenwahlrecht', 'mondlandung', 'fernsehen', 'wärmepumpe', 'mikroplastik', 'inflation', 'schlaf', 'impfungen', 'blockchain', 'polarlichter', 'bienensterben', 'deepfakes', 'memes', 'streaming', 'barrierefreiheit', 'speedcubing', 'urban gardening', 'e-sport', 'imkerei', 'vinyl', 'bouldern', 'lebensmittel retten']) {
      expect(titel, w).toContain(w);
    }
  });
  it('Schema lehnt zu wenige Themen, doppelte IDs und kaputte Einträge ab', () => {
    const raw = { kunden: catalogs.kunden, kanaele: catalogs.kanaele, anlaesse: catalogs.anlaesse, haken: catalogs.haken, recherche: catalogs.recherche, themen: catalogs.themen };
    expect(CatalogsSchema.safeParse(raw).success).toBe(true);
    expect(CatalogsSchema.safeParse({ ...raw, themen: catalogs.themen.filter(t => t.kategorie !== 'medien') }).success).toBe(false);
    expect(CatalogsSchema.safeParse({ ...raw, themen: [...catalogs.themen, catalogs.themen[0]] }).success).toBe(false);
    expect(CatalogsSchema.safeParse({ ...raw, themen: catalogs.themen.map((t, i) => (i === 0 ? { ...t, leitfragen: t.leitfragen.slice(0, 2) } : t)) }).success).toBe(false);
    expect(CatalogsSchema.safeParse({ ...raw, themen: catalogs.themen.map((t, i) => (i === 0 ? { ...t, kategorie: 'sport' } : t)) }).success).toBe(false);
  });
});

describe('Kunden-Steckbrief', () => {
  it('jeder Kunde hat einen vollständigen Steckbrief', () => {
    for (const k of catalogs.kunden) {
      const p = k.profile;
      expect(p.gegruendet, k.name).toBeGreaterThanOrEqual(1800);
      expect(p.gegruendet, k.name).toBeLessThanOrEqual(2030);
      expect(Number.isInteger(p.mitarbeitende) && p.mitarbeitende > 0, k.name).toBe(true);
      for (const s of [p.ort, p.angebot, p.zielgruppe, p.besonderheit, p.ansprechperson.name, p.ansprechperson.rolle]) expect(s.trim().length, k.name).toBeGreaterThan(2);
      expect(p.werte.length, k.name).toBeGreaterThanOrEqual(2);
      expect(p.werte.length, k.name).toBeLessThanOrEqual(3);
      expect(p.synonyme.length, k.name).toBeGreaterThanOrEqual(2);
      expect(p.synonyme.length, k.name).toBeLessThanOrEqual(5);
    }
  });
  it('mindestens 20 Betriebe und 8 Redaktionen, Namen eindeutig', () => {
    expect(catalogs.kunden.filter(k => k.art === 'betrieb').length).toBeGreaterThanOrEqual(20);
    expect(catalogs.kunden.filter(k => k.art === 'redaktion').length).toBeGreaterThanOrEqual(8);
    expect(new Set(catalogs.kunden.map(k => k.name)).size).toBe(catalogs.kunden.length);
  });
  it('Schema lehnt einen Kunden ohne Steckbrief ab', () => {
    const raw = { kunden: catalogs.kunden.map((k, i) => (i === 0 ? { name: k.name, branche: k.branche } : k)), kanaele: catalogs.kanaele, anlaesse: catalogs.anlaesse, haken: catalogs.haken, recherche: catalogs.recherche, themen: catalogs.themen };
    expect(CatalogsSchema.safeParse(raw).success).toBe(false);
  });
  it('Themen-Anlässe: Erklärvideo und Kurzdoku, 60–90 s, {thema} im Satz', () => {
    const t = catalogs.anlaesse.filter(a => a.thema);
    expect(t.length).toBeGreaterThanOrEqual(3);
    for (const a of t) {
      expect(a.satz).toContain('{thema}');
      expect([a.minSec, a.maxSec]).toEqual([60, 90]);
    }
    for (const a of catalogs.anlaesse.filter(x => !x.thema)) expect(a.satz).not.toContain('{thema}');
  });
});

describe('worldWeights', () => {
  it('Gewichte aus rules.json: 40 Betriebe, 60 Themen', () => {
    expect(rules.worldWeights).toEqual({ betrieb: 40, gesellschaft: 20, geschichte: 15, wissen: 15, medien: 5, nischen: 5 });
  });
  it('Schema prüft die Schlüssel wie bei den übrigen', () => {
    const copy = () => JSON.parse(JSON.stringify(rulesJson)) as Record<string, Record<string, unknown>>;
    const missing = copy();
    delete missing.worldWeights.wissen;
    expect(RulesSchema.safeParse(missing).success).toBe(false);
    const negative = copy();
    negative.worldWeights.betrieb = -1;
    expect(RulesSchema.safeParse(negative).success).toBe(false);
    const zero = copy();
    for (const k of Object.keys(zero.worldWeights)) zero.worldWeights[k] = 0;
    expect(RulesSchema.safeParse(zero).success).toBe(false);
    expect(RulesSchema.safeParse(copy()).success).toBe(true);
  });
});

describe('Welten im Generator', () => {
  const list = series('welten', 300);
  it('Verteilung folgt den Gewichten (40/20/15/15/5/5, mit Toleranz)', () => {
    const share = (w: WorldId) => list.filter(a => worldOf(a) === w).length / list.length;
    expect(share('betrieb')).toBeGreaterThan(0.3);
    expect(share('betrieb')).toBeLessThan(0.5);
    expect(share('gesellschaft')).toBeGreaterThan(0.12);
    expect(share('geschichte')).toBeGreaterThan(0.08);
    expect(share('wissen')).toBeGreaterThan(0.08);
    for (const k of KATEGORIEN) expect(share(k), k).toBeGreaterThan(0);
  });
  it('deterministisch: gleicher Seed und gleicher Verlauf → gleiche Aufträge', () => {
    expect(series('welten', 40)).toEqual(series('welten', 40));
    expect(drawWorld('x', 5, rules)).toBe(drawWorld('x', 5, rules));
  });
  it('Betriebs-Auftrag: Kunde aus den Betrieben mit Steckbrief, kein Thema', () => {
    const b = list.filter(a => !a.topic);
    expect(b.length).toBeGreaterThan(50);
    for (const a of b) {
      const k = catalogs.kunden.find(x => x.name === a.client.name)!;
      expect(k.art).toBe('betrieb');
      expect(a.client.profile).toEqual(k.profile);
      expect(a.client.profile).not.toBe(k.profile);
    }
  });
  it('Themen-Auftrag: Redaktion, Thema aus der Kategorie, Kopie des Katalogeintrags', () => {
    const t = list.filter(a => a.topic);
    expect(t.length).toBeGreaterThan(100);
    for (const a of t) {
      const k = catalogs.kunden.find(x => x.name === a.client.name)!;
      expect(k.art).toBe('redaktion');
      expect(a.client.profile).toEqual(k.profile);
      const th = catalogs.themen.find(x => x.id === a.topic!.id)!;
      expect(a.topic).toEqual({ id: th.id, kategorie: th.kategorie, titel: th.titel, hintergrund: th.hintergrund, leitfragen: th.leitfragen, schlagwoerter: th.schlagwoerter, einstieg: th.einstieg });
      expect(a.topic!.leitfragen).not.toBe(th.leitfragen);
      expect(a.title).toContain(a.topic!.titel);
      expect(a.briefing).toContain(`„${a.topic!.titel}“`);
      expect(a.briefing).toContain(a.client.name);
      expect(a.briefing).toContain(a.hook.text);
      const n = a.briefing.split(/(?<=[.!?])\s+/).filter(Boolean).length;
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(4);
    }
  });
  it('Recherche je Welt: Gesellschaft → Kommentar, Geschichte → Dossier, Wissen, Medien, Nischen → Erklärvideo-Konzept (oder Exposé)', () => {
    const seen: Record<string, Set<string>> = {};
    for (const a of series('vorlagen', 400, 3)) {
      if (!a.topic) continue;
      for (const d of a.deliverables.filter(x => x.kind === 'research')) {
        (seen[a.topic.kategorie] ??= new Set()).add(d.researchTemplate!);
        const erlaubt = { gesellschaft: 'meinung', geschichte: 'geschichte', wissen: 'erklaer', medien: 'erklaer', nischen: 'erklaer' }[a.topic.kategorie];
        expect([erlaubt, 'expose']).toContain(d.researchTemplate);
      }
    }
    expect([...seen.gesellschaft].sort()).toEqual(['expose', 'meinung']);
    expect([...seen.geschichte].sort()).toEqual(['expose', 'geschichte']);
    expect([...seen.wissen].sort()).toEqual(['erklaer', 'expose']);
  });
  it('Themen-Video: Erklärvideo oder Kurzdoku, 60–90 s, Format nach Kanal, Thema im Briefing', () => {
    const v = series('video', 300, 3).filter(a => a.topic && a.type !== 'research');
    expect(v.length).toBeGreaterThan(40);
    const names = new Set<string>();
    for (const a of v) {
      const anlass = catalogs.anlaesse.find(x => a.occasion.endsWith(x.name))!;
      expect(anlass.thema).toBe(true);
      names.add(anlass.name);
      const kanal = catalogs.kanaele.find(k => k.id === anlass.kanal)!;
      for (const d of a.deliverables.filter(x => x.videoSpec)) {
        const s = d.videoSpec!;
        expect(s.durationSec).toBeGreaterThanOrEqual(60);
        expect(s.durationSec).toBeLessThanOrEqual(90);
        expect(s.durationSec % 5).toBe(0);
      }
      const spec = a.deliverables.find(x => x.videoSpec)!.videoSpec!;
      expect(kanal.aspects).toContain(spec.aspect);
      expect(['16:9', '9:16']).toContain(spec.aspect);
      expect(a.briefing).toContain(`„${a.topic!.titel}“`);
      expect(a.title).toContain(a.topic!.titel);
      expect(spec.fileName).toBe(fileNameFor(a, a.deliverables.find(x => x.videoSpec)!, 1));
      expect(spec.fileName.startsWith(projectFolderFor(a))).toBe(true);
      expect(projectFolderFor(a)).toMatch(/^A\d{2,}_[A-Za-z0-9-]+$/);
    }
    expect(names.has('Erklärvideo')).toBe(true);
    expect(names.has('Kurzdoku')).toBe(true);
  });
  it('Themen-Kombi: Vorlage der Welt zum Thema plus Video', () => {
    const k = series('kombi', 300, 3).filter(a => a.topic && a.type === 'kombi');
    expect(k.length).toBeGreaterThan(10);
    for (const a of k) {
      expect(a.deliverables.filter(d => d.kind === 'video').length).toBeGreaterThanOrEqual(1);
      const r = a.deliverables.filter(d => d.kind === 'research');
      expect(r).toHaveLength(1);
      expect(['meinung', 'geschichte', 'erklaer', 'expose']).toContain(r[0].researchTemplate);
      expect(r[0].label.endsWith('zum Thema')).toBe(true);
      expect(a.briefing).toContain('zum Thema');
    }
  });
  it('Haken: Themen-Aufträge ziehen keine reinen Betriebs-Haken, Betriebs-Aufträge keine reinen Themen-Haken', () => {
    for (const a of series('haken', 300, 3)) {
      const h = catalogs.haken.find(x => x.id === a.hook.id)!;
      if (a.topic) expect(h.nurBetrieb ?? false).toBe(false);
      else expect(h.nurThema ?? false).toBe(false);
    }
  });
  it('Typen und Stufen bleiben wie vorher: Stufe 1 ohne Kombi, nur Recherche → nur Recherche', () => {
    for (const a of series('s1', 100, 1)) expect(a.type).not.toBe('kombi');
    for (let n = 1; n <= 60; n++) expect(generateAssignment('r', n, NOW, 3, ['research'], catalogs, rules).type).toBe('research');
  });
});

describe('Abwechslung', () => {
  it('dieselbe Kategorie höchstens zweimal hintereinander (Verlauf über 400 Aufträge)', () => {
    const list = series('abwechslung', 400);
    let run = 1;
    for (let i = 1; i < list.length; i++) {
      const k = list[i].topic?.kategorie;
      run = k && k === list[i - 1].topic?.kategorie ? run + 1 : 1;
      expect(run, `Auftrag ${list[i].number}`).toBeLessThanOrEqual(2);
    }
  });
  it('kein Thema wiederholt sich innerhalb der letzten 20 Aufträge', () => {
    const list = series('abwechslung', 400);
    for (let i = 0; i < list.length; i++) {
      const id = list[i].topic?.id;
      if (!id) continue;
      expect(list.slice(Math.max(0, i - 20), i).some(a => a.topic?.id === id), `Auftrag ${list[i].number}`).toBe(false);
    }
  });
  it('erzwungen: nur eine Kategorie gewichtet → trotzdem höchstens zweimal hintereinander, sofern andere Welten erlaubt sind', () => {
    const only = { ...rules, worldWeights: { betrieb: 1, gesellschaft: 100, geschichte: 0, wissen: 0, medien: 0, nischen: 0 } };
    const list = series('erzwungen', 120, 2, 1, only);
    let run = 1;
    for (let i = 1; i < list.length; i++) {
      run = list[i].topic && list[i].topic?.kategorie === list[i - 1].topic?.kategorie ? run + 1 : 1;
      expect(run).toBeLessThanOrEqual(2);
    }
    for (let i = 0; i < list.length; i++) {
      const id = list[i].topic?.id;
      if (id) expect(list.slice(Math.max(0, i - 20), i).some(a => a.topic?.id === id)).toBe(false);
    }
  });
  it('ist nur eine Welt gewichtet, bleibt sie erlaubt (keine Endlosschleife, kein Fehler)', () => {
    const only = { ...rules, worldWeights: { betrieb: 0, gesellschaft: 1, geschichte: 0, wissen: 0, medien: 0, nischen: 0 } };
    const list = series('einzige', 60, 2, 1, only);
    expect(list.every(a => a.topic?.kategorie === 'gesellschaft')).toBe(true);
    // 15 Themen, 20 Aufträge Gedächtnis: es greift der Rückfall auf das am längsten nicht gezogene Thema
    expect(new Set(list.map(a => a.topic!.id)).size).toBeGreaterThanOrEqual(catalogs.themen.filter(t => t.kategorie === 'gesellschaft').length);
  });
  it('ohne Verlauf gibt es keine Beschränkung, aber dieselbe Erzeugung', () => {
    const a = generateAssignment('o', 7, NOW, 2, AVAILABLE_TYPES, catalogs, rules);
    expect(generateAssignment('o', 7, NOW, 2, AVAILABLE_TYPES, catalogs, rules, [])).toEqual(a);
  });
  it('Verlauf mit höheren Nummern oder ohne Thema stört nicht', () => {
    const a = generateAssignment('o', 7, NOW, 2, AVAILABLE_TYPES, catalogs, rules);
    const later = series('o', 5, 2, 8);
    expect(generateAssignment('o', 7, NOW, 2, AVAILABLE_TYPES, catalogs, rules, later)).toEqual(a);
  });
});

describe('Betriebs-Aufträge bleiben wie vorher', () => {
  it('feste Beispiele (Seeds der E2E-Tests): gleiche Aufträge wie vor der Änderung', () => {
    const at = (s: string) => generateAssignment(s, 1, NOW, 1, AVAILABLE_TYPES, catalogs, rules);
    expect(at('e2e-film').title).toBe('Veranstaltungs-Clip – Musikschule Taktgefühl');
    expect(at('e2e-research-1').title).toBe('Technik-Kaufberatung für Hofladen Ackerglück');
    expect(at('e2e-laut').title).toBe('Kanal-Trailer – Café Morgenrot');
    const both = at('e2e-6-388');
    expect(both.hook.autoRule).toBe('bothFormats');
    expect(both.topic).toBeUndefined();
  });
});

describe('Ältere Stände', () => {
  const state = (assignments: unknown[]) => ({
    version: 1, installId: 'x', createdAt: 0, schedule: { nextIssueAt: 0, nextNumber: 2, vacations: [] }, assignments, evaluations: [], settings: {},
  });
  const alt = { id: 'A01', number: 1, client: { name: 'Café Mühle', branche: 'Gastro' }, title: 'x' };
  it('Aufträge ohne Steckbrief und Thema sind gültig', () => expect(isValidState(state([alt]))).toBe(true));
  it('Aufträge mit Steckbrief und Thema sind gültig und bleiben unverändert erhalten', () => {
    const a = series('neu', 3).find(x => x.topic)!;
    expect(isValidState(state([a]))).toBe(true);
  });
  it('eine unbekannte Form von Thema oder Steckbrief macht den Stand nicht unlesbar', () => {
    expect(isValidState(state([{ ...alt, topic: 'kaputt', client: { name: 'x', profile: 5 } }]))).toBe(true);
  });
});
