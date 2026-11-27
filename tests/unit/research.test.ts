import { describe, expect, it } from 'vitest';
import {
  countedSources,
  evaluateResearch,
  parseSource,
  RESEARCH_TEMPLATES,
  researchOnlyPoints,
  sentenceEnds,
  sourcesToCheck,
  wordCount,
  type ResearchContext,
  type ResearchDoc,
} from '../../src/domain/chef/research';
import { loadRules } from '../../src/domain/chef/rules';
import drehplanFixture from '../fixtures/research/drehplan-schreinerei.json';
import exposeFixture from '../fixtures/research/expose-schreinerei.json';
import junk from '../fixtures/research/gibberish.json';
import kaufFixture from '../fixtures/research/kaufberatung-mikrofon.json';

const rules = loadRules();
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
/** Realistisches Exposé (Schreinerei-Jubiläum) mit zwei echten Quellen: keine Abzüge. */
const goodExpose = (): ResearchDoc => clone(exposeFixture) as ResearchDoc;
const run = (d: ResearchDoc, ctx?: ResearchContext) => evaluateResearch(d, RESEARCH_TEMPLATES[d.templateId], rules, undefined, ctx);
const ids = (d: ResearchDoc, ctx?: ResearchContext) => run(d, ctx).map(x => x.ruleId);
const KEYWORDS = ['schreinerei', 'holzwerk', 'brandt', 'handwerk'];
/** Mehr als 300 Wörter echter Text (aus den Beispieltexten zusammengesetzt). */
const longText = [exposeFixture.fields.inhalt, kaufFixture.fields.empfehlung, drehplanFixture.fields.zeitplan, kaufFixture.fields.alternativen].join(' ');

describe('Recherche-Vorlagen', () => {
  it('jede Vorlage hat 4–7 deutsche Felder', () => {
    expect(Object.keys(RESEARCH_TEMPLATES).sort()).toEqual(['drehplan', 'expose', 'formatvergleich', 'kaufberatung', 'rechte', 'shotlist']);
    for (const t of Object.values(RESEARCH_TEMPLATES)) {
      expect(t.fields.length).toBeGreaterThanOrEqual(4);
      expect(t.fields.length).toBeLessThanOrEqual(7);
    }
  });
  it('Wörter = Tokens', () => expect(wordCount('  ein  Wort\nzwei ')).toBe(3));
});

describe('Recherche-Bewertung', () => {
  it('vollständiges Exposé: keine Abzüge', () => expect(run(goodExpose())).toEqual([]));
  it('leeres Pflichtfeld −3, eine Quelle −5', () => {
    const d = goodExpose();
    d.fields.zielgruppe = '   ';
    d.sources = ['https://www.handwerk.de/berufe/tischler'];
    const out = run(d);
    expect(out.map(x => [x.ruleId, x.points, x.category])).toEqual([['researchEmptyField', -3, 'auftrag'], ['researchSources', -5, 'auftrag']]);
    expect(out[1].ist).toBe('1 Quelle');
  });
  it('Quellen ohne http(s) zählen nicht', () => {
    const d = goodExpose();
    d.sources = ['www.example.org', 'ftp://x.de/y', 'https://ok.de/x', 'https:// kaputt'];
    expect(ids(d)).toEqual(['researchSources']);
  });
  it('Text außerhalb Längenrahmen −3 je Feld', () => {
    const d = goodExpose();
    d.fields.logline = 'Ein Tag in der Werkstatt.';
    d.fields.inhalt = longText;
    const out = run(d);
    expect(out.map(x => x.points)).toEqual([-3, -3]);
    expect(out[0].soll).toBe('10–40 Wörter');
    expect(out[0].ist).toBe('5 Wörter');
  });
  it('fehlendes Feld im Dokument zählt als leer', () => {
    const d = goodExpose();
    delete d.fields.laenge;
    expect(ids(d)).toEqual(['researchEmptyField']);
  });
});

describe('Unsinn in Feldern', () => {
  it('ein unsinniges Pflichtfeld zählt wie ein leeres: gleiche Punkte, eigene Regel und Titel, keine Längenprüfung', () => {
    const d = goodExpose();
    d.fields.inhalt = junk.zufallsbuchstaben;
    const out = run(d);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ ruleId: 'researchGibberish', points: rules.deductions.auftrag.researchEmptyField, category: 'auftrag', label: 'Exposé: Pflichtfeld „Inhalt“ ist kein verständlicher Text' });
    const ro = evaluateResearch(d, RESEARCH_TEMPLATES.expose, rules, researchOnlyPoints(rules));
    expect(ro[0].points).toBe(rules.deductions.researchOnly.emptyField);
  });
  it('Lorem ipsum, „test test test“ und Tastatursalat in kurzen Feldern', () => {
    const d = goodExpose();
    d.fields.gestaltung = junk.loremIpsum;
    d.fields.arbeitstitel = junk.wiederholt;
    d.fields.laenge = 'asdf';
    expect(ids(d)).toEqual(['researchGibberish', 'researchGibberish', 'researchGibberish']);
  });
  it('freiwillige Felder mit Unsinn kosten nichts', () => {
    const d: ResearchDoc = {
      templateId: 'shotlist',
      fields: {
        ueberblick: 'Ein Rundgang durch die Werkstatt der Schreinerei Holzwerk Brandt in zehn Einstellungen, vom Holzlager bis zum fertigen Tisch.',
        einstellungen: '1. Totale: die Werkstatt von außen mit dem alten Schild. 2. Halbnah: Jana Brandt öffnet das Tor. 3. Detail: ihre Hand am Lichtschalter. 4. Totale: die Hobelbänke im Morgenlicht. 5. Nah: Malik prüft ein Brett. 6. Detail: Späne fallen auf den Boden.',
        einstellungsgroessen: 'Totale, Halbtotale, Halbnah, Nah und Detail; dazu zwei Groß-Einstellungen im Interview.',
        ton: junk.tastatursalatLang,
      },
      sources: exposeFixture.sources,
    };
    expect(run(d)).toEqual([]);
  });
});

describe('Kopien', () => {
  it('zwei längere Felder fast gleich: ein Abzug je Paar', () => {
    const d = goodExpose();
    d.fields.gestaltung = d.fields.inhalt;
    const out = run(d).filter(x => x.ruleId === 'researchCopy');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ points: rules.researchQuality.kombi.copiedField, label: 'Exposé: „Inhalt“ und „Gestaltungsidee“ sind fast gleich', ist: '100 % gleiche Wörter' });
  });
  it('kurze Felder zählen nicht als Kopie', () => {
    const d = goodExpose();
    d.fields.arbeitstitel = 'Holzwerk Brandt';
    d.fields.zielgruppe = 'Holzwerk Brandt Familien';
    expect(ids(d)).not.toContain('researchCopy');
  });
});

describe('Themenbezug', () => {
  it('ein Schlagwort in Logline oder Inhalt genügt', () => {
    expect(ids(goodExpose(), { keywords: KEYWORDS })).toEqual([]);
    expect(ids(goodExpose(), { keywords: ['jubiläum'] })).toEqual([]);
  });
  it('kein Schlagwort: ein Abzug', () => {
    const out = run(goodExpose(), { keywords: ['bäckerei', 'korn', 'krust'] });
    expect(out.map(x => [x.ruleId, x.points])).toEqual([['researchOffTopic', rules.researchQuality.kombi.offTopic]]);
    expect(out[0].soll).toBe('Kunde, Branche oder Anlass in „Logline“, „Inhalt“');
  });
  it('ohne Schlagwörter oder bei unsinnigem Haupttext kein Abzug', () => {
    expect(ids(goodExpose(), { keywords: [] })).toEqual([]);
    const d = goodExpose();
    d.fields.logline = junk.tastatursalatLang;
    d.fields.inhalt = junk.zufallsbuchstaben;
    expect(ids(d, { keywords: ['bäckerei'] })).not.toContain('researchOffTopic');
  });
  it('andere Vorlagen: alle Pflichtfelder zählen', () => {
    const d = clone(drehplanFixture) as ResearchDoc;
    expect(ids(d, { keywords: ['lindenstraße'] })).toEqual([]);
    expect(ids(d, { keywords: ['bäckerei'] })).toEqual(['researchOffTopic']);
  });
});

describe('Feldplausibilität', () => {
  const findings = (patch: Partial<Record<string, string>>, base: ResearchDoc = goodExpose()) => {
    const d = clone(base);
    Object.assign(d.fields, patch);
    return run(d).filter(x => x.ruleId === 'researchImplausible');
  };
  it('Exposé „Länge“ braucht eine Dauer', () => {
    for (const ok of ['90 s', '90s', '1:30', 'etwa 2 Min.', '45 Sekunden', 'zwei Minuten', 'eine Minute', 'ca. 1,5 Minuten']) expect(findings({ laenge: ok }), ok).toEqual([]);
    const out = findings({ laenge: 'so lang wie nötig' });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ label: 'Exposé: „Länge“ nennt keine Dauer', points: rules.researchQuality.kombi.implausibleField });
  });
  it('Exposé „Zielgruppe“ nennt eine Gruppe oder ein Alter', () => {
    for (const ok of ['Familien', 'Stammkunden im Viertel', 'ab 14', '16- bis 25-Jährige', 'Senioren', 'Fachpublikum']) expect(findings({ zielgruppe: ok }), ok).toEqual([]);
    expect(findings({ zielgruppe: 'möglichst breit' }).map(x => x.label)).toEqual(['Exposé: „Zielgruppe“ nennt keine Gruppe']);
  });
  it('Exposé „Gestaltungsidee“ hat mindestens drei Fachbegriffe', () => {
    const plain = 'Wir zeigen die Menschen in der Werkstatt bei ihrer Arbeit und lassen sie erzählen, was ihnen wichtig ist. Es soll freundlich und ehrlich wirken, ohne dass etwas gestellt aussieht. Am Ende sieht man, wie alle zusammen feiern und sich freuen.';
    const out = findings({ gestaltung: plain });
    expect(out.map(x => [x.label, x.ist])).toEqual([['Exposé: „Gestaltungsidee“ mit zu wenig Fachbegriffen', '0 Fachbegriffe']]);
    expect(findings({ gestaltung: `${plain} Totale, Gegenlicht und J-Cuts.` })).toEqual([]);
  });
  it('Exposé „Logline“ ist ein ganzer Satz (höchstens zwei Satzenden; z. B., Zahlen und Abkürzungen zählen nicht)', () => {
    const base = 'Zum 50. Jubiläum der Schreinerei zeigen wir z. B. die Meisterin, ca. 30 Jahre im Betrieb, und ihr Team';
    expect(findings({ logline: `${base}.` })).toEqual([]);
    expect(findings({ logline: `${base}!` })).toEqual([]);
    expect(findings({ logline: `„${base}.“` })).toEqual([]);
    expect(findings({ logline: `${base}. Danach wird gefeiert.` })).toEqual([]);
    expect(findings({ logline: base }).map(x => x.ist)).toEqual(['ohne Satzzeichen am Ende']);
    expect(findings({ logline: `${base}. Danach wird gefeiert. Dann ist Schluss.` }).map(x => x.ist)).toEqual(['3 Sätze']);
  });
  it('Satzenden zählen', () => {
    expect(sentenceEnds('Ein Satz. Noch einer! Und? ')).toBe(3);
    expect(sentenceEnds('Am 3. Mai, z. B. um 9 Uhr usw.')).toBe(1);
  });
  it('Drehplan „Datum“, Kaufberatung „Budget“, Rechte „Link“', () => {
    const drehplan = clone(drehplanFixture) as ResearchDoc;
    for (const ok of ['13.03.2027', '2027-03-13', 'Samstag', '13. März', 'März 2027', '13.3.']) expect(findings({ datum: ok }, drehplan), ok).toEqual([]);
    expect(findings({ datum: 'bald, wenn es passt' }, drehplan).map(x => x.label)).toEqual(['Drehplan: „Datum“ nennt kein Datum']);
    const kauf = clone(kaufFixture) as ResearchDoc;
    for (const ok of ['150 €', '150', 'hundertfünfzig Euro', '150 EUR']) expect(findings({ budget: ok }, kauf), ok).toEqual([]);
    expect(findings({ budget: 'nicht so viel' }, kauf).map(x => x.label)).toEqual(['Technik-Kaufberatung: „Budget“ nennt keinen Betrag']);
    const rechte: ResearchDoc = {
      templateId: 'rechte',
      fields: { werk: 'Gitarrenstück „Morgenholz“', quelle: 'Freie Musikdatenbank', lizenz: 'CC BY 4.0', link: 'https://freemusicarchive.org/music/morgenholz', bedingungen: 'Namensnennung im Abspann ist Pflicht, Bearbeitung ist erlaubt, auch für den Kunden.' },
      sources: exposeFixture.sources,
    };
    expect(run(rechte)).toEqual([]);
    expect(findings({ link: 'freemusicarchive.org' }, rechte).map(x => x.label)).toEqual(['Rechte-Recherche: „Link“ ist keine gültige Adresse']);
  });
  it('die übrigen Felder prüfen nur die allgemeinen Regeln', () => {
    expect(findings({ arbeitstitel: 'Späne' })).toEqual([]);
  });
});

describe('Quellen', () => {
  it('Domain = die letzten zwei Teile; Platzhalter erkennen', () => {
    expect(parseSource('https://mediathek.zdf.de/x')).toMatchObject({ host: 'mediathek.zdf.de', domain: 'zdf.de', placeholder: false });
    for (const p of ['https://example.com', 'https://www.example.org/a', 'http://beispiel.de', 'https://test.com/x', 'http://localhost:3000', 'http://kamera.local/x', 'http://127.0.0.1/x', 'http://[::1]/', 'https://domain.de', 'https://url.de', 'https://xxx.de', 'https://xxxx.com/a', 'https://abc.de', 'https://intranet/']) {
      expect(parseSource(p)?.placeholder, p).toBe(true);
    }
    expect(parseSource('https://www.test.de/Mikrofone-im-Test')?.placeholder).toBe(false);
    expect(parseSource('www.zdf.de')).toBeNull();
  });
  it('gleiche Domain zählt einmal, Platzhalter gar nicht', () => {
    expect(countedSources(['https://www.zdf.de/a', 'https://mediathek.zdf.de/b'])).toBe(1);
    expect(countedSources(['https://zdf.de/a', 'https://ard.de/b', 'https://example.com'])).toBe(2);
  });
  it('example.com + example.com/2: zu wenige Quellen und je Platzhalter ein Abzug', () => {
    const d = goodExpose();
    d.sources = ['https://example.com', 'https://example.com/2'];
    const out = run(d);
    expect(out.map(x => [x.ruleId, x.points])).toEqual([
      ['researchSources', rules.deductions.auftrag.researchTooFewSources],
      ['researchPlaceholderSource', rules.researchQuality.kombi.placeholderSource],
      ['researchPlaceholderSource', rules.researchQuality.kombi.placeholderSource],
    ]);
    expect(out[0].ist).toBe('0 Quellen');
  });
  it('zwei Links auf dieselbe Seite: zu wenige Quellen', () => {
    const d = goodExpose();
    d.sources = ['https://www.handwerk.de/a', 'https://handwerk.de/b'];
    expect(ids(d)).toEqual(['researchSources']);
  });
  it('Links für die Online-Prüfung: echte Quellen, je Adresse einmal, höchstens sechs', () => {
    const many = ['https://a.de/1', ' https://a.de/1 ', 'https://example.com', 'ftp://b.de', 'https://b.de/1', 'https://c.de', 'https://d.de', 'https://e.de', 'https://f.de', 'https://g.de'];
    expect(sourcesToCheck(many)).toEqual(['https://a.de/1', 'https://b.de/1', 'https://c.de', 'https://d.de', 'https://e.de', 'https://f.de']);
  });
});

describe('Online-Prüfung der Links', () => {
  const [a, b] = exposeFixture.sources;
  const ctx = (sourceCheck: ResearchContext['sourceCheck'], offline = false): ResearchContext => ({ keywords: [], sourceCheck, offline });
  it('alle erreichbar: kein Abzug', () => expect(ids(goodExpose(), ctx({ [a]: 'ok', [b]: 'ok' }))).toEqual([]));
  it('404 kostet je Link', () => {
    const out = run(goodExpose(), ctx({ [a]: 'notFound', [b]: 'notFound' }));
    expect(out.map(x => [x.ruleId, x.points])).toEqual([
      ['researchSourceNotFound', rules.researchQuality.kombi.sourceNotFound],
      ['researchSourceNotFound', rules.researchQuality.kombi.sourceNotFound],
    ]);
    expect(out[0].label).toBe('Exposé: Link führt ins Leere: www.handwerk.de');
  });
  it('nicht erreichbar kostet nur, wenn ein anderer Link ging', () => {
    expect(ids(goodExpose(), ctx({ [a]: 'ok', [b]: 'unreachable' }))).toEqual(['researchSourceUnreachable']);
    expect(ids(goodExpose(), ctx({ [a]: 'unreachable', [b]: 'unreachable' }))).toEqual([]);
    expect(ids(goodExpose(), ctx({ [a]: 'notFound', [b]: 'unreachable' }))).toEqual(['researchSourceNotFound']);
  });
  it('offline: kein Link-Abzug', () => {
    expect(ids(goodExpose(), ctx({ [a]: 'notFound', [b]: 'unreachable' }, true))).toEqual([]);
  });
});

describe('Schutz vor Fehlalarm: echte Beispieltexte', () => {
  it('Exposé, Drehplan und Kaufberatung bekommen keinen Abzug (mit Themenbezug und erreichbaren Links)', () => {
    const cases: [ResearchDoc, string[]][] = [
      [goodExpose(), KEYWORDS],
      [clone(drehplanFixture) as ResearchDoc, KEYWORDS],
      [clone(kaufFixture) as ResearchDoc, ['bäckerei', 'korn', 'krust', 'mikrofon']],
    ];
    for (const [doc, keywords] of cases) {
      const sourceCheck = Object.fromEntries(doc.sources.map(s => [s, 'ok' as const]));
      const r = researchOnlyPoints(rules);
      expect(evaluateResearch(doc, RESEARCH_TEMPLATES[doc.templateId], rules, r, { keywords, sourceCheck }), doc.templateId).toEqual([]);
    }
  });
});
