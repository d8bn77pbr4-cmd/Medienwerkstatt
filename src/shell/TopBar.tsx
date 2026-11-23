import { useLocation } from 'react-router-dom';
import { areaForPath } from './areas';

/** Kopfleiste: links Bereich, rechts Platzhalter für Auftrag/Countdown und Punktekonto. */
export function TopBar() {
  const area = areaForPath(useLocation().pathname);
  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="topbar-title">{area.label}</span>
      </div>
      <div className="topbar-right">
        <span className="topbar-status">Kein aktiver Auftrag</span>
        <span className="topbar-status">Punkte: –</span>
      </div>
    </header>
  );
}
