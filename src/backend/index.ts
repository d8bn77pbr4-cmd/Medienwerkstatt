import type { Backend } from './Backend';
import { MockBackend } from './MockBackend';
import { TauriBackend } from './TauriBackend';

export type { Backend } from './Backend';

let instance: Backend | null = null;

export function getBackend(): Backend {
  if (!instance) {
    instance = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window ? new TauriBackend() : new MockBackend();
  }
  return instance;
}

/** Nur für Tests: verwirft die gemerkte Instanz. */
export function resetBackendForTests(): void {
  instance = null;
}
