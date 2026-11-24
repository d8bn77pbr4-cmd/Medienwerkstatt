import type { Assignment } from '../assignments/types';
import { phraseFor } from './phrases';
import { evaluateResearch, kombiResearchPoints, RESEARCH_TEMPLATES, researchOnlyPoints } from './research';
import { elementRules, hookAndDeliverableRules } from './rules/auftrag';
import { gestaltungRules } from './rules/gestaltung';
import { technikRules } from './rules/technik';
import type { Rules } from './rules';
import { makeDeduction, type CategoryResult, type Deduction, type Evaluation, type EvaluationInput } from './types';

export type { Deduction, Evaluation, EvaluationInput, ProjectFacts } from './types';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** −10 je angefangene 24 h nach der Frist, höchstens `maxDays` Tage; `null` wenn pünktlich. */
export function applyLate(assignment: Assignment, submittedAt: number, rules: Rules): Deduction | null {
  if (submittedAt <= assignment.deadline) return null;
  const started = Math.ceil((submittedAt - assignment.deadline) / DAY_MS);
  const counted = Math.min(started, rules.frist.maxDays);
  return makeDeduction('', 'late', 'frist', 'Zu spät abgegeben', 'pünktlich zur Frist', `${started} Tag${started === 1 ? '' : 'e'} zu spät`, rules.frist.perDay * counted,
    'Plane die Abgabe früher: Lege dir einen Puffer vor der Frist, damit der Export nicht in die Verspätung rutscht.');
}

/** Gesamtpunkte aus Kategorien, Bonus und Verspätung (Spec §9.2/§9.3): Deckel, Verspätung, Korrekturgrenze. */
export function totalOf(categories: Evaluation['categories'], bonus: Deduction[], late: Deduction | null, rules: Rules, isCorrection: boolean): number {
  const bonusSum = Math.min(rules.bonus.max, bonus.reduce((s, b) => s + b.points, 0));
  const sum = categories.technik.points + categories.gestaltung.points + categories.auftrag.points + bonusSum;
  const total = Math.max(0, Math.min(rules.maxScore, sum) + (late?.points ?? 0));
  return isCorrection ? Math.min(total, rules.correction.maxScore) : total;
}

function category(max: number, deductions: Deduction[]): CategoryResult {
  return { max, points: Math.max(0, max + deductions.reduce((s, d) => s + d.points, 0)), deductions };
}

export function evaluate(input: EvaluationInput, rules: Rules): Evaluation {
  const { assignment: a } = input;
  const d = rules.deductions;
  const videoDeliverables = a.deliverables.filter(x => x.kind === 'video' && x.videoSpec);
  const prefixFor = (label: string) => (videoDeliverables.length > 1 ? label : '');

  const technik: Deduction[] = [];
  const gestaltung: Deduction[] = [];
  const researchOnly = !a.deliverables.some(x => x.kind === 'video');
  const ro = d.researchOnly;
  const pts = researchOnly ? { missingDeliverable: ro.missingDeliverable, hookNotMet: ro.hookNotMet } : { missingDeliverable: d.auftrag.missingDeliverable, hookNotMet: d.auftrag.hookNotMet };
  const auftrag: Deduction[] = hookAndDeliverableRules(a, input.videos, input.research, input.selfChecks.hookDone, rules, pts);
  let videosPresent = 0;
  for (const del of videoDeliverables) {
    const v = input.videos[del.id];
    if (!v || !del.videoSpec) continue;
    videosPresent++;
    const prefix = prefixFor(del.label);
    technik.push(...technikRules(del.videoSpec, v, rules, prefix));
    gestaltung.push(...gestaltungRules(del.videoSpec, v, a.hook, rules, prefix));
    auftrag.push(...elementRules(del.videoSpec, v, rules, prefix));
  }
  for (const del of a.deliverables) {
    if (del.kind !== 'research') continue;
    const doc = input.research[del.id];
    if (doc) auftrag.push(...evaluateResearch(doc, RESEARCH_TEMPLATES[del.researchTemplate ?? doc.templateId], rules, researchOnly ? researchOnlyPoints(rules) : kombiResearchPoints(rules)));
  }

  if (videoDeliverables.length > 0 && videosPresent === 0) {
    const none = (id: string, cat: 'technik' | 'gestaltung', max: number) =>
      makeDeduction('', id, cat, 'Kein Film abgegeben', 'Film nach Vorgabe', 'fehlt', -max, 'Exportiere den Film in der Werkstatt und gib ihn erneut ab.', 'export');
    technik.push(none('noVideoTechnik', 'technik', d.technik.max));
    gestaltung.push(none('noVideoGestaltung', 'gestaltung', d.gestaltung.max));
  }

  const bonus: Deduction[] = [];
  // Ohne tatsächlich vorliegende Abgabe gibt es keinen Frühbonus (sonst lohnte sich die leere Abgabe).
  const researchPresent = a.deliverables.filter(x => x.kind === 'research' && input.research[x.id]).length;
  if (videosPresent + researchPresent > 0 && input.submittedAt <= a.deadline - rules.bonus.earlyHours * HOUR_MS) {
    bonus.push(makeDeduction('', 'early24h', 'bonus', 'Früh abgegeben', `≥ ${rules.bonus.earlyHours} h vor der Frist`, 'erfüllt', rules.bonus.early24h, ''));
  }
  if (videosPresent > 0 && videosPresent === videoDeliverables.length && technik.length === 0) {
    bonus.push(makeDeduction('', 'allTechPerfect', 'bonus', 'Alle Technikwerte perfekt', 'keine Technik-Abzüge', 'erfüllt', rules.bonus.allTechPerfect, ''));
  }

  const categories = researchOnly
    ? { technik: category(0, []), gestaltung: category(0, []), auftrag: category(ro.max, auftrag) }
    : { technik: category(d.technik.max, technik), gestaltung: category(d.gestaltung.max, gestaltung), auftrag: category(d.auftrag.max, auftrag) };
  const late = applyLate(a, input.submittedAt, rules);
  const total = totalOf(categories, bonus, late, rules, input.isCorrection);

  const e: Evaluation = { id: `${a.id}:${input.submittedAt}`, assignmentId: a.id, at: input.submittedAt, categories, bonus, late, total, phrase: '' };
  e.phrase = phraseFor(e, rules);
  return e;
}
