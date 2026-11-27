import type { Measurements } from '../../backend/types';
import type { Assignment } from '../assignments/types';
import type { ShotSize } from '../assignments/types';
import type { GeminiResult } from '../gemini/schema';
import type { ResearchDoc, SourceStatus } from './research';

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
  /**
   * Gewollt schwarze oder stehende Stellen (Sekunden wie `shots`): Titel über leerer Videospur und Bild-Clips.
   * Schwarz-/Standbild-Funde, die zu ≥ 50 % darin liegen, zählen nicht. Ältere Momentaufnahmen: fehlt.
   */
  exemptIntervals?: { start: number; end: number }[];
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
  /**
   * Korrektur: Zeitpunkt der ersten Abgabe. Verspätung und Frühbonus zählen ab dort (Nachbessern ist kein
   * neues Zuspätkommen). Fehlt er, gilt `submittedAt`.
   */
  lateBasisAt?: number;
  /** Ergebnis der Online-Prüfung der Recherche-Links beim Abgeben (je Link-Adresse). Fehlt: nicht geprüft. */
  sourceCheck?: Record<string, SourceStatus>;
  /** Die Link-Prüfung lief ohne Netz (alle Links unerreichbar oder Prüfung fehlgeschlagen): kein Link-Abzug. */
  sourcesOffline?: boolean;
};

export type CategoryResult = { max: number; points: number; deductions: Deduction[] };

/** Platzhalter-`assignmentId` der Übungsbewertungen (freie Projekte haben keinen Auftrag). */
export const PRACTICE_ASSIGNMENT_ID = 'uebung';

export type Evaluation = {
  id: string;
  /** Übungsbewertungen (`practice`): `PRACTICE_ASSIGNMENT_ID`. */
  assignmentId: string;
  /** Übung im freien Projekt: zählt nicht fürs Punktekonto, den Rang, das Showreel und die Korrektur. */
  practice?: true;
  /** Das freie Projekt, aus dem die Übung stammt (nur mit `practice`). */
  freeProjectId?: string;
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
  /** Hinweis im Protokoll, wenn die Links der Recherche nicht online geprüft werden konnten (kein Abzug). */
  sourceNote?: string;
  /** Höchstpunktzahl (Recherche-Auftrag aus Unsinn); gilt auch nach Bonus und Gemini. */
  capTotal?: number;
  /** Die abgegebenen Dateien (für Showreel-Merkliste und „Im Finder zeigen“). */
  exports?: { deliverableId: string; fileName: string; path: string }[];
};

/** Zählt die Bewertung fürs Konto, den Rang, das Showreel und die Korrektur? (Übungen nicht.) */
export const countsForAccount = (e: Pick<Evaluation, 'practice'>): boolean => !e.practice;

/** Nur die Bewertungen, die zählen (ohne Übungen). */
export function countedEvaluations<T extends Pick<Evaluation, 'practice'>>(evaluations: T[]): T[] {
  return evaluations.filter(countsForAccount);
}

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
