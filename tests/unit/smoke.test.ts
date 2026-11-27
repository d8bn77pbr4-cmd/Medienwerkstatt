import { afterEach, describe, expect, it } from 'vitest';
import { getBackend, resetBackendForTests } from '../../src/backend';
import { MockBackend } from '../../src/backend/MockBackend';
import { TauriBackend } from '../../src/backend/TauriBackend';

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  resetBackendForTests();
});

describe('getBackend', () => {
  it('liefert im Browser/jsdom (ohne Tauri) genau eine MockBackend', () => {
    resetBackendForTests();
    expect(getBackend().constructor).toBe(MockBackend);
  });

  it('liefert mit __TAURI_INTERNALS__ eine TauriBackend', () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    resetBackendForTests();
    expect(getBackend().constructor).toBe(TauriBackend);
  });
});
