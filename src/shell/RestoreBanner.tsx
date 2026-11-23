import { X } from 'lucide-react';
import { useApp } from '../state/appStore';

/** Hinweis nach dem Laden aus der Sicherung; schließbar. */
export function RestoreBanner() {
  const restored = useApp((s) => s.restoredFromBackup);
  const dismiss = useApp((s) => s.dismissRestoredBanner);
  if (!restored) return null;
  return (
    <div className="banner" role="status">
      <span>Letzte Sicherung geladen</span>
      <button type="button" className="icon-btn pressable" aria-label="Hinweis schließen" onClick={dismiss}>
        <X aria-hidden="true" />
      </button>
    </div>
  );
}
