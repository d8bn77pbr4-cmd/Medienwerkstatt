import { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { countdown } from '../features/auftraege/format';
import { accountSummary, activeAssignment, useApp } from '../state/appStore';
import { useNow } from '../state/useNow';
import { areaForPath } from './areas';

/** Kopfleiste: links Bereich, rechts aktiver Auftrag mit Countdown und Punktekonto. */
export function TopBar() {
  const area = areaForPath(useLocation().pathname);
  const state = useApp((s) => s.state);
  const now = useNow();
  const active = useMemo(() => activeAssignment({ state }), [state]);
  const account = useMemo(() => accountSummary({ state }), [state]);
  const cd = active ? countdown(active.deadline, now) : null;
  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="topbar-title">{area.label}</span>
      </div>
      <div className="topbar-right">
        {active && cd ? (
          <Link to={`/auftraege/${active.id}`} className="topbar-status topbar-active" title={active.title}>
            <span className="topbar-active-title">
              Auftrag #{active.number}: {active.title}
            </span>
            <span className={`countdown${cd.late ? ' is-late' : ''}`}>{cd.text}</span>
          </Link>
        ) : (
          <span className="topbar-status">Kein aktiver Auftrag</span>
        )}
        <span className="topbar-status" title={account.levelName}>
          {account.points} Punkte
        </span>
      </div>
    </header>
  );
}
