import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getBackend } from '../../backend';
import { researchKey, useApp } from '../../state/appStore';
import { loadProjectFor } from '../../state/projectAccess';
import { SubmitSheet } from '../chefbuero/SubmitSheet';
import { countedEvaluations } from '../../domain/chef/types';
import { countedSources, RESEARCH_TEMPLATES } from '../../domain/chef/research';
import { SteckbriefKarte, ThemaKarte } from './AuftragHintergrund';
import { formatDeadline } from './format';
import { StatusBadge } from './StatusBadge';
import { useStatusOf } from './useStatus';
import { vorgabenFor } from './vorgaben';
import './auftraege.css';

export function AuftragDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const assignment = useApp((s) => s.state?.assignments.find((a) => a.id === id));
  const ready = useApp((s) => s.ready);
  const checked = useApp((s) => s.state?.checklist[id]);
  const research = useApp((s) => s.state?.research);
  const toggle = useApp((s) => s.toggleChecklist);
  const statusOf = useStatusOf();
  const evaluations = useApp((s) => s.state?.evaluations);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [exportCount, setExportCount] = useState(0);
  const groups = useMemo(() => (assignment ? vorgabenFor(assignment) : []), [assignment]);

  // Gibt es schon einen Export? Erst dann ist „Abgeben“ sinnvoll (Recherche-Aufträge brauchen keinen).
  useEffect(() => {
    if (!assignment) return;
    let alive = true;
    loadProjectFor(assignment, getBackend())
      .then((r) => alive && setExportCount(r.project?.exports.length ?? 0))
      .catch(() => alive && setExportCount(0));
    return () => {
      alive = false;
    };
  }, [assignment]);

  if (!assignment) {
    return (
      <main className="main">
        <div className="page">
          <p className="page-kicker">Aufträge</p>
          <h1>{ready ? 'Auftrag nicht gefunden' : 'Auftrag'}</h1>
          <p className="page-lead">{ready ? 'Diesen Auftrag gibt es nicht (mehr).' : 'Wird geladen …'}</p>
          <p className="back-row">
            <Link to="/auftraege" className="btn">
              Zu den Aufträgen
            </Link>
          </p>
        </div>
      </main>
    );
  }

  const { status, countdown } = statusOf(assignment);
  const hasVideo = assignment.deliverables.some((d) => d.kind === 'video');
  const firstResearch = assignment.deliverables.find((d) => d.kind === 'research');
  const researchPath = firstResearch ? `/auftraege/${assignment.id}/recherche/${firstResearch.id}` : null;
  const canSubmit = assignment.status === 'open' && (!hasVideo || exportCount > 0);
  const lastEvaluation = countedEvaluations(evaluations ?? []).filter((e) => e.assignmentId === assignment.id).sort((a, b) => b.at - a.at)[0];
  const ticked = new Set(checked ?? []);
  const total = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <main className="main">
      <div className="page">
        <p className="page-kicker">
          <Link to="/auftraege" className="crumb">
            Aufträge
          </Link>{' '}
          · Auftrag #{assignment.number}
        </p>
        <h1>{assignment.title}</h1>

        <div className="detail-head">
          <StatusBadge status={status} />
          <span className="detail-deadline">Frist {formatDeadline(assignment.deadline)}</span>
          {countdown && <span className={`countdown${countdown.late ? ' is-late' : ''}`}>{countdown.text}</span>}
        </div>

        <section className="card" aria-labelledby="briefing-h">
          <h2 id="briefing-h">Briefing</h2>
          <p className="detail-client">
            {assignment.client.name} · {assignment.client.branche} · {assignment.occasion}
          </p>
          <p>{assignment.briefing}</p>
        </section>

        {assignment.topic ? <ThemaKarte topic={assignment.topic} /> : <SteckbriefKarte client={assignment.client} />}

        <section className="card" aria-labelledby="vorgaben-h">
          <h2 id="vorgaben-h">Vorgaben</h2>
          <p className="muted vorgaben-count">
            {ticked.size} von {total} abgehakt
          </p>
          {groups.map((g) => (
            <div key={g.id} className="vorgaben-group">
              {g.heading && <h3>{g.heading}</h3>}
              <ul className="checklist">
                {g.items.map((it) => (
                  <li key={it.id}>
                    <label>
                      <input type="checkbox" checked={ticked.has(it.id)} onChange={() => toggle(assignment.id, it.id)} />
                      <span>{it.text}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        {assignment.shootingNotes.length > 0 && (
          <section className="card" aria-labelledby="dreh-h">
            <h2 id="dreh-h">Drehhinweise</h2>
            <ul className="plain-list">
              {assignment.shootingNotes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </section>
        )}

        <section className="card" aria-labelledby="abgaben-h">
          <h2 id="abgaben-h">Abgaben</h2>
          <ul className="plain-list">
            {assignment.deliverables.map((d) => {
              const doc = research?.[researchKey(assignment.id, d.id)];
              const template = d.researchTemplate ? RESEARCH_TEMPLATES[d.researchTemplate] : null;
              let info: string;
              if (d.videoSpec) info = `Datei ${d.videoSpec.fileName}`;
              else if (template) {
                const req = template.fields.filter((f) => f.required);
                const filled = req.filter((f) => (doc?.fields[f.key] ?? '').trim() !== '').length;
                info = `${filled} von ${req.length} Pflichtfeldern, ${countedSources(doc?.sources ?? [])} Quellen`;
              } else info = '';
              return (
                <li key={d.id}>
                  <strong>{d.label}</strong> <span className="muted">· {info}</span>
                  {d.kind === 'research' && hasVideo && researchPath && (
                    <>
                      {' '}
                      <Link to={`/auftraege/${assignment.id}/recherche/${d.id}`} className="inline-link">
                        Recherche bearbeiten
                      </Link>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <div className="actions">
          {canSubmit && (
            <button type="button" className="btn btn-primary pressable" onClick={() => setSubmitOpen(true)}>
              Abgeben
            </button>
          )}
          {lastEvaluation && (
            <button
              type="button"
              className={`btn pressable${canSubmit ? '' : ' btn-primary'}`}
              onClick={() => navigate(`/chefbuero/${encodeURIComponent(lastEvaluation.id)}`)}
            >
              Zum Abnahmeprotokoll
            </button>
          )}
          {hasVideo ? (
            <button
              type="button"
              className={`btn pressable${canSubmit || lastEvaluation ? '' : ' btn-primary'}`}
              onClick={() => navigate('/', { state: { assignmentId: assignment.id } })}
            >
              In der Werkstatt öffnen
            </button>
          ) : (
            researchPath && (
              <button type="button" className={`btn pressable${canSubmit || lastEvaluation ? '' : ' btn-primary'}`} onClick={() => navigate(researchPath)}>
                Recherche bearbeiten
              </button>
            )
          )}
        </div>
        {submitOpen && <SubmitSheet assignment={assignment} onClose={() => setSubmitOpen(false)} />}
      </div>
    </main>
  );
}
