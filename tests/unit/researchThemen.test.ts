import { describe, expect, it } from 'vitest';
import { assignmentKeywords } from '../../src/domain/assignments/keywords';
import { loadCatalogs } from '../../src/domain/assignments/generator';
import { evaluateResearch, RESEARCH_TEMPLATES, type ResearchContext, type ResearchDoc } from '../../src/domain/chef/research';
import { loadRules } from '../../src/domain/chef/rules';
import exposeFixture from '../fixtures/research/expose-schreinerei.json';

const rules = loadRules();
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const SOURCES = ['https://www.bpb.de/themen/medien/', 'https://www.tagesschau.de/inland/'];
const run = (d: ResearchDoc, ctx?: ResearchContext) => evaluateResearch(d, RESEARCH_TEMPLATES[d.templateId], rules, undefined, ctx);
const ids = (d: ResearchDoc, ctx?: ResearchContext) => run(d, ctx).map(x => x.ruleId);

const meinung = (): ResearchDoc => ({
  templateId: 'meinung',
  fields: {
    these: 'Ein Handyverbot an Schulen ist sinnvoll, wenn es klare Ausnahmen für den Unterricht gibt und die Schülerschaft an der Regel beteiligt wird.',
    dafuer:
      'Befürworter eines Verbots sagen, dass Smartphones im Unterricht ablenken und die Konzentration senken. Pausen werden wieder lebendiger, weil die Schülerinnen und Schüler miteinander sprechen, statt auf den Bildschirm zu schauen. Außerdem lässt sich Mobbing über Chatgruppen während der Schulzeit leichter eindämmen, wenn Geräte ausgeschaltet bleiben. Viele Lehrkräfte berichten, dass klare Regeln ihnen Streit über Einzelfälle ersparen.',
    dagegen:
      'Kritiker verweisen darauf, dass Smartphones auch Lernwerkzeuge sind, mit denen man recherchieren, übersetzen und Notizen machen kann. Ein pauschales Verbot nimmt den Jugendlichen die Chance, einen verantwortungsvollen Umgang zu lernen. Zudem sind manche Familien darauf angewiesen, dass ihre Kinder im Notfall erreichbar sind. Auch die Kontrolle eines Verbots kostet Zeit, die im Unterricht fehlt.',
    fazit:
      'Meine Meinung ist, dass ein Verbot allein nicht reicht. Besser finde ich eine Regel, die gemeinsam mit Lehrkräften und Schülerschaft entsteht und im Unterricht gezielte Ausnahmen erlaubt. Dann bleibt die Konzentration geschützt, und die Jugendlichen lernen trotzdem, mit dem Gerät umzugehen. Wichtig ist, dass die Schule die Regel erklärt und regelmäßig überprüft, ob sie noch passt.',
  },
  sources: SOURCES,
});

const geschichte = (): ResearchDoc => ({
  templateId: 'geschichte',
  fields: {
    ereignis:
      'Am 9. November 1989 öffnete die DDR ihre Grenzen nach West-Berlin, nachdem Proteste im ganzen Land den Druck auf die Führung erhöht hatten, und die Mauer verlor ihre Funktion.',
    zeitleiste:
      '1961: Die DDR beginnt am 13. August mit dem Bau der Berliner Mauer.\n1989: Im Herbst wachsen die Demonstrationen, am 9. November werden die Grenzübergänge geöffnet.\n1990: Am 3. Oktober wird Deutschland wiedervereinigt.',
    ursachen:
      'Die Menschen in der DDR waren unzufrieden mit den eingeschränkten Reisemöglichkeiten, der Mangelwirtschaft und der fehlenden Meinungsfreiheit. Viele verließen das Land über Ungarn und die Botschaften in Prag, während zu Hause Demonstrationen wuchsen. Auch die Reformen in der Sowjetunion machten es der Führung schwerer, Proteste mit Gewalt zu beenden.',
    folgen:
      'Nach der Grenzöffnung wuchs der Wunsch nach einem gemeinsamen Staat schnell. Es folgten Verhandlungen über die Währung und die staatliche Einheit, und im Oktober 1990 entstand das vereinte Deutschland. Für viele Menschen im Osten veränderten sich Arbeit und Alltag sehr stark, was bis heute diskutiert wird.',
    heute:
      'Der 9. November erinnert an die Freiheit, aber auch an die schwierige Geschichte der Teilung. In Gedenkstätten und Schulen wird weiter erzählt, wie das Leben an der Grenze aussah, damit junge Menschen die Demokratie schätzen.',
  },
  sources: SOURCES,
});

const erklaer = (): ResearchDoc => ({
  templateId: 'erklaer',
  fields: {
    kernfrage: 'Wie heizt eine Wärmepumpe ein Haus mit Wärme aus der Umgebung?',
    zielgruppe: 'Jugendliche ab 14 Jahren und Familien, die über eine neue Heizung nachdenken.',
    kernaussagen:
      'Eine Wärmepumpe holt Wärme aus Luft, Erde oder Wasser.\nMit Strom hebt sie diese Wärme auf ein Niveau, das zum Heizen reicht.\nOb sie sich lohnt, hängt vom Haus und von der Heizungsanlage ab.',
    skript:
      'Im Winter ist es draußen kalt, und trotzdem steckt in der Luft noch Wärme. Eine Wärmepumpe nimmt diese Wärme auf, so wie ein Kühlschrank Wärme aus seinem Inneren nach außen bringt, nur in die andere Richtung. Ein Kältemittel verdampft schon bei niedrigen Temperaturen und nimmt dabei Energie auf. Ein Verdichter drückt das Gas zusammen, wodurch es heiß wird. Diese Wärme geht an das Wasser der Heizung. Danach entspannt sich das Gas wieder, wird flüssig und beginnt den Kreislauf von vorn. Am Ende fragen wir, wann sich das lohnt: Das hängt vom Haus, von der Dämmung und von den Heizkörpern ab.',
    visualisierung:
      'Zu Beginn zeigt eine Totale ein Haus im Winter, dann folgt eine Animation des Kältekreislaufs mit farbigen Pfeilen. Die Grafik wird mit ruhiger Musik und einer klaren Sprecherstimme unterlegt. Im Schnitt wechseln wir zwischen Detailaufnahmen der Außeneinheit und Bildern aus dem Heizungskeller, um den Weg der Wärme zu zeigen. Am Ende blendet der Titel die Quellen ein.',
  },
  sources: SOURCES,
});

describe('Vorlage Kommentar (meinung)', () => {
  it('Felder: These, Argumente dafür und dagegen, Meinung und Fazit', () => {
    const f = RESEARCH_TEMPLATES.meinung.fields;
    expect(f.map(x => x.label)).toEqual(['These', 'Argumente dafür', 'Argumente dagegen', 'Eigene Meinung und Fazit']);
    expect(f.map(x => [x.minWords, x.maxWords])).toEqual([[10, 40], [40, 200], [40, 200], [40, 200]]);
    expect(RESEARCH_TEMPLATES.meinung.label).toBe('Kommentar');
  });
  it('ein vollständiger Kommentar: keine Abzüge', () => expect(run(meinung(), { keywords: ['handy', 'schule'] })).toEqual([]));
  it('Argumente dafür und dagegen fast gleich: Kopie-Abzug', () => {
    const d = meinung();
    d.fields.dagegen = d.fields.dafuer;
    expect(ids(d)).toEqual(['researchCopy']);
  });
  it('zu kurz: Längenabzug', () => {
    const d = meinung();
    d.fields.dagegen = 'Smartphones helfen auch beim Lernen.';
    expect(ids(d)).toEqual(['researchLength']);
  });
});

describe('Vorlage Dossier (geschichte)', () => {
  it('Felder und Längen', () => {
    const f = RESEARCH_TEMPLATES.geschichte.fields;
    expect(f.map(x => x.label)).toEqual(['Ereignis', 'Zeitleiste', 'Ursachen', 'Folgen', 'Bedeutung heute']);
    expect(f.map(x => [x.minWords, x.maxWords])).toEqual([[10, 60], [20, 200], [30, 200], [30, 200], [20, 150]]);
    expect(RESEARCH_TEMPLATES.geschichte.label).toBe('Dossier');
  });
  it('ein vollständiges Dossier: keine Abzüge', () => expect(run(geschichte(), { keywords: ['mauerfall', 'mauer'] })).toEqual([]));
  it('Zeitleiste braucht mindestens drei verschiedene Jahreszahlen', () => {
    const d = geschichte();
    d.fields.zeitleiste = '1989: Im Herbst wachsen die Demonstrationen, am 9. November werden die Grenzübergänge geöffnet. 1989: Die Menschen feiern an der Grenze und in der ganzen Stadt, und viele fallen sich in die Arme.';
    const out = run(d);
    expect(out.map(x => [x.ruleId, x.points])).toEqual([['researchImplausible', rules.researchQuality.kombi.implausibleField]]);
    expect(out[0].label).toContain('Zeitleiste');
    expect(out[0].ist).toBe('1 Jahreszahl');
    // Zahlen, die keine Jahre sind, zählen nicht
    d.fields.zeitleiste = '2 Millionen Menschen, 500 Meter Grenzstreifen, 12345 Schritte: das ist keine Zeitleiste, sondern eine Reihe von Zahlen, die niemand einordnen kann.';
    expect(run(d).map(x => x.ruleId)).toEqual(['researchImplausible']);
  });
});

describe('Vorlage Erklärvideo-Konzept (erklaer)', () => {
  it('Felder und Längen', () => {
    const f = RESEARCH_TEMPLATES.erklaer.fields;
    expect(f.map(x => x.label)).toEqual(['Kernfrage', 'Zielgruppe', 'Drei Kernaussagen', 'Skript-Entwurf', 'Visualisierung']);
    expect(f.map(x => [x.minWords, x.maxWords])).toEqual([[5, 30], [undefined, undefined], [15, 120], [80, 300], [30, 200]]);
    expect(RESEARCH_TEMPLATES.erklaer.label).toBe('Erklärvideo-Konzept');
  });
  it('ein vollständiges Konzept: keine Abzüge', () => expect(run(erklaer(), { keywords: ['wärmepump'] })).toEqual([]));
  it('Drei Kernaussagen: Zeilen oder Sätze, mindestens drei', () => {
    const d = erklaer();
    d.fields.kernaussagen = 'Eine Wärmepumpe holt Wärme aus Luft, Erde oder Wasser und bringt sie mit Strom auf ein Niveau, das zum Heizen reicht, ob sie sich lohnt, hängt vom Haus ab';
    expect(ids(d)).toEqual(['researchImplausible']);
    // drei Sätze in einer Zeile genügen, ebenso Aufzählungszeichen
    d.fields.kernaussagen = 'Eine Wärmepumpe holt Wärme aus der Umgebung. Mit Strom hebt sie diese Wärme auf Heiztemperatur. Ob sie sich lohnt, hängt vom Haus ab.';
    expect(ids(d)).toEqual([]);
    d.fields.kernaussagen = '- Wärme aus der Umgebung nutzen\n- Strom hebt die Temperatur\n- Das Haus entscheidet über den Nutzen';
    expect(ids(d)).toEqual([]);
  });
  it('Visualisierung braucht mindestens drei Fachbegriffe aus Film und Grafik', () => {
    const d = erklaer();
    d.fields.visualisierung =
      'Das Video soll schön aussehen und die Leute begeistern, damit sich viele Menschen das Thema ansehen und darüber sprechen, wenn sie am Abend mit Freunden zusammen sind und über Heizungen reden.';
    const out = run(d);
    expect(out.map(x => x.ruleId)).toEqual(['researchImplausible']);
    expect(out[0].label).toContain('Visualisierung');
  });
  it('Zielgruppe nennt eine Gruppe', () => {
    const d = erklaer();
    d.fields.zielgruppe = 'Wärmepumpe';
    expect(ids(d)).toEqual(['researchImplausible']);
  });
  it('Themenbezug: Thema im Hinweis, Kernfrage und Kernaussagen zählen', () => {
    const d = erklaer();
    const out = run(d, { keywords: ['blockchain', 'bitcoin'], topic: true });
    expect(out.map(x => x.ruleId)).toEqual(['researchOffTopic']);
    expect(out[0].soll).toBe('Thema, Kunde oder Anlass in „Kernfrage“, „Drei Kernaussagen“');
    expect(out[0].fix).toContain('Thema');
    // das Schlagwort steht nur im Skript: zählt nicht als Themenbezug der Hauptfelder
    d.fields.skript += ' Blockchain';
    expect(ids(d, { keywords: ['blockchain'], topic: true })).toEqual(['researchOffTopic']);
  });
});

describe('Themenbezug mit Steckbrief und Thema', () => {
  const catalogs = loadCatalogs();
  const schreinerei = catalogs.kunden.find(k => k.name === 'Schreinerei Holzwerk Brandt')!;
  const base = { occasion: 'Recherche: Exposé', title: 'Exposé für Schreinerei Holzwerk Brandt', briefing: 'Schreinerei Holzwerk Brandt (Handwerk) braucht von dir ein Exposé. Es geht um einen Film zu einem anstehenden Jubiläum.' };
  /** Exposé ohne eines der Wörter aus Name, Branche und Anlass, dafür mit „Tischlerei“. */
  const tischlerei = (): ResearchDoc => {
    const d = clone(exposeFixture) as ResearchDoc;
    const swap = (s: string) => s.replace(/Schreinerei|Holzwerk|Brandt|Handwerk|Jubiläum|Holz\w*|Möbel/g, 'Tischlerei');
    for (const k of Object.keys(d.fields)) d.fields[k] = swap(d.fields[k]);
    return d;
  };
  it('Synonyme des Steckbriefs zählen als Schlagwörter: „Tischlerei“ passt zur Schreinerei', () => {
    expect(schreinerei.profile.synonyme).toContain('Tischlerei');
    const alt = assignmentKeywords({ ...base, client: { name: schreinerei.name, branche: schreinerei.branche } });
    const neu = assignmentKeywords({ ...base, client: { name: schreinerei.name, branche: schreinerei.branche, profile: schreinerei.profile } });
    expect(alt).not.toContain('tischlerei');
    expect(neu).toContain('tischlerei');
    // Synonyme zählen auch dann, wenn sie in der Grundwortliste stehen
    expect(neu).toContain('holz');
    const doc = { ...tischlerei(), fields: { ...tischlerei().fields, logline: 'Eine Tischlerei feiert ihr Jubiläum mit allen Kundinnen und Kunden und zeigt, wie aus einem Brett ein Tisch entsteht, der Generationen überdauert.', inhalt: tischlerei().fields.inhalt.replace(/Tischlerei/g, 'Werkstatt') } };
    doc.fields.logline = doc.fields.logline.replace(/Jubiläum/, 'Fest');
    expect(ids(doc, { keywords: ['schreinerei', 'holzwerk', 'brandt', 'handwerk'] })).toContain('researchOffTopic');
    expect(ids(doc, { keywords: neu })).not.toContain('researchOffTopic');
  });
  it('Schlagwörter des Themas zählen, auch aus der Grundwortliste', () => {
    const thema = catalogs.themen.find(t => t.id === 'wi-schlaf')!;
    const k = assignmentKeywords({ client: { name: 'Wissenskanal Neugierwerk', branche: 'Online-Wissenschaftskanal' }, occasion: 'Recherche: Erklärvideo-Konzept', title: `Erklärvideo-Konzept: ${thema.titel}`, briefing: `Es geht um „${thema.titel}“.`, topic: thema });
    for (const w of ['schlaf', 'tiefschlaf', 'erholung']) expect(k).toContain(w);
  });
  it('alte Stände ohne profile und topic funktionieren wie vorher', () => {
    expect(assignmentKeywords({ client: { name: 'Kistenkraft', branche: 'Start-up für Lagersoftware' }, occasion: 'Recherche: Drehplan', title: 'Drehplan für Kistenkraft', briefing: '' })).toEqual(['kistenkraft', 'start', 'lagersoftwar']);
  });
});
