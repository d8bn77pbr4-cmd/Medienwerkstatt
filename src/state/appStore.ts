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
import { loadProjectFor } from './projectAccess';
import { runSubmission } from './submission';

export const SAVE_DEBOUNCE_MS = 2000;

export type SelfChecks = { hookDone: boolean };
export type CorrectionResult = { ok: true; evaluation: Evaluation } | { ok: false; reason: CorrectionRefusal };

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
  submit(assignmentId: string, selfChecks: SelfChecks, onProgress?: (message: string) => void): Promise<Evaluation>;
  /** Nachbessern (Spec §9.3): einmal, innerhalb von 24 h nach der ersten Bewertung, gedeckelt. */
  correction(assignmentId: string, selfChecks: SelfChecks, onProgress?: (message: string) => void): Promise<CorrectionResult>;
  /** Bewertung ab `showreelMinScore` in die Showreel-Merkliste legen oder wieder herausnehmen. */
  toggleShowreel(evaluationId: string): void;
  addVacation(v: Vacation): ReturnType<typeof canAddVacation>;
  toggleChecklist(assignmentId: string, itemId: string): void;
  setDevTimeOffset(ms: number): void;
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
  return {
    ...s,
    evaluations: s.evaluations ?? [],
    assignments: s.assignments ?? [],
    showreel: s.showreel ?? [],
    checklist: s.checklist ?? {},
    research: s.research ?? {},
    settings: {
      theme: s.settings?.theme ?? 'auto',
      gemini: { enabled: s.settings?.gemini?.enabled ?? false, model: s.settings?.gemini?.model ?? null },
      devTimeOffsetMs: s.settings?.devTimeOffsetMs ?? 0,
    },
  };
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
  const sameSchedule =
    r.schedule.nextIssueAt === s.schedule.nextIssueAt && r.schedule.nextNumber === s.schedule.nextNumber;
  if (r.events.length === 0 && sameSchedule) return s;
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
  const evaluateAndStore = async (assignmentId: string, selfChecks: SelfChecks, isCorrection: boolean, onProgress?: (m: string) => void): Promise<Evaluation> => {
    const clock = get().clock;
    const s = get().state;
    const a = s?.assignments.find((x) => x.id === assignmentId);
    if (!s || !clock || !backend || !a) throw new Error('Die App ist noch nicht bereit.');
    const { project } = await loadProjectFor(a, backend);
    const research: Record<string, ResearchDoc | null> = {};
    for (const d of a.deliverables) if (d.kind === 'research') research[d.id] = s.research[researchKey(a.id, d.id)] ?? null;
    const submittedAt = clock.now();
    const evaluation = await runSubmission({ backend, rules: loadRules(), assignment: a, project, research, selfChecks, isCorrection, submittedAt, onProgress });
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
      base = freshState(opts.installId ?? crypto.randomUUID(), clock.now());
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

    async submit(assignmentId, selfChecks, onProgress) {
      const a = get().state?.assignments.find((x) => x.id === assignmentId);
      if (!a) throw new Error('Auftrag nicht gefunden.');
      if (a.status !== 'open') throw new Error('Dieser Auftrag ist nicht mehr offen. Zum Verbessern nutze „Nachbessern“.');
      return evaluateAndStore(a.id, selfChecks, false, onProgress);
    },

    async correction(assignmentId, selfChecks, onProgress) {
      const s = get().state;
      const clock = get().clock;
      const a = s?.assignments.find((x) => x.id === assignmentId);
      if (!s || !clock || !a) throw new Error('Auftrag nicht gefunden.');
      const check = canCorrect(a, s.evaluations, clock.now(), loadRules());
      if (!check.ok) return check;
      return { ok: true, evaluation: await evaluateAndStore(a.id, selfChecks, true, onProgress) };
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
      const check = canAddVacation(s.schedule.vacations, v, clock.now());
      if (!check.ok) return check;
      commit((cur) => ({ ...cur, schedule: { ...cur.schedule, vacations: [...cur.schedule.vacations, v] } as ScheduleState }));
      return check;
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

    dismissRestoredBanner() {
      set({ restoredFromBackup: false });
    },

    async restart() {
      const clock = get().clock;
      if (!clock || !backend) return;
      const fresh = ticked(freshState(crypto.randomUUID(), clock.now()), clock.now());
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
