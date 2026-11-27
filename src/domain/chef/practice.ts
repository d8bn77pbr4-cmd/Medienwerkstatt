import type { Hook, VideoSpec } from '../assignments/types';
import type { ProjectFormat } from '../projects';
import { category } from './evaluate';
import { phraseFor } from './phrases';
import type { Rules } from './rules';
import { gestaltungRules } from './rules/gestaltung';
import { technikRules } from './rules/technik';
import { PRACTICE_ASSIGNMENT_ID, type Evaluation, type VideoInput } from './types';


const NEUTRAL_HOOK: Hook = { id: 'practice', text: '', verify: 'self' };

function aspectOf(f: ProjectFormat): VideoSpec['aspect'] {
  const r = f.width / f.height;
  return Math.abs(r - 1) < 0.01 ? '1:1' : r > 1 ? '16:9' : '9:16';
}

/** Bei Übungen ist der Codec frei wählbar: ProRes bleibt ProRes, alles andere wird an H.264 gemessen. */
export function practiceCodec(measuredVideoCodec: string): VideoSpec['codec'] {
  return /prores/i.test(measuredVideoCodec) ? 'prores' : 'h264';
}

/**
 * Vorgabe einer Übung aus dem Projektformat (nur im Speicher): −14 LUFS, True Peak −1, keine Pflichten
 * (Einstellungsgrößen, J-Schnitt, Bauchbinde). Ein Dauer-Soll gibt es nicht: Die Länge der Datei ist das Soll,
 * die Längenregel greift also nie. Dateiname und Codec (H.264 oder ProRes) sind ebenfalls die der Datei.
 */
export function practiceSpec(format: ProjectFormat, measuredDurationSec: number, fileName: string, codec: VideoSpec['codec'] = 'h264'): VideoSpec {
  return {
    aspect: aspectOf(format),
    width: format.width,
    height: format.height,
    fps: format.fps as VideoSpec['fps'],
    durationSec: measuredDurationSec,
    toleranceSec: 0,
    loudnessLufs: -14,
    truePeakMax: -1,
    codec,
    fileName,
    minShots: 0,
    requiredShotSizes: [],
    requireJCut: false,
    requireLowerThird: false,
  };
}

export type PracticeInput = { freeProjectId: string; format: ProjectFormat; at: number; video: VideoInput };

/**
 * Übungsbewertung: nur Technik und Gestaltung (Regeln wie bei Abgaben), keine Auftrags-Kategorie, keine Frist,
 * kein Bonus, keine Korrektur. Das Ergebnis (`total`) ist auf 0–`maxScore` hochgerechnet. Es zählt nirgends mit
 * (siehe `countsForAccount`).
 */
export function evaluatePractice(input: PracticeInput, rules: Rules): Evaluation {
  const { video } = input;
  const m = video.measurements.format;
  const spec = practiceSpec(input.format, m.durationSec, video.fileName, practiceCodec(m.videoCodec));
  const d = rules.deductions;
  const technik = category(d.technik.max, technikRules(spec, video, rules, ''));
  const gestaltung = category(d.gestaltung.max, gestaltungRules(spec, video, NEUTRAL_HOOK, rules, ''));
  const max = technik.max + gestaltung.max;
  const total = max > 0 ? Math.round((rules.maxScore * (technik.points + gestaltung.points)) / max) : 0;
  const e: Evaluation = {
    id: `practice:${input.freeProjectId}:${input.at}`,
    assignmentId: PRACTICE_ASSIGNMENT_ID,
    practice: true,
    freeProjectId: input.freeProjectId,
    at: input.at,
    categories: { technik, gestaltung, auftrag: { max: 0, points: 0, deductions: [] } },
    bonus: [],
    late: null,
    total,
    phrase: '',
  };
  e.phrase = phraseFor(e, rules);
  return e;
}
