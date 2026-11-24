import type { Project, ProjectSettings } from './types';

const SETTING_DEFAULTS: Required<ProjectSettings> = { safetyLimiter: true };

/** Projekt-Einstellung mit Standardwert (ältere Projekte haben keine). */
export function projectSetting<K extends keyof ProjectSettings>(p: Pick<Project, 'settings'> | null | undefined, key: K): boolean {
  return p?.settings?.[key] ?? SETTING_DEFAULTS[key];
}
