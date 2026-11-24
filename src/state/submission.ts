import type { Backend } from '../backend/Backend';
import type { Segment } from '../backend/types';
import type { Assignment } from '../domain/assignments/types';
import { evaluate } from '../domain/chef/evaluate';
import type { ResearchDoc } from '../domain/chef/research';
import type { Rules } from '../domain/chef/rules';
import type { Evaluation, ProjectFacts, VideoInput } from '../domain/chef/types';
import { exportRange } from '../domain/render/filtergraph';
import { projectFacts } from '../domain/timeline/facts';
import type { ExportRecord, MediaItem, Project, Sequence } from '../domain/timeline/types';

export type TimeRange = { start: number; end: number };

/** Die neueste Version einer Abgabe oder `null`. */
export function latestExport(project: Project | null, deliverableId: string): ExportRecord | null {
  let best: ExportRecord | null = null;
  for (const r of project?.exports ?? []) if (r.deliverableId === deliverableId && (!best || r.version > best.version)) best = r;
  return best;
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
  const shots = facts.shots
    .map((s) => ({ ...s, start: Math.max(s.start, range.start) - range.start, end: Math.min(s.end, range.end) - range.start }))
    .filter((s) => s.end - s.start > 1e-9);
  return { ...facts, shots, longestShotSec: shots.reduce((mx, s) => Math.max(mx, s.end - s.start), 0) };
}

/** Einstellungs-Segmente für `backend.analyze`. */
export function exportSegments(seq: Sequence, media: MediaItem[], range?: TimeRange): Segment[] {
  return factsForExport(seq, media, range).shots.map((s) => ({ start: s.start, end: s.end }));
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
    const seq = project.sequences.find((s) => s.id === rec.sequenceId) ?? project.sequences.find((s) => s.id === project.activeSequenceId) ?? project.sequences[0];
    const range = rec.rangeSec ?? rangeOfSequence(seq);
    const facts = factsForExport(seq, project.media, range);
    r.onProgress?.('Messe Ton …');
    const measurements = await r.backend.analyze(rec.path, facts.shots.map((s) => ({ start: s.start, end: s.end })));
    r.onProgress?.('Prüfe Belichtung …');
    videos[d.id] = { measurements, facts, fileName: rec.fileName };
    files.push({ deliverableId: d.id, fileName: rec.fileName, path: rec.path });
    measured++;
  }
  if (measured === 0) r.onProgress?.('Prüfe Abgaben …');
  r.onProgress?.('Bewerte …');
  const e = evaluate({ assignment: a, submittedAt: r.submittedAt, videos, research: r.research, selfChecks: r.selfChecks, isCorrection: r.isCorrection }, r.rules);
  return files.length > 0 ? { ...e, exports: files } : e;
}
