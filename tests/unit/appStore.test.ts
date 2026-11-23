import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockBackend } from '../../src/backend/MockBackend';
import type { Backend } from '../../src/backend/Backend';
import type { AppState } from '../../src/backend/types';
import {
  accountSummary,
  activeAssignment,
  openAssignments,
  resetAppForTests,
  researchKey,
  useApp,
} from '../../src/state/appStore';
import { H } from '../../src/domain/assignments/schedule';
import type { Clock } from '../../src/domain/time';

const t0 = Date.parse('2026-11-23T10:00:00+01:00');
function stubClock(start = t0): Clock & { advance(ms: number): void } {
  let t = start;
  return { now: () => t, advance: (ms) => void (t += ms) };
}
const app = () => useApp.getState();
const st = (): AppState => {
  const s = app().state;
  if (!s) throw new Error('kein Zustand');
  return s;
};

beforeEach(() => {
  localStorage.clear();
  resetAppForTests();
});
afterEach(() => {
  vi.useRealTimers();
  resetAppForTests();
});

describe('init', () => {
  it('legt bei leerem Backend installId an und gibt Auftrag #1 aus', async () => {
    const clock = stubClock();
    await app().init(new MockBackend(), clock);
    expect(app().ready).toBe(true);
    expect(app().restoredFromBackup).toBe(false);
    expect(st().installId).toMatch(/\S{8,}/);
    expect(st().createdAt).toBe(t0);
    expect(st().assignments).toHaveLength(1);
    const a = st().assignments[0];
    expect(a.number).toBe(1);
    expect(a.status).toBe('open');
    expect(a.issuedAt).toBe(t0);
    expect(a.deadline).toBeGreaterThan(t0);
    expect(st().schedule.nextNumber).toBe(2);
    expect(st().settings).toEqual({ theme: 'auto', gemini: { enabled: false, model: null }, devTimeOffsetMs: 0 });
  });

  it('nimmt eine vorgegebene installId (Seed) und erzeugt daraus denselben Auftrag', async () => {
    await app().init(new MockBackend(), stubClock(), { installId: 'e2e-film' });
    expect(st().installId).toBe('e2e-film');
    const first = st().assignments[0];
    resetAppForTests();
    localStorage.clear();
    await app().init(new MockBackend(), stubClock(), { installId: 'e2e-film' });
    expect(st().assignments[0]).toEqual(first);
  });

  it('tickNow nach +72 h gibt Auftrag #2 aus', async () => {
    const clock = stubClock();
    await app().init(new MockBackend(), clock);
    clock.advance(72 * H);
    app().tickNow();
    expect(st().assignments.map((a) => a.number)).toEqual([1, 2]);
    expect(st().assignments[1].issuedAt).toBe(t0 + 72 * H);
    expect(st().schedule.nextNumber).toBe(3);
  });

  it('tickNow ohne Fälligkeit ändert nichts (gleiche Referenz)', async () => {
    await app().init(new MockBackend(), stubClock());
    const before = app().state;
    app().tickNow();
    expect(app().state).toBe(before);
  });

  it('defekter Zustand: Sicherung wird geladen und restoredFromBackup gemeldet', async () => {
    const clock = stubClock();
    const b1 = new MockBackend();
    await app().init(b1, clock);
    app().toggleChecklist('A01', 'x');
    await app().flush();
    await app().flush(); // zweiter Schreibvorgang schiebt den ersten nach bak1
    expect(localStorage.getItem('mw-state.bak1')).not.toBeNull();
    localStorage.setItem('mw-state', '{kaputt');
    resetAppForTests();
    await app().init(new MockBackend(), clock);
    expect(app().restoredFromBackup).toBe(true);
    expect(st().assignments[0].number).toBe(1);
  });

  it('Zustand mit falscher Version gilt als defekt', async () => {
    const clock = stubClock();
    await app().init(new MockBackend(), clock);
    await app().flush();
    app().toggleChecklist('A01', 'x');
    await app().flush();
    localStorage.setItem('mw-state', JSON.stringify({ version: 2 }));
    resetAppForTests();
    await app().init(new MockBackend(), clock);
    expect(app().restoredFromBackup).toBe(true);
  });

  it('reicht restoredFromBackup eines beliebigen Backends durch und kann den Hinweis schließen', async () => {
    const real = new MockBackend();
    const b: Backend = Object.assign(Object.create(real) as Backend, {
      loadState: async () => ({ value: null, restoredFromBackup: true }),
    });
    await app().init(b, stubClock());
    expect(app().restoredFromBackup).toBe(true);
    app().dismissRestoredBanner();
    expect(app().restoredFromBackup).toBe(false);
  });

  it('lädt gespeicherten Zustand ohne neuen Auftrag zu erzeugen', async () => {
    const clock = stubClock();
    await app().init(new MockBackend(), clock);
    const id = st().installId;
    await app().flush();
    resetAppForTests();
    await app().init(new MockBackend(), clock);
    expect(st().installId).toBe(id);
    expect(st().assignments).toHaveLength(1);
  });
});

describe('Speichern', () => {
  it('ist 2 s entprellt', async () => {
    vi.useFakeTimers();
    const backend = new MockBackend();
    const spy = vi.spyOn(backend, 'saveState');
    await app().init(backend, stubClock());
    spy.mockClear();
    app().toggleChecklist('A01', 'a');
    vi.advanceTimersByTime(1900);
    app().toggleChecklist('A01', 'b');
    vi.advanceTimersByTime(1900);
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].checklist['A01']).toEqual(['a', 'b']);
  });

  it('der erste Start wird sofort gesichert (installId überlebt ein Neuladen)', async () => {
    const backend = new MockBackend();
    const spy = vi.spyOn(backend, 'saveState');
    await app().init(backend, stubClock());
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('Aktionen und Selektoren', () => {
  it('saveResearch speichert pro Auftrag und Abgabe und überlebt ein Neuladen', async () => {
    const clock = stubClock();
    await app().init(new MockBackend(), clock);
    const doc = { templateId: 'drehplan' as const, fields: { ort: 'Bäckerei' }, sources: ['https://example.org'] };
    app().saveResearch('A01', 'recherche', doc);
    expect(st().research[researchKey('A01', 'recherche')]).toEqual(doc);
    await app().flush();
    resetAppForTests();
    await app().init(new MockBackend(), clock);
    expect(st().research['A01/recherche']).toEqual(doc);
  });

  it('toggleChecklist hakt an und wieder ab', async () => {
    await app().init(new MockBackend(), stubClock());
    app().toggleChecklist('A01', 'x');
    expect(st().checklist['A01']).toEqual(['x']);
    app().toggleChecklist('A01', 'x');
    expect(st().checklist['A01']).toEqual([]);
  });

  it('openAssignments und activeAssignment (früheste Frist)', async () => {
    const clock = stubClock();
    await app().init(new MockBackend(), clock);
    clock.advance(72 * H);
    app().tickNow();
    const open = openAssignments(app());
    expect(open.map((a) => a.number)).toEqual([1, 2]);
    expect(activeAssignment(app())?.number).toBe(1);
  });

  it('accountSummary startet bei 0 Punkten, Stufe 1', async () => {
    await app().init(new MockBackend(), stubClock());
    expect(accountSummary(app())).toMatchObject({ points: 0, level: 1 });
  });

  it('addVacation lehnt Vergangenes ab und nimmt Künftiges an', async () => {
    const clock = stubClock();
    await app().init(new MockBackend(), clock);
    expect(app().addVacation({ start: t0 - 5 * H, end: t0 + 5 * H })).toEqual({ ok: false, reason: 'past' });
    expect(app().addVacation({ start: t0 + 24 * H, end: t0 + 48 * H })).toEqual({ ok: true });
    expect(st().schedule.vacations).toHaveLength(1);
  });

  it('setDevTimeOffset verschiebt die Uhr und gibt fällige Aufträge aus', async () => {
    let offset = 0;
    const base = t0;
    const clock: Clock = { now: () => base + offset };
    await app().init(new MockBackend(), clock);
    // Der Store liest den Versatz aus den Einstellungen; die Uhr im Test folgt ihm.
    offset = 80 * H;
    app().setDevTimeOffset(80 * H);
    expect(st().settings.devTimeOffsetMs).toBe(80 * H);
    expect(st().assignments.map((a) => a.number)).toEqual([1, 2]);
  });
});
