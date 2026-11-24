import type { Backend } from '../backend/Backend';
import type { Assignment } from '../domain/assignments/types';
import { allDeductions, type Evaluation, type EvaluationInput } from '../domain/chef/types';
import type { Rules } from '../domain/chef/rules';
import { applyGemini } from '../domain/gemini/apply';
import type { GeminiFrame } from '../domain/gemini/frames';
import { buildGeminiPrompt } from '../domain/gemini/prompt';
import { GEMINI_SCHEMA, parseGeminiResult } from '../domain/gemini/schema';

/** Entscheidung beim Abgeben: mit Einwilligung (und Standbildern) oder ohne Gemini. */
export type GeminiChoice = { consent: true; frames: GeminiFrame[] } | { consent: false; note?: string };
export type GeminiRun = { model: string; choice: GeminiChoice };

export const NOTE_DECLINED = 'Ohne Gemini abgegeben';
export const NOTE_OFFLINE = 'Gemini nicht erreichbar – nur Regeln';
export const NOTE_LIMIT = 'Gemini-Limit erreicht – nur Regeln';
export const NOTE_KEY = 'Gemini-Schlüssel ungültig – nur Regeln';
export const NOTE_UNREADABLE = 'Gemini-Antwort nicht lesbar – nur Regeln';

/** Vermerk im Protokoll zu einem Fehler des Gemini-Aufrufs (Tauri-Fehler tragen einen `code`). */
export function noteForError(e: unknown): string {
  const code = e && typeof e === 'object' && 'code' in e ? (e as { code: unknown }).code : null;
  if (code === 'rate_limited') return NOTE_LIMIT;
  if (code === 'invalid_key') return NOTE_KEY;
  return NOTE_OFFLINE;
}

type ReviewRequest = {
  backend: Backend;
  rules: Rules;
  assignment: Assignment;
  input: EvaluationInput;
  evaluation: Evaluation;
  run: GeminiRun;
};

/**
 * Gemini-Begutachtung: Anweisung bauen, senden, Antwort prüfen, anwenden. Jeder Fehlschlag (keine Einwilligung,
 * Schlüssel, Limit, offline, unlesbare Antwort) liefert die Regel-Bewertung mit Vermerk statt eines Fehlers.
 */
export async function geminiReview(r: ReviewRequest): Promise<Evaluation> {
  const { evaluation: e, run } = r;
  if (!run.choice.consent) return { ...e, geminiNote: run.choice.note ?? NOTE_DECLINED };
  const frames = run.choice.frames;
  try {
    if (!(await r.backend.gemini.hasKey())) return { ...e, geminiNote: NOTE_KEY };
    const prompt = buildGeminiPrompt(r.assignment, r.input, allDeductions(e), frames);
    const text = await r.backend.gemini.generate(run.model, prompt, frames.map((f) => f.path), GEMINI_SCHEMA);
    const parsed = parseGeminiResult(text);
    if (!parsed) return { ...e, geminiNote: NOTE_UNREADABLE };
    return applyGemini(e, parsed, r.rules, { isCorrection: r.input.isCorrection });
  } catch (err) {
    return { ...e, geminiNote: noteForError(err) };
  }
}
