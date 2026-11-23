import { describe, expect, it } from 'vitest';
import { countdown, statusOf } from '../../src/features/auftraege/format';
import { H } from '../../src/domain/assignments/schedule';
import type { Assignment } from '../../src/domain/assignments/types';

const now = Date.parse('2026-11-23T10:00:00+01:00');
const M = 60_000;

describe('countdown', () => {
  it('Tage und Stunden ab einem Tag', () => {
    expect(countdown(now + 52 * H, now)).toEqual({ text: 'noch 2 T. 4 Std.', late: false });
  });
  it('Stunden und Minuten unter einem Tag', () => {
    expect(countdown(now + 5 * H + 12 * M, now).text).toBe('noch 5 Std. 12 Min.');
  });
  it('nur Minuten unter einer Stunde', () => {
    expect(countdown(now + 12 * M, now).text).toBe('noch 12 Min.');
  });
  it('verspätet', () => {
    expect(countdown(now - 27 * H, now)).toEqual({ text: 'verspätet seit 1 T. 3 Std.', late: true });
    expect(countdown(now - 3 * H - 5 * M, now).text).toBe('verspätet seit 3 Std. 5 Min.');
    expect(countdown(now - 9 * M, now).text).toBe('verspätet seit 9 Min.');
  });
});

describe('statusOf', () => {
  const a = (over: Partial<Assignment>): Assignment =>
    ({ id: 'A01', number: 1, issuedAt: now, deadline: now + 40 * H, expiresAt: now + 100 * H, status: 'open', ...over }) as Assignment;
  it('offen, bald fällig, verspätet', () => {
    expect(statusOf(a({}), null, now).kind).toBe('offen');
    expect(statusOf(a({ deadline: now + 24 * H }), null, now).kind).toBe('bald');
    expect(statusOf(a({ deadline: now - 1 }), null, now).kind).toBe('verspaetet');
  });
  it('abgegeben, bewertet, verfallen', () => {
    expect(statusOf(a({ status: 'submitted' }), null, now).kind).toBe('abgegeben');
    expect(statusOf(a({ status: 'expired' }), null, now).kind).toBe('verfallen');
    expect(statusOf(a({ status: 'evaluated' }), 82, now)).toMatchObject({ kind: 'bewertet', tone: 'good', label: 'bewertet 82' });
    expect(statusOf(a({ status: 'evaluated' }), 31, now)).toMatchObject({ kind: 'bewertet', tone: 'bad' });
  });
});
