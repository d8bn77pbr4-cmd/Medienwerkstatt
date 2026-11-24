import type { Measurements } from '../../backend/types';
import type { Assignment } from '../assignments/types';
import type { ShotSize } from '../assignments/types';
import type { GeminiResult } from '../gemini/schema';
import type { ResearchDoc } from './research';

export type Category = 'technik' | 'gestaltung' | 'auftrag' | 'frist' | 'bonus';
export type Panel = 'audio' | 'farbe' | 'export' | 'timeline' | 'medien';

export type ProjectFacts = {
  shots: { start: number; end: number; mediaId: string; shotSize: ShotSize | null }[];
  hasJOrLCut: boolean;
  lowerThirds: number;
  transitions: number;
  audioCutsWithoutFade: number;
  fpsMismatch: boolean;
  longestShotSec: number;
};

export type Deduction = {
  ruleId: string;
  category: Category;
  label: string;
  soll: string;
  ist: string;
  points: number;
  fix: string;
  tool?: { area: 'werkstatt'; panel: Panel };
};

export type VideoInput = { measurements: Measurements; facts: ProjectFacts; fileName: string };

export type EvaluationInput = {
  assignment: Assignment;
  submittedAt: number;
  videos: Record<string, VideoInput | null>;
  research: Record<string, ResearchDoc | null>;
  selfChecks: { hookDone: boolean };
  isCorrection: boolean;
};

export type CategoryResult = { max: number; points: number; deductions: Deduction[] };

export type Evaluation = {
  id: string;
  assignmentId: string;
  at: number;
  categories: Record<'technik' | 'gestaltung' | 'auftrag', CategoryResult>;
  bonus: Deduction[];
  late: Deduction | null;
  total: number;
  phrase: string;
  gemini?: GeminiResult;
  /** Um wie viele Punkte Gemini die Kategorien tatsächlich verschoben hat (nach Klemmung). */
  geminiShift?: { gestaltung: number; auftrag: number };
  /** Hinweis im Protokoll, wenn Gemini nicht mitgewirkt hat (abgelehnt, Fehler, Limit, offline). */
  geminiNote?: string;
  /** Die abgegebenen Dateien (für Showreel-Merkliste und „Im Finder zeigen“). */
  exports?: { deliverableId: string; fileName: string; path: string }[];
};

export type ScoredCategory = 'technik' | 'gestaltung' | 'auftrag';
const SCORED: ScoredCategory[] = ['technik', 'gestaltung', 'auftrag'];

/** Kategorien, die für diesen Auftrag gelten: `max: 0` (Recherche-Auftrag) zählt nicht. */
export function applicableCategories(e: Pick<Evaluation, 'categories'>): ScoredCategory[] {
  return SCORED.filter(k => e.categories[k].max > 0);
}

/** Alle Abzüge der geltenden Kategorien plus Verspätung (ohne Bonus). */
export function allDeductions(e: Pick<Evaluation, 'categories' | 'late'>): Deduction[] {
  return [...applicableCategories(e).flatMap(k => e.categories[k].deductions), ...(e.late ? [e.late] : [])];
}

/** Baut einen Abzug; `prefix` kennzeichnet bei mehreren Videos die Abgabe. */
export function makeDeduction(
  prefix: string,
  ruleId: string,
  category: Category,
  label: string,
  soll: string,
  ist: string,
  points: number,
  fix: string,
  panel?: Panel,
): Deduction {
  return {
    ruleId,
    category,
    label: prefix ? `${prefix}: ${label}` : label,
    soll,
    ist,
    points,
    fix,
    ...(panel ? { tool: { area: 'werkstatt' as const, panel } } : {}),
  };
}
