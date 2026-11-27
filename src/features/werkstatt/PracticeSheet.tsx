import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { FreeProject } from '../../domain/projects';
import { Sheet } from '../../shell/Sheet';
import { useApp } from '../../state/appStore';
import { useProject } from '../../state/projectStore';

/**
 * „Chef ansehen lassen (ohne Punkte)“: misst den letzten Export des freien Projekts, der Chef bewertet Technik und
 * Gestaltung. Das Ergebnis ist eine Übung und ändert Konto, Rang und Showreel nicht.
 */
export function PracticeSheet({ freeProject, onClose }: { freeProject: FreeProject; onClose(): void }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('Prüfe die Datei …');
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => void (alive.current = false);
  }, []);

  const run = async () => {
    setBusy(true);
    setError(null);
    setMessage('Prüfe die Datei …');
    try {
      const e = await useApp.getState().reviewPractice(freeProject.id, useProject.getState().project, (m) => alive.current && setMessage(m));
      if (!alive.current) return;
      onClose();
      navigate(`/chefbuero/${encodeURIComponent(e.id)}`, { state: { fresh: true } });
    } catch (err) {
      if (!alive.current) return;
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Sheet
      id="practice-h"
      title="Chef ansehen lassen"
      busy={busy}
      onClose={onClose}
      footer={
        error ? (
          <button type="button" className="btn btn-primary" data-autofocus onClick={() => void run()}>
            Noch einmal versuchen
          </button>
        ) : null
      }
    >
      <p className="muted">
        „{freeProject.name}“ · Übung ohne Punkte: Der Chef sagt dir, wie Technik und Gestaltung wirken. Dein Punktekonto, dein Rang und dein Showreel bleiben, wie sie sind.
      </p>
      <div className="exp-status" role="status">
        {busy && <span>{message}</span>}
      </div>
      {error && (
        <p className="ws-warn" role="alert">
          Das hat nicht geklappt: {error}
        </p>
      )}
    </Sheet>
  );
}
