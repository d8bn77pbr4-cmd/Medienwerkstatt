import { loadRules, type Rules } from '../chef/rules';
import type { Assignment } from './types';

export { systemClock } from '../time';
export type { Clock } from '../time';

export const H = 3_600_000;
export const ISSUE_INTERVAL = 72 * H;

export interface Vacation { start: number; end: number }
export interface ScheduleState { nextIssueAt: number; nextNumber: number; vacations: Vacation[] }
export type ScheduleEvent = { kind: 'issued' | 'expired'; assignmentId: string; reason?: 'deadline' | 'limit' };

/** 18:00 Ortszeit am selben Tag, wenn ts <= 18:00, sonst am Folgetag. */
export function roundUpTo18(ts: number, hour = 18): number {
  const d = new Date(ts);
  const today = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, 0, 0, 0).getTime();
  if (ts <= today) return today;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, hour, 0, 0, 0).getTime();
}

function overlapWithVacations(from: number, to: number, vs: Vacation[]): number {
  let sum = 0;
  for (const v of vs) sum += Math.max(0, Math.min(to, v.end) - Math.max(from, v.start));
  return sum;
}

export function tick(
  s: ScheduleState,
  assignments: Assignment[],
  now: number,
  issue: (number: number, issuedAt: number) => Assignment,
  rules: Rules,
): { schedule: ScheduleState; assignments: Assignment[]; events: ScheduleEvent[] } {
  const list = assignments.map(a => ({ ...a }));
  const events: ScheduleEvent[] = [];
  let { nextIssueAt, nextNumber } = s;
  const interval = rules.schedule.intervalHours * H;
  const lateWindow = rules.schedule.lateWindowHours * H;

  const expire = (a: Assignment, reason: 'deadline' | 'limit') => {
    a.status = 'expired';
    a.expiredReason = reason;
    events.push({ kind: 'expired', assignmentId: a.id, reason });
  };
  const sweep = (at: number) => {
    for (const a of list) if (a.status === 'open' && at >= a.expiresAt) expire(a, 'deadline');
  };

  while (nextIssueAt <= now) {
    const issuedAt = nextIssueAt;
    const vac = s.vacations.find(v => issuedAt >= v.start && issuedAt < v.end);
    if (vac) {
      nextIssueAt = vac.end;
      continue;
    }
    sweep(issuedAt);
    const open = list.filter(a => a.status === 'open');
    if (open.length >= rules.schedule.maxOpen) {
      const oldest = open.reduce((m, a) => (a.issuedAt < m.issuedAt ? a : m));
      expire(oldest, 'limit');
    }
    const rawDeadline = roundUpTo18(issuedAt + interval, rules.schedule.deadlineHour);
    const deadline = rawDeadline + overlapWithVacations(issuedAt, rawDeadline, s.vacations);
    const rawExpiry = deadline + lateWindow;
    const expiresAt = rawExpiry + overlapWithVacations(deadline, rawExpiry, s.vacations);
    const a = issue(nextNumber, issuedAt);
    list.push({ ...a, deadline, expiresAt, status: 'open' });
    events.push({ kind: 'issued', assignmentId: a.id });
    nextNumber += 1;
    nextIssueAt = issuedAt + interval;
  }
  sweep(now);

  return { schedule: { nextIssueAt, nextNumber, vacations: s.vacations }, assignments: list, events };
}

function daysInYears(v: Vacation): Map<number, number> {
  const out = new Map<number, number>();
  for (let y = new Date(v.start).getFullYear(); y <= new Date(v.end).getFullYear(); y++) {
    const from = Math.max(v.start, new Date(y, 0, 1).getTime());
    const to = Math.min(v.end, new Date(y + 1, 0, 1).getTime());
    if (to > from) out.set(y, Math.ceil((to - from) / (24 * H)));
  }
  return out;
}

export function canAddVacation(
  vs: Vacation[],
  v: Vacation,
  now: number,
  rules: Rules = loadRules(),
): { ok: true } | { ok: false; reason: 'past' | 'over14days' | 'overlap' } {
  if (v.start < now) return { ok: false, reason: 'past' };
  if (vs.some(o => v.start < o.end && o.start < v.end)) return { ok: false, reason: 'overlap' };
  const totals = new Map<number, number>();
  for (const x of [...vs, v]) for (const [y, d] of daysInYears(x)) totals.set(y, (totals.get(y) ?? 0) + d);
  for (const d of totals.values()) if (d > rules.schedule.vacationDaysPerYear) return { ok: false, reason: 'over14days' };
  return { ok: true };
}
