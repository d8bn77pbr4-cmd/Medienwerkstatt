import { create } from 'zustand';
import { getBackend } from '../backend';
import type { Backend } from '../backend/Backend';
import type { VersionInfo } from '../backend/types';
import { projectFolderFor } from '../domain/assignments/naming';
import type { Assignment, ShotSize } from '../domain/assignments/types';
import { folderOf, type FreeProject, type OpenedRef } from '../domain/projects';
import { History } from '../domain/timeline/history';
import { newSequence, withFormat } from '../domain/timeline/sequence';
import { projectSetting } from '../domain/timeline/settings';
import type { ExportRecord, MediaItem, Project, ProjectSettings, Sequence } from '../domain/timeline/types';
import { uuid } from '../domain/uuid';

export const PROJECT_SAVE_DEBOUNCE_MS = 2000;
/** Höchstens so viele Proxies werden gleichzeitig erstellt (ffmpeg ist schwer; der Rest wartet). */
export const PROXY_CONCURRENCY = 2;


export { projectSetting };
export const SWITCH_ERROR = 'Wechsel nicht möglich – Projekt konnte nicht gespeichert werden';

export type ProjectStatus = 'idle' | 'loading' | 'ready' | 'noVideo' | 'error';
export type SeqOp = (seq: Sequence, media: MediaItem[]) => Sequence;

/** Was die Werkstatt öffnet: das Projekt eines Auftrags oder ein freies Projekt. */
export type OpenTarget = { kind: 'assignment'; assignment: Assignment } | { kind: 'free'; project: FreeProject };

/** Kurzform für `lastOpened` und Vergleiche. */
export function refOf(t: OpenTarget): OpenedRef {
  return t.kind === 'assignment' ? { kind: 'assignment', id: t.assignment.id } : { kind: 'free', id: t.project.id };
}

/** Eindeutiger Schlüssel eines Ziels (`assignment:A01`, `free:p-…`). */
export function targetKey(t: OpenTarget | OpenedRef): string {
  const r = 'id' in t ? t : refOf(t);
  return `${r.kind}:${r.id}`;
}

/** Schlüssel des offenen Ziels im Store (oder `null`). */
export function currentKey(s: Pick<ProjectStore, 'target'>): string | null {
  return s.target ? targetKey(s.target) : null;
}

/** Projektordner des Ziels (unter dem Projekt-Stamm). */
export function targetFolder(t: OpenTarget): string {
  return t.kind === 'assignment' ? projectFolderFor(t.assignment) : folderOf(t.project);
}

export interface ProjectStore {
  status: ProjectStatus;
  /** Offenes (bzw. gerade öffnendes) Ziel. */
  target: OpenTarget | null;
  dir: string | null;
  project: Project | null;
  /** Aktive Sequenz (= aktueller Stand des Verlaufs). */
  seq: Sequence | null;
  canUndo: boolean;
  canRedo: boolean;
  /** Letztes Speichern ist fehlgeschlagen (neuer Versuch folgt). */
  saveError: boolean;
  /** Es gibt Änderungen, die noch nicht auf der Platte sind (Entprellzeit läuft oder Schreiben läuft). */
  savePending: boolean;
  /** Zeitpunkt (ms) des letzten erfolgreichen Speicherns in dieser Sitzung des Projekts. */
  savedAt: number | null;
  /** Die letzte Sicherungsversion ließ sich nicht anlegen (neuer Versuch im nächsten Takt). */
  versionError: boolean;
  /** Zählt jede Änderung am Projekt hoch (nie zurückgesetzt, auch nicht beim Öffnen); der Sicherungstakt vergleicht damit. */
  rev: number;
  /** Der Stand `rev`, der zuletzt als Sicherungsversion angelegt wurde (oder beim Öffnen vorlag). `rev !== versionedRev` = seither geändert. */
  versionedRev: number;
  loadError: string | null;
  restoredFromBackup: boolean;
  /** Proxy-Fortschritt 0–1 je Medium, solange er läuft. */
  proxyProgress: Record<string, number>;
  /** Medien, deren Proxy in der Warteschlange wartet (Reihenfolge der Abarbeitung). */
  proxyQueue: string[];
  importError: string | null;
  /** Wechsel zu einem anderen Projekt abgelehnt, weil der offene Stand nicht gesichert werden konnte. */
  switchError: string | null;
  /**
   * Öffnet das Projekt des Auftrags bzw. das freie Projekt (legt es bei Bedarf an). Ungesicherte Änderungen
   * eines anderen offenen Projekts werden vorher gesichert; schlägt das fehl, bleibt das alte Projekt offen,
   * `switchError` ist gesetzt und das Ergebnis ist `false`.
   */
  open(target: OpenTarget, backend?: Backend): Promise<boolean>;
  import(paths: string[]): Promise<MediaItem[]>;
  setShotSize(mediaId: string, s: ShotSize | null): void;
  /** Projekt-Einstellung setzen (wird mit dem Projekt gespeichert). */
  setProjectSetting<K extends keyof ProjectSettings>(key: K, value: boolean): void;
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
  /**
   * Sichert das offene Projekt (erst `flush`) und legt danach die Sicherungsversion `name` an. `false`, wenn kein Projekt
   * offen ist oder eins von beiden fehlschlägt (`saveError` bzw. `versionError` ist dann gesetzt; der Aufrufer versucht es später noch einmal).
   */
  saveVersion(name: string): Promise<boolean>;
  /** Versionen des offenen Projekts, neueste zuerst. */
  listVersions(): Promise<VersionInfo[]>;
  /**
   * Holt die Version `name` zurück: sichert zuerst den aktuellen Stand als Version `backupName`, ersetzt dann das offene Projekt
   * (Verlauf zurückgesetzt) und speichert es. Wirft einen Error mit deutscher Meldung; dann bleibt der aktuelle Stand unverändert.
   */
  restoreVersion(name: string, backupName: string): Promise<void>;
  dismissRestored(): void;
}

let backend: Backend | null = null;
/** Projektweiter Verlauf: Schnappschüsse aller Sequenzen (die aktive Sequenz wählt `activeSequenceId`, nicht der Verlauf). */
let history: History<Sequence[]> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let dirty = false;
/** Das laufende Schreiben des Projekts (für `persisted`). */
let saving: Promise<unknown> | null = null;
let gesture: string | null = null;
let inFlight: { key: string; promise: Promise<boolean> } | null = null;
/** Zählt Öffnungen hoch: verspätete Ergebnisse eines älteren `open` werden verworfen. */
let openToken = 0;
/** Proxy-Warteschlange des offenen Projekts. */
let proxyJobs: { dir: string; m: MediaItem }[] = [];
let proxyRunning = 0;
/** Zählt Rücksetzungen hoch (nur Tests): Abschlüsse älterer Läufe zählen dann nicht mehr. */
let proxyGen = 0;

function cancelTimer() {
  if (timer !== null) clearTimeout(timer);
  timer = null;
}

/** Mindestform eines geladenen Projekts. */
function isProject(v: unknown): v is Project {
  const p = v as Project | null;
  return !!p && p.version === 1 && Array.isArray(p.media) && Array.isArray(p.sequences) && p.sequences.length > 0;
}

/** Neues Projekt: Aufträge nach der ersten Video-Abgabe (ohne: `null`), freie Projekte im gewählten Format. */
function freshProject(t: OpenTarget): Project | null {
  if (t.kind === 'free') {
    const { format, name, id } = t.project;
    const seq = newSequence({ width: format.width, height: format.height, fps: format.fps, name });
    return { version: 1, freeProjectId: id, media: [], sequences: [seq], activeSequenceId: seq.id, exports: [] };
  }
  const a = t.assignment;
  const d = a.deliverables.find((x) => x.kind === 'video' && x.videoSpec);
  if (!d?.videoSpec) return null;
  const seq = newSequence({ width: d.videoSpec.width, height: d.videoSpec.height, fps: d.videoSpec.fps, name: d.label });
  return { version: 1, assignmentId: a.id, media: [], sequences: [seq], activeSequenceId: seq.id, exports: [] };
}

const activeOf = (p: Project): Sequence => p.sequences.find((s) => s.id === p.activeSequenceId) ?? p.sequences[0];

const EMPTY = {
  status: 'idle' as ProjectStatus,
  target: null,
  dir: null,
  project: null,
  seq: null,
  canUndo: false,
  canRedo: false,
  saveError: false,
  savePending: false,
  savedAt: null as number | null,
  versionError: false,
  loadError: null,
  restoredFromBackup: false,
  proxyProgress: {},
  proxyQueue: [] as string[],
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
      const writing = backend.saveProject(dir, project);
      saving = writing;
      await writing;
      set({ savedAt: Date.now(), savePending: dirty });
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
    set({ rev: get().rev + 1, savePending: true });
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

  const doOpen = async (t: OpenTarget, b: Backend, token: number) => {
    cancelTimer();
    dirty = false;
    gesture = null;
    history = null;
    backend = b;
    proxyJobs = [];
    set({ ...EMPTY, status: 'loading', target: t, versionedRev: get().rev });
    const fresh = freshProject(t);
    if (!fresh) {
      set({ status: 'noVideo' });
      return;
    }
    let dir: string;
    let loaded;
    try {
      dir = await b.projectDir(targetFolder(t));
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
    rev: 0,
    versionedRev: 0,

    open(t, b = getBackend()) {
      const cur = get();
      const key = targetKey(t);
      if (currentKey(cur) === key && cur.status === 'ready' && backend === b) {
        if (cur.switchError) set({ switchError: null });
        return Promise.resolve(true);
      }
      if (inFlight && inFlight.key === key) return inFlight.promise;
      const token = ++openToken;
      const run = async (): Promise<boolean> => {
        // Wechsel des Projekts: offenen Stand vorher sichern. Gelingt das nicht, nicht wechseln –
        // sonst gingen die Änderungen verloren (Zeitgeber, „dirty“ und Hinweis bleiben).
        if (dirty) {
          await flush();
          if (dirty) {
            if (token === openToken) set({ switchError: SWITCH_ERROR });
            return false;
          }
        }
        await doOpen(t, b, token);
        return token === openToken;
      };
      const promise = run().finally(() => {
        if (inFlight?.promise === promise) inFlight = null;
      });
      inFlight = { key, promise };
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
      for (const m of items.filter((x) => x.kind === 'video' && !x.proxyPath)) proxyJobs.push({ dir, m });
      set({ proxyQueue: proxyJobs.filter((j) => j.dir === dir).map((j) => j.m.id) });
      pumpProxies(b);
      return items;
    },

    async recordExport(rec) {
      commitProject((p) => ({ ...p, exports: [...p.exports, rec] }));
      await flush();
    },

    addSequenceFor(name, format) {
      const { seq } = get();
      if (!history || !seq) return null;
      const copy: Sequence = { ...withFormat(seq, format), id: uuid(), name };
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

    setProjectSetting(key, value) {
      const p = get().project;
      if (!p || p.settings?.[key] === value) return;
      commitProject((cur) => ({ ...cur, settings: { ...cur.settings, [key]: value } }));
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

    async saveVersion(name) {
      const { dir, project } = get();
      const b = backend;
      if (!b || !dir || !project) return false;
      await flush();
      if (get().dir !== dir || !(await persisted())) return false;
      // Alles bis hier ist auf der Platte; spätere Änderungen zählen als „seither geändert“.
      const rev = get().rev;
      try {
        await b.saveProjectVersion(dir, name);
      } catch {
        set({ versionError: true });
        return false;
      }
      if (get().dir === dir) set({ versionedRev: rev, versionError: false });
      return true;
    },

    async listVersions() {
      const { dir } = get();
      return backend && dir ? backend.listProjectVersions(dir) : [];
    },

    async restoreVersion(name, backupName) {
      const { dir, project } = get();
      const b = backend;
      if (!b || !dir || !project) throw new Error('Es ist kein Projekt offen.');
      const token = openToken;
      const stillHere = () => token === openToken && get().dir === dir;
      // Die gewählte Version zuerst lesen: Trägt die Sicherung des aktuellen Standes denselben Namen, überschreibt sie sie sonst.
      let restored: unknown;
      try {
        restored = await b.restoreProjectVersion(dir, name);
      } catch {
        throw new Error('Diese Version ließ sich nicht lesen. Es wurde nichts verändert.');
      }
      if (!isProject(restored)) throw new Error('Diese Version ist beschädigt. Es wurde nichts verändert.');
      // Dann den aktuellen Stand als Version sichern, damit sich das Zurückholen umkehren lässt.
      if (!(await get().saveVersion(backupName))) throw new Error('Der aktuelle Stand ließ sich nicht sichern. Es wurde nichts verändert.');
      if (!stillHere()) throw new Error('Das Projekt wurde inzwischen gewechselt. Es wurde nichts verändert.');
      gesture = null;
      history = new History(restored.sequences);
      set({ project: restored, seq: activeOf(restored), canUndo: false, canRedo: false });
      scheduleSave();
      await flush();
    },

    dismissRestored() {
      set({ restoredFromBackup: false });
    },
  };

  /** Startet wartende Proxy-Aufträge, bis `PROXY_CONCURRENCY` laufen. */
  function pumpProxies(b: Backend) {
    while (proxyRunning < PROXY_CONCURRENCY && proxyJobs.length > 0) {
      const job = proxyJobs.shift()!;
      if (get().dir === job.dir) set({ proxyQueue: get().proxyQueue.filter((id) => id !== job.m.id) });
      proxyRunning++;
      const gen = proxyGen;
      void makeProxy(b, job.dir, job.m).finally(() => {
        if (gen !== proxyGen) return;
        proxyRunning--;
        pumpProxies(b);
      });
    }
  }

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

/** Wartet auf ein laufendes Schreiben: `true`, wenn danach nichts Ungesichertes bleibt (kein Fehler, nichts Neues). */
async function persisted(): Promise<boolean> {
  try {
    await saving;
  } catch {
    /* der Fehler steht in `saveError` */
  }
  return !dirty && !useProject.getState().saveError;
}

/** Nur für Tests: Store, Verlauf und Zeitgeber zurücksetzen. */
export function resetProjectForTests(): void {
  cancelTimer();
  dirty = false;
  backend = null;
  history = null;
  gesture = null;
  inFlight = null;
  openToken++;
  proxyJobs = [];
  proxyRunning = 0;
  proxyGen++;
  saving = null;
  useProject.setState({ ...EMPTY });
}
