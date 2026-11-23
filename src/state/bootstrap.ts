import { getBackend } from '../backend';
import { systemClock } from '../domain/time';
import { useApp } from './appStore';

/** Nur im Browser-/Mock-Modus: `?seed=<x>` setzt die Installations-ID (deterministische E2E-Tests). */
function seedFromUrl(): string | undefined {
  if (typeof window === 'undefined' || '__TAURI_INTERNALS__' in window) return undefined;
  const seed = new URLSearchParams(window.location.search).get('seed');
  return seed && seed.trim() !== '' ? seed : undefined;
}

export function startApp(): Promise<void> {
  const clock = systemClock(() => useApp.getState().state?.settings.devTimeOffsetMs ?? 0);
  return useApp.getState().init(getBackend(), clock, { installId: seedFromUrl() });
}
