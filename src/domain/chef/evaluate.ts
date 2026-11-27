import { assignmentKeywords } from '../assignments/keywords';
import type { Assignment } from '../assignments/types';
import { phraseFor } from './phrases';
import { assessResearch, kombiResearchPoints, RESEARCH_TEMPLATES, researchOnlyPoints, type ResearchAssessment, type ResearchContext } from './research';
import { elementRules, hookAndDeliverableRules } from './rules/auftrag';
import { gestaltungRules } from './rules/gestaltung';
import { technikRules } from './rules/technik';
import type { Rules } from './rules';
import { makeDeduction, type CategoryResult, type Deduction, type Evaluation, type EvaluationInput } from './types';

export type { Deduction, Evaluation, EvaluationInput, ProjectFacts } from './types';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** Hinweis im Protokoll, wenn die Links ohne Netz nicht geprüft werden konnten. */
export const SOURCE_NOTE_OFFLINE = 'Links nicht online geprüft – keine Verbindung. Das kostet keine Punkte.';

/** −10 je angefangene 24 h nach der Frist, höchstens `maxDays` Tage; `null` wenn pünktlich. */
export function applyLate(assignment: Assignment, submittedAt: number, rules: Rules): Deduction | null {
  if (submittedAt <= assignment.deadline) return null;
  const started = Math.ceil((submittedAt - assignment.deadline) / DAY_MS);
  const counted = Math.min(started, rules.frist.maxDays);
  return makeDeduction('', 'late', 'frist', 'Zu spät abgegeben', 'pünktlich zur Frist', `${started} Tag${started === 1 ? '' : 'e'} zu spät`, rules.frist.perDay * counted,
    'Plane die Abgabe früher: Lege dir einen Puffer vor der Frist, damit der Export nicht in die Verspätung rutscht.');
}

/**
 * Gesamtpunkte aus Kategorien, Bonus und Verspätung (Spec §9.2/§9.3): Deckel, Verspätung, Korrekturgrenze.
 * `capTotal`: Höchstpunktzahl dieser Bewertung (Recherche-Auftrag aus Unsinn), gilt nach Bonus und Gemini.
 */
export function totalOf(categories: Evaluation['categories'], bonus: Deduction[], late: Deduction | null, rules: Rules, isCorrection: boolean, capTotal?: number): number {
  const bonusSum = Math.min(rules.bonus.max, bonus.reduce((s, b) => s + b.points, 0));
  const sum = categories.technik.points + categories.gestaltung.points + categories.auftrag.points + bonusSum;
  const total = Math.max(0, Math.min(rules.maxScore, sum) + (late?.points ?? 0));
  const capped = capTotal === undefined ? total : Math.min(total, capTotal);
  return isCorrection ? Math.min(capped, rules.correction.maxScore) : capped;
}

/** Sind so viele Pflichtfelder Unsinn, dass die Recherche nicht zählt (mindestens `gibberishCapShare`, Standard: die Hälfte)? */
export function researchIsGibberish(r: Pick<ResearchAssessment, 'gibberishFields' | 'requiredFields'>, rules: Rules): boolean {
  return r.gibberishFields > 0 && r.gibberishFields >= rules.researchQuality.gibberishCapShare * r.requiredFields;
}

/** Abzug „Recherche gedeckelt“: steht im Protokoll, auch wenn er nichts mehr abzieht (die Punkte lagen schon darunter). */
function gibberishCap(prefix: string, r: ResearchAssessment, points: number, researchOnly: boolean, rules: Rules): Deduction {
  const cap = rules.researchQuality.gibberishCapTotal;
  return makeDeduction(
    prefix,
    'researchGibberishCap',
    'auftrag',
    researchOnly ? `Recherche auf höchstens ${cap} Punkte gedeckelt` : 'Recherche zählt nicht',
    'verständlicher Text in den Pflichtfeldern',
    `${r.gibberishFields} von ${r.requiredFields} Pflichtfeldern unverständlich`,
    points,
    researchOnly
      ? `Schreib die Pflichtfelder als echten Text. Sind mindestens die Hälfte Tastatursalat, gibt es höchstens ${cap} Punkte.`
      : 'Schreib die Pflichtfelder als echten Text. Sind mindestens die Hälfte Tastatursalat, zählt die Recherche wie eine fehlende Abgabe.',
  );
}

export function category(max: number, deductions: Deduction[]): CategoryResult {
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
  const ctx: ResearchContext = { keywords: assignmentKeywords(a), sourceCheck: input.sourceCheck, offline: input.sourcesOffline, topic: a.topic !== undefined };
  // Unsinn zählt nicht als vorliegende Abgabe (kein Frühbonus, wie bei der leeren Abgabe).
  let researchPresent = 0;
  let researchDocs = 0;
  let gibberish: { prefix: string; r: ResearchAssessment } | null = null;
  for (const del of a.deliverables) {
    if (del.kind !== 'research') continue;
    const doc = input.research[del.id];
    if (!doc) continue;
    researchDocs++;
    const template = RESEARCH_TEMPLATES[del.researchTemplate ?? doc.templateId];
    const r = assessResearch(doc, template, rules, researchOnly ? researchOnlyPoints(rules) : kombiResearchPoints(rules), ctx);
    auftrag.push(...r.deductions);
    if (!researchIsGibberish(r, rules)) {
      researchPresent++;
      continue;
    }
    gibberish ??= { prefix: template.label, r };
    if (!researchOnly) {
      // Kombi: Der Recherche-Anteil am Auftrag fällt auf 0 – sie kostet mindestens so viel wie eine fehlende Abgabe.
      const sum = r.deductions.reduce((s, x) => s + x.points, 0);
      auftrag.push(gibberishCap(template.label, r, Math.min(0, d.auftrag.missingDeliverable - sum), false, rules));
    }
  }
  // Recherche-Auftrag: höchstens `gibberishCapTotal` Punkte (der Abzug bringt die Kategorie dorthin).
  const capTotal = researchOnly && gibberish ? rules.researchQuality.gibberishCapTotal : undefined;
  if (capTotal !== undefined && gibberish) {
    const before = Math.max(0, ro.max + auftrag.reduce((s, x) => s + x.points, 0));
    auftrag.push(gibberishCap(gibberish.prefix, gibberish.r, Math.min(0, capTotal - before), true, rules));
  }

  if (videoDeliverables.length > 0 && videosPresent === 0) {
    const none = (id: string, cat: 'technik' | 'gestaltung', max: number) =>
      makeDeduction('', id, cat, 'Kein Film abgegeben', 'Film nach Vorgabe', 'fehlt', -max, 'Exportiere den Film in der Werkstatt und gib ihn erneut ab.', 'export');
    technik.push(none('noVideoTechnik', 'technik', d.technik.max));
    gestaltung.push(none('noVideoGestaltung', 'gestaltung', d.gestaltung.max));
  }

  const bonus: Deduction[] = [];
  // Ohne tatsächlich vorliegende Abgabe gibt es keinen Frühbonus (sonst lohnte sich die leere Abgabe).
  // Korrektur: Frist und Frühbonus messen an der ersten Abgabe.
  const basisAt = input.isCorrection && input.lateBasisAt !== undefined ? input.lateBasisAt : input.submittedAt;
  if (videosPresent + researchPresent > 0 && basisAt <= a.deadline - rules.bonus.earlyHours * HOUR_MS) {
    bonus.push(makeDeduction('', 'early24h', 'bonus', 'Früh abgegeben', `≥ ${rules.bonus.earlyHours} h vor der Frist`, 'erfüllt', rules.bonus.early24h, ''));
  }
  if (videosPresent > 0 && videosPresent === videoDeliverables.length && technik.length === 0) {
    bonus.push(makeDeduction('', 'allTechPerfect', 'bonus', 'Alle Technikwerte perfekt', 'keine Technik-Abzüge', 'erfüllt', rules.bonus.allTechPerfect, ''));
  }

  const categories = researchOnly
    ? { technik: category(0, []), gestaltung: category(0, []), auftrag: category(ro.max, auftrag) }
    : { technik: category(d.technik.max, technik), gestaltung: category(d.gestaltung.max, gestaltung), auftrag: category(d.auftrag.max, auftrag) };
  const late = applyLate(a, basisAt, rules);
  const total = totalOf(categories, bonus, late, rules, input.isCorrection, capTotal);

  const e: Evaluation = { id: `${a.id}:${input.submittedAt}`, assignmentId: a.id, at: input.submittedAt, categories, bonus, late, total, phrase: '' };
  if (capTotal !== undefined) e.capTotal = capTotal;
  if (input.sourcesOffline && researchDocs > 0) e.sourceNote = SOURCE_NOTE_OFFLINE;
  e.phrase = phraseFor(e, rules);
  return e;
}
