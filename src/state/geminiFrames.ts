import type { Backend } from '../backend/Backend';
import type { Assignment, ShotSize } from '../domain/assignments/types';
import { MAX_FRAMES, MIN_FRAMES, selectFrameTimes, type GeminiFrame } from '../domain/gemini/frames';
import type { Project } from '../domain/timeline/types';
import { exportSnapshot, latestExport } from './submission';

export const NOTE_FRAMES = 'Standbilder nicht lesbar – nur Regeln';

export type GeminiPreparation = { frames: GeminiFrame[]; error?: string };

/** Einstellungsgröße der Einstellung, in der `time` liegt. */
function shotSizeAt(shots: { start: number; end: number; shotSize: ShotSize | null }[], time: number): ShotSize | null {
  return shots.find((s) => time >= s.start && time < s.end)?.shotSize ?? shots.find((s) => time <= s.end)?.shotSize ?? null;
}

/**
 * Standbilder für die Vorschau und das Senden: je Video-Abgabe aus der Export-Datei (Mitte jeder Einstellung
 * laut Momentaufnahme, insgesamt höchstens 12, bei kurzem Film aufgefüllt bis 8; Breite höchstens 768 px).
 * Recherche-Abgaben liefern keine Bilder (nur Text).
 */
export async function prepareFrames(backend: Backend, assignment: Assignment, project: Project | null): Promise<GeminiPreparation> {
  const videos = assignment.deliverables.filter((d) => d.kind === 'video' && d.videoSpec);
  const per = Math.max(2, Math.floor(MAX_FRAMES / Math.max(1, videos.length)));
  const frames: GeminiFrame[] = [];
  try {
    for (const d of videos) {
      const rec = latestExport(project, d.id);
      if (!rec || !project) continue;
      const { facts } = exportSnapshot(project, rec);
      const duration = Math.max(0, ...facts.shots.map((s) => s.end), rec.rangeSec ? rec.rangeSec.end - rec.rangeSec.start : 0);
      const times = selectFrameTimes(facts.shots, duration, per, Math.min(MIN_FRAMES, per));
      if (times.length === 0) continue;
      const paths = await backend.extractFrames(rec.path, times, 768);
      times.forEach((t, i) => {
        if (paths[i]) frames.push({ deliverableId: d.id, time: t, shotSize: shotSizeAt(facts.shots, t), path: paths[i] });
      });
    }
  } catch {
    return { frames: [], error: NOTE_FRAMES };
  }
  return { frames };
}
