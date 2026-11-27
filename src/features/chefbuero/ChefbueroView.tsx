import { ArrowLeft, Check, FolderSearch } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { getBackend } from '../../backend';
import type { Assignment } from '../../domain/assignments/types';
import { account } from '../../domain/chef/account';
import { canCorrect, correctionBlockedText, correctionDeadline } from '../../domain/chef/correction';
import { loadRules } from '../../domain/chef/rules';
import { allDeductions, applicableCategories, countedEvaluations, type Deduction, type Evaluation } from '../../domain/chef/types';
import type { FreeProject } from '../../domain/projects';
import { formatDeadline } from '../auftraege/format';
import { useApp } from '../../state/appStore';
import { useNow } from '../../state/useNow';
import { Protokoll, useJumpToTool } from './Protokoll';
import { CATEGORY_TITLES } from './ruleTitles';
import { Stage } from './Stage';
import './chefbuero.css';

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const dateOf = (at: number) => new Date(at).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });

function Shell({ kicker, title, lead, children }: { kicker: string; title: string; lead?: string; children: React.ReactNode }) {
  return (
    <main className="main">
      <div className="page">
        <p className="page-kicker">{kicker}</p>
        <h1>{title}</h1>
        {lead && <p className="page-lead">{lead}</p>}
        {children}
      </div>
    </main>
  );
}

function Empty() {
  const navigate = useNavigate();
  return (
    <section className="card" aria-labelledby="leer-h">
      <h2 id="leer-h">Noch keine Abnahme</h2>
      <p>Sobald du einen Auftrag abgegeben hast, siehst du hier dein Konto und die Protokolle.</p>
      <div className="actions">
        <button type="button" className="btn btn-primary pressable" onClick={() => navigate('/auftraege')}>
          Zu den Aufträgen
        </button>
      </div>
    </section>
  );
}

/** Bar mit Wert für eine Kategorie im Verlauf. */
function MiniBar({ label, points, max }: { label: string; points: number; max: number }) {
  return (
    <li className="mini">
      <span className="mini-label">{label}</span>
      <span className="mini-bar" aria-hidden="true">
        <span style={{ transform: `scaleX(${max > 0 ? points / max : 0})` }} />
      </span>
      <span className="mini-val">
        {points}/{max}
      </span>
    </li>
  );
}

function Konto({ evaluations, assignments }: { evaluations: Evaluation[]; assignments: Assignment[] }) {
  const rules = loadRules();
  const acc = useMemo(() => account(evaluations, assignments, rules), [evaluations, assignments, rules]);
  const jump = useJumpToTool();
  const base = rules.levels[acc.level - 1].min;
  const ratio = acc.nextAt === null ? 1 : Math.max(0, Math.min(1, (acc.points - base) / (acc.nextAt - base)));
  const top = acc.frequent[0];
  const topTool = useMemo<Deduction | undefined>(() => {
    if (!top) return undefined;
    for (const e of countedEvaluations(evaluations)) for (const d of allDeductions(e)) if (d.ruleId === top.ruleId && d.tool) return d;
    return undefined;
  }, [evaluations, top]);
  const next = acc.nextAt === null ? null : rules.levels[acc.level];
  return (
    <section className="card kurz" aria-labelledby="konto-h">
      <h2 id="konto-h">Kurz gesagt</h2>
      <p className="kurz-total">
        <span className="total-real" data-testid="konto-punkte">
          {acc.points}
        </span>
        <span className="kurz-of"> Punkte · Stufe {acc.level}: {acc.levelName}</span>
      </p>
      <div
        className="level-bar"
        role="progressbar"
        aria-label={next ? `Fortschritt zur Stufe ${next.name}` : 'Höchste Stufe erreicht'}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
      >
        <span style={{ transform: `scaleX(${ratio})` }} />
      </div>
      <p className="muted level-hint">
        {next && acc.nextAt !== null ? `Noch ${Math.max(0, acc.nextAt - acc.points)} Punkte bis „${next.name}“ (ab ${acc.nextAt}).` : 'Du bist auf der höchsten Stufe.'}
      </p>
      {top && (
        <div className="dauer">
          <p>
            <strong>Dein Dauerbrenner:</strong> {top.label} <span className="muted">({top.count}× abgezogen)</span>
          </p>
          {topTool?.tool && (
            <button type="button" className="btn pressable" onClick={() => jump(topTool.tool!.panel)}>
              In der Werkstatt öffnen
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function Verlauf({ evaluations, assignments }: { evaluations: Evaluation[]; assignments: Assignment[] }) {
  const last = useMemo(() => countedEvaluations(evaluations).sort((a, b) => b.at - a.at).slice(0, 10), [evaluations]);
  return (
    <ol className="verlauf" aria-label="Verlauf der letzten Abgaben">
      {last.map((e) => {
        const a = assignments.find((x) => x.id === e.assignmentId);
        return (
          <li key={e.id} className="verlauf-item">
            <Link to={`/chefbuero/${encodeURIComponent(e.id)}`} className="verlauf-link pressable">
              <span className="verlauf-main">
                <span className="verlauf-date">{dateOf(e.at)}</span>
                <span className="verlauf-title">{a ? `Auftrag #${a.number}: ${a.title}` : 'Auftrag'}</span>
              </span>
              <span className="verlauf-total" aria-label={`${e.total} Punkte`}>
                {e.total}
              </span>
              <ul className="minis" aria-label="Punkte je Kategorie">
                {applicableCategories(e).map((k) => (
                  <MiniBar key={k} label={CATEGORY_TITLES[k]} points={e.categories[k].points} max={e.categories[k].max} />
                ))}
              </ul>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

function Showreel({ evaluations, assignments, marked }: { evaluations: Evaluation[]; assignments: Assignment[]; marked: string[] }) {
  const min = loadRules().showreelMinScore;
  const toggle = useApp((s) => s.toggleShowreel);
  const eligible = useMemo(() => countedEvaluations(evaluations).filter((e) => e.total >= min).sort((a, b) => b.at - a.at), [evaluations, min]);
  if (eligible.length === 0) return <p className="muted">Ab {min} Punkten kannst du eine Abgabe fürs Showreel merken. Noch ist keine so weit.</p>;
  return (
    <ul className="showreel">
      {eligible.map((e) => {
        const a = assignments.find((x) => x.id === e.assignmentId);
        const on = marked.includes(e.id);
        return (
          <li key={e.id}>
            <div className="showreel-main">
              <strong>{a ? `Auftrag #${a.number}: ${a.title}` : 'Auftrag'}</strong> <span className="muted">· {e.total} Punkte</span>
              {on && (e.exports ?? []).map((f) => (
                <p key={f.deliverableId} className="showreel-file">
                  {f.fileName}
                  {isTauri() && (
                    <button type="button" className="btn btn-small" onClick={() => void getBackend().revealInFinder(f.path)}>
                      <FolderSearch aria-hidden="true" /> Im Finder zeigen
                    </button>
                  )}
                </p>
              ))}
            </div>
            <button type="button" className="btn pressable" aria-pressed={on} onClick={() => toggle(e.id)}>
              {on && <Check aria-hidden="true" />} {on ? 'Gemerkt' : 'Fürs Showreel merken'}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Übungen aus freien Projekten: eigener Abschnitt, zählt nicht fürs Konto. */
function Uebungen({ practice, projects }: { practice: Evaluation[]; projects: FreeProject[] }) {
  const list = useMemo(() => [...practice].sort((a, b) => b.at - a.at), [practice]);
  return (
    <section className="card" aria-labelledby="uebungen-h" data-testid="uebungen">
      <h2 id="uebungen-h">Übungen</h2>
      <p className="muted">Hier zeigt dir der Chef, wie deine freien Projekte ankommen. Übungen zählen nicht fürs Punktekonto, nicht für deinen Rang und nicht fürs Showreel.</p>
      <ol className="verlauf" aria-label="Übungen aus freien Projekten">
        {list.map((e) => {
          const p = projects.find((x) => x.id === e.freeProjectId);
          return (
            <li key={e.id} className="verlauf-item">
              <Link to={`/chefbuero/${encodeURIComponent(e.id)}`} className="verlauf-link pressable">
                <span className="verlauf-main">
                  <span className="verlauf-date">{dateOf(e.at)}</span>
                  <span className="verlauf-title">{p ? p.name : 'Freies Projekt'}</span>
                </span>
                <span className="verlauf-uebung">
                  {e.total}/{loadRules().maxScore} – Übung, zählt nicht
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function ProtokollPage({ evaluation, fresh }: { evaluation: Evaluation; fresh: boolean }) {
  const navigate = useNavigate();
  const assignments = useApp((s) => s.state?.assignments ?? []);
  const evaluations = useApp((s) => s.state?.evaluations ?? []);
  const projects = useApp((s) => s.state?.projects ?? []);
  const practice = evaluation.practice === true;
  const assignment = practice ? undefined : assignments.find((a) => a.id === evaluation.assignmentId);
  const free = practice ? projects.find((p) => p.id === evaluation.freeProjectId) : undefined;
  const now = useNow();
  const rules = loadRules();
  const check = assignment ? canCorrect(assignment, evaluations, now, rules) : null;
  const until = assignment ? correctionDeadline(assignment, evaluations, rules) : null;
  return (
    <Shell
      kicker={practice ? 'Chefbüro · Übungsprotokoll' : 'Chefbüro · Abnahmeprotokoll'}
      title={practice ? (free?.name ?? 'Freies Projekt') : assignment ? `Auftrag #${assignment.number}: ${assignment.title}` : 'Abnahmeprotokoll'}
    >
      <p className="back-row">
        <Link to="/chefbuero" className="crumb">
          <ArrowLeft aria-hidden="true" className="crumb-icon" /> Zurück zum Chefbüro
        </Link>
        <span className="muted"> · {dateOf(evaluation.at)}</span>
      </p>
      {practice && (
        <p className="badge-uebung" data-testid="uebung-badge">
          Übung – zählt nicht fürs Konto
        </p>
      )}
      <Protokoll evaluation={evaluation} assignment={assignment} fresh={fresh} />
      {assignment && check && (
        <div className="actions nach">
          {check.ok ? (
            <>
              <button type="button" className="btn btn-primary pressable" onClick={() => navigate('/', { state: { assignmentId: assignment.id } })}>
                Nachbessern
              </button>
              {until !== null && <span className="muted">Noch bis {formatDeadline(until)} möglich, einmal, höchstens {rules.correction.maxScore} Punkte.</span>}
            </>
          ) : (
            <p className="muted">{correctionBlockedText(check.reason, rules)}</p>
          )}
        </div>
      )}
    </Shell>
  );
}

/** Chefbüro (`/chefbuero`) und Abnahmeprotokoll (`/chefbuero/:evaluationId`). */
export function ChefbueroView({ lead }: { lead: string }) {
  const { evaluationId } = useParams();
  const fresh = (useLocation().state as { fresh?: boolean } | null)?.fresh === true;
  const ready = useApp((s) => s.ready);
  const evaluations = useApp((s) => s.state?.evaluations);
  const assignments = useApp((s) => s.state?.assignments);
  const showreel = useApp((s) => s.state?.showreel);
  const projects = useApp((s) => s.state?.projects);

  if (!ready) return <Shell kicker="Chefbüro" title="Chefbüro" lead="Wird geladen …"><span /></Shell>;
  const all = evaluations ?? [];
  const counted = countedEvaluations(all);
  const practice = all.filter((e) => e.practice);
  if (evaluationId) {
    const e = all.find((x) => x.id === decodeURIComponent(evaluationId));
    if (!e) {
      return (
        <Shell kicker="Chefbüro" title="Protokoll nicht gefunden" lead="Dieses Abnahmeprotokoll gibt es nicht (mehr).">
          <p className="back-row">
            <Link to="/chefbuero" className="btn">
              Zurück zum Chefbüro
            </Link>
          </p>
        </Shell>
      );
    }
    return <ProtokollPage evaluation={e} fresh={fresh} />;
  }
  return (
    <Shell kicker="Chefbüro" title="Chefbüro" lead={lead}>
      {counted.length === 0 ? (
        <Empty />
      ) : (
        <>
          <Konto evaluations={counted} assignments={assignments ?? []} />
          <Stage id="chef-verstehen" title="Verstehen" defaultOpen>
            <h3 className="stage-sub">Verlauf der letzten 10 Abgaben</h3>
            <Verlauf evaluations={counted} assignments={assignments ?? []} />
          </Stage>
          <Stage id="chef-profis" title="Für Profis">
            <h3 className="stage-sub">Showreel-Merkliste</h3>
            <Showreel evaluations={counted} assignments={assignments ?? []} marked={showreel ?? []} />
          </Stage>
        </>
      )}
      {practice.length > 0 && <Uebungen practice={practice} projects={projects ?? []} />}
    </Shell>
  );
}
