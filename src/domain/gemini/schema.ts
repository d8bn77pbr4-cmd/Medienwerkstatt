import { z } from 'zod';

export const GEMINI_KEYS = ['bildaufbau', 'einstellungsgroessen', 'licht', 'farbe', 'briefing', 'inhalt'] as const;
export type GeminiKey = (typeof GEMINI_KEYS)[number];

export type GeminiResult = {
  criteria: {
    key: GeminiKey;
    verdict: string;
    reason: string;
    shift: number;
  }[];
  summary: string;
};

/** Grenze je Kriterium (Spec §9.5); die Summe klemmt `applyGemini` zusätzlich auf `rules.gemini.maxShift`. */
export const MAX_CRITERION_SHIFT = 10;

/** JSON-Schema für die Antwort (`responseSchema` der Gemini-API). */
export const GEMINI_SCHEMA = {
  type: 'object',
  properties: {
    criteria: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string', enum: [...GEMINI_KEYS] },
          verdict: { type: 'string' },
          reason: { type: 'string' },
          shift: { type: 'number', minimum: -MAX_CRITERION_SHIFT, maximum: MAX_CRITERION_SHIFT },
        },
        required: ['key', 'verdict', 'reason', 'shift'],
      },
    },
    summary: { type: 'string' },
  },
  required: ['criteria', 'summary'],
} as const;

/** Zod-Gegenstück zu `GEMINI_SCHEMA`. */
export const GeminiResultSchema = z.object({
  criteria: z.array(
    z.object({
      key: z.enum(GEMINI_KEYS),
      verdict: z.string(),
      reason: z.string(),
      shift: z.number().min(-MAX_CRITERION_SHIFT).max(MAX_CRITERION_SHIFT),
    }),
  ),
  summary: z.string(),
});

/** Antworttext prüfen; Codezäune (```json) werden toleriert. Ungültig → `null`. */
export function parseGeminiResult(text: string): GeminiResult | null {
  const body = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const r = GeminiResultSchema.safeParse(JSON.parse(body));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}
