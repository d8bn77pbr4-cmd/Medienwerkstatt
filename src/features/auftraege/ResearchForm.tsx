import { Plus, X } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { RESEARCH_TEMPLATES, wordCount, type ResearchDoc, type ResearchField } from '../../domain/chef/research';
import { researchKey, useApp } from '../../state/appStore';
import './auftraege.css';

function hint(f: ResearchField): string | null {
  if (f.minWords === undefined && f.maxWords === undefined) return null;
  return `Ziel: ${f.minWords ?? 0}–${f.maxWords ?? '∞'} Wörter`;
}

function counterState(f: ResearchField, n: number): 'ok' | 'low' | 'high' {
  if (f.maxWords !== undefined && n > f.maxWords) return 'high';
  if (f.minWords !== undefined && n < f.minWords && n > 0) return 'low';
  return 'ok';
}

const validUrl = (s: string) => /^https?:\/\/\S+$/.test(s.trim());

export function ResearchForm() {
  const { id = '', deliverableId = '' } = useParams();
  const assignment = useApp((s) => s.state?.assignments.find((a) => a.id === id));
  const ready = useApp((s) => s.ready);
  const saved = useApp((s) => s.state?.research[researchKey(id, deliverableId)]);
  const save = useApp((s) => s.saveResearch);

  const deliverable = assignment?.deliverables.find((d) => d.id === deliverableId && d.kind === 'research');
  const template = deliverable?.researchTemplate ? RESEARCH_TEMPLATES[deliverable.researchTemplate] : null;

  if (!assignment || !deliverable || !template) {
    return (
      <main className="main">
        <div className="page">
          <p className="page-kicker">Aufträge</p>
          <h1>{ready ? 'Recherche nicht gefunden' : 'Recherche'}</h1>
          <p className="page-lead">{ready ? 'Diese Abgabe gibt es nicht.' : 'Wird geladen …'}</p>
          <p className="back-row">
            <Link to="/auftraege" className="btn">
              Zu den Aufträgen
            </Link>
          </p>
        </div>
      </main>
    );
  }

  const doc: ResearchDoc = saved ?? { templateId: template.id, fields: {}, sources: [] };
  const update = (patch: Partial<ResearchDoc>) => save(id, deliverableId, { ...doc, ...patch });
  const setField = (key: string, value: string) => update({ fields: { ...doc.fields, [key]: value } });
  const setSource = (i: number, value: string) => update({ sources: doc.sources.map((s, j) => (j === i ? value : s)) });

  return (
    <main className="main">
      <div className="page">
        <p className="page-kicker">
          <Link to="/auftraege" className="crumb">
            Aufträge
          </Link>{' '}
          ·{' '}
          <Link to={`/auftraege/${assignment.id}`} className="crumb">
            Auftrag #{assignment.number}
          </Link>{' '}
          · Recherche
        </p>
        <h1>{deliverable.label}</h1>
        <p className="page-lead">Änderungen werden automatisch gespeichert.</p>

        <form className="card research-form" onSubmit={(e) => e.preventDefault()} aria-label={`${template.label} ausfüllen`}>
          {template.fields.map((f) => {
            const value = doc.fields[f.key] ?? '';
            const n = wordCount(value);
            const long = f.maxWords !== undefined && f.maxWords > 40;
            const fid = `f-${f.key}`;
            const h = hint(f);
            return (
              <div key={f.key} className="field">
                <label htmlFor={fid}>
                  {f.label}
                  {f.required && <span className="req"> (Pflicht)</span>}
                </label>
                {long || (f.minWords ?? 0) > 10 ? (
                  <textarea id={fid} rows={long ? 5 : 3} value={value} onChange={(e) => setField(f.key, e.target.value)} aria-describedby={`${fid}-n`} />
                ) : (
                  <input id={fid} type="text" value={value} onChange={(e) => setField(f.key, e.target.value)} aria-describedby={`${fid}-n`} />
                )}
                <span id={`${fid}-n`} className={`counter counter-${counterState(f, n)}`}>
                  <span>{n} {n === 1 ? 'Wort' : 'Wörter'}</span>
                  {h && <span> · {h}</span>}
                  {counterState(f, n) !== 'ok' && <span> · {counterState(f, n) === 'low' ? 'zu kurz' : 'zu lang'}</span>}
                </span>
              </div>
            );
          })}

          <fieldset className="sources">
            <legend>Quellen</legend>
            <p className="muted">Mindestens zwei Quellen mit vollständigem Link (https://…).</p>
            {doc.sources.map((s, i) => (
              <div key={i} className="source-row">
                <label className="sr-only" htmlFor={`src-${i}`}>
                  Quelle {i + 1}
                </label>
                <input
                  id={`src-${i}`}
                  type="url"
                  inputMode="url"
                  placeholder="https://…"
                  value={s}
                  aria-invalid={s.trim() !== '' && !validUrl(s)}
                  onChange={(e) => setSource(i, e.target.value)}
                />
                <button type="button" className="icon-btn pressable" aria-label={`Quelle ${i + 1} entfernen`} onClick={() => update({ sources: doc.sources.filter((_, j) => j !== i) })}>
                  <X aria-hidden="true" />
                </button>
              </div>
            ))}
            <button type="button" className="btn pressable" onClick={() => update({ sources: [...doc.sources, ''] })}>
              <Plus aria-hidden="true" /> Quelle hinzufügen
            </button>
          </fieldset>
        </form>

        <p className="back-row">
          <Link to={`/auftraege/${assignment.id}`} className="btn">
            Zurück zum Auftrag
          </Link>
        </p>
      </div>
    </main>
  );
}
