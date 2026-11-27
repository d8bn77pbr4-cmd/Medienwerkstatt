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
 * Dazu kommen die von Hand gepflegten Wörter des Steckbriefs (`client.profile.synonyme`) und des Themas
 * (`topic.schlagwoerter`); sie gelten auch dann, wenn sie in der Grundwortliste stehen (Holz, Schlaf, Wetter).
 */
export function assignmentKeywords(a: Pick<Assignment, 'client' | 'occasion' | 'title' | 'briefing' | 'topic'>): string[] {
  const out: string[] = [];
  const add = (word: string, curated = false) => {
    const lower = word.toLowerCase();
    if (lower.length < MIN_LETTERS || KEYWORD_STOP.has(lower) || (!curated && COMMON_WORDS.has(lower))) return;
    const stem = keywordStem(lower);
    if (!out.includes(stem)) out.push(stem);
  };
  wordsOf(a.client.name).forEach(w => add(w));
  wordsOf(a.client.branche).forEach(w => add(w));
  (a.client.profile?.synonyme ?? []).flatMap(wordsOf).forEach(w => add(w, true));
  nounsOf(a.occasion).forEach(w => add(w));
  nounsOf(a.title).forEach(w => add(w));
  nounsOf(topicOf(a.briefing)).forEach(w => add(w));
  (a.topic?.schlagwoerter ?? []).flatMap(wordsOf).forEach(w => add(w, true));
  return out;
}
