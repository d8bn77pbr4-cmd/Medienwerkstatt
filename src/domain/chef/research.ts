import type { ResearchTemplateId } from '../assignments/types';
import type { Rules } from './rules';
import { containsAny, countStems, isGibberish, similarity, tokens } from './textQuality';
import { makeDeduction, type Deduction } from './types';
import { AUDIENCE_STEMS, FILM_TERMS } from './wordlists';

export type ResearchField = { key: string; label: string; required: boolean; minWords?: number; maxWords?: number };
export type ResearchTemplate = { id: ResearchTemplateId; label: string; fields: ResearchField[] };
export type ResearchDoc = { templateId: ResearchTemplateId; fields: Record<string, string>; sources: string[] };

/** Ergebnis der Online-Prüfung eines Links (`check_urls`). */
export type SourceStatus = 'ok' | 'notFound' | 'unreachable';

/**
 * Zusatzwissen für die Bewertung: Schlagwörter des Auftrags (Themenbezug) und das Ergebnis der Link-Prüfung.
 * `offline`: Die Prüfung lief ohne Netz – dann kostet kein Link Punkte.
 */
export type ResearchContext = { keywords: string[]; sourceCheck?: Record<string, SourceStatus>; offline?: boolean; /** Themen-Auftrag: Hinweise nennen das Thema statt des Betriebs. */ topic?: boolean };

export const RESEARCH_TEMPLATES: Record<ResearchTemplateId, ResearchTemplate> = {
  expose: {
    id: 'expose',
    label: 'Exposé',
    fields: [
      { key: 'arbeitstitel', label: 'Arbeitstitel', required: true },
      { key: 'logline', label: 'Logline', required: true, minWords: 10, maxWords: 40 },
      { key: 'zielgruppe', label: 'Zielgruppe', required: true },
      { key: 'inhalt', label: 'Inhalt', required: true, minWords: 80, maxWords: 300 },
      { key: 'gestaltung', label: 'Gestaltungsidee', required: true, minWords: 40, maxWords: 200 },
      { key: 'laenge', label: 'Länge', required: true },
    ],
  },
  drehplan: {
    id: 'drehplan',
    label: 'Drehplan',
    fields: [
      { key: 'datum', label: 'Datum', required: true },
      { key: 'ort', label: 'Ort', required: true },
      { key: 'motive', label: 'Motive', required: true, minWords: 10, maxWords: 150 },
      { key: 'personen', label: 'Personen', required: true },
      { key: 'technik', label: 'Technikliste', required: true, minWords: 5, maxWords: 150 },
      { key: 'zeitplan', label: 'Zeitplan', required: true, minWords: 10, maxWords: 200 },
    ],
  },
  shotlist: {
    id: 'shotlist',
    label: 'Shotlist',
    fields: [
      { key: 'ueberblick', label: 'Überblick', required: true, minWords: 10, maxWords: 80 },
      { key: 'einstellungen', label: 'Einstellungen', required: true, minWords: 30, maxWords: 300 },
      { key: 'einstellungsgroessen', label: 'Einstellungsgrößen', required: true, minWords: 5, maxWords: 100 },
      { key: 'ton', label: 'Ton und Atmo', required: false, maxWords: 100 },
    ],
  },
  rechte: {
    id: 'rechte',
    label: 'Rechte-Recherche',
    fields: [
      { key: 'werk', label: 'Werk (Musik oder Bild)', required: true },
      { key: 'quelle', label: 'Quelle', required: true },
      { key: 'lizenz', label: 'Lizenz', required: true },
      { key: 'link', label: 'Link', required: true },
      { key: 'bedingungen', label: 'Bedingungen', required: true, minWords: 8, maxWords: 150 },
    ],
  },
  kaufberatung: {
    id: 'kaufberatung',
    label: 'Technik-Kaufberatung',
    fields: [
      { key: 'budget', label: 'Budget', required: true },
      { key: 'bedarf', label: 'Bedarf', required: true, minWords: 20, maxWords: 150 },
      { key: 'empfehlung', label: 'Empfehlung', required: true, minWords: 40, maxWords: 250 },
      { key: 'alternativen', label: 'Alternativen', required: true, minWords: 20, maxWords: 200 },
      { key: 'fazit', label: 'Fazit', required: true, minWords: 10, maxWords: 80 },
    ],
  },
  formatvergleich: {
    id: 'formatvergleich',
    label: 'Formatvergleich (Codecs)',
    fields: [
      { key: 'formate', label: 'Verglichene Formate', required: true },
      { key: 'qualitaet', label: 'Bildqualität', required: true, minWords: 20, maxWords: 200 },
      { key: 'dateigroesse', label: 'Dateigröße', required: true, minWords: 10, maxWords: 150 },
      { key: 'einsatz', label: 'Einsatzzweck', required: true, minWords: 20, maxWords: 200 },
      { key: 'empfehlung', label: 'Empfehlung', required: true, minWords: 10, maxWords: 100 },
    ],
  },
  meinung: {
    id: 'meinung',
    label: 'Kommentar',
    fields: [
      { key: 'these', label: 'These', required: true, minWords: 10, maxWords: 40 },
      { key: 'dafuer', label: 'Argumente dafür', required: true, minWords: 40, maxWords: 200 },
      { key: 'dagegen', label: 'Argumente dagegen', required: true, minWords: 40, maxWords: 200 },
      { key: 'fazit', label: 'Eigene Meinung und Fazit', required: true, minWords: 40, maxWords: 200 },
    ],
  },
  geschichte: {
    id: 'geschichte',
    label: 'Dossier',
    fields: [
      { key: 'ereignis', label: 'Ereignis', required: true, minWords: 10, maxWords: 60 },
      { key: 'zeitleiste', label: 'Zeitleiste', required: true, minWords: 20, maxWords: 200 },
      { key: 'ursachen', label: 'Ursachen', required: true, minWords: 30, maxWords: 200 },
      { key: 'folgen', label: 'Folgen', required: true, minWords: 30, maxWords: 200 },
      { key: 'heute', label: 'Bedeutung heute', required: true, minWords: 20, maxWords: 150 },
    ],
  },
  erklaer: {
    id: 'erklaer',
    label: 'Erklärvideo-Konzept',
    fields: [
      { key: 'kernfrage', label: 'Kernfrage', required: true, minWords: 5, maxWords: 30 },
      { key: 'zielgruppe', label: 'Zielgruppe', required: true },
      { key: 'kernaussagen', label: 'Drei Kernaussagen', required: true, minWords: 15, maxWords: 120 },
      { key: 'skript', label: 'Skript-Entwurf', required: true, minWords: 80, maxWords: 300 },
      { key: 'visualisierung', label: 'Visualisierung', required: true, minWords: 30, maxWords: 200 },
    ],
  },
};

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

const HTTP_URL = /^https?:\/\/\S+$/;

/** Quellen in der Form eines vollständigen http(s)-Links (noch ohne Prüfung auf Platzhalter und Dubletten). */
export function validSources(sources: string[]): string[] {
  return sources.filter(s => HTTP_URL.test(s.trim()));
}

/** Eine Quelle mit Host, ungefährer Domain (die letzten zwei Teile) und Platzhalter-Kennung. */
export type SourceInfo = { url: string; host: string; domain: string; placeholder: boolean };

/** Namen, die Platzhalter sind (`example.*`, `test.*` …), zusätzlich reine x-Folgen (`xxx.de`), nicht aber echte Namen wie xxxlutz.de. */
const PLACEHOLDER_NAMES = new Set(['example', 'beispiel', 'test', 'domain', 'url', 'abc']);
/** Echte Seiten mit Platzhalter-Namen: test.de ist die Stiftung Warentest. */
const REAL_DESPITE_NAME = new Set(['test.de']);

/** Liest eine Quelle; `null`, wenn sie kein vollständiger http(s)-Link ist. */
export function parseSource(source: string): SourceInfo | null {
  const url = source.trim();
  if (!HTTP_URL.test(url)) return null;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return null;
  }
  if (host === '') return null;
  const ip = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.startsWith('[') || host.includes(':');
  const labels = host.split('.');
  const single = labels.length < 2;
  const domain = ip || single ? host : labels.slice(-2).join('.');
  const named = labels.slice(0, -1).filter(l => l !== 'www');
  const placeholder =
    ip ||
    single ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    (!REAL_DESPITE_NAME.has(domain) && named.some(l => PLACEHOLDER_NAMES.has(l) || /^x{3,}$/.test(l)));
  return { url, host, domain, placeholder };
}

/** Echte Quellen (ohne Platzhalter), je Adresse einmal. */
function realSources(sources: string[]): SourceInfo[] {
  const seen = new Set<string>();
  const out: SourceInfo[] = [];
  for (const s of sources) {
    const p = parseSource(s);
    if (!p || p.placeholder || seen.has(p.url)) continue;
    seen.add(p.url);
    out.push(p);
  }
  return out;
}

/** Zählende Quellen: verschiedene Domains, ohne Platzhalter (zwei Links auf dieselbe Seite zählen einmal). */
export function countedSources(sources: string[]): number {
  return new Set(realSources(sources).map(s => s.domain)).size;
}

/** Höchstens so viele Links prüft die App beim Abgeben online (wie `check_urls`). */
export const MAX_CHECKED_SOURCES = 6;

/** Die Links, die beim Abgeben online geprüft werden: echte Quellen, je Adresse einmal, höchstens sechs. */
export function sourcesToCheck(sources: string[]): string[] {
  return realSources(sources)
    .slice(0, MAX_CHECKED_SOURCES)
    .map(s => s.url);
}

export type ResearchPoints = {
  emptyField: number;
  tooFewSources: number;
  lengthOutOfRange: number;
  minSources: number;
  copiedField: number;
  offTopic: number;
  implausibleField: number;
  placeholderSource: number;
  sourceNotFound: number;
  sourceUnreachable: number;
};

/** Punktwerte für Recherche in Kombi-Aufträgen (Kategorie Auftrag). */
export function kombiResearchPoints(rules: Rules): ResearchPoints {
  const a = rules.deductions.auftrag;
  return {
    emptyField: a.researchEmptyField,
    tooFewSources: a.researchTooFewSources,
    lengthOutOfRange: a.researchLengthOutOfRange,
    minSources: a.researchMinSources,
    ...rules.researchQuality.kombi,
  };
}

/** Punktwerte für reine Recherche-Aufträge. */
export function researchOnlyPoints(rules: Rules): ResearchPoints {
  const o = rules.deductions.researchOnly;
  return {
    emptyField: o.emptyField,
    tooFewSources: o.tooFewSources,
    lengthOutOfRange: o.lengthOutOfRange,
    minSources: rules.deductions.auftrag.researchMinSources,
    ...rules.researchQuality.researchOnly,
  };
}

type Finding = { label: string; soll: string; ist: string; fix: string };
type FieldCheck = (text: string, label: string) => Finding | null;

const DURATION_NUMBER = '(?:\\d+(?:[.,]\\d+)?|eine?|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|zwölf|fünfzehn|zwanzig|dreißig|vierzig|fünfzig|sechzig|neunzig|anderthalb|eineinhalb|halbe?)';
const DURATION_RE = new RegExp(`${DURATION_NUMBER}\\s*-?\\s*(?:s|sek|sekunden?|min|minuten?)(?![a-zäöüß])`, 'i');
const MINUTES_SECONDS_RE = /(?:^|\D)\d{1,2}:[0-5]\d(?!\d)/;
const MONTHS = 'januar|jänner|februar|märz|maerz|april|mai|juni|juli|august|september|oktober|november|dezember|jan|feb|mär|apr|jun|jul|aug|sep|sept|okt|nov|dez';
const DATE_RES = [
  /(?:^|\D)\d{1,2}\.\s?\d{1,2}\.(?:\s?\d{2,4})?/,
  /(?:^|\D)\d{4}-\d{2}-\d{2}(?!\d)/,
  /(?:^|\D)\d{1,2}\/\d{1,2}(?:\/\d{2,4})?(?!\d)/,
  new RegExp(`(?:^|\\d\\.?\\s*)(?:${MONTHS})(?![a-zäöüß])`, 'i'),
  new RegExp(`(?:^|[^a-zäöüß])(?:${MONTHS})\\.?\\s+\\d{4}`, 'i'),
  /(?:^|[^a-zäöüß])(?:montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonnabend|sonntag)(?![a-zäöüß])/i,
];
/** Abkürzungen, deren Punkt kein Satzende ist (z. B., ca., Nr. …). */
const ABBREVIATIONS = new Set(['ca', 'bzw', 'usw', 'etc', 'ggf', 'inkl', 'evtl', 'vgl', 'nr', 'dr', 'st', 'sog', 'bspw', 'jh', 'jhd', 'mio', 'mrd', 'min', 'sek', 'std', 'max', 'zb', 'ua', 'dh']);
const FILM_TERMS_MIN = 3;
const TIMELINE_YEARS_MIN = 3;
const KEY_POINTS_MIN = 3;
/** Jahreszahl von 1000 bis 2099, ohne weitere Ziffern daneben (kein Lookbehind: Safari vor 16.4 kennt ihn nicht). */
const YEAR_RE = /(?:^|\D)((?:1\d|20)\d{2})(?!\d)/g;

/** Satzenden zählen: Punkt, Ausrufe- und Fragezeichen – nicht nach Zahlen (50. Jubiläum), Einzelbuchstaben (z. B.) und Abkürzungen. */
export function sentenceEnds(text: string): number {
  let n = 0;
  const re = /([0-9A-Za-zÄÖÜäöüß]*)([.!?…]+)(?=["“”'’»«)\]]*(?:\s|$))/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const word = m[1].toLowerCase();
    const atEnd = text.slice(m.index + m[0].length).replace(/["“”'’»«)\]]/g, '').trim() === '';
    const abbreviation = m[2] === '.' && (/^\d+$/.test(word) || word.length === 1 || ABBREVIATIONS.has(word));
    if (!abbreviation || atEnd) n++;
  }
  return n;
}

const checkDuration: FieldCheck = (text, label) =>
  DURATION_RE.test(text) || MINUTES_SECONDS_RE.test(text)
    ? null
    : { label: `„${label}“ nennt keine Dauer`, soll: 'Dauer mit Zahl und Einheit, z. B. „90 Sekunden“ oder „1:30 Minuten“', ist: 'keine Dauer erkennbar', fix: `Gib im Feld „${label}“ die geplante Filmlänge mit Zahl und Einheit an, z. B. „90 Sekunden“.` };

const checkAudience: FieldCheck = (text, label) =>
  /\d/.test(text) || containsAny(text, AUDIENCE_STEMS)
    ? null
    : { label: `„${label}“ nennt keine Gruppe`, soll: 'Personengruppe oder Alter', ist: 'keine Gruppe erkennbar', fix: `Schreib ins Feld „${label}“, wen der Film erreichen soll, z. B. „Familien mit Kindern“ oder „Jugendliche ab 14“.` };

const checkFilmTerms: FieldCheck = (text, label) => {
  const n = countStems(text, FILM_TERMS);
  return n >= FILM_TERMS_MIN
    ? null
    : { label: `„${label}“ mit zu wenig Fachbegriffen`, soll: `mindestens ${FILM_TERMS_MIN} Fachbegriffe (Kamera, Licht, Schnitt, Ton …)`, ist: `${n} Fachbegriff${n === 1 ? '' : 'e'}`, fix: `Beschreib in „${label}“ Kamera, Licht, Schnitt und Ton mit Fachbegriffen, z. B. „Totale“, „Gegenlicht“, „J-Cut“ oder „Atmo“.` };
};

const checkSentence: FieldCheck = (text, label) => {
  const closed = /[.!?…]["“”'’»«)\]]*$/.test(text.trim());
  const n = sentenceEnds(text);
  if (closed && n <= 2) return null;
  return {
    label: `„${label}“ ist kein ganzer Satz`,
    soll: 'ein Satz mit Punkt, Ausrufe- oder Fragezeichen',
    ist: closed ? `${n} Sätze` : 'ohne Satzzeichen am Ende',
    fix: `Fass die Geschichte im Feld „${label}“ in einem ganzen Satz zusammen und schließ ihn mit einem Punkt ab.`,
  };
};

const checkDate: FieldCheck = (text, label) =>
  DATE_RES.some(re => re.test(text))
    ? null
    : { label: `„${label}“ nennt kein Datum`, soll: 'Datum, z. B. „Samstag, 13.03.2027“', ist: 'kein Datum erkennbar', fix: `Trag im Feld „${label}“ den Drehtag mit Datum ein, z. B. „13.03.2027“.` };

const checkAmount: FieldCheck = (text, label) =>
  /\d|€|(?:^|[^a-zäöüß])eur(?:o|os)?(?![a-zäöüß])/i.test(text)
    ? null
    : { label: `„${label}“ nennt keinen Betrag`, soll: 'Betrag, z. B. „150 €“', ist: 'keine Zahl', fix: `Schreib ins Feld „${label}“ den Betrag als Zahl, z. B. „150 €“.` };

const checkLink: FieldCheck = (text, label) =>
  text.split(/\s+/).some(w => parseSource(w.replace(/[.,;)]+$/, '')) !== null)
    ? null
    : { label: `„${label}“ ist keine gültige Adresse`, soll: 'vollständiger Link (https://…)', ist: 'kein http(s)-Link', fix: `Kopier die Adresse aus dem Browser vollständig ins Feld „${label}“, mit https:// am Anfang.` };

/** Verschiedene Jahreszahlen im Text (1000–2099). */
function distinctYears(text: string): number {
  const years = new Set<string>();
  for (let m = YEAR_RE.exec(text); m; m = YEAR_RE.exec(text)) years.add(m[1]);
  YEAR_RE.lastIndex = 0;
  return years.size;
}

const checkTimeline: FieldCheck = (text, label) => {
  const n = distinctYears(text);
  return n >= TIMELINE_YEARS_MIN
    ? null
    : {
        label: `„${label}“ nennt zu wenige Jahreszahlen`,
        soll: `mindestens ${TIMELINE_YEARS_MIN} verschiedene Jahreszahlen`,
        ist: `${n} Jahreszahl${n === 1 ? '' : 'en'}`,
        fix: `Ordne in „${label}“ die wichtigsten Ereignisse mit Jahreszahl, z. B. „1961: …“, „1989: …“.`,
      };
};

/** Einträge einer Aufzählung: Zeilen, Satzenden oder durch Semikolon getrennte Teile – das Größte davon. */
function listItems(text: string): number {
  const lines = text.split(/\n+/).filter(l => l.replace(/^\s*(?:[-–•*·]|\d+[.)])\s*/, '').trim() !== '').length;
  const semicolons = text.split(';').filter(p => p.trim() !== '').length;
  return Math.max(lines, semicolons, sentenceEnds(text));
}

const checkKeyPoints: FieldCheck = (text, label) => {
  const n = listItems(text);
  return n >= KEY_POINTS_MIN
    ? null
    : {
        label: `„${label}“ nennt zu wenige Punkte`,
        soll: `${KEY_POINTS_MIN} Kernaussagen, je eine pro Zeile oder Satz`,
        ist: `${n} Punkt${n === 1 ? '' : 'e'}`,
        fix: `Schreib in „${label}“ drei Kernaussagen, jede in einer eigenen Zeile oder einem eigenen Satz.`,
      };
};

/** Plausibilität einzelner Felder je Vorlage; alle anderen Felder prüfen nur die allgemeinen Regeln. */
const FIELD_CHECKS: Partial<Record<ResearchTemplateId, Record<string, FieldCheck>>> = {
  expose: { laenge: checkDuration, zielgruppe: checkAudience, gestaltung: checkFilmTerms, logline: checkSentence },
  drehplan: { datum: checkDate },
  kaufberatung: { budget: checkAmount },
  rechte: { link: checkLink },
  geschichte: { zeitleiste: checkTimeline },
  erklaer: { zielgruppe: checkAudience, kernaussagen: checkKeyPoints, visualisierung: checkFilmTerms },
};

/** Felder für den Themenbezug (die übrigen Vorlagen prüfen alle Pflichtfelder). */
const MAIN_FIELDS: Partial<Record<ResearchTemplateId, string[]>> = {
  expose: ['logline', 'inhalt'],
  meinung: ['these', 'fazit'],
  geschichte: ['ereignis', 'ursachen'],
  erklaer: ['kernfrage', 'kernaussagen'],
};

/** Mindestwörter je Feld für die Kopie-Prüfung und Grenze der Ähnlichkeit. */
const COPY_MIN_WORDS = 8;
const COPY_SIMILARITY = 0.8;

const shortUrl = (u: string) => (u.length > 60 ? `${u.slice(0, 57)}…` : u);
const quoted = (xs: string[]) => xs.map(x => `„${x}“`).join(', ');

export type ResearchAssessment = {
  deductions: Deduction[];
  /** Pflichtfelder mit Unsinn (Tastatursalat, Platzhalter, Wiederholung). */
  gibberishFields: number;
  requiredFields: number;
};

/**
 * Recherche bewerten (rein, offline): leere und unsinnige Pflichtfelder, Textlängen, Feldplausibilität, Kopien,
 * Themenbezug, Quellen (verschiedene Domains, Platzhalter) und – mit `ctx.sourceCheck` – die Online-Prüfung der Links.
 */
export function assessResearch(doc: ResearchDoc, template: ResearchTemplate, rules: Rules, r: ResearchPoints = kombiResearchPoints(rules), ctx?: ResearchContext): ResearchAssessment {
  const out: Deduction[] = [];
  const prefix = template.label;
  const ded = (ruleId: string, f: Finding, points: number) => out.push(makeDeduction(prefix, ruleId, 'auftrag', f.label, f.soll, f.ist, points, f.fix));
  /** Felder mit verständlichem Text (für Kopien und Themenbezug). */
  const sense = new Map<string, string>();
  let gibberishFields = 0;
  const checks = FIELD_CHECKS[template.id] ?? {};

  for (const f of template.fields) {
    const text = (doc.fields[f.key] ?? '').trim();
    if (text === '') {
      if (f.required) {
        ded('researchEmptyField', { label: `Pflichtfeld „${f.label}“ leer`, soll: 'ausgefüllt', ist: 'leer', fix: `Fülle das Feld „${f.label}“ aus.` }, r.emptyField);
      }
      continue;
    }
    if (isGibberish(text)) {
      // Unsinn zählt wie ein leeres Feld (gleiche Punkte, keine weiteren Prüfungen für dieses Feld).
      if (f.required) {
        gibberishFields++;
        ded(
          'researchGibberish',
          { label: `Pflichtfeld „${f.label}“ ist kein verständlicher Text`, soll: 'verständlicher Text', ist: 'Tastatursalat oder Platzhalter', fix: `Schreib ins Feld „${f.label}“ echten Text in ganzen Wörtern. Tastatursalat zählt wie ein leeres Feld.` },
          r.emptyField,
        );
      }
      continue;
    }
    sense.set(f.key, text);
    const n = wordCount(text);
    const below = f.minWords !== undefined && n < f.minWords;
    const above = f.maxWords !== undefined && n > f.maxWords;
    if (below || above) {
      ded(
        'researchLength',
        {
          label: `„${f.label}“ ${below ? 'zu kurz' : 'zu lang'}`,
          soll: `${f.minWords ?? 0}–${f.maxWords ?? '∞'} Wörter`,
          ist: `${n} Wörter`,
          fix: below ? `Schreibe zum Feld „${f.label}“ mehr, bis du mindestens ${f.minWords} Wörter hast.` : `Kürze das Feld „${f.label}“ auf höchstens ${f.maxWords} Wörter.`,
        },
        r.lengthOutOfRange,
      );
    }
    const finding = checks[f.key]?.(text, f.label);
    if (finding) ded('researchImplausible', finding, r.implausibleField);
  }

  // Kopien: zwei längere Felder mit fast denselben Wörtern (ein Abzug je Paar).
  const long = template.fields.filter(f => tokens(sense.get(f.key) ?? '').length >= COPY_MIN_WORDS);
  for (let i = 0; i < long.length; i++) {
    for (let j = i + 1; j < long.length; j++) {
      const a = long[i];
      const b = long[j];
      const sim = similarity(sense.get(a.key) ?? '', sense.get(b.key) ?? '');
      if (sim > COPY_SIMILARITY) {
        ded(
          'researchCopy',
          { label: `„${a.label}“ und „${b.label}“ sind fast gleich`, soll: 'eigener Text je Feld', ist: `${Math.round(sim * 100)} % gleiche Wörter`, fix: `Schreib für „${b.label}“ einen eigenen Text, statt „${a.label}“ zu wiederholen.` },
          r.copiedField,
        );
      }
    }
  }

  // Themenbezug: Mindestens ein Schlagwort des Auftrags in den Haupttextfeldern.
  const keywords = ctx?.keywords ?? [];
  if (keywords.length > 0) {
    const keys = MAIN_FIELDS[template.id];
    const main = keys ? template.fields.filter(f => keys.includes(f.key)) : template.fields.filter(f => f.required);
    const text = main.map(f => sense.get(f.key) ?? '').join(' ');
    if (text.trim() !== '' && !containsAny(text, keywords)) {
      const where = quoted(main.map(f => f.label));
      ded(
        'researchOffTopic',
        {
          label: 'Kein Bezug zum Auftrag',
          soll: ctx?.topic ? `Thema, Kunde oder Anlass in ${where}` : `Kunde, Branche oder Anlass in ${where}`,
          ist: 'kein Schlagwort gefunden',
          fix: ctx?.topic
            ? `Schreib in ${where}, worum es geht: Nenne das Thema aus dem Briefing und den Kunden oder den Anlass.`
            : `Schreib in ${where}, für wen und worum es geht: Nenne den Kunden, die Branche oder den Anlass aus dem Briefing.`,
        },
        r.offTopic,
      );
    }
  }

  // Quellen: verschiedene Domains zählen, Platzhalter nicht.
  const parsed = doc.sources.map(parseSource).filter((s): s is SourceInfo => s !== null);
  const sources = countedSources(doc.sources);
  if (sources < r.minSources) {
    ded(
      'researchSources',
      {
        label: 'Zu wenige Quellen',
        soll: `mindestens ${r.minSources} Quellen mit http(s)-Link von verschiedenen Seiten`,
        ist: `${sources} Quelle${sources === 1 ? '' : 'n'}`,
        fix: `Ergänze Quellen mit vollständigem Link (https://…) von verschiedenen Seiten, bis es mindestens ${r.minSources} sind.`,
      },
      r.tooFewSources,
    );
  }
  for (const p of parsed.filter(s => s.placeholder)) {
    ded(
      'researchPlaceholderSource',
      { label: `Platzhalter statt Quelle: ${p.host}`, soll: 'echte Seite, auf der du recherchiert hast', ist: shortUrl(p.url), fix: 'Ersetze Platzhalter wie „example.com“ oder „localhost“ durch die Adresse der Seite, auf der du wirklich nachgelesen hast.' },
      r.placeholderSource,
    );
  }

  // Online-Prüfung: 404 kostet immer, „nicht erreichbar“ nur, wenn ein anderer Link ging (sonst war das Netz weg).
  const check = ctx?.sourceCheck;
  if (check && !ctx?.offline) {
    const checked = realSources(doc.sources).filter(s => check[s.url] !== undefined);
    const online = checked.some(s => check[s.url] === 'ok');
    for (const s of checked) {
      if (check[s.url] === 'notFound') {
        ded('researchSourceNotFound', { label: `Link führt ins Leere: ${s.host}`, soll: 'Seite vorhanden', ist: `${shortUrl(s.url)} – Seite nicht gefunden (404)`, fix: 'Öffne den Link im Browser und trag die richtige Adresse ein – oder such eine andere Quelle.' }, r.sourceNotFound);
      } else if (check[s.url] === 'unreachable' && online) {
        ded('researchSourceUnreachable', { label: `Link nicht erreichbar: ${s.host}`, soll: 'Seite erreichbar', ist: `${shortUrl(s.url)} – keine Antwort`, fix: 'Prüf den Link im Browser. Ist die Seite weg, such dir eine andere Quelle.' }, r.sourceUnreachable);
      }
    }
  }

  return { deductions: out, gibberishFields, requiredFields: template.fields.filter(f => f.required).length };
}

/** Nur die Abzüge (siehe `assessResearch`). */
export function evaluateResearch(doc: ResearchDoc, template: ResearchTemplate, rules: Rules, r: ResearchPoints = kombiResearchPoints(rules), ctx?: ResearchContext): Deduction[] {
  return assessResearch(doc, template, rules, r, ctx).deductions;
}
