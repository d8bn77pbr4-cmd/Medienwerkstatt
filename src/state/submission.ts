import type { Backend } from '../backend/Backend';
import type { Segment } from '../backend/types';
import type { Assignment } from '../domain/assignments/types';
import { evaluate } from '../domain/chef/evaluate';
import type { ResearchDoc } from '../domain/chef/research';
import type { Rules } from '../domain/chef/rules';
import type { Evaluation, ProjectFacts, VideoInput } from '../domain/chef/types';
import { exportRange } from '../domain/render/filtergraph';
import { projectFacts } from '../domain/timeline/facts';
import { sequenceHash } from './hash';
import { geminiReview, type GeminiRun } from './gemini';
import type { ExportRecord, MediaItem, Project, Sequence } from '../domain/timeline/types';

export type TimeRange = { start: number; end: number };

/** Die neueste Version einer Abgabe oder `null`. */
export function latestExport(project: Project | null, deliverableId: string): ExportRecord | null {
  let best: ExportRecord | null = null;
  for (const r of project?.exports ?? []) if (r.deliverableId === deliverableId && (!best || r.version > best.version)) best = r;
  return best;
}

/** Sequenz, aus der exportiert wurde (ältere Einträge ohne `sequenceId`: die aktive). */
export function sequenceOfExport(project: Project, rec: ExportRecord): Sequence {
  return project.sequences.find((s) => s.id === rec.sequenceId) ?? project.sequences.find((s) => s.id === project.activeSequenceId) ?? project.sequences[0];
}

/** Wurde die Sequenz seit dem Export geändert? Ältere Einträge ohne Hash gelten nie als veraltet. */
export function exportStale(project: Project | null, rec: ExportRecord): boolean {
  if (!project || !rec.sequenceHash) return false;
  const seq = project.sequences.find((s) => s.id === rec.sequenceId);
  return !!seq && sequenceHash(seq) !== rec.sequenceHash;
}

/** Exportierter Bereich in Sekunden der Sequenz (In/Out, sonst ganze Sequenz). */
export function rangeOfSequence(seq: Sequence): TimeRange {
  const { inF, outF } = exportRange(seq);
  return { start: inF / seq.fps, end: outF / seq.fps };
}

/**
 * Projekt-Fakten der exportierten Datei: Einstellungen auf den Exportbeginn (0 s = Beginn der Datei)
 * verschoben und auf den Exportbereich beschnitten. Die Datei und `facts.shots` bleiben so deckungsgleich
 * (Einstellung i ↔ Messsegment i).
 */
export function factsForExport(seq: Sequence, media: MediaItem[], range?: TimeRange): ProjectFacts {
  const facts = projectFacts(seq, media);
  if (!range) return facts;
  const clip = <T extends TimeRange>(list: T[]): T[] =>
    list
      .map((s) => ({ ...s, start: Math.max(s.start, range.start) - range.start, end: Math.min(s.end, range.end) - range.start }))
      .filter((s) => s.end - s.start > 1e-9);
  const shots = clip(facts.shots);
  return { ...facts, shots, exemptIntervals: clip(facts.exemptIntervals ?? []), longestShotSec: shots.reduce((mx, s) => Math.max(mx, s.end - s.start), 0) };
}

/** Einstellungs-Segmente für `backend.analyze`. */
export function exportSegments(seq: Sequence, media: MediaItem[], range?: TimeRange): Segment[] {
  return factsForExport(seq, media, range).shots.map((s) => ({ start: s.start, end: s.end }));
}

/**
 * Einstellungsgrößen aus dem aktuellen Stand der Medien: Die Beschriftung ist eine Angabe über das Material,
 * nicht über die Datei – wer nach dem Export beschriftet, soll nicht neu exportieren müssen.
 */
function withCurrentShotSizes(facts: ProjectFacts, media: MediaItem[]): ProjectFacts {
  const byId = new Map(media.map((m) => [m.id, m.shotSize]));
  return { ...facts, shots: facts.shots.map((s) => (byId.has(s.mediaId) ? { ...s, shotSize: byId.get(s.mediaId) ?? null } : s)) };
}

/**
 * Momentaufnahme des Exports (Zeiten und Schnitte gelten der Datei); ältere Einträge: aus dem Stand der Sequenz
 * berechnet. Die Einstellungsgrößen kommen immer aus den aktuellen Medien.
 */
export function exportSnapshot(project: Project, rec: ExportRecord): { facts: ProjectFacts; segments: Segment[] } {
  if (rec.facts && rec.segments) return { facts: withCurrentShotSizes(rec.facts, project.media), segments: rec.segments };
  const seq = sequenceOfExport(project, rec);
  const facts = factsForExport(seq, project.media, rec.rangeSec ?? rangeOfSequence(seq));
  return { facts, segments: facts.shots.map((s) => ({ start: s.start, end: s.end })) };
}

export type SubmissionRequest = {
  backend: Backend;
  rules: Rules;
  assignment: Assignment;
  /** Projekt des Auftrags (`null`, wenn es noch keines gibt). */
  project: Project | null;
  /** Recherche-Entwürfe je Abgabe-ID. */
  research: Record<string, ResearchDoc | null>;
  selfChecks: { hookDone: boolean };
  isCorrection: boolean;
  submittedAt: number;
  /** Korrektur: Zeitpunkt der ersten Abgabe (Basis für Verspätung und Frühbonus). */
  lateBasisAt?: number;
  /** Nur gesetzt, wenn Gemini eingeschaltet ist und der Nutzer sich entschieden hat. */
  gemini?: GeminiRun;
  onProgress?: (message: string) => void;
};

/**
 * Abgabe prüfen und bewerten: je Video-Abgabe die neueste Export-Datei messen (Einstellungs-Segmente aus
 * dem Projektmodell), dann den Regel-Chef anwenden. Fehlende Abgaben bleiben `null` (→ Abzug).
 */
export async function runSubmission(r: SubmissionRequest): Promise<Evaluation> {
  const { assignment: a, project } = r;
  const videos: Record<string, VideoInput | null> = {};
  const files: NonNullable<Evaluation['exports']> = [];
  const todo = a.deliverables.filter((d) => d.kind === 'video' && d.videoSpec);
  let measured = 0;
  for (const d of todo) {
    const rec = latestExport(project, d.id);
    if (!rec || !project) {
      videos[d.id] = null;
      continue;
    }
    const { facts, segments } = exportSnapshot(project, rec);
    r.onProgress?.('Messe Ton …');
    const measurements = await r.backend.analyze(rec.path, segments);
    r.onProgress?.('Prüfe Belichtung …');
    videos[d.id] = { measurements, facts, fileName: rec.fileName };
    files.push({ deliverableId: d.id, fileName: rec.fileName, path: rec.path });
    measured++;
  }
  if (measured === 0) r.onProgress?.('Prüfe Abgaben …');
  r.onProgress?.('Bewerte …');
  const input = { assignment: a, submittedAt: r.submittedAt, videos, research: r.research, selfChecks: r.selfChecks, isCorrection: r.isCorrection, lateBasisAt: r.lateBasisAt };
  let e = evaluate(input, r.rules);
  if (r.gemini) {
    r.onProgress?.(r.gemini.choice.consent ? 'Frage Gemini …' : 'Bewerte …');
    e = await geminiReview({ backend: r.backend, rules: r.rules, assignment: a, input, evaluation: e, run: r.gemini });
  }
  return files.length > 0 ? { ...e, exports: files } : e;
}
