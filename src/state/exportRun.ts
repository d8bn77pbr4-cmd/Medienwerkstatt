import { freeFileName } from '../domain/assignments/naming';
import type { Assignment, Deliverable } from '../domain/assignments/types';
import type { ExportPresetId, ExportRecord } from '../domain/timeline/types';
import { exportDeliverable, type ExportDeps } from './exporter';
import { useProject } from './projectStore';
import { FREE_DELIVERABLE_ID } from './submission';

export type ExportRow = { deliverable: Deliverable; sequenceId: string; presetId: ExportPresetId };
export type ExportRunDeps = Omit<ExportDeps, 'assignment' | 'fileName' | 'onProgress'> & { onProgress?: (deliverableId: string, p: number) => void };

/**
 * Exportiert die Zeilen nacheinander und hängt jeden fertigen Eintrag an das offene Projekt (und sichert es).
 * Schlägt ein Export fehl, wird nichts angehängt; bereits fertige Zeilen davor bleiben erhalten.
 */
export async function exportRows(assignment: Assignment, rows: ExportRow[], deps: ExportRunDeps): Promise<ExportRecord[]> {
  const out: ExportRecord[] = [];
  for (const row of rows) {
    const current = useProject.getState().project;
    const seq = current?.sequences.find((s) => s.id === row.sequenceId);
    if (!current || !seq) throw new Error(`Für „${row.deliverable.label}“ ist keine Sequenz gewählt.`);
    const rec = await exportDeliverable(current, seq, row.deliverable, row.presetId, {
      ...deps,
      assignment,
      onProgress: (p) => deps.onProgress?.(row.deliverable.id, p),
    });
    await useProject.getState().recordExport(rec);
    out.push(rec);
  }
  return out;
}

export { FREE_DELIVERABLE_ID };

/**
 * Freies Projekt exportieren: dieselbe Pipeline wie bei Aufträgen, aber mit einer Abgabe nur im Speicher
 * (`frei`, nie im App-Zustand) und dem Dateinamen `<Name>_v<NN>_<kurze Seite>p<fps>.mp4`. Hängt den Eintrag an
 * das offene Projekt und sichert es.
 */
export async function exportFreeProject(
  name: string,
  row: { sequenceId: string; presetId: ExportPresetId },
  deps: ExportRunDeps,
): Promise<ExportRecord> {
  const deliverable: Deliverable = { id: FREE_DELIVERABLE_ID, kind: 'video', label: name };
  const current = useProject.getState().project;
  const seq = current?.sequences.find((s) => s.id === row.sequenceId);
  if (!current || !seq) throw new Error('Wähle eine Sequenz für den Export.');
  const rec = await exportDeliverable(current, seq, deliverable, row.presetId, {
    ...deps,
    fileName: (version, out) => freeFileName(name, version, out),
    onProgress: (p) => deps.onProgress?.(FREE_DELIVERABLE_ID, p),
  });
  await useProject.getState().recordExport(rec);
  return rec;
}
