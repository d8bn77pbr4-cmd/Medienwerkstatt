import { describe, expect, it } from 'vitest';
import { H, ISSUE_INTERVAL, roundUpTo18, tick, canAddVacation, systemClock, type ScheduleState } from '../../src/domain/assignments/schedule';
import type { Assignment } from '../../src/domain/assignments/types';
import { loadRules } from '../../src/domain/chef/rules';

const rules = loadRules();
const t0 = Date.parse('2026-11-23T10:00:00+01:00');
const start = (at: number): ScheduleState => ({ nextIssueAt: at, nextNumber: 1, vacations: [] });
const issueStub = (number: number, issuedAt: number): Assignment => ({
  id: `A${number}`, number, issuedAt, deadline: 0, expiresAt: 0, level: 1, type: 'video',
  client: { name: 'x', branche: 'y' }, occasion: '', title: '', briefing: '',
  hook: { id: 'h', text: '', verify: 'self' }, deliverables: [], shootingNotes: [], status: 'open', submissions: [],
});

describe('Zeitzone im Test', () => {
  it('lokale Zeit läuft in Berlin (Sommer +2, Winter +1)', () => {
    expect(new Date(2026, 6, 1, 12).getTimezoneOffset()).toBe(-120);
    expect(new Date(2026, 0, 1, 12).getTimezoneOffset()).toBe(-60);
  });
});

describe('roundUpTo18', () => {
  it('Frist 18:00 Ortszeit', () => {
    expect(roundUpTo18(Date.parse('2026-11-23T10:00:00+01:00'))).toBe(Date.parse('2026-11-23T18:00:00+01:00'));
    expect(roundUpTo18(Date.parse('2026-11-23T19:30:00+01:00'))).toBe(Date.parse('2026-11-24T18:00:00+01:00'));
    expect(roundUpTo18(Date.parse('2026-11-23T18:00:00+01:00'))).toBe(Date.parse('2026-11-23T18:00:00+01:00'));
  });
  it('über Zeitumstellung bleibt 18:00', () => {
    expect(new Date(roundUpTo18(Date.parse('2027-03-26T20:00:00+01:00') + 72 * H)).getHours()).toBe(18);
  });
});

describe('tick', () => {
  it('erster Auftrag beim ersten Start mit Frist und Verfall', () => {
    const r = tick(start(t0), [], t0, issueStub, rules);
    expect(r.assignments).toHaveLength(1);
    expect(r.assignments[0]).toMatchObject({
      number: 1, issuedAt: t0, status: 'open',
      deadline: roundUpTo18(t0 + ISSUE_INTERVAL),
      expiresAt: roundUpTo18(t0 + ISSUE_INTERVAL) + 72 * H,
    });
    expect(r.schedule).toMatchObject({ nextIssueAt: t0 + ISSUE_INTERVAL, nextNumber: 2 });
    expect(r.events).toEqual([{ kind: 'issued', assignmentId: 'A1' }]);
  });
  it('10 Tage Abwesenheit: 4 Aufträge nachträglich, #1 per Frist verfallen, Fristen nach Original', () => {
    const r = tick(start(t0), [], t0 + 10 * 24 * H, issueStub, rules);
    expect(r.assignments.map(a => a.number)).toEqual([1, 2, 3, 4]);
    expect(r.assignments[0]).toMatchObject({ status: 'expired', expiredReason: 'deadline' });
    expect(r.assignments[1].deadline).toBe(roundUpTo18(t0 + 72 * H + 72 * H));
    expect(r.assignments[3]).toMatchObject({ status: 'open', issuedAt: t0 + 9 * 24 * H });
    expect(r.events.filter(e => e.kind === 'expired' && e.assignmentId === 'A1')).toEqual([
      { kind: 'expired', assignmentId: 'A1', reason: 'deadline' },
    ]);
  });
  it('Urlaub verschiebt Ausgabe und verlängert Fristen', () => {
    const vStart = t0 + 2 * 24 * H;
    const vEnd = t0 + 5 * 24 * H; // deckt die Ausgabezeit t0+72h ab
    const s: ScheduleState = { ...start(t0), vacations: [{ start: vStart, end: vEnd }] };
    const r = tick(s, [], t0 + 9 * 24 * H, issueStub, rules);
    expect(r.assignments.map(a => a.issuedAt)).toEqual([t0, vEnd, vEnd + 72 * H]);
    // Auftrag 1: 48 h laufen vor dem Urlaub (23.11. 10:00 – 25.11. 10:00), die Uhr steht 72 h still,
    // die restlichen 32 h laufen ab 28.11. 10:00 → 29.11. 18:00 (Spec §8.1: im Urlaub laufen keine Fristen)
    expect(r.assignments[0].deadline).toBe(Date.parse('2026-11-29T18:00:00+01:00'));
    expect(r.assignments[0].expiresAt).toBe(Date.parse('2026-12-02T18:00:00+01:00'));
    // Auftrag 2 liegt nach dem Urlaub: Frist unverändert
    expect(r.assignments[1].deadline).toBe(Date.parse('2026-12-01T18:00:00+01:00'));
  });
  it('verlängerte Frist über die Zeitumstellung (März 2027) endet 18:00', () => {
    const issued = Date.parse('2027-03-24T10:00:00+01:00');
    const s: ScheduleState = {
      ...start(issued),
      vacations: [{ start: Date.parse('2027-03-26T12:00:00+01:00'), end: Date.parse('2027-03-29T12:00:00+02:00') }],
    };
    const a = tick(s, [], issued, issueStub, rules).assignments[0];
    // 50 h vor dem Urlaub, 30 h Rest ab 29.03. 12:00 (Sommerzeit) → 30.03. 18:00
    expect(a.deadline).toBe(Date.parse('2027-03-30T18:00:00+02:00'));
    expect(new Date(a.deadline).getHours()).toBe(18);
    expect(a.expiresAt).toBe(Date.parse('2027-04-02T18:00:00+02:00'));
  });
  it('Verfallszeit bleibt über die Zeitumstellung (Oktober 2027) 18:00', () => {
    const issued = Date.parse('2027-10-26T10:00:00+02:00');
    const a = tick(start(issued), [], issued, issueStub, rules).assignments[0];
    expect(a.deadline).toBe(Date.parse('2027-10-29T18:00:00+02:00'));
    expect(a.expiresAt).toBe(Date.parse('2027-11-01T18:00:00+01:00'));
  });
  it('Limit: 3 offene Aufträge mit fernem expiresAt + neue Ausgabe → ältester expired (limit)', () => {
    const far = t0 + 365 * 24 * H;
    const open = [1, 2, 3].map(n => ({ ...issueStub(n, t0 - (4 - n) * H), baseDeadline: far, deadline: far, expiresAt: far }));
    const s: ScheduleState = { nextIssueAt: t0, nextNumber: 4, vacations: [] };
    const r = tick(s, open, t0, issueStub, rules);
    expect(r.assignments.map(a => a.status)).toEqual(['expired', 'open', 'open', 'open']);
    expect(r.assignments[0].expiredReason).toBe('limit');
    expect(r.events).toContainEqual({ kind: 'expired', assignmentId: 'A1', reason: 'limit' });
    expect(r.assignments.filter(a => a.status === 'open')).toHaveLength(3);
  });
  it('abgegebene/bewertete Aufträge verfallen nie', () => {
    const a: Assignment = { ...issueStub(1, t0), deadline: t0 + H, expiresAt: t0 + 2 * H, status: 'submitted' };
    const b: Assignment = { ...issueStub(2, t0), deadline: t0 + H, expiresAt: t0 + 2 * H, status: 'evaluated' };
    const r = tick({ nextIssueAt: t0 + 1000 * H, nextNumber: 3, vacations: [] }, [a, b], t0 + 100 * H, issueStub, rules);
    expect(r.assignments.map(x => x.status)).toEqual(['submitted', 'evaluated']);
    expect(r.events).toEqual([]);
  });
  it('Urlaub, der nach der Ausgabe eingetragen wird, verschiebt Frist und Verfall des laufenden Auftrags', () => {
    // Ausgabe 23.11. 10:00, Frist 26.11. 18:00, Verfall 29.11. 18:00
    const first = tick(start(t0), [], t0, issueStub, rules);
    const a0 = first.assignments[0];
    expect(a0.deadline).toBe(Date.parse('2026-11-26T18:00:00+01:00'));
    // 1 h später: 7 Tage Urlaub ab 23.11. 11:00 → die Uhr steht 168 h still
    const vStart = t0 + H;
    const vEnd = vStart + 7 * 24 * H;
    const s: ScheduleState = { ...first.schedule, vacations: [{ start: vStart, end: vEnd }] };
    const r = tick(s, first.assignments, t0 + H, issueStub, rules);
    expect(r.changed).toBe(true);
    expect(r.assignments[0].deadline).toBe(Date.parse('2026-12-03T18:00:00+01:00'));
    expect(r.assignments[0].expiresAt).toBe(Date.parse('2026-12-06T18:00:00+01:00'));
    expect(r.assignments[0].deadline).toBeGreaterThan(vEnd);
    // Neu rechnen ist idempotent
    const again = tick(r.schedule, r.assignments, t0 + 2 * H, issueStub, rules);
    expect(again.changed).toBe(false);
    expect(again.assignments[0].deadline).toBe(r.assignments[0].deadline);
    expect(again.assignments[0].expiresAt).toBe(r.assignments[0].expiresAt);
  });
  it('verlängerte Frist, die in einen zweiten Urlaub läuft, verlängert sich weiter (Kaskade)', () => {
    const first = tick(start(t0), [], t0, issueStub, rules);
    // Urlaub 1: 24.11. 10:00 – 26.11. 10:00 (48 h) → Frist ohne Kaskade 28.11. 18:00
    // Urlaub 2: 27.11. 00:00 – 29.11. 00:00 (48 h) liegt in der verlängerten Frist → 30.11. 18:00
    const v1 = { start: Date.parse('2026-11-24T10:00:00+01:00'), end: Date.parse('2026-11-26T10:00:00+01:00') };
    const v2 = { start: Date.parse('2026-11-27T00:00:00+01:00'), end: Date.parse('2026-11-29T00:00:00+01:00') };
    const s: ScheduleState = { ...first.schedule, vacations: [v1, v2] };
    const r = tick(s, first.assignments, t0 + H, issueStub, rules);
    expect(r.assignments[0].deadline).toBe(Date.parse('2026-11-30T18:00:00+01:00'));
    // Verfall: 72 h nach der Frist, kein Urlaub mehr dazwischen
    expect(r.assignments[0].expiresAt).toBe(Date.parse('2026-12-03T18:00:00+01:00'));
  });
  it('Urlaub in der Spätfrist verschiebt nur den Verfall', () => {
    const first = tick(start(t0), [], t0, issueStub, rules);
    const v = { start: Date.parse('2026-11-27T10:00:00+01:00'), end: Date.parse('2026-11-28T10:00:00+01:00') };
    const r = tick({ ...first.schedule, vacations: [v] }, first.assignments, t0 + H, issueStub, rules);
    expect(r.assignments[0].deadline).toBe(Date.parse('2026-11-26T18:00:00+01:00'));
    expect(r.assignments[0].expiresAt).toBe(Date.parse('2026-11-30T18:00:00+01:00'));
  });
  it('alter Stand ohne baseDeadline: Grundfrist wird aus der Ausgabezeit abgeleitet', () => {
    const old: Assignment = {
      ...issueStub(1, t0),
      deadline: Date.parse('2026-11-26T18:00:00+01:00'),
      expiresAt: Date.parse('2026-11-29T18:00:00+01:00'),
    };
    delete (old as Partial<Assignment>).baseDeadline;
    const v = { start: t0 + H, end: t0 + H + 7 * 24 * H };
    const r = tick({ nextIssueAt: t0 + ISSUE_INTERVAL, nextNumber: 2, vacations: [v] }, [old], t0 + H, issueStub, rules);
    expect(r.assignments[0].baseDeadline).toBe(Date.parse('2026-11-26T18:00:00+01:00'));
    expect(r.assignments[0].deadline).toBe(Date.parse('2026-12-03T18:00:00+01:00'));
  });
  it('mutiert die Eingaben nicht', () => {
    const s = start(t0);
    tick(s, [], t0 + 10 * 24 * H, issueStub, rules);
    expect(s).toEqual(start(t0));
  });
});

describe('canAddVacation', () => {
  const now = t0;
  it('Urlaub > 14 Tage im Jahr oder rückwirkend wird abgelehnt', () => {
    expect(canAddVacation([], { start: now - H, end: now + 24 * H }, now, rules)).toEqual({ ok: false, reason: 'past' });
    const d = (iso: string) => Date.parse(iso);
    expect(canAddVacation([], { start: d('2026-12-01T00:00:00+01:00'), end: d('2026-12-16T00:00:00+01:00') }, now, rules))
      .toEqual({ ok: false, reason: 'over14days' });
    expect(canAddVacation([], { start: d('2026-12-01T00:00:00+01:00'), end: d('2026-12-15T00:00:00+01:00') }, now, rules))
      .toEqual({ ok: true });
  });
  it('summiert mit bestehendem Urlaub und lehnt Überlappung ab', () => {
    const d = (iso: string) => Date.parse(iso);
    const existing = [{ start: d('2026-12-01T00:00:00+01:00'), end: d('2026-12-08T00:00:00+01:00') }];
    expect(canAddVacation(existing, { start: d('2026-12-10T00:00:00+01:00'), end: d('2026-12-18T00:00:00+01:00') }, now, rules))
      .toEqual({ ok: false, reason: 'over14days' });
    expect(canAddVacation(existing, { start: d('2026-12-07T00:00:00+01:00'), end: d('2026-12-09T00:00:00+01:00') }, now, rules))
      .toEqual({ ok: false, reason: 'overlap' });
  });
  it('zählt lokale Kalendertage über die Zeitumstellung (14 ok, 15 zu viel)', () => {
    const before = Date.parse('2026-10-01T00:00:00+02:00');
    const d = (iso: string) => Date.parse(iso);
    expect(canAddVacation([], { start: d('2026-10-20T00:00:00+02:00'), end: d('2026-11-03T00:00:00+01:00') }, before, rules))
      .toEqual({ ok: true });
    expect(canAddVacation([], { start: d('2026-10-20T00:00:00+02:00'), end: d('2026-11-04T00:00:00+01:00') }, before, rules))
      .toEqual({ ok: false, reason: 'over14days' });
  });
  it('end <= start ist ungültig', () => {
    expect(canAddVacation([], { start: now + 24 * H, end: now + 24 * H }, now, rules)).toEqual({ ok: false, reason: 'invalid' });
    expect(canAddVacation([], { start: now + 48 * H, end: now + 24 * H }, now, rules)).toEqual({ ok: false, reason: 'invalid' });
  });
  it('zählt Tage je Kalenderjahr getrennt (Jahreswechsel)', () => {
    const d = (iso: string) => Date.parse(iso);
    const v = { start: d('2026-12-20T00:00:00+01:00'), end: d('2027-01-10T00:00:00+01:00') }; // 12 + 9 Tage
    expect(canAddVacation([], v, now, rules)).toEqual({ ok: true });
  });
});

describe('systemClock', () => {
  it('addiert den Versatz', () => {
    const c = systemClock(() => 5000);
    const before = Date.now();
    const n = c.now();
    expect(n - before).toBeGreaterThanOrEqual(5000);
    expect(n - before).toBeLessThan(6000);
  });
});
