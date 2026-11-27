import { z } from 'zod';
import rulesJson from '../../../rules.json';

export type Level = 1 | 2 | 3 | 4 | 5;

const technik = z.object({
  max: z.number(),
  resolutionOrAspect: z.number(),
  fps: z.number(),
  mixedFps: z.number(),
  lengthPerSecond: z.number(),
  lengthMax: z.number(),
  loudnessToleranceLU: z.number(),
  loudnessPerLU: z.number(),
  loudnessMax: z.number(),
  truePeakLimitDbtp: z.number(),
  truePeak: z.number(),
  clipping: z.number(),
  blackOrFreeze: z.number(),
  codecOrFileName: z.number(),
});
const gestaltung = z.object({
  max: z.number(),
  overexposedThresholdPct: z.number(),
  overexposed: z.number(),
  overexposedMax: z.number(),
  underexposed: z.number(),
  underexposedMax: z.number(),
  shotLengthMinSec: z.number(),
  shotLengthMaxSec: z.number(),
  shotLengthOutOfRange: z.number(),
  shotLengthOutOfRangeMax: z.number(),
  missingShotSize: z.number(),
  colorJump: z.number(),
  colorJumpMax: z.number(),
  colorJumpLumaThreshold: z.number(),
  colorJumpChromaThreshold: z.number(),
  audioCutNoFade: z.number(),
  audioCutNoFadeMax: z.number(),
});
const auftrag = z.object({
  max: z.number(),
  missingDeliverable: z.number(),
  missingElement: z.number(),
  hookNotMet: z.number(),
  longShotMinSec: z.number(),
  researchEmptyField: z.number(),
  researchMinSources: z.number(),
  researchTooFewSources: z.number(),
  researchLengthOutOfRange: z.number(),
});

/** Abzüge der Textprüfung je Recherche (Kombi-Werte etwa ein Viertel der Recherche-Auftrag-Werte). */
const researchQualityPoints = z.object({
  copiedField: z.number(),
  offTopic: z.number(),
  implausibleField: z.number(),
  placeholderSource: z.number(),
  sourceNotFound: z.number(),
  sourceUnreachable: z.number(),
});

export const RulesSchema = z.object({
  schedule: z.object({
    intervalHours: z.number().positive(),
    deadlineHour: z.number().int().min(0).max(23),
    lateWindowHours: z.number().positive(),
    maxOpen: z.number().int().positive(),
    vacationDaysPerYear: z.number().int().positive(),
  }),
  typeWeights: z.object({ video: z.number(), ton: z.number(), bild: z.number(), motion: z.number(), research: z.number() }),
  lengthTolerancePct: z.array(z.number()).length(5),
  kombiShareFromLevel2: z.number().min(0).max(1),
  levels: z.array(z.object({ min: z.number(), name: z.string() })).length(5),
  maxScore: z.number(),
  deductions: z.object({
    technik,
    gestaltung,
    auftrag,
    researchOnly: z.object({ max: z.number(), missingDeliverable: z.number(), emptyField: z.number(), tooFewSources: z.number(), lengthOutOfRange: z.number(), hookNotMet: z.number() }),
  }),
  /**
   * Recherche ehrlich bewerten: Deckel bei Unsinn (Recherche-Auftrag höchstens `gibberishCapTotal` Punkte, sobald
   * mindestens `gibberishCapShare` der Pflichtfelder Unsinn sind) und die Abzüge der Textprüfung.
   */
  researchQuality: z.object({
    gibberishCapTotal: z.number(),
    gibberishCapShare: z.number().min(0).max(1),
    kombi: researchQualityPoints,
    researchOnly: researchQualityPoints,
  }),
  frist: z.object({ perDay: z.number(), maxDays: z.number(), expiredAccount: z.number() }),
  bonus: z.object({ max: z.number(), early24h: z.number(), earlyHours: z.number(), allTechPerfect: z.number() }),
  correction: z.object({ windowHours: z.number(), maxScore: z.number(), loops: z.number() }),
  showreelMinScore: z.number(),
  tone: z.object({ badBelow: z.number(), okBelow: z.number() }),
  gemini: z.object({ maxShift: z.number() }),
});

export type Rules = z.infer<typeof RulesSchema>;

let cached: Rules | null = null;

/** Liest rules.json und validiert beim ersten Aufruf; wirft bei ungültiger Datei. */
export function loadRules(): Rules {
  cached ??= RulesSchema.parse(rulesJson);
  return cached;
}
