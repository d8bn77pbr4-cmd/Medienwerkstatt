import { describe, expect, it } from 'vitest';
import { getBackend } from '../../src/backend';
import { MockBackend } from '../../src/backend/MockBackend';

describe('getBackend', () => {
  it('liefert im Browser/jsdom (ohne Tauri) eine MockBackend-Instanz', () => {
    expect(getBackend()).toBeInstanceOf(MockBackend);
  });
});
