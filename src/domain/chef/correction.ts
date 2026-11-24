import type { Assignment } from '../assignments/types';
import type { Rules } from './rules';
import type { Evaluation } from './types';

const HOUR_MS = 3_600_000;

export type CorrectionRefusal = 'window' | 'used';
export type CorrectionCheck = { ok: true } | { ok: false; reason: CorrectionRefusal };

/**
 * Nachbessern (Spec §9.3): `rules.correction.loops` Korrekturschleifen je Auftrag, innerhalb von
 * `rules.correction.windowHours` nach der ERSTEN Bewertung. „Schon genutzt“ hat Vorrang vor „Frist“.
 */
export function canCorrect(a: Assignment, evaluations: Evaluation[], now: number, rules: Rules): CorrectionCheck {
  const mine = evaluations.filter((e) => e.assignmentId === a.id);
  const used = Math.max(a.submissions.filter((s) => s.isCorrection).length, mine.length - 1);
  if (used >= rules.correction.loops) return { ok: false, reason: 'used' };
  if (mine.length === 0) return { ok: false, reason: 'window' };
  const first = Math.min(...mine.map((e) => e.at));
  if (now - first > rules.correction.windowHours * HOUR_MS) return { ok: false, reason: 'window' };
  return { ok: true };
}

/** Wann das Nachbessern endet (Epoch-ms), `null` ohne Bewertung. */
export function correctionDeadline(a: Assignment, evaluations: Evaluation[], rules: Rules): number | null {
  const mine = evaluations.filter((e) => e.assignmentId === a.id);
  return mine.length === 0 ? null : Math.min(...mine.map((e) => e.at)) + rules.correction.windowHours * HOUR_MS;
}

export function correctionBlockedText(reason: CorrectionRefusal, rules: Pick<Rules, 'correction'>): string {
  const hours = rules.correction.windowHours;
  return reason === 'used'
    ? 'Nachbessern ist nur einmal pro Auftrag möglich, und das ist schon passiert.'
    : `Nachbessern ist nur innerhalb von ${hours} Stunden nach der ersten Abnahme möglich. Die Zeit ist abgelaufen.`;
}
