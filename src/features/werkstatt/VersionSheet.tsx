import { useEffect, useRef, useState } from 'react';
import type { VersionInfo } from '../../backend/types';
import { Sheet } from '../../shell/Sheet';
import { versionName } from '../../state/autosave';
import { useProject } from '../../state/projectStore';
import { useWerkstatt } from './uiStore';

/** „24.11.2026, 18:42:07“ in Ortszeit. */
export function formatSavedAt(ms: number): string {
  return new Date(ms).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** „812 KB“, „1,4 MB“ (mindestens 1 KB). */
export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString('de-DE')} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} MB`;
}

type Load = { state: 'loading' } | { state: 'error' } | { state: 'ready'; versions: VersionInfo[] };

/**
 * „Ältere Version …“: Liste der Sicherungsversionen des offenen Projekts (neueste zuerst). „Wiederherstellen“ fragt nach,
 * sichert den aktuellen Stand vorher selbst als Version und lädt dann die gewählte; der Verlauf (Rückgängig) beginnt neu.
 */
export function VersionSheet({ minutes, onClose }: { minutes: number; onClose(): void }) {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [pending, setPending] = useState<VersionInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const confirmBtn = useRef<HTMLButtonElement>(null);
  const rowBtns = useRef(new Map<string, HTMLButtonElement>());
  const lastPicked = useRef<string | null>(null);

  useEffect(() => {
    alive.current = true;
    useProject
      .getState()
      .listVersions()
      .then((versions) => alive.current && setLoad({ state: 'ready', versions }))
      .catch(() => alive.current && setLoad({ state: 'error' }));
    return () => void (alive.current = false);
  }, []);

  // Der Fokus folgt dem Wechsel zwischen Liste und Rückfrage (der gedrückte Knopf verschwindet sonst mit dem Fokus).
  useEffect(() => {
    if (pending) confirmBtn.current?.focus();
    else if (lastPicked.current) rowBtns.current.get(lastPicked.current)?.focus();
  }, [pending]);

  const restore = async (v: VersionInfo) => {
    setBusy(true);
    setError(null);
    try {
      await useProject.getState().restoreVersion(v.name, versionName());
      if (!alive.current) return;
      useWerkstatt.getState().clearSelection();
      useWerkstatt.getState().showNotice(`Version vom ${formatSavedAt(v.savedAt)} geladen. Der Stand davor ist als Version gesichert.`);
      onClose();
    } catch (e) {
      if (!alive.current) return;
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
      setPending(null);
    }
  };

  const footer = pending ? (
    <>
      <button type="button" className="btn" disabled={busy} onClick={() => setPending(null)}>
        Abbrechen
      </button>
      <button type="button" className="btn btn-primary" ref={confirmBtn} disabled={busy} onClick={() => void restore(pending)}>
        Wiederherstellen
      </button>
    </>
  ) : null;

  return (
    <Sheet id="ver-h" title="Ältere Version" busy={busy} onClose={onClose} footer={footer}>
      {pending ? (
        <div className="ver-confirm">
          <p>
            Version vom <strong>{formatSavedAt(pending.savedAt)}</strong> wiederherstellen?
          </p>
          <p className="muted">Der aktuelle Stand wird vorher selbst als Version gesichert. Du kannst also wieder zurück.</p>
          <div className="exp-status" role="status">
            {busy && 'Stelle wieder her …'}
          </div>
        </div>
      ) : (
        <>
          <p className="muted ver-lead">Alle {minutes} Minuten legt die App eine Sicherungsversion an (die letzten 20 bleiben), und mit ⌘S sofort.</p>
          {load.state === 'loading' && <p role="status">Lade Versionen …</p>}
          {load.state === 'error' && (
            <p className="ws-warn" role="alert">
              Die Versionen ließen sich nicht lesen.
            </p>
          )}
          {load.state === 'ready' && load.versions.length === 0 && (
            <p className="ver-empty" data-testid="ver-empty">
              Noch keine Sicherungsversion. Die erste entsteht, sobald du etwas änderst und der Takt abläuft, oder gleich mit ⌘S.
            </p>
          )}
          {load.state === 'ready' && load.versions.length > 0 && (
            <ul className="ver-list" aria-label="Sicherungsversionen, neueste zuerst">
              {load.versions.map((v) => (
                <li key={v.name}>
                  <span className="ver-when">{formatSavedAt(v.savedAt)}</span>
                  <span className="ver-size muted">{formatSize(v.bytes)}</span>
                  <button
                    type="button"
                    className="btn btn-small"
                    aria-label={`Version vom ${formatSavedAt(v.savedAt)} wiederherstellen`}
                    ref={(el) => {
                      if (el) rowBtns.current.set(v.name, el);
                      else rowBtns.current.delete(v.name);
                    }}
                    onClick={() => {
                      lastPicked.current = v.name;
                      setError(null);
                      setPending(v);
                    }}
                  >
                    Wiederherstellen
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error && (
            <p className="ws-warn" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </Sheet>
  );
}
