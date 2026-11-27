import { useApp } from './appStore';
import { attachAutosave, attachSaveShortcut } from './autosave';
import { useProject } from './projectStore';

/**
 * Minütliches `tickNow`, Prüfung beim Fokussieren des Fensters und Sichern beim Verlassen
 * (beforeunload, pagehide, Tab im Hintergrund) – App-Zustand und offenes Projekt; dazu der Takt der Sicherungsversionen
 * und ⌘S (siehe `autosave.ts`). Gibt den Aufräumer zurück.
 */
export function attachLifecycle(): () => void {
  const tickNow = () => useApp.getState().tickNow();
  const flush = () => {
    void useApp.getState().flush();
    void useProject.getState().flush();
  };
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') flush();
    else tickNow();
  };
  const id = setInterval(tickNow, 60_000);
  const offAutosave = attachAutosave();
  const offSaveKey = attachSaveShortcut();
  window.addEventListener('focus', tickNow);
  window.addEventListener('beforeunload', flush);
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    clearInterval(id);
    offAutosave();
    offSaveKey();
    window.removeEventListener('focus', tickNow);
    window.removeEventListener('beforeunload', flush);
    window.removeEventListener('pagehide', flush);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
