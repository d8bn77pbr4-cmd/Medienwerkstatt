import { useState } from 'react';
import { useApp } from '../../state/appStore';

const H = 3_600_000;

/** Entwickler-Zeitsimulation, nur mit `?dev=1` in der Adresse. */
function DevTime() {
  const offset = useApp((s) => s.state?.settings.devTimeOffsetMs ?? 0);
  const setOffset = useApp((s) => s.setDevTimeOffset);
  const [hours, setHours] = useState(String(offset / H));
  return (
    <section className="card" aria-labelledby="dev-h">
      <h2 id="dev-h">Entwickler</h2>
      <form
        className="dev-form"
        onSubmit={(e) => {
          e.preventDefault();
          const h = Number(hours.replace(',', '.'));
          if (Number.isFinite(h)) setOffset(Math.round(h * H));
        }}
      >
        <div className="field">
          <label htmlFor="dev-hours">Zeit vorspulen (Stunden)</label>
          <input id="dev-hours" type="number" step="any" value={hours} onChange={(e) => setHours(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary pressable">
          Übernehmen
        </button>
      </form>
    </section>
  );
}

/** Platzhalter; Task 14 baut die volle Ansicht und behält den Entwickler-Abschnitt. */
export function Einstellungen({ label, lead }: { label: string; lead: string }) {
  const dev = new URLSearchParams(window.location.search).get('dev') === '1';
  return (
    <main className="main">
      <div className="page">
        <p className="page-kicker">{label}</p>
        <h1>{label}</h1>
        <p className="page-lead">{lead}</p>
        {dev && <DevTime />}
      </div>
    </main>
  );
}
