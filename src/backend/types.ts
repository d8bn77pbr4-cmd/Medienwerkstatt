// Platzhalter-Typen: spätere Tasks füllen sie mit den echten Feldern.

export type LoadResult<T> = { value: T | null; restoredFromBackup: boolean };

export type AppState = { version: 1 };
export type { Assignment } from '../domain/assignments/types';
export type Project = { version: 1 };
export type MediaItem = { id: string; path: string };
export type Segment = { start: number; end: number };
export type Measurements = Record<string, unknown>;
