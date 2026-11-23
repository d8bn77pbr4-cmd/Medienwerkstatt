import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { Assignment } from '../../backend/types';
import { useApp } from '../../state/appStore';
import { formatDeadline } from './format';
import { StatusBadge } from './StatusBadge';
import { useStatusOf } from './useStatus';
import './auftraege.css';

function AuftragCard({ a }: { a: Assignment }) {
  const statusOf = useStatusOf();
  const { status, countdown } = statusOf(a);
  return (
    <Link to={`/auftraege/${a.id}`} className="auftrag-card pressable">
      <span className="auftrag-card-main">
        <span className="auftrag-nr">Auftrag #{a.number}</span>
        <span className="auftrag-title">{a.title}</span>
        <span className="auftrag-meta">
          {a.occasion} · Frist {formatDeadline(a.deadline)}
        </span>
      </span>
      <span className="auftrag-card-side">
        <StatusBadge status={status} />
        {countdown && <span className={`countdown${countdown.late ? ' is-late' : ''}`}>{countdown.text}</span>}
      </span>
    </Link>
  );
}

export function AuftraegeView({ lead }: { lead: string }) {
  const assignments = useApp((s) => s.state?.assignments);
  const ready = useApp((s) => s.ready);
  const initError = useApp((s) => s.initError);
  const { current, archive } = useMemo(() => {
    const all = assignments ?? [];
    return {
      current: all.filter((a) => a.status === 'open' || a.status === 'submitted').sort((x, y) => x.deadline - y.deadline || x.number - y.number),
      archive: all.filter((a) => a.status === 'evaluated' || a.status === 'expired').sort((x, y) => y.number - x.number),
    };
  }, [assignments]);

  return (
    <main className="main">
      <div className="page">
        <p className="page-kicker">Aufträge</p>
        <h1>Aufträge</h1>
        <p className="page-lead">{lead}</p>

        <section className="card auftrag-section" aria-labelledby="offen-h">
          <h2 id="offen-h">Offene Aufträge</h2>
          {!ready ? (
            <p className="muted">{initError ? 'Laden fehlgeschlagen.' : 'Wird geladen …'}</p>
          ) : current.length === 0 ? (
            <p className="muted">Gerade ist nichts offen. Der nächste Auftrag kommt automatisch.</p>
          ) : (
            <ul className="auftrag-list">
              {current.map((a) => (
                <li key={a.id}>
                  <AuftragCard a={a} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {archive.length > 0 && (
          <details className="card auftrag-section archiv">
            <summary>Archiv ({archive.length})</summary>
            <ul className="auftrag-list">
              {archive.map((a) => (
                <li key={a.id}>
                  <AuftragCard a={a} />
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </main>
  );
}
