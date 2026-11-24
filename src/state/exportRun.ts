import type { Assignment, Deliverable } from '../domain/assignments/types';
import type { ExportPresetId, ExportRecord } from '../domain/timeline/types';
import { exportDeliverable, type ExportDeps } from './exporter';
import { useProject } from './projectStore';

export type ExportRow = { deliverable: Deliverable; sequenceId: string; presetId: ExportPresetId };
export type ExportRunDeps = Omit<ExportDeps, 'assignment' | 'onProgress'> & { onProgress?: (deliverableId: string, p: number) => void };

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
