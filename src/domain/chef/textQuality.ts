/**
 * Textprüfung für Recherche-Felder: reine Funktionen, offline, ohne Zufall. Erkennt Tastatursalat, Platzhalter,
 * Lorem ipsum und Wiederholung; misst Ähnlichkeit (Kopien) und findet Stämme (Fach- und Schlagwörter).
 */
import { COMMON_WORDS, FILM_TERMS, KNOWN_ABBREVIATIONS, PLACEHOLDER_WORDS } from './wordlists';

const LETTERS = 'a-zäöüßàáâãåæçèéêëìíîïñòóôõøùúûýÿœ';
const WORD_RE = new RegExp(`[${LETTERS}]+`, 'g');
const CAP_WORD_RE = new RegExp(`[${LETTERS}A-ZÄÖÜÀ-ÝŒ]+`, 'g');
const NON_LETTER_RE = new RegExp(`[^${LETTERS}]`);
const VOWEL_RE = /[aeiouyäöüàáâãåæèéêëìíîïòóôõøùúûýÿœ]/;
const NUMBER_RE = /\d+/g;

/** Wörter in Kleinschreibung (Buchstaben inkl. äöüß und Akzente); Ziffern und Zeichen trennen. */
export function tokens(text: string): string[] {
  return text.toLowerCase().match(WORD_RE) ?? [];
}

/** Anzahl der Zahlen (Ziffernfolgen) im Text. */
export function numberCount(text: string): number {
  return (text.match(NUMBER_RE) ?? []).length;
}

/**
 * Tastenreihen (QWERTZ und QWERTY, vorwärts und rückwärts). Ein Wort mit vier Tasten am Stück aus einer Reihe gilt
 * als Tastatursalat. Ausgenommen sind Folgen, die in echten Wörtern stecken: „wert“ (bewerten), „ertz“ (Hertz),
 * „erty“ (Liberty).
 */
const ROWS = ['qwertzuiopü', 'asdfghjklöä', 'yxcvbnm', 'qwertyuiop', 'zxcvbnm'];
const RUN_EXCEPTIONS = new Set(['wert', 'ertz', 'erty', 'trew', 'ztre', 'ytre']);
const ROW_RUNS: readonly string[] = (() => {
  const out = new Set<string>();
  for (const row of ROWS) {
    for (const r of [row, [...row].reverse().join('')]) {
      for (let i = 0; i + 4 <= r.length; i++) {
        const run = r.slice(i, i + 4);
        if (!RUN_EXCEPTIONS.has(run)) out.add(run);
      }
    }
  }
  return [...out];
})();

/** Endungen, die vor dem Nachschlagen in der Grundwortliste abgeschnitten werden dürfen (neuen → neu). */
const ENDINGS = ['em', 'en', 'er', 'es', 'e', 'n', 's'];

/** Steht das Wort (oder seine Grundform ohne Endung) in der Grundwortliste, den Kürzeln oder den Fachwörtern? */
export function isKnownWord(t: string): boolean {
  if (COMMON_WORDS.has(t) || KNOWN_ABBREVIATIONS.has(t)) return true;
  for (const e of ENDINGS) if (t.length > e.length + 1 && t.endsWith(e) && COMMON_WORDS.has(t.slice(0, -e.length))) return true;
  return FILM_TERMS.some(s => !NON_LETTER_RE.test(s) && t.startsWith(s));
}

/**
 * Unplausibles Wort: Platzhalter (test, asdf, lorem …); vier oder mehr Buchstaben ohne Vokal (aeiouyäöü);
 * drei oder mehr gleiche Buchstaben am Stück (genau drei in langen Wörtern sind erlaubt: Schifffahrt, Brennnessel);
 * „j“ vor einem Mitlaut oder „q“ ohne „u“; eine Tastenreihe (qwer, asdf, jklö, yxcv, uiop …).
 * Wörter der Grundwortliste und bekannte Kürzel (DSLR, JPG …) sind plausibel.
 */
export function isImplausible(t: string): boolean {
  if (PLACEHOLDER_WORDS.has(t)) return true;
  if (COMMON_WORDS.has(t) || KNOWN_ABBREVIATIONS.has(t)) return false;
  if (t.length >= 4 && !VOWEL_RE.test(t)) return true;
  const repeat = /(.)\1{2,}/.exec(t);
  if (repeat && (repeat[0].length > 3 || t.length < 8)) return true;
  // Im Deutschen folgt auf „j“ ein Vokal und auf „q“ ein „u“ (jfkd, qwd sind Tippsalat).
  if (/j[bcdfghjklmnpqrstvwxzß]|q[a-tv-zäöüß]/.test(t)) return true;
  return ROW_RUNS.some(r => t.includes(r));
}

/**
 * Anteil bekannter Wörter (Grundwortliste mit Funktionswörtern, Kürzel, Fachwörter); Zahlen zählen als bekannt.
 * Deutscher Text liegt meist weit über 0,3; Tastatursalat und Lorem ipsum nahe 0. Leerer Text: 0.
 */
export function functionWordShare(text: string): number {
  const t = tokens(text);
  const n = numberCount(text);
  if (t.length + n === 0) return 0;
  return (t.filter(isKnownWord).length + n) / (t.length + n);
}

/** Anteil unplausibler Wörter; Zahlen zählen als plausibel. Leerer Text: 0. */
export function implausibleShare(text: string): number {
  const t = tokens(text);
  const n = numberCount(text);
  if (t.length + n === 0) return 0;
  return t.filter(isImplausible).length / (t.length + n);
}

/** Verhältnis verschiedener Wörter zu allen Wörtern (1 = keine Wiederholung). Leerer Text: 1. */
export function typeTokenRatio(text: string): number {
  const t = tokens(text);
  return t.length === 0 ? 1 : new Set(t).size / t.length;
}

/**
 * Sieht der Text wie eine Liste aus (Motive, Technikliste, Stichpunkte)? Dann fehlen Funktionswörter ganz natürlich.
 * Liste: mindestens ein Trennzeichen (Komma, Semikolon, Zeilenumbruch, Aufzählungspunkt) je vier Wörter, oder mindestens
 * 60 % groß geschriebene Wörter (deutsche Nomen-Reihe). Lorem ipsum und Tastatursalat sind beides nicht.
 */
export function looksLikeList(text: string): boolean {
  const t = tokens(text);
  if (t.length === 0) return false;
  const separators = (text.match(/[,;\n•·]/g) ?? []).length;
  const words = text.match(CAP_WORD_RE) ?? [];
  const capitalized = words.filter(w => /^[A-ZÄÖÜÀ-ÝŒ]/.test(w)).length;
  return separators * 4 >= t.length || capitalized >= 0.6 * words.length;
}

/** Schwellen der Unsinn-Erkennung. */
export const GIBBERISH = {
  /** Ab so vielen Wörtern gelten die Regeln für längere Texte. */
  longTextWords: 8,
  minFunctionWordShare: 0.12,
  maxImplausibleShareLong: 0.35,
  minTypeTokenRatio: 0.3,
  typeTokenMinWords: 10,
  maxImplausibleShareShort: 0.5,
} as const;

/**
 * Ist der Text Unsinn (Tastatursalat, Platzhalter, Lorem ipsum, Wiederholung)?
 * - Ab `minWords` Wörtern (Standard 8): Anteil bekannter Wörter < 0,12 (nicht bei Listen), ODER unplausible Wörter > 35 %,
 *   ODER (ab 10 Wörtern) Verhältnis verschiedener zu allen Wörtern < 0,3.
 * - Kurze Felder: unplausible Wörter > 50 %, kein echtes Wort (mindestens zwei Buchstaben) und keine Zahl, oder
 *   dasselbe Wort mindestens dreimal und sonst nichts.
 * Leerer Text ist kein Unsinn (dafür gibt es die Regel „leer“).
 */
export function isGibberish(text: string, minWords: number = GIBBERISH.longTextWords): boolean {
  if (text.trim() === '') return false;
  const t = tokens(text);
  const g = GIBBERISH;
  if (t.length >= minWords) {
    if (implausibleShare(text) > g.maxImplausibleShareLong) return true;
    if (t.length >= g.typeTokenMinWords && typeTokenRatio(text) < g.minTypeTokenRatio) return true;
    return functionWordShare(text) < g.minFunctionWordShare && !looksLikeList(text);
  }
  const realWord = t.some(w => w.length >= 2 && !isImplausible(w));
  if (!realWord && numberCount(text) === 0) return true;
  if (t.length >= 3 && new Set(t).size === 1) return true;
  return implausibleShare(text) > g.maxImplausibleShareShort;
}

/** Jaccard-Ähnlichkeit der Wortmengen (0 = nichts gemeinsam, 1 = gleiche Wörter). Beide leer: 0. */
export function similarity(a: string, b: string): number {
  const sa = new Set(tokens(a));
  const sb = new Set(tokens(b));
  if (sa.size === 0 && sb.size === 0) return 0;
  let both = 0;
  for (const w of sa) if (sb.has(w)) both++;
  return both / (sa.size + sb.size - both);
}

function stemHit(stem: string, toks: string[], lower: string): boolean {
  const s = stem.toLowerCase();
  // Stämme mit Zeichen (J-Cut, O-Ton, 16:9, „slow motion“) im ganzen Text suchen.
  if (NON_LETTER_RE.test(s)) return lower.includes(s);
  // Ab vier Buchstaben auch mitten im Wort (Gegenlicht, Stammkunden), kürzere nur am Wortanfang (Ton, Nah, LUT).
  return toks.some(t => (s.length >= 4 ? t.includes(s) : t.startsWith(s)));
}

/** Wie viele der Stämme kommen im Text vor (ohne Groß-/Kleinschreibung)? Jeder Stamm zählt einmal. */
export function countStems(text: string, stems: readonly string[]): number {
  const toks = tokens(text);
  const lower = text.toLowerCase();
  return stems.filter(s => s.trim() !== '' && stemHit(s, toks, lower)).length;
}

/** Kommt mindestens einer der Stämme im Text vor (ohne Groß-/Kleinschreibung)? */
export function containsAny(text: string, stems: readonly string[]): boolean {
  const toks = tokens(text);
  const lower = text.toLowerCase();
  return stems.some(s => s.trim() !== '' && stemHit(s, toks, lower));
}
