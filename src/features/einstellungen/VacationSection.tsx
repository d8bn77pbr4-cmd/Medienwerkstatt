import { Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useApp } from '../../state/appStore';
import { useNow } from '../../state/useNow';
import { vacationRefusalText } from './vacationText';

const DAY = 24 * 3_600_000;
const NONE: never[] = [];
const fmt = (ms: number) => new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** „2026-12-05“ → Mitternacht Ortszeit (dayOffset 1 = Mitternacht des Folgetags). */
function localMidnight(iso: string, dayOffset = 0): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + dayOffset).getTime() : null;
}

/** Urlaub: Ausgabe pausiert, Fristen verlängern sich (Spec §8). Liste, Entfernen künftiger Einträge, Hinzufügen. */
export function VacationSection() {
  const vacations = useApp((s) => s.state?.schedule.vacations ?? NONE);
  const addVacation = useApp((s) => s.addVacation);
  const removeVacation = useApp((s) => s.removeVacation);
  const now = useNow();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const start = localMidnight(from);
    const end = localMidnight(to, 1);
    if (start === null || end === null) return setError('Bitte wähle Beginn und Ende des Urlaubs.');
    const r = addVacation({ start, end });
    if (r.ok) {
      setError(null);
      setFrom('');
      setTo('');
    } else setError(vacationRefusalText(r.reason));
  };

  const sorted = [...vacations].sort((a, b) => a.start - b.start);
  return (
    <section className="card" aria-labelledby="urlaub-h">
      <h2 id="urlaub-h">Urlaub</h2>
      <p className="muted set-lead">Im Urlaub gibt es keine neuen Aufträge, und laufende Fristen verlängern sich um die Urlaubstage. Höchstens 14 Tage im Jahr.</p>
      {sorted.length > 0 && (
        <ul className="vac-list" aria-label="Eingetragener Urlaub">
          {sorted.map((v) => {
            const days = Math.round((v.end - v.start) / DAY);
            const label = `${fmt(v.start)} – ${fmt(v.end - 1)}`;
            return (
              <li key={v.start}>
                <span>
                  {label} <span className="muted">({days} {days === 1 ? 'Tag' : 'Tage'})</span>
                </span>
                {v.start > now ? (
                  <button type="button" className="icon-btn pressable" aria-label={`Urlaub vom ${label} entfernen`} onClick={() => removeVacation(v.start)}>
                    <Trash2 aria-hidden="true" />
                  </button>
                ) : (
                  <span className="muted">{v.end <= now ? 'vorbei' : 'läuft'}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <form className="vac-form" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="vac-from">Von</label>
          <input id="vac-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-invalid={error ? true : undefined} />
        </div>
        <div className="field">
          <label htmlFor="vac-to">Bis (einschließlich)</label>
          <input id="vac-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-invalid={error ? true : undefined} />
        </div>
        <button type="submit" className="btn btn-primary pressable">
          Urlaub eintragen
        </button>
      </form>
      {error && (
        <p className="set-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
