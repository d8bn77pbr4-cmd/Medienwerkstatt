import { X } from 'lucide-react';
import { useApp } from '../state/appStore';

/** Hinweise zum Speicherstand: Sicherung geladen, Speichern fehlgeschlagen, Laden fehlgeschlagen. */
export function RestoreBanner() {
  const restored = useApp((s) => s.restoredFromBackup);
  const dismiss = useApp((s) => s.dismissRestoredBanner);
  const saveError = useApp((s) => s.saveError);
  const initError = useApp((s) => s.initError);
  const restart = useApp((s) => s.restart);
  return (
    <>
      {initError && (
        <div className="banner" role="alert">
          <span>Der Stand konnte nicht geladen werden.</span>
          <button type="button" className="btn pressable" onClick={() => void restart()}>
            Neu starten
          </button>
        </div>
      )}
      {saveError && (
        <div className="banner" role="alert">
          <span>Speichern fehlgeschlagen – neuer Versuch …</span>
        </div>
      )}
      {restored && (
        <div className="banner" role="status">
          <span>Letzte Sicherung geladen</span>
          <button type="button" className="icon-btn pressable" aria-label="Hinweis schließen" onClick={dismiss}>
            <X aria-hidden="true" />
          </button>
        </div>
      )}
    </>
  );
}
