import { useEffect, useMemo, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../../state/appStore';
import { openTarget } from '../../state/openProject';
import { targetKey, useProject, type OpenTarget } from '../../state/projectStore';
import { chooseTarget, type WerkstattNav } from './chooseTarget';
import { Workspace } from './Workspace';
import './workspace.css';

function headingOf(t: OpenTarget): string {
  return t.kind === 'assignment' ? `Auftrag #${t.assignment.number}: ${t.assignment.title}` : t.project.name;
}
function shortLabel(t: OpenTarget): string {
  return t.kind === 'assignment' ? `Auftrag #${t.assignment.number}` : `„${t.project.name}“`;
}
function navFor(t: OpenTarget): { state: WerkstattNav } {
  return { state: t.kind === 'assignment' ? { assignmentId: t.assignment.id } : { projectId: t.project.id } };
}

/** Werkstatt-Route `/`: öffnet das gewählte, das offene oder das zuletzt geöffnete Projekt – sonst die Übersicht. */
export function Werkstatt() {
  const navigate = useNavigate();
  const nav = useLocation().state as WerkstattNav;
  const wantedAssignment = nav?.assignmentId;
  const wantedProject = nav?.projectId;
  const state = useApp((s) => s.state);
  const ready = useApp((s) => s.ready);
  const status = useProject((s) => s.status);
  const loadError = useProject((s) => s.loadError);
  const opened = useProject((s) => s.target);
  const openedKey = opened ? targetKey(opened) : null;
  const switchError = useProject((s) => s.switchError);

  const target = useMemo<OpenTarget | null>(
    () => (state ? chooseTarget(state, { assignmentId: wantedAssignment, projectId: wantedProject }, { target: opened, status }) : null),
    [state, wantedAssignment, wantedProject, opened, status],
  );
  const key = target ? targetKey(target) : null;

  useEffect(() => {
    if (target) void openTarget(target);
    // nur bei Wechsel des Ziels neu öffnen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  // Verlassen der Werkstatt: offenen Stand sofort sichern.
  useEffect(() => () => void useProject.getState().flush(), []);

  if (!ready || !state) return <Empty title="Werkstatt" text="Wird geladen …" />;
  if (!target) return <Navigate to="/projekte" replace />;
  const heading = headingOf(target);
  if (switchError && opened && openedKey !== key) {
    // Der offene Stand ließ sich nicht sichern: Er bleibt offen (Wiederholung läuft), kein Wechsel.
    return (
      <Empty title={heading} text={`${shortLabel(opened)} hat noch ungesicherte Änderungen.`}>
        <p className="ws-warn" role="alert">
          {switchError}
        </p>
        <button type="button" className="btn btn-primary" onClick={() => void openTarget(target)}>
          Erneut versuchen
        </button>
        <button type="button" className="btn" onClick={() => navigate('/', navFor(opened))}>
          Zurück zu {shortLabel(opened)}
        </button>
      </Empty>
    );
  }
  if (openedKey !== key || status === 'loading' || status === 'idle') return <Empty title={heading} text="Projekt wird geöffnet …" />;
  if (status === 'noVideo' && target.kind === 'assignment') {
    const research = target.assignment.deliverables.find((d) => d.kind === 'research');
    return (
      <Empty title={heading} text="Dieser Auftrag braucht keine Werkstatt. Eigene Projekte kannst du trotzdem jederzeit schneiden.">
        {research && (
          <button type="button" className="btn btn-primary" onClick={() => navigate(`/auftraege/${target.assignment.id}/recherche/${research.id}`)}>
            Recherche bearbeiten
          </button>
        )}
        <button type="button" className={research ? 'btn' : 'btn btn-primary'} onClick={() => navigate('/projekte')}>
          Zur Projektübersicht
        </button>
      </Empty>
    );
  }
  if (status === 'error') {
    return (
      <Empty title={heading} text="Das Projekt konnte nicht geöffnet werden.">
        <p className="ws-warn" role="alert">
          {loadError}
        </p>
        <button type="button" className="btn btn-primary" onClick={() => void openTarget(target)}>
          Erneut versuchen
        </button>
        <button type="button" className="btn" onClick={() => navigate('/projekte')}>
          Zur Projektübersicht
        </button>
      </Empty>
    );
  }
  return <Workspace target={target} heading={heading} />;
}

function Empty({ title, text, children }: { title: string; text: string; children?: ReactNode }) {
  return (
    <main className="main werkstatt">
      <div className="werkstatt-page">
        <h1>{title}</h1>
        <p className="page-lead">{text}</p>
        {children && <div className="ws-empty-actions">{children}</div>}
      </div>
    </main>
  );
}
