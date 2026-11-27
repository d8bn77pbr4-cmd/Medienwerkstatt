import { COMMON_WORDS, KEYWORD_STOP } from '../chef/wordlists';
import type { Assignment } from './types';

/** Wörter in Originalschreibung; Bindestriche, Satz- und Sonderzeichen trennen („Eröffnungs-Reel“ → Eröffnungs, Reel). */
const WORD_RE = /[A-Za-zÄÖÜäöüßÀ-ÖØ-öø-ÿ]+/g;
const MIN_LETTERS = 4;
const ENDINGS = ['en', 'er', 'es', 'e', 'n', 's'];

const wordsOf = (text: string): string[] => text.match(WORD_RE) ?? [];
/** Nomen: im Deutschen groß geschrieben. */
const nounsOf = (text: string): string[] => wordsOf(text).filter(w => /^[A-ZÄÖÜÀ-ÖØ-Þ]/.test(w));

/** Stamm für den Vergleich: eine Endung ab, solange vier Buchstaben bleiben (Kruste → krust, Eröffnungs → eröffnung). */
export function keywordStem(word: string): string {
  const w = word.toLowerCase();
  for (const e of ENDINGS) if (w.endsWith(e) && w.length - e.length >= MIN_LETTERS) return w.slice(0, -e.length);
  return w;
}

/** Das Thema des Recherche-Briefings („Es geht um … .“), sonst leer. */
function topicOf(briefing: string): string {
  return /Es geht um ([^.]*)\./.exec(briefing)?.[1] ?? '';
}

/**
 * Schlagwörter für den Themenbezug einer Recherche: Wörter des Kundennamens und der Branche, die Nomen aus Anlass,
 * Titel und dem Thema des Briefings („Es geht um …“). Ohne Stoppwörter (Grundwortliste, allgemeine Auftragswörter wie
 * „Recherche“, „Exposé“, „Film“) und ohne Wörter unter vier Buchstaben. Als Stämme, ohne Dubletten, in fester Reihenfolge.
 */
export function assignmentKeywords(a: Pick<Assignment, 'client' | 'occasion' | 'title' | 'briefing'>): string[] {
  const out: string[] = [];
  const add = (word: string) => {
    const lower = word.toLowerCase();
    if (lower.length < MIN_LETTERS || COMMON_WORDS.has(lower) || KEYWORD_STOP.has(lower)) return;
    const stem = keywordStem(lower);
    if (!out.includes(stem)) out.push(stem);
  };
  wordsOf(a.client.name).forEach(add);
  wordsOf(a.client.branche).forEach(add);
  nounsOf(a.occasion).forEach(add);
  nounsOf(a.title).forEach(add);
  nounsOf(topicOf(a.briefing)).forEach(add);
  return out;
}
