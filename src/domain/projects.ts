import { freeProjectFolder } from './assignments/naming';
import { uuid } from './uuid';

/** Bildformat eines freien Projekts (= Format der ersten Sequenz). */
export type ProjectFormat = { width: number; height: number; fps: number };

/** Eigenes Projekt ohne Auftrag (Spec Phase 1.1 §1). */
export type FreeProject = {
  /** `p-<uuid>` */
  id: string;
  name: string;
  createdAt: number;
  openedAt: number;
  format: ProjectFormat;
  /**
   * Ordner unter dem Projekt-Stamm, beim Anlegen festgelegt: Umbenennen ändert nur den Anzeigenamen.
   * Fehlt er (ältere Einträge), gilt `freeProjectFolder(p)`.
   */
  folder?: string;
};

/** Zuletzt geöffnetes Projekt (Start der Werkstatt). */
export type OpenedRef = { kind: 'free' | 'assignment'; id: string };

export type FormatChoice = { id: string; label: string; format: ProjectFormat };

/** Format-Vorlagen für „Neues Projekt“; die erste ist die Voreinstellung. */
export const PROJECT_FORMATS: readonly FormatChoice[] = [
  { id: 'hd25', label: '16:9 · 1920×1080 · 25p', format: { width: 1920, height: 1080, fps: 25 } },
  { id: 'hd30', label: '16:9 · 1920×1080 · 30p', format: { width: 1920, height: 1080, fps: 30 } },
  { id: 'hoch30', label: '9:16 · 1080×1920 · 30p', format: { width: 1080, height: 1920, fps: 30 } },
  { id: 'quadrat30', label: '1:1 · 1080×1080 · 30p', format: { width: 1080, height: 1080, fps: 30 } },
  { id: 'uhd25', label: '4K · 3840×2160 · 25p', format: { width: 3840, height: 2160, fps: 25 } },
];

export const PROJECT_NAME_MAX = 60;

/** „16:9 · 1920×1080 · 25p“; unbekannte Formate als „W×H · fps p“. */
export function formatLabel(f: ProjectFormat): string {
  const known = PROJECT_FORMATS.find((c) => c.format.width === f.width && c.format.height === f.height && c.format.fps === f.fps);
  return known ? known.label : `${f.width}×${f.height} · ${f.fps}p`;
}

/** Name prüfen: getrimmt, 1–60 Zeichen. Gibt den bereinigten Namen oder einen Fehlertext zurück. */
export function checkProjectName(raw: string): { ok: true; name: string } | { ok: false; error: string } {
  const name = raw.trim();
  if (name === '') return { ok: false, error: 'Gib deinem Projekt einen Namen.' };
  if (name.length > PROJECT_NAME_MAX) return { ok: false, error: `Höchstens ${PROJECT_NAME_MAX} Zeichen.` };
  return { ok: true, name };
}

export function newFreeProject(name: string, format: ProjectFormat, now: number, id = `p-${uuid()}`): FreeProject {
  const base = { id, name, createdAt: now, openedAt: now, format: { ...format } };
  return { ...base, folder: freeProjectFolder(base) };
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/**
 * Gespeicherte Liste bereinigen: fehlt sie (ältere Stände), gibt es keine freien Projekte; Einträge ohne
 * ID, Namen oder gültiges Format fallen weg, fehlende Zeiten werden aufgefüllt.
 */
export function freeProjectsOf(raw: unknown): FreeProject[] {
  if (!Array.isArray(raw)) return [];
  const out: FreeProject[] = [];
  for (const x of raw as Partial<FreeProject>[]) {
    if (!x || typeof x.id !== 'string' || x.id === '' || typeof x.name !== 'string') continue;
    const f = x.format;
    if (!f || !isNum(f.width) || !isNum(f.height) || !isNum(f.fps)) continue;
    const createdAt = typeof x.createdAt === 'number' ? x.createdAt : 0;
    out.push({ ...x, id: x.id, name: x.name, createdAt, openedAt: typeof x.openedAt === 'number' ? x.openedAt : createdAt, format: f } as FreeProject);
  }
  return out;
}

/** Ordner des freien Projekts (gespeichert, sonst aus Name und ID). */
export function folderOf(p: FreeProject): string {
  return p.folder && p.folder.trim() !== '' ? p.folder : freeProjectFolder(p);
}
