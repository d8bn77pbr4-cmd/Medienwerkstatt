import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockBackend } from '../../src/backend/MockBackend';
import { H } from '../../src/domain/assignments/schedule';
import type { Clock } from '../../src/domain/time';
import { resetAppForTests, useApp } from '../../src/state/appStore';
import { attachLifecycle } from '../../src/state/lifecycle';

const t0 = Date.parse('2026-11-23T10:00:00+01:00');
let now = t0;
const clock: Clock = { now: () => now };
let backend: MockBackend;
let detach: () => void;
const numbers = () => useApp.getState().state?.assignments.map((a) => a.number);

function setVisibility(v: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
  document.dispatchEvent(new Event('visibilitychange'));
}
/** Änderung, die noch nicht gespeichert ist (Debounce läuft). */
const dirtyChange = () => useApp.getState().toggleChecklist('A01', 'x');

beforeEach(async () => {
  vi.useFakeTimers();
  localStorage.clear();
  resetAppForTests();
  now = t0;
  backend = new MockBackend();
  await useApp.getState().init(backend, clock);
  detach = attachLifecycle();
});
afterEach(() => {
  detach();
  vi.useRealTimers();
  resetAppForTests();
  setVisibility('visible');
});

describe('attachLifecycle', () => {
  it('tickt jede Minute', () => {
    now += 72 * H;
    vi.advanceTimersByTime(59_000);
    expect(numbers()).toEqual([1]);
    vi.advanceTimersByTime(1_000);
    expect(numbers()).toEqual([1, 2]);
  });

  it('focus löst tickNow aus', () => {
    now += 72 * H;
    window.dispatchEvent(new Event('focus'));
    expect(numbers()).toEqual([1, 2]);
  });

  it('sichtbar werden löst tickNow aus, unsichtbar speichert', async () => {
    now += 72 * H;
    setVisibility('visible');
    expect(numbers()).toEqual([1, 2]);
    const spy = vi.spyOn(backend, 'saveState');
    dirtyChange();
    setVisibility('hidden');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it.each(['beforeunload', 'pagehide'])('%s speichert sofort', (type) => {
    const spy = vi.spyOn(backend, 'saveState');
    dirtyChange();
    window.dispatchEvent(new Event(type));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('Aufräumen entfernt Intervall und Listener', () => {
    detach();
    now += 72 * H;
    vi.advanceTimersByTime(120_000);
    window.dispatchEvent(new Event('focus'));
    setVisibility('visible');
    expect(numbers()).toEqual([1]);
    const spy = vi.spyOn(backend, 'saveState');
    dirtyChange();
    window.dispatchEvent(new Event('beforeunload'));
    window.dispatchEvent(new Event('pagehide'));
    setVisibility('hidden');
    expect(spy).not.toHaveBeenCalled();
    detach = attachLifecycle(); // für afterEach
  });
});
