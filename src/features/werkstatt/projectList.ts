import type { AppState, Assignment, FreeProject } from '../../backend/types';

/** Ein Eintrag der Projektübersicht: freies Projekt oder Projekt eines Video-Auftrags. */
export type ProjectEntry = { kind: 'free'; project: FreeProject; at: number } | { kind: 'assignment'; assignment: Assignment; at: number };

const hasVideo = (a: Assignment) => a.deliverables.some((d) => d.kind === 'video' && d.videoSpec);

/** Letzte Aktivität eines Auftrags: Ausgabe oder letzte Abgabe. */
function assignmentActivity(a: Assignment): number {
  return a.submissions.reduce((m, s) => Math.max(m, s.at), a.issuedAt);
}

/**
 * Alle Projekte, zuletzt geöffnete zuerst: freie Projekte nach `openedAt`, Aufträge (nur mit Video-Abgabe) nach
 * ihrer letzten Aktivität. Das zuletzt geöffnete Projekt (`lastOpened`) steht immer oben.
 */
export function projectEntries(state: AppState): ProjectEntry[] {
  const last = state.lastOpened;
  const entries: ProjectEntry[] = [
    ...(state.projects ?? []).map((project): ProjectEntry => ({ kind: 'free', project, at: project.openedAt })),
    ...state.assignments.filter(hasVideo).map((assignment): ProjectEntry => ({ kind: 'assignment', assignment, at: assignmentActivity(assignment) })),
  ];
  const isLast = (e: ProjectEntry) => !!last && last.kind === e.kind && last.id === (e.kind === 'free' ? e.project.id : e.assignment.id);
  const key = (e: ProjectEntry) => (isLast(e) ? Infinity : e.at);
  return entries.sort((x, y) => key(y) - key(x));
}

const MIN = 60_000;
const timeFmt = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
const dateFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

const startOfDay = (ts: number) => {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/** „zuletzt geöffnet gerade eben / vor 5 Min. / heute, 14:05 Uhr / gestern, 09:12 Uhr / am 23.11.2026“ (Ortszeit). */
export function openedText(ts: number, now: number): string {
  const ago = now - ts;
  if (ago >= 0 && ago < MIN) return 'zuletzt geöffnet gerade eben';
  if (ago >= 0 && ago < 60 * MIN) return `zuletzt geöffnet vor ${Math.floor(ago / MIN)} Min.`;
  const day = startOfDay(ts);
  const today = startOfDay(now);
  if (day === today) return `zuletzt geöffnet heute, ${timeFmt.format(new Date(ts))} Uhr`;
  if (day === startOfDay(today - 1)) return `zuletzt geöffnet gestern, ${timeFmt.format(new Date(ts))} Uhr`;
  return `zuletzt geöffnet am ${dateFmt.format(new Date(ts))}`;
}
