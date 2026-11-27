import { Pencil, Plus } from 'lucide-react';
import { useMemo, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { PROJECT_FORMATS, PROJECT_NAME_MAX, checkProjectName, formatLabel, type FreeProject } from '../../domain/projects';
import { useApp } from '../../state/appStore';
import { useNow } from '../../state/useNow';
import { Sheet } from '../../shell/Sheet';
import { formatDeadline } from '../auftraege/format';
import { StatusBadge } from '../auftraege/StatusBadge';
import { useStatusOf } from '../auftraege/useStatus';
import { openedText, projectEntries, type ProjectEntry } from './projectList';
import '../auftraege/auftraege.css';
import './projekte.css';
import './workspace.css';

/** Enter in einem Eingabefeld (auch Optionsfeld) schickt das Formular ab – ohne `requestSubmit` (fehlt in Safari 15). */
function enterSubmits(submit: () => void) {
  return (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    if ((e.target as HTMLElement).tagName !== 'INPUT') return;
    e.preventDefault();
    submit();
  };
}

function NameField({ id, value, error, onChange }: { id: string; value: string; error: string | null; onChange(v: string): void }) {
  return (
    <div className="field">
      <label htmlFor={id}>Name</label>
      <input
        id={id}
        type="text"
        data-autofocus
        autoComplete="off"
        maxLength={PROJECT_NAME_MAX}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && (
        <p id={`${id}-err`} className="ws-warn" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** „Neues Projekt“: Name und Format; Enter legt an, Esc bricht ab. */
function NewProjectSheet({ onClose, onCreated }: { onClose(): void; onCreated(p: FreeProject): void }) {
  const create = useApp((s) => s.createProject);
  const [name, setName] = useState('');
  const [formatId, setFormatId] = useState(PROJECT_FORMATS[0].id);
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    const check = checkProjectName(name);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    const format = (PROJECT_FORMATS.find((f) => f.id === formatId) ?? PROJECT_FORMATS[0]).format;
    const p = create(check.name, format);
    if (p) onCreated(p);
  };
  return (
    <Sheet
      id="neu-h"
      title="Neues Projekt"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button type="submit" form="neu-form" className="btn btn-primary">
            Anlegen
          </button>
        </>
      }
    >
      <form
        id="neu-form"
        noValidate
        onKeyDown={enterSubmits(submit)}
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          submit();
        }}
      >
        <NameField
          id="neu-name"
          value={name}
          error={error}
          onChange={(v) => {
            setName(v);
            if (error) setError(null);
          }}
        />
        <fieldset className="proj-formats">
          <legend>Format</legend>
          {PROJECT_FORMATS.map((f) => (
            <label key={f.id} className="proj-format">
              <input type="radio" name="neu-format" value={f.id} checked={formatId === f.id} onChange={() => setFormatId(f.id)} />
              <span>{f.label}</span>
            </label>
          ))}
        </fieldset>
      </form>
    </Sheet>
  );
}

/** Anzeigenamen eines freien Projekts ändern (der Ordner bleibt gleich). */
function RenameSheet({ project, onClose }: { project: FreeProject; onClose(): void }) {
  const rename = useApp((s) => s.renameProject);
  const [name, setName] = useState(project.name);
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    const check = checkProjectName(name);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    if (rename(project.id, check.name)) onClose();
  };
  return (
    <Sheet
      id="umbenennen-h"
      title="Projekt umbenennen"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button type="submit" form="umbenennen-form" className="btn btn-primary">
            Umbenennen
          </button>
        </>
      }
    >
      <form
        id="umbenennen-form"
        noValidate
        onKeyDown={enterSubmits(submit)}
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          submit();
        }}
      >
        <NameField
          id="umbenennen-name"
          value={name}
          error={error}
          onChange={(v) => {
            setName(v);
            if (error) setError(null);
          }}
        />
        <p className="muted proj-hint">Der Ordner auf deinem Mac behält seinen Namen.</p>
      </form>
    </Sheet>
  );
}

type StatusOf = ReturnType<typeof useStatusOf>;

function EntryRow({ e, now, statusOf, onOpen, onRename }: { e: ProjectEntry; now: number; statusOf: StatusOf; onOpen(): void; onRename?(): void }) {
  if (e.kind === 'free') {
    const p = e.project;
    return (
      <li className="proj-row">
        <button type="button" className="proj-open pressable" onClick={onOpen}>
          <span className="proj-main">
            <span className="proj-name">{p.name}</span>
            <span className="proj-meta">
              {formatLabel(p.format)} · {openedText(p.openedAt, now)}
            </span>
          </span>
        </button>
        <button type="button" className="icon-btn proj-rename" aria-label={`„${p.name}“ umbenennen`} title="Umbenennen" onClick={onRename}>
          <Pencil aria-hidden="true" />
        </button>
      </li>
    );
  }
  const a = e.assignment;
  const { status, countdown } = statusOf(a);
  return (
    <li className="proj-row">
      <button type="button" className="proj-open pressable" onClick={onOpen}>
        <span className="proj-main">
          <span className="proj-badge">Auftrag #{a.number}</span>
          <span className="proj-name">{a.title}</span>
          <span className="proj-meta">
            {a.client.name}
            {a.status === 'open' && <> · Frist {formatDeadline(a.deadline)}</>}
          </span>
        </span>
        <span className="proj-side">
          <StatusBadge status={status} />
          {countdown && <span className={`countdown${countdown.late ? ' is-late' : ''}`}>{countdown.text}</span>}
        </span>
      </button>
      {/* Platz des Umbenennen-Knopfs freier Projekte: alle Zeilen enden bündig. */}
      <span className="proj-rename-slot" aria-hidden="true" />
    </li>
  );
}

/** Projektübersicht `/projekte`: alle freien Projekte und Auftragsprojekte, „Neues Projekt“. Immer dunkel wie die Werkstatt. */
export function Projekte() {
  const navigate = useNavigate();
  const state = useApp((s) => s.state);
  const ready = useApp((s) => s.ready);
  const now = useNow();
  const statusOf = useStatusOf();
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<FreeProject | null>(null);
  const entries = useMemo(() => (state ? projectEntries(state) : []), [state]);

  const open = (e: ProjectEntry) =>
    navigate('/', { state: e.kind === 'free' ? { projectId: e.project.id } : { assignmentId: e.assignment.id } });
  const newButton = (
    <button type="button" className="btn btn-primary pressable" onClick={() => setCreating(true)}>
      <Plus aria-hidden="true" /> Neues Projekt
    </button>
  );

  return (
    <main className="main werkstatt">
      <div className="werkstatt-page proj-page">
        <p className="page-kicker">Werkstatt</p>
        <div className="proj-head">
          <div>
            <h1>Projekte</h1>
            <p className="page-lead">Schneide, was du willst – eigene Projekte gehen immer. Aufträge kommen einfach dazu.</p>
          </div>
          {ready && entries.length > 0 && newButton}
        </div>

        {!ready ? (
          <p className="muted proj-loading">Wird geladen …</p>
        ) : entries.length === 0 ? (
          <section className="proj-empty" aria-labelledby="proj-empty-h">
            <h2 id="proj-empty-h">Noch keine Projekte</h2>
            <p className="muted">Leg dein erstes Projekt an: Clips rein, schneiden, ausprobieren. Ganz ohne Auftrag und ohne Frist.</p>
            {newButton}
          </section>
        ) : (
          <section aria-labelledby="proj-list-h">
            <h2 id="proj-list-h" className="proj-list-h">
              Zuletzt geöffnet
            </h2>
            <ul className="proj-list" role="list">
              {entries.map((e) => (
                <EntryRow
                  key={e.kind === 'free' ? e.project.id : e.assignment.id}
                  e={e}
                  now={now}
                  statusOf={statusOf}
                  onOpen={() => open(e)}
                  onRename={e.kind === 'free' ? () => setRenaming(e.project) : undefined}
                />
              ))}
            </ul>
          </section>
        )}
      </div>
      {creating && (
        <NewProjectSheet
          onClose={() => setCreating(false)}
          onCreated={(p) => {
            setCreating(false);
            navigate('/', { state: { projectId: p.id } });
          }}
        />
      )}
      {renaming && <RenameSheet project={renaming} onClose={() => setRenaming(null)} />}
    </main>
  );
}
