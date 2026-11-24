import { create } from 'zustand';
import type { Backend } from '../backend/Backend';
import { isValidState } from '../backend/schema';
import type { AppState, Assignment } from '../backend/types';
import { AVAILABLE_TYPES, generateAssignment, loadCatalogs } from '../domain/assignments/generator';
import { canAddVacation, tick, type ScheduleState, type Vacation } from '../domain/assignments/schedule';
import { account, type AccountResult } from '../domain/chef/account';
import { canCorrect, type CorrectionRefusal } from '../domain/chef/correction';
import type { Evaluation } from '../domain/chef/types';
import type { ResearchDoc } from '../domain/chef/research';
import { loadRules } from '../domain/chef/rules';
import type { Clock } from '../domain/time';
import { checkProjectName, freeProjectsOf, newFreeProject, type FreeProject, type OpenedRef, type ProjectFormat } from '../domain/projects';
import { prepareFrames, type GeminiPreparation } from './geminiFrames';
import type { GeminiChoice } from './gemini';
import { loadProjectFor } from './projectAccess';
import { runSubmission } from './submission';
import { uuid } from '../domain/uuid';

export const SAVE_DEBOUNCE_MS = 2000;

export type SelfChecks = { hookDone: boolean };
export type { GeminiChoice };
export type CorrectionResult = { ok: true; evaluation: Evaluation } | { ok: false; reason: CorrectionRefusal | 'busy' };

export type InitOptions = {
  /** Vorgegebene Installations-ID (nur Mock-Modus, für deterministische E2E-Tests). */
  installId?: string;
};

export interface AppStore {
  state: AppState | null;
  ready: boolean;
  restoredFromBackup: boolean;
  /** Letzter Speicherversuch ist fehlgeschlagen (neuer Versuch folgt). */
  saveError: boolean;
  /** Laden ist fehlgeschlagen; „Neu starten“ legt einen frischen Zustand an. */
  initError: string | null;
  clock: Clock | null;
  init(backend: Backend, clock: Clock, opts?: InitOptions): Promise<void>;
  /** Fällige Aufträge ausgeben, Fristen prüfen. Jede Minute und beim Fokussieren des Fensters. */
  tickNow(): void;
  saveResearch(assignmentId: string, deliverableId: string, doc: ResearchDoc): void;
  /** Abgabe prüfen, messen und bewerten (Spec §9.1); nur für offene Aufträge. */
  submit(assignmentId: string, selfChecks: SelfChecks, onProgress?: (message: string) => void, gemini?: GeminiChoice): Promise<Evaluation>;
  /**
   * Standbilder für die Gemini-Vorschau. `null`, wenn Gemini nicht aktiv ist (aus, kein Schlüssel oder kein Modell):
   * dann gibt es keine Einwilligungsfrage und keine Anfrage.
   */
  prepareGemini(assignmentId: string): Promise<GeminiPreparation | null>;
  /** Nachbessern (Spec §9.3): einmal, innerhalb von 24 h nach der ersten Bewertung, gedeckelt. */
  correction(assignmentId: string, selfChecks: SelfChecks, onProgress?: (message: string) => void, gemini?: GeminiChoice): Promise<CorrectionResult>;
  /** Bewertung ab `showreelMinScore` in die Showreel-Merkliste legen oder wieder herausnehmen. */
  toggleShowreel(evaluationId: string): void;
  addVacation(v: Vacation): ReturnType<typeof canAddVacation>;
  /** Urlaub mit diesem Beginn entfernen – nur künftige (bereits begonnene bleiben). */
  removeVacation(start: number): void;
  setTheme(theme: AppState['settings']['theme']): void;
  setGeminiEnabled(enabled: boolean): void;
  setGeminiModel(model: string | null): void;
  toggleChecklist(assignmentId: string, itemId: string): void;
  setDevTimeOffset(ms: number): void;
  /** Freies Projekt anlegen (Name wird getrimmt, 1–60 Zeichen); `null` bei ungültigem Namen. Sichert sofort. */
  createProject(name: string, format: ProjectFormat): FreeProject | null;
  /** Anzeigenamen eines freien Projekts ändern (der Ordner bleibt). `false` bei ungültigem Namen. */
  renameProject(id: string, name: string): boolean;
  /** Ein Projekt wurde in der Werkstatt geöffnet: `lastOpened` setzen, bei freien Projekten auch `openedAt`. */
  noteOpened(ref: OpenedRef): void;
  dismissRestoredBanner(): void;
  /** Nach Ladefehler: frischen Zustand mit neuer Installations-ID anlegen. */
  restart(): Promise<void>;
  /** Sofort speichern (Debounce-Timer entfällt). */
  flush(): Promise<void>;
}

export const researchKey = (assignmentId: string, deliverableId: string) => `${assignmentId}/${deliverableId}`;

let backend: Backend | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let dirty = false;
let initInFlight: { backend: Backend; promise: Promise<void> } | null = null;

function cancelTimer() {
  if (timer !== null) clearTimeout(timer);
  timer = null;
}

/** Fehlende Felder älterer Stände auffüllen. */
function normalize(s: AppState): AppState {
  const lastOpened = s.lastOpened && (s.lastOpened.kind === 'free' || s.lastOpened.kind === 'assignment') && typeof s.lastOpened.id === 'string' ? s.lastOpened : undefined;
  const out: AppState = {
    ...s,
    evaluations: s.evaluations ?? [],
    assignments: s.assignments ?? [],
    showreel: s.showreel ?? [],
    checklist: s.checklist ?? {},
    research: s.research ?? {},
    projects: freeProjectsOf(s.projects),
    settings: {
      theme: s.settings?.theme ?? 'auto',
      gemini: { enabled: s.settings?.gemini?.enabled ?? false, model: s.settings?.gemini?.model ?? null },
      devTimeOffsetMs: s.settings?.devTimeOffsetMs ?? 0,
    },
  };
  if (lastOpened) out.lastOpened = lastOpened;
  else delete out.lastOpened;
  return out;
}

function freshState(installId: string, now: number): AppState {
  return normalize({
    version: 1,
    installId,
    createdAt: now,
    schedule: { nextIssueAt: now, nextNumber: 1, vacations: [] },
    assignments: [],
    evaluations: [],
    showreel: [],
    settings: { theme: 'auto', gemini: { enabled: false, model: null }, devTimeOffsetMs: 0 },
    checklist: {},
    research: {},
    projects: [],
  });
}

/** Läuft `tick` auf dem Zustand; gibt dieselbe Referenz zurück, wenn sich nichts ändert. */
function ticked(s: AppState, now: number): AppState {
  const rules = loadRules();
  const catalogs = loadCatalogs();
  const level = account(s.evaluations, s.assignments, rules).level;
  const r = tick(
    s.schedule,
    s.assignments,
    now,
    (number, issuedAt) => generateAssignment(s.installId, number, issuedAt, level, AVAILABLE_TYPES, catalogs, rules),
    rules,
  );
  if (!r.changed) return s;
  return { ...s, schedule: r.schedule, assignments: r.assignments };
}

export const useApp = create<AppStore>()((set, get) => {
  const flush = async (): Promise<void> => {
    cancelTimer();
    const s = get().state;
    if (!dirty || !backend || !s) return;
    dirty = false;
    try {
      await backend.saveState(s);
      if (get().saveError) set({ saveError: false });
    } catch {
      // Änderungen nicht verlieren: Zustand bleibt „unsaved“, neuer Versuch nach der Entprellzeit.
      dirty = true;
      set({ saveError: true });
      cancelTimer();
      timer = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
    }
  };
  const scheduleSave = () => {
    dirty = true;
    cancelTimer();
    timer = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
  };
  /** Zustand ändern und Speichern anstoßen. */
  const commit = (fn: (s: AppState) => AppState) => {
    const cur = get().state;
    if (!cur) return;
    const next = fn(cur);
    if (next === cur) return;
    set({ state: next });
    scheduleSave();
  };

  /** Messen, bewerten, Bewertung + Abgabe speichern, Status „bewertet“. */
  const evaluateAndStore = async (assignmentId: string, selfChecks: SelfChecks, isCorrection: boolean, onProgress?: (m: string) => void, choice?: GeminiChoice): Promise<Evaluation> => {
    const clock = get().clock;
    const s = get().state;
    const a = s?.assignments.find((x) => x.id === assignmentId);
    if (!s || !clock || !backend || !a) throw new Error('Die App ist noch nicht bereit.');
    const { project } = await loadProjectFor(a, backend);
    const research: Record<string, ResearchDoc | null> = {};
    for (const d of a.deliverables) if (d.kind === 'research') research[d.id] = s.research[researchKey(a.id, d.id)] ?? null;
    const submittedAt = clock.now();
    // Gemini läuft nur, wenn es in den Einstellungen eingeschaltet ist; ohne Entscheidung gibt es keine Anfrage.
    const g = s.settings.gemini;
    const gemini = g.enabled && choice && (g.model || !choice.consent) ? { model: g.model ?? '', choice } : undefined;
    // Korrektur: Verspätung/Frühbonus ab der ersten (nicht korrigierenden) Abgabe.
    const firstAt = a.submissions.filter((x) => !x.isCorrection).reduce<number | undefined>((m, x) => (m === undefined || x.at < m ? x.at : m), undefined);
    const lateBasisAt = isCorrection ? firstAt : undefined;
    const evaluation = await runSubmission({ backend, rules: loadRules(), assignment: a, project, research, selfChecks, isCorrection, submittedAt, lateBasisAt, gemini, onProgress });
    commit((cur) => ({
      ...cur,
      evaluations: [...cur.evaluations, evaluation],
      assignments: cur.assignments.map((x) =>
        x.id === a.id ? { ...x, status: 'evaluated' as const, submissions: [...x.submissions, { at: submittedAt, evaluationId: evaluation.id, isCorrection }] } : x,
      ),
    }));
    await flush();
    return evaluation;
  };

  /** Laufende Abgaben je Auftrag (Schutz gegen Doppelklick und parallele Aufrufe). */
  const inFlight = new Map<string, { kind: 'submit' | 'correction'; promise: Promise<unknown> }>();
  const track = <T,>(id: string, kind: 'submit' | 'correction', p: Promise<T>): Promise<T> => {
    const entry = { kind, promise: p };
    inFlight.set(id, entry);
    const clear = () => {
      if (inFlight.get(id) === entry) inFlight.delete(id);
    };
    p.then(clear, clear);
    return p;
  };

  const doInit = async (b: Backend, clock: Clock, opts: InitOptions) => {
    cancelTimer();
    dirty = false;
    backend = b;
    set({ clock });
    set({ initError: null });
    let loaded;
    try {
      loaded = await b.loadState();
    } catch (e) {
      set({ initError: e instanceof Error ? e.message : 'Laden fehlgeschlagen' });
      return;
    }
    let base: AppState;
    let fresh = false;
    if (loaded.value && isValidState(loaded.value)) {
      base = normalize(loaded.value);
    } else {
      fresh = true;
      base = freshState(opts.installId ?? uuid(), clock.now());
    }
    let state: AppState;
    try {
      state = ticked(base, clock.now());
    } catch (e) {
      set({ initError: e instanceof Error ? e.message : 'Laden fehlgeschlagen' });
      return;
    }
    set({ state, ready: true, restoredFromBackup: loaded.restoredFromBackup });
    if (fresh) {
      // Die Installations-ID muss ein sofortiges Neuladen überleben.
      dirty = true;
      await flush();
    } else if (state !== base || loaded.restoredFromBackup) {
      scheduleSave();
    }
  };

  return {
    state: null,
    ready: false,
    restoredFromBackup: false,
    saveError: false,
    initError: null,
    clock: null,

    init(b, clock, opts = {}) {
      // Doppelter Aufruf (React StrictMode) während des Ladens teilt sich dieselbe Arbeit.
      if (initInFlight && initInFlight.backend === b) return initInFlight.promise;
      const promise = doInit(b, clock, opts).finally(() => {
        if (initInFlight?.promise === promise) initInFlight = null;
      });
      initInFlight = { backend: b, promise };
      return promise;
    },

    tickNow() {
      const clock = get().clock;
      if (!clock) return;
      commit((s) => ticked(s, clock.now()));
    },

    saveResearch(assignmentId, deliverableId, doc) {
      commit((s) => ({ ...s, research: { ...s.research, [researchKey(assignmentId, deliverableId)]: doc } }));
    },

    async prepareGemini(assignmentId) {
      const s = get().state;
      const a = s?.assignments.find((x) => x.id === assignmentId);
      if (!s || !a || !backend || !s.settings.gemini.enabled || !s.settings.gemini.model) return null;
      try {
        if (!(await backend.gemini.hasKey())) return null;
      } catch {
        return null;
      }
      const { project } = await loadProjectFor(a, backend);
      return prepareFrames(backend, a, project);
    },

    submit(assignmentId, selfChecks, onProgress, gemini) {
      // Läuft für diesen Auftrag schon eine Abgabe, bekommt ein zweiter Aufruf dasselbe Ergebnis (nie zwei Bewertungen).
      const running = inFlight.get(assignmentId);
      if (running) return running.kind === 'submit' ? (running.promise as Promise<Evaluation>) : Promise.reject(new Error('Für diesen Auftrag läuft gerade eine Korrektur.'));
      const a = get().state?.assignments.find((x) => x.id === assignmentId);
      if (!a) return Promise.reject(new Error('Auftrag nicht gefunden.'));
      if (a.status !== 'open') return Promise.reject(new Error('Dieser Auftrag ist nicht mehr offen. Zum Verbessern nutze „Nachbessern“.'));
      return track(assignmentId, 'submit', evaluateAndStore(a.id, selfChecks, false, onProgress, gemini));
    },

    correction(assignmentId, selfChecks, onProgress, gemini) {
      const running = inFlight.get(assignmentId);
      if (running) return running.kind === 'correction' ? (running.promise as Promise<CorrectionResult>) : Promise.resolve<CorrectionResult>({ ok: false, reason: 'busy' });
      const s = get().state;
      const clock = get().clock;
      const a = s?.assignments.find((x) => x.id === assignmentId);
      if (!s || !clock || !a) return Promise.reject(new Error('Auftrag nicht gefunden.'));
      const check = canCorrect(a, s.evaluations, clock.now(), loadRules());
      if (!check.ok) return Promise.resolve<CorrectionResult>(check);
      return track(
        assignmentId,
        'correction',
        evaluateAndStore(a.id, selfChecks, true, onProgress, gemini).then((evaluation): CorrectionResult => ({ ok: true, evaluation })),
      );
    },

    toggleShowreel(evaluationId) {
      commit((s) => {
        const e = s.evaluations.find((x) => x.id === evaluationId);
        if (!e) return s;
        if (s.showreel.includes(evaluationId)) return { ...s, showreel: s.showreel.filter((x) => x !== evaluationId) };
        if (e.total < loadRules().showreelMinScore) return s;
        return { ...s, showreel: [...s.showreel, evaluationId] };
      });
    },

    addVacation(v) {
      const clock = get().clock;
      const s = get().state;
      if (!clock || !s) return { ok: false, reason: 'invalid' };
      // „Ab heute“ gilt: Beginn am heutigen Datum (Mitternacht, wie das Formular ihn sendet) startet jetzt; frühere Tage bleiben „past“.
      const now = clock.now();
      const d = new Date(now);
      const today = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      if (v.start === today && today < now) v = { ...v, start: now };
      const check = canAddVacation(s.schedule.vacations, v, now);
      if (!check.ok) return check;
      // Laufende Fristen sofort neu rechnen: im Urlaub steht die Uhr (Spec §8.1).
      commit((cur) => ticked({ ...cur, schedule: { ...cur.schedule, vacations: [...cur.schedule.vacations, v] } as ScheduleState }, now));
      return check;
    },

    removeVacation(start) {
      const now = get().clock?.now() ?? 0;
      commit((s) => {
        const vs = s.schedule.vacations.filter((v) => v.start !== start || v.start <= now);
        return vs.length === s.schedule.vacations.length ? s : ticked({ ...s, schedule: { ...s.schedule, vacations: vs } }, now);
      });
    },

    setTheme(theme) {
      commit((s) => (s.settings.theme === theme ? s : { ...s, settings: { ...s.settings, theme } }));
    },

    setGeminiEnabled(enabled) {
      commit((s) => (s.settings.gemini.enabled === enabled ? s : { ...s, settings: { ...s.settings, gemini: { ...s.settings.gemini, enabled } } }));
    },

    setGeminiModel(model) {
      commit((s) => (s.settings.gemini.model === model ? s : { ...s, settings: { ...s.settings, gemini: { ...s.settings.gemini, model } } }));
    },

    toggleChecklist(assignmentId, itemId) {
      commit((s) => {
        const cur = s.checklist[assignmentId] ?? [];
        const next = cur.includes(itemId) ? cur.filter((x) => x !== itemId) : [...cur, itemId];
        return { ...s, checklist: { ...s.checklist, [assignmentId]: next } };
      });
    },

    setDevTimeOffset(ms) {
      commit((s) => ({ ...s, settings: { ...s.settings, devTimeOffsetMs: ms } }));
      get().tickNow();
    },

    createProject(name, format) {
      const s = get().state;
      const clock = get().clock;
      const check = checkProjectName(name);
      if (!s || !clock || !check.ok) return null;
      const p = newFreeProject(check.name, format, clock.now());
      commit((cur) => ({ ...cur, projects: [...(cur.projects ?? []), p] }));
      // Der neue Eintrag muss ein sofortiges Beenden überleben (das Projekt selbst sichert der projectStore sofort).
      void flush();
      return p;
    },

    renameProject(id, name) {
      const check = checkProjectName(name);
      if (!check.ok || !get().state?.projects?.some((p) => p.id === id)) return false;
      commit((s) => {
        const list = s.projects ?? [];
        const cur = list.find((p) => p.id === id);
        if (!cur || cur.name === check.name) return s;
        return { ...s, projects: list.map((p) => (p.id === id ? { ...p, name: check.name } : p)) };
      });
      return true;
    },

    noteOpened(ref) {
      const now = get().clock?.now() ?? 0;
      commit((s) => {
        const list = s.projects ?? [];
        if (ref.kind === 'free' && !list.some((p) => p.id === ref.id)) return s;
        if (ref.kind === 'assignment' && !s.assignments.some((a) => a.id === ref.id)) return s;
        const same = s.lastOpened?.kind === ref.kind && s.lastOpened.id === ref.id;
        if (ref.kind === 'assignment') return same ? s : { ...s, lastOpened: { kind: ref.kind, id: ref.id } };
        return {
          ...s,
          lastOpened: same ? s.lastOpened : { kind: ref.kind, id: ref.id },
          projects: list.map((p) => (p.id === ref.id ? { ...p, openedAt: now } : p)),
        };
      });
    },

    dismissRestoredBanner() {
      set({ restoredFromBackup: false });
    },

    async restart() {
      const clock = get().clock;
      if (!clock || !backend) return;
      const fresh = ticked(freshState(uuid(), clock.now()), clock.now());
      set({ state: fresh, ready: true, restoredFromBackup: false, initError: null });
      dirty = true;
      await flush();
    },

    flush,
  };
});

/** Nur für Tests: Zustand und Zeitgeber zurücksetzen. */
export function resetAppForTests(): void {
  cancelTimer();
  dirty = false;
  backend = null;
  initInFlight = null;
  useApp.setState({ state: null, ready: false, restoredFromBackup: false, saveError: false, initError: null, clock: null });
}

// ---------- Selektoren (reine Funktionen; in Komponenten per useMemo über `state` nutzen) ----------

/** Aufträge mit Status „offen“, früheste Frist zuerst. */
export function openAssignments(s: Pick<AppStore, 'state'>): Assignment[] {
  return (s.state?.assignments ?? []).filter((a) => a.status === 'open').sort((a, b) => a.deadline - b.deadline || a.number - b.number);
}

/** Aktiver Auftrag = offener Auftrag mit der frühesten Frist. */
export function activeAssignment(s: Pick<AppStore, 'state'>): Assignment | null {
  return openAssignments(s)[0] ?? null;
}

export function accountSummary(s: Pick<AppStore, 'state'>): AccountResult {
  const st = s.state;
  return account(st?.evaluations ?? [], st?.assignments ?? [], loadRules());
}
