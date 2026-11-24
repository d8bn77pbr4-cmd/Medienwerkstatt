import { useEffect, useMemo, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Assignment } from '../../domain/assignments/types';
import { activeAssignment, useApp } from '../../state/appStore';
import { useProject } from '../../state/projectStore';
import { Workspace } from './Workspace';
import './workspace.css';

/** Werkstatt-Route `/`: öffnet das Projekt des gewählten (sonst des aktiven) Auftrags. */
export function Werkstatt() {
  const navigate = useNavigate();
  const wanted = (useLocation().state as { assignmentId?: string } | null)?.assignmentId;
  const state = useApp((s) => s.state);
  const ready = useApp((s) => s.ready);
  const assignment = useMemo<Assignment | null>(
    () => state?.assignments.find((a) => a.id === wanted) ?? activeAssignment({ state }),
    [state, wanted],
  );
  const status = useProject((s) => s.status);
  const loadError = useProject((s) => s.loadError);
  const opened = useProject((s) => s.assignment);
  const openedId = opened?.id;
  const switchError = useProject((s) => s.switchError);
  const open = useProject((s) => s.open);

  const id = assignment?.id;
  useEffect(() => {
    if (assignment) void open(assignment);
    // nur bei Wechsel des Auftrags neu öffnen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, open]);
  // Verlassen der Werkstatt: offenen Stand sofort sichern.
  useEffect(() => () => void useProject.getState().flush(), []);

  if (!ready) return <Empty title="Werkstatt" text="Wird geladen …" />;
  if (!assignment) {
    return (
      <Empty title="Werkstatt" text="Gerade gibt es keinen offenen Auftrag. Der nächste kommt bestimmt.">
        <button type="button" className="btn btn-primary" onClick={() => navigate('/auftraege')}>
          Zu den Aufträgen
        </button>
      </Empty>
    );
  }
  const heading = `Auftrag #${assignment.number}: ${assignment.title}`;
  if (switchError && opened && openedId !== assignment.id) {
    // Der offene Stand ließ sich nicht sichern: Er bleibt offen (Wiederholung läuft), kein Wechsel.
    return (
      <Empty title={heading} text={`Auftrag #${opened.number} hat noch ungesicherte Änderungen.`}>
        <p className="ws-warn" role="alert">
          {switchError}
        </p>
        <button type="button" className="btn btn-primary" onClick={() => void open(assignment)}>
          Erneut versuchen
        </button>
        <button type="button" className="btn" onClick={() => navigate('/', { state: { assignmentId: opened.id } })}>
          Zurück zu Auftrag #{opened.number}
        </button>
      </Empty>
    );
  }
  if (openedId !== assignment.id || status === 'loading' || status === 'idle') return <Empty title={heading} text="Projekt wird geöffnet …" />;
  if (status === 'noVideo') {
    const research = assignment.deliverables.find((d) => d.kind === 'research');
    return (
      <Empty title={heading} text="Dieser Auftrag braucht keine Werkstatt.">
        {research && (
          <button type="button" className="btn btn-primary" onClick={() => navigate(`/auftraege/${assignment.id}/recherche/${research.id}`)}>
            Recherche bearbeiten
          </button>
        )}
      </Empty>
    );
  }
  if (status === 'error') {
    return (
      <Empty title={heading} text="Das Projekt konnte nicht geöffnet werden.">
        <p className="ws-warn" role="alert">
          {loadError}
        </p>
        <button type="button" className="btn btn-primary" onClick={() => void useProject.getState().open(assignment)}>
          Erneut versuchen
        </button>
      </Empty>
    );
  }
  return <Workspace assignment={assignment} heading={heading} />;
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
