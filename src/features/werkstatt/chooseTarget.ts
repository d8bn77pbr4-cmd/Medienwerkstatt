import type { AppState } from '../../backend/types';
import type { OpenTarget, ProjectStatus } from '../../state/projectStore';

/** Navigationszustand der Route `/`: ein bestimmter Auftrag (Auftragsansicht, Chefbüro) oder ein freies Projekt. */
export type WerkstattNav = { assignmentId?: string; projectId?: string } | null;

const hasVideo = (a: AppState['assignments'][number]) => a.deliverables.some((d) => d.kind === 'video' && d.videoSpec);

/** Ziel aus dem aktuellen Zustand neu auflösen (frische Objekte, z. B. nach Umbenennen); `null`, wenn es fehlt. */
function resolve(state: AppState, kind: 'free' | 'assignment', id: string): OpenTarget | null {
  if (kind === 'assignment') {
    const assignment = state.assignments.find((a) => a.id === id);
    return assignment ? { kind, assignment } : null;
  }
  const project = (state.projects ?? []).find((p) => p.id === id);
  return project ? { kind, project } : null;
}

/**
 * Was die Werkstatt öffnet: ausdrücklich gewählter Auftrag bzw. freies Projekt, sonst das schon offene Projekt,
 * sonst das zuletzt geöffnete. Ein Auftrag ohne Video-Abgabe kommt nur über die ausdrückliche Wahl (`assignmentId`)
 * in die Werkstatt. `null` = nichts zu öffnen (→ Projektübersicht).
 */
export function chooseTarget(state: AppState, nav: WerkstattNav, open: { target: OpenTarget | null; status: ProjectStatus }): OpenTarget | null {
  if (nav?.assignmentId) {
    const t = resolve(state, 'assignment', nav.assignmentId);
    if (t) return t;
  }
  if (nav?.projectId) {
    const t = resolve(state, 'free', nav.projectId);
    if (t) return t;
  }
  if (open.target && open.status !== 'noVideo') {
    const id = open.target.kind === 'assignment' ? open.target.assignment.id : open.target.project.id;
    const t = resolve(state, open.target.kind, id);
    if (t) return t;
  }
  const last = state.lastOpened;
  if (last) {
    const t = resolve(state, last.kind, last.id);
    if (t && (t.kind === 'free' || hasVideo(t.assignment))) return t;
  }
  return null;
}
