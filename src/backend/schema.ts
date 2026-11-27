import { z } from 'zod';
import type { AppState } from './types';

/** Mindestform eines gespeicherten Zustands; unbekannte Felder bleiben erhalten. */
export const AppStateSchema = z.looseObject({
  version: z.literal(1),
  installId: z.string().min(1),
  createdAt: z.number(),
  schedule: z.looseObject({
    nextIssueAt: z.number(),
    nextNumber: z.number(),
    vacations: z.array(z.looseObject({ start: z.number(), end: z.number() })),
  }),
  assignments: z.array(z.looseObject({ id: z.string(), number: z.number() })),
  evaluations: z.array(z.looseObject({ practice: z.boolean().optional(), freeProjectId: z.string().optional() })),
  settings: z.looseObject({}),
  // Phase 1.1: optional, damit ältere Stände weiter laden (Standard: keine freien Projekte).
  projects: z.array(z.looseObject({ id: z.string(), name: z.string() })).optional(),
  lastOpened: z.looseObject({ kind: z.enum(['free', 'assignment']), id: z.string() }).optional(),
});

export function isValidState(v: unknown): v is AppState {
  return AppStateSchema.safeParse(v).success;
}
