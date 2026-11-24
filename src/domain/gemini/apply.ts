import { phraseFor } from '../chef/phrases';
import { totalOf } from '../chef/evaluate';
import type { Rules } from '../chef/rules';
import type { CategoryResult, Evaluation } from '../chef/types';
import type { GeminiKey, GeminiResult } from './schema';

const GROUP: Record<GeminiKey, 'gestaltung' | 'auftrag'> = {
  bildaufbau: 'gestaltung',
  einstellungsgroessen: 'gestaltung',
  licht: 'gestaltung',
  farbe: 'gestaltung',
  briefing: 'auftrag',
  inhalt: 'auftrag',
};

const within = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Gemini-Urteil anwenden (Spec §9.5): Summe der Verschiebungen auf ±`rules.gemini.maxShift` klemmen, dann auf
 * Gestaltung und Auftrag verteilen. Technik, Kategorien mit `max: 0` (Recherche-Aufträge) und alles außerhalb
 * von 0…max bleiben unberührt; die Gesamtpunkte folgen derselben Rechnung wie beim Regel-Chef.
 */
export function applyGemini(e: Evaluation, g: GeminiResult, rules: Rules, opts: { isCorrection?: boolean } = {}): Evaluation {
  const raw = { gestaltung: 0, auftrag: 0 };
  for (const c of g.criteria) if (e.categories[GROUP[c.key]].max > 0) raw[GROUP[c.key]] += c.shift;
  const active = (['gestaltung', 'auftrag'] as const).filter((k) => e.categories[k].max > 0);
  const sum = active.reduce((s, k) => s + raw[k], 0);
  const limit = rules.gemini.maxShift;
  const total = Math.round(within(sum, -limit, limit));
  // Erst klemmen, dann verteilen: bei Überschreitung anteilig, der Rest geht an die letzte Kategorie.
  const scale = Math.abs(sum) > limit ? total / sum : 1;
  const want: Record<'gestaltung' | 'auftrag', number> = { gestaltung: 0, auftrag: 0 };
  let left = total;
  active.forEach((k, i) => {
    want[k] = i === active.length - 1 ? left : Math.round(raw[k] * scale);
    left -= want[k];
  });

  const categories = { ...e.categories };
  const applied = { gestaltung: 0, auftrag: 0 };
  for (const k of active) {
    const c = e.categories[k];
    const points = within(c.points + want[k], 0, c.max);
    applied[k] = points - c.points;
    categories[k] = { ...c, points } satisfies CategoryResult;
  }
  const next: Evaluation = {
    ...e,
    categories,
    total: totalOf(categories, e.bonus, e.late, rules, opts.isCorrection ?? false),
    gemini: g,
    geminiShift: applied,
  };
  delete next.geminiNote;
  next.phrase = phraseFor(next, rules);
  return next;
}
