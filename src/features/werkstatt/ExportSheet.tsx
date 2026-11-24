import { useMemo, useState } from 'react';
import { getBackend } from '../../backend';
import type { Assignment, Deliverable, VideoSpec } from '../../domain/assignments/types';
import { canCorrect } from '../../domain/chef/correction';
import { loadRules } from '../../domain/chef/rules';
import { EXPORT_PRESETS, defaultPresetFor } from '../../domain/render/presets';
import type { ExportPresetId } from '../../domain/timeline/types';
import { useApp } from '../../state/appStore';
import { useNow } from '../../state/useNow';
import { defaultEncoder } from '../../state/exporter';
import { exportRows } from '../../state/exportRun';
import { projectSetting, useProject } from '../../state/projectStore';
import { LIMITER_LABEL } from '../../domain/chef/rules/technik';
import { latestExport } from '../../state/submission';
import { Sheet } from '../../shell/Sheet';
import './exportSheet.css';

/** Voreinstellung aus der Vorgabe: das Preset, das in Größe, Codec, Container und Lautheitsziel genau passt. */
export function defaultPreset(spec: VideoSpec): ExportPresetId {
  return defaultPresetFor(spec);
}

type Row = { sequenceId: string; presetId: ExportPresetId };
type Progress = Record<string, number>;

function ExportRow({ d, row, onChange, progress, busy }: { d: Deliverable; row: Row; onChange(r: Row): void; progress: number | undefined; busy: boolean }) {
  const project = useProject((s) => s.project);
  const last = latestExport(project, d.id);
  const sequences = project?.sequences ?? [];
  const hasOwn = sequences.some((s) => s.name === d.label);
  const spec = d.videoSpec!;
  const addSequence = () => {
    const id = useProject.getState().addSequenceFor(d.label, { width: spec.width, height: spec.height, fps: spec.fps });
    if (id) onChange({ ...row, sequenceId: id });
  };
  const idBase = `exp-${d.id}`;
  return (
    <fieldset className="exp-row" disabled={busy}>
      <legend>{d.label}</legend>
      <div className="exp-fields">
        <div className="field">
          <label htmlFor={`${idBase}-seq`}>Sequenz</label>
          <select id={`${idBase}-seq`} value={row.sequenceId} onChange={(e) => onChange({ ...row, sequenceId: e.target.value })}>
            {sequences.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name || 'Sequenz'} · {s.width}×{s.height} · {s.fps} fps
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${idBase}-preset`}>Vorlage (Preset)</label>
          <select id={`${idBase}-preset`} value={row.presetId} onChange={(e) => onChange({ ...row, presetId: e.target.value as ExportPresetId })}>
            {EXPORT_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {row.sequenceId !== project?.activeSequenceId && sequences.some((x) => x.id === row.sequenceId) && (
        <button type="button" className="btn btn-small exp-add" onClick={() => useProject.getState().refreshSequenceFromActive(row.sequenceId)}>
          Neu aus aktiver Sequenz
        </button>
      )}
      {!hasOwn && (
        <button type="button" className="btn btn-small exp-add" onClick={addSequence}>
          Sequenz für {d.label} anlegen
        </button>
      )}
      <p className="exp-last muted">{last ? `Zuletzt: Version ${last.version} · ${last.fileName}` : 'Noch nicht exportiert.'}</p>
      {progress !== undefined && (
        <div className="exp-progress" role="progressbar" aria-label={`Export ${d.label}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <span style={{ transform: `scaleX(${progress})` }} />
        </div>
      )}
    </fieldset>
  );
}

/** ⌘M: Abgaben des Auftrags exportieren (je Abgabe Sequenz und Preset wählen), danach „Jetzt abgeben“. */
export function ExportSheet({ assignment, onClose, onSubmit }: { assignment: Assignment; onClose(): void; onSubmit(): void }) {
  const project = useProject((s) => s.project);
  const dir = useProject((s) => s.dir);
  const limiter = useProject((s) => projectSetting(s.project, 'safetyLimiter'));
  const evaluations = useApp((s) => s.state?.evaluations);
  const now = useNow();
  const deliverables = useMemo(() => assignment.deliverables.filter((d) => d.kind === 'video' && d.videoSpec), [assignment]);
  const [rows, setRows] = useState<Record<string, Row>>(() => {
    const p = useProject.getState().project;
    const seqs = p?.sequences ?? [];
    return Object.fromEntries(
      deliverables.map((d) => [d.id, { sequenceId: (seqs.find((s) => s.name === d.label) ?? seqs.find((s) => s.id === p?.activeSequenceId) ?? seqs[0])?.id ?? '', presetId: defaultPreset(d.videoSpec!) }]),
    );
  });
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress>({});
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const correction = assignment.status === 'evaluated';
  const canSubmit = assignment.status === 'open' || (correction && canCorrect(assignment, evaluations ?? [], now, loadRules()).ok);

  const run = async () => {
    const clock = useApp.getState().clock;
    if (!project || !dir || !clock) return;
    setBusy(true);
    setError(null);
    setDone(false);
    setProgress(Object.fromEntries(deliverables.map((d) => [d.id, 0])));
    try {
      await exportRows(
        assignment,
        deliverables.map((d) => ({ deliverable: d, sequenceId: rows[d.id].sequenceId, presetId: rows[d.id].presetId })),
        {
          backend: getBackend(),
          dir,
          now: () => clock.now(),
          h264Encoder: defaultEncoder(),
          onProgress: (id, v) => setProgress((p) => ({ ...p, [id]: v })),
        },
      );
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const running = Object.entries(progress).filter(([, v]) => v < 1).length > 0 && busy;
  const percent = Math.round((Object.values(progress).reduce((s, v) => s + v, 0) / Math.max(1, deliverables.length)) * 100);

  return (
    <Sheet
      id="export-h"
      title="Exportieren"
      wide
      busy={busy}
      onClose={onClose}
      footer={
        <>
          {canSubmit && done && (
            <button type="button" className="btn btn-primary" data-autofocus onClick={onSubmit}>
              {correction ? 'Jetzt nachbessern' : 'Jetzt abgeben'}
            </button>
          )}
          <button type="button" className={done && canSubmit ? 'btn' : 'btn btn-primary'} data-autofocus={!done || !canSubmit ? true : undefined} disabled={busy || deliverables.length === 0} onClick={() => void run()}>
            {done ? 'Erneut exportieren' : 'Exportieren'}
          </button>
        </>
      }
    >
      {deliverables.length === 0 ? (
        <p className="muted">Dieser Auftrag hat keine Video-Abgabe.</p>
      ) : (
        <p className="exp-lead muted">Wähle für jede Abgabe die Sequenz und die Vorlage. Die Datei landet im Ordner „Export“ des Projekts.</p>
      )}
      {deliverables.map((d) => (
        <ExportRow key={d.id} d={d} row={rows[d.id]} busy={busy} progress={progress[d.id]} onChange={(r) => setRows((cur) => ({ ...cur, [d.id]: r }))} />
      ))}
      {deliverables.length > 0 && (
        <div className="exp-limiter">
          <label className="check">
            <input type="checkbox" checked={limiter} disabled={busy} onChange={(e) => useProject.getState().setProjectSetting('safetyLimiter', e.target.checked)} />
            <span>{LIMITER_LABEL}</span>
          </label>
          <p className="exp-hint muted">Fängt kurze Spitzen ab, damit der Ton nicht übersteuert. Die Lautheit (LUFS) stellst du weiter selbst mit dem Pegel ein.</p>
        </div>
      )}
      <div className="exp-status" role="status">
        {busy && running && <span>Exportiere … {percent} %</span>}
        {busy && !running && <span>Schreibe Datei …</span>}
        {done && !busy && <span className="exp-done">Export fertig.</span>}
      </div>
      {error && (
        <p className="ws-warn" role="alert">
          Export fehlgeschlagen: {error}
        </p>
      )}
    </Sheet>
  );
}
