import { create } from 'zustand';
import type { Backend } from '../backend/Backend';
import type { AppState, Assignment } from '../backend/types';
import { AVAILABLE_TYPES, generateAssignment, loadCatalogs } from '../domain/assignments/generator';
import { canAddVacation, tick, type ScheduleState, type Vacation } from '../domain/assignments/schedule';
import { account, type AccountResult } from '../domain/chef/account';
import type { ResearchDoc } from '../domain/chef/research';
import { loadRules } from '../domain/chef/rules';
import type { Clock } from '../domain/time';

export const SAVE_DEBOUNCE_MS = 2000;

export type InitOptions = {
  /** Vorgegebene Installations-ID (nur Mock-Modus, für deterministische E2E-Tests). */
  installId?: string;
};

export interface AppStore {
  state: AppState | null;
  ready: boolean;
  restoredFromBackup: boolean;
  clock: Clock | null;
  init(backend: Backend, clock: Clock, opts?: InitOptions): Promise<void>;
  /** Fällige Aufträge ausgeben, Fristen prüfen. Jede Minute und beim Fokussieren des Fensters. */
  tickNow(): void;
  saveResearch(assignmentId: string, deliverableId: string, doc: ResearchDoc): void;
  addVacation(v: Vacation): ReturnType<typeof canAddVacation>;
  toggleChecklist(assignmentId: string, itemId: string): void;
  setDevTimeOffset(ms: number): void;
  dismissRestoredBanner(): void;
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
    await backend.saveState(s);
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

  const doInit = async (b: Backend, clock: Clock, opts: InitOptions) => {
    cancelTimer();
    dirty = false;
    backend = b;
    set({ clock });
    const loaded = await b.loadState();
    let base: AppState;
    let fresh = false;
    if (loaded.value) {
      base = normalize(loaded.value);
    } else {
      fresh = true;
      base = freshState(opts.installId ?? crypto.randomUUID(), clock.now());
    }
    const state = ticked(base, clock.now());
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

    flush,
  };
});

/** Nur für Tests: Zustand und Zeitgeber zurücksetzen. */
export function resetAppForTests(): void {
  cancelTimer();
  dirty = false;
  backend = null;
  initInFlight = null;
  useApp.setState({ state: null, ready: false, restoredFromBackup: false, clock: null });
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
