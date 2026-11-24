import { create } from 'zustand';
import { getBackend } from '../backend';
import type { Backend } from '../backend/Backend';
import type { Assignment, ShotSize } from '../domain/assignments/types';
import { History } from '../domain/timeline/history';
import { newSequence, withFormat } from '../domain/timeline/sequence';
import type { ExportRecord, MediaItem, Project, Sequence } from '../domain/timeline/types';

export const PROJECT_SAVE_DEBOUNCE_MS = 2000;
export const SWITCH_ERROR = 'Wechsel nicht möglich – Projekt konnte nicht gespeichert werden';

export type ProjectStatus = 'idle' | 'loading' | 'ready' | 'noVideo' | 'error';
export type SeqOp = (seq: Sequence, media: MediaItem[]) => Sequence;

export interface ProjectStore {
  status: ProjectStatus;
  assignment: Assignment | null;
  dir: string | null;
  project: Project | null;
  /** Aktive Sequenz (= aktueller Stand des Verlaufs). */
  seq: Sequence | null;
  canUndo: boolean;
  canRedo: boolean;
  /** Letztes Speichern ist fehlgeschlagen (neuer Versuch folgt). */
  saveError: boolean;
  loadError: string | null;
  restoredFromBackup: boolean;
  /** Proxy-Fortschritt 0–1 je Medium, solange er läuft. */
  proxyProgress: Record<string, number>;
  importError: string | null;
  /** Wechsel zu einem anderen Auftrag abgelehnt, weil der offene Stand nicht gesichert werden konnte. */
  switchError: string | null;
  /**
   * Öffnet das Projekt des Auftrags (legt es bei Bedarf an). Ungesicherte Änderungen eines anderen
   * offenen Projekts werden vorher gesichert; schlägt das fehl, bleibt das alte Projekt offen,
   * `switchError` ist gesetzt und das Ergebnis ist `false`.
   */
  open(a: Assignment, backend?: Backend): Promise<boolean>;
  import(paths: string[]): Promise<MediaItem[]>;
  setShotSize(mediaId: string, s: ShotSize | null): void;
  /** Export-Eintrag anhängen und das Projekt sofort sichern. */
  recordExport(rec: ExportRecord): Promise<void>;
  /** Wechselt die aktive Sequenz (nicht rückgängig zu machen; der Verlauf gilt projektweit). */
  switchSequence(id: string): void;
  /** Ersetzt Clips, Blenden, Marker und Bereich der Sequenz `id` durch eine Kopie der aktiven (Format, Name, ID bleiben). */
  refreshSequenceFromActive(id: string): boolean;
  /** Kopie der aktiven Sequenz mit Format und Namen einer Abgabe (z. B. zweites Format); gibt deren ID zurück. */
  addSequenceFor(name: string, format: { width: number; height: number; fps: number }): string | null;
  /** Bearbeitung der aktiven Sequenz als Verlaufsschritt; `coalesce` fasst eine Geste (Regler) zu einem Schritt zusammen. */
  apply(op: SeqOp, opts?: { coalesce?: string }): boolean;
  /** Beendet eine zusammengefasste Geste. */
  endGesture(): void;
  undo(): void;
  redo(): void;
  /** Sofort speichern. */
  flush(): Promise<void>;
  dismissRestored(): void;
}

let backend: Backend | null = null;
/** Projektweiter Verlauf: Schnappschüsse aller Sequenzen (die aktive Sequenz wählt `activeSequenceId`, nicht der Verlauf). */
let history: History<Sequence[]> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let dirty = false;
let gesture: string | null = null;
let inFlight: { id: string; promise: Promise<boolean> } | null = null;
/** Zählt Öffnungen hoch: verspätete Ergebnisse eines älteren `open` werden verworfen. */
let openToken = 0;

function cancelTimer() {
  if (timer !== null) clearTimeout(timer);
  timer = null;
}

/** Mindestform eines geladenen Projekts. */
function isProject(v: unknown): v is Project {
  const p = v as Project | null;
  return !!p && p.version === 1 && Array.isArray(p.media) && Array.isArray(p.sequences) && p.sequences.length > 0;
}

function freshProject(a: Assignment): Project | null {
  const d = a.deliverables.find((x) => x.kind === 'video' && x.videoSpec);
  if (!d?.videoSpec) return null;
  const seq = newSequence({ width: d.videoSpec.width, height: d.videoSpec.height, fps: d.videoSpec.fps, name: d.label });
  return { version: 1, assignmentId: a.id, media: [], sequences: [seq], activeSequenceId: seq.id, exports: [] };
}

const activeOf = (p: Project): Sequence => p.sequences.find((s) => s.id === p.activeSequenceId) ?? p.sequences[0];

const EMPTY = {
  status: 'idle' as ProjectStatus,
  assignment: null,
  dir: null,
  project: null,
  seq: null,
  canUndo: false,
  canRedo: false,
  saveError: false,
  loadError: null,
  restoredFromBackup: false,
  proxyProgress: {},
  importError: null,
  switchError: null,
};

export const useProject = create<ProjectStore>()((set, get) => {
  const flush = async (): Promise<void> => {
    cancelTimer();
    const { project, dir } = get();
    if (!dirty || !backend || !project || !dir) return;
    dirty = false;
    try {
      await backend.saveProject(dir, project);
      if (get().saveError) set({ saveError: false });
    } catch {
      // Nichts verlieren: neuer Versuch nach der Entprellzeit.
      dirty = true;
      set({ saveError: true });
      cancelTimer();
      timer = setTimeout(() => void flush(), PROJECT_SAVE_DEBOUNCE_MS);
    }
  };
  const scheduleSave = () => {
    dirty = true;
    cancelTimer();
    timer = setTimeout(() => void flush(), PROJECT_SAVE_DEBOUNCE_MS);
  };
  /** Projekt ändern und Speichern anstoßen. */
  const commitProject = (fn: (p: Project) => Project) => {
    const p = get().project;
    if (!p) return;
    set({ project: fn(p) });
    scheduleSave();
  };
  /** Stand des Verlaufs in Projekt und Store spiegeln. */
  const syncFromHistory = () => {
    const p = get().project;
    if (!history || !p) return;
    const sequences = history.present;
    const seq = sequences.find((s) => s.id === p.activeSequenceId) ?? sequences[0];
    set({
      seq,
      canUndo: history.canUndo,
      canRedo: history.canRedo,
      project: { ...p, sequences, activeSequenceId: seq.id },
    });
    scheduleSave();
  };

  const doOpen = async (a: Assignment, b: Backend, token: number) => {
    cancelTimer();
    dirty = false;
    gesture = null;
    history = null;
    backend = b;
    set({ ...EMPTY, status: 'loading', assignment: a });
    const fresh = freshProject(a);
    if (!fresh) {
      set({ status: 'noVideo' });
      return;
    }
    let dir: string;
    let loaded;
    try {
      dir = await b.projectDir(a);
      loaded = await b.loadProject(dir);
    } catch (e) {
      if (token === openToken) set({ status: 'error', loadError: e instanceof Error ? e.message : String(e) });
      return;
    }
    if (token !== openToken) return;
    let project: Project;
    let created = false;
    if (loaded.value === null) {
      project = fresh;
      created = true;
    } else if (isProject(loaded.value)) {
      project = loaded.value;
    } else {
      // Unlesbares Projekt nicht überschreiben.
      set({ status: 'error', loadError: 'Die Projektdatei ist beschädigt.' });
      return;
    }
    const seq = activeOf(project);
    history = new History(project.sequences);
    set({ status: 'ready', dir, project, seq, canUndo: false, canRedo: false, restoredFromBackup: loaded.restoredFromBackup });
    if (created) {
      // Das neue Projekt muss ein sofortiges Neuladen überleben.
      dirty = true;
      await flush();
    }
  };

  return {
    ...EMPTY,

    open(a, b = getBackend()) {
      const cur = get();
      if (cur.assignment?.id === a.id && cur.status === 'ready' && backend === b) {
        if (cur.switchError) set({ switchError: null });
        return Promise.resolve(true);
      }
      if (inFlight && inFlight.id === a.id) return inFlight.promise;
      const token = ++openToken;
      const run = async (): Promise<boolean> => {
        // Wechsel des Auftrags: offenen Stand vorher sichern. Gelingt das nicht, nicht wechseln –
        // sonst gingen die Änderungen verloren (Zeitgeber, „dirty“ und Hinweis bleiben).
        if (dirty) {
          await flush();
          if (dirty) {
            if (token === openToken) set({ switchError: SWITCH_ERROR });
            return false;
          }
        }
        await doOpen(a, b, token);
        return token === openToken;
      };
      const promise = run().finally(() => {
        if (inFlight?.promise === promise) inFlight = null;
      });
      inFlight = { id: a.id, promise };
      return promise;
    },

    async import(paths) {
      const { dir, project } = get();
      if (!backend || !dir || !project || paths.length === 0) return [];
      const b = backend;
      let items: MediaItem[];
      try {
        items = await b.importMedia(dir, paths, 'copy');
      } catch (e) {
        set({ importError: e instanceof Error ? e.message : String(e) });
        return [];
      }
      if (get().dir !== dir) return [];
      set({ importError: null });
      commitProject((p) => ({ ...p, media: [...p.media, ...items] }));
      for (const m of items.filter((x) => x.kind === 'video' && !x.proxyPath)) void makeProxy(b, dir, m);
      return items;
    },

    async recordExport(rec) {
      commitProject((p) => ({ ...p, exports: [...p.exports, rec] }));
      await flush();
    },

    addSequenceFor(name, format) {
      const { seq } = get();
      if (!history || !seq) return null;
      const copy: Sequence = { ...withFormat(seq, format), id: crypto.randomUUID(), name };
      gesture = null;
      history.push([...history.present, copy]);
      syncFromHistory();
      return copy.id;
    },

    switchSequence(id) {
      const p = get().project;
      const target = p?.sequences.find((s) => s.id === id);
      if (!p || !target || p.activeSequenceId === id) return;
      gesture = null;
      set({ seq: target, project: { ...p, activeSequenceId: id } });
      scheduleSave();
    },

    refreshSequenceFromActive(id) {
      const { seq } = get();
      const target = history?.present.find((s) => s.id === id);
      if (!history || !seq || !target || seq.id === id) return false;
      // Inhalt der aktiven Sequenz in Format und Namen der Zielsequenz (Bildrate wird umgerechnet).
      const fresh: Sequence = { ...withFormat(seq, { width: target.width, height: target.height, fps: target.fps }), id: target.id, name: target.name };
      gesture = null;
      history.push(history.present.map((s) => (s.id === id ? fresh : s)));
      syncFromHistory();
      return true;
    },

    setShotSize(mediaId, s) {
      commitProject((p) => ({ ...p, media: p.media.map((m) => (m.id === mediaId ? { ...m, shotSize: s } : m)) }));
    },

    apply(op, opts = {}) {
      const p = get().project;
      if (!history || !p) return false;
      const cur = get().seq;
      if (!cur) return false;
      const next = op(cur, p.media);
      if (next === cur) return false;
      const all = history.present.map((s) => (s.id === cur.id ? next : s));
      if (opts.coalesce && gesture === opts.coalesce && history.canUndo) history.replace(all);
      else history.push(all);
      gesture = opts.coalesce ?? null;
      syncFromHistory();
      return true;
    },

    endGesture() {
      gesture = null;
    },

    undo() {
      if (!history?.canUndo) return;
      gesture = null;
      history.undo();
      syncFromHistory();
    },

    redo() {
      if (!history?.canRedo) return;
      gesture = null;
      history.redo();
      syncFromHistory();
    },

    flush,

    dismissRestored() {
      set({ restoredFromBackup: false });
    },
  };

  async function makeProxy(b: Backend, dir: string, m: MediaItem) {
    const progress = (v: number) => {
      if (get().dir !== dir) return;
      set({ proxyProgress: { ...get().proxyProgress, [m.id]: Math.max(0, Math.min(1, v)) } });
    };
    progress(0);
    try {
      const proxy = await b.createProxy(dir, m, progress);
      if (get().dir === dir && proxy && proxy !== m.path) {
        commitProject((p) => ({ ...p, media: p.media.map((x) => (x.id === m.id ? { ...x, proxyPath: proxy } : x)) }));
      }
    } catch {
      // Ohne Proxy spielt die Vorschau das Original.
    } finally {
      if (get().dir === dir) {
        const rest = { ...get().proxyProgress };
        delete rest[m.id];
        set({ proxyProgress: rest });
      }
    }
  }
});

/** Nur für Tests: Store, Verlauf und Zeitgeber zurücksetzen. */
export function resetProjectForTests(): void {
  cancelTimer();
  dirty = false;
  backend = null;
  history = null;
  gesture = null;
  inFlight = null;
  openToken++;
  useProject.setState({ ...EMPTY });
}
