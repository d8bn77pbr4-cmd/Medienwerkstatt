import type { Assignment } from '../../backend/types';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** „2 T. 4 Std.“ (ab 1 Tag), „5 Std. 12 Min.“, „12 Min.“; unter einer Minute „weniger als 1 Min.“. */
function span(ms: number): string {
  const a = Math.abs(ms);
  const d = Math.floor(a / DAY);
  const h = Math.floor((a % DAY) / HOUR);
  const m = Math.floor((a % HOUR) / MIN);
  if (d >= 1) return `${d} T. ${h} Std.`;
  if (h >= 1) return `${h} Std. ${m} Min.`;
  if (m >= 1) return `${m} Min.`;
  return 'weniger als 1 Min.';
}

export function countdown(deadline: number, now: number): { text: string; late: boolean } {
  const left = deadline - now;
  if (left >= 0) return { text: `noch ${span(left)}`, late: false };
  return { text: `verspätet seit ${span(left)}`, late: true };
}

export type StatusKind = 'offen' | 'bald' | 'verspaetet' | 'abgegeben' | 'bewertet' | 'verfallen';
export type StatusTone = 'info' | 'care' | 'warn' | 'muted' | 'good' | 'bad';
export type Status = { kind: StatusKind; label: string; tone: StatusTone };

/** Status dreifach codiert (Spec §10.5): Art → Farbe (Ton), Symbol und Text kommen aus dem Badge. */
export function statusOf(a: Assignment, evaluationTotal: number | null, now: number): Status {
  switch (a.status) {
    case 'expired':
      return { kind: 'verfallen', label: 'verfallen', tone: 'muted' };
    case 'submitted':
      return { kind: 'abgegeben', label: 'abgegeben', tone: 'muted' };
    case 'evaluated': {
      const t = evaluationTotal ?? 0;
      return { kind: 'bewertet', label: `bewertet ${t}`, tone: t >= 50 ? 'good' : 'bad' };
    }
    default:
      if (now > a.deadline) return { kind: 'verspaetet', label: 'verspätet', tone: 'warn' };
      if (a.deadline - now <= DAY) return { kind: 'bald', label: 'bald fällig', tone: 'care' };
      return { kind: 'offen', label: 'offen', tone: 'info' };
  }
}

const dateFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
/** „Do., 26.11.2026, 18:00 Uhr“ in Ortszeit. */
export function formatDeadline(ts: number): string {
  return `${dateFmt.format(new Date(ts))} Uhr`;
}
