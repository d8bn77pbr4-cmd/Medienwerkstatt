import { DEFAULT_AUTOSAVE_MINUTES } from '../backend/types';
import { useApp } from './appStore';
import { useProject } from './projectStore';

const MINUTE_MS = 60_000;

const two = (n: number) => String(n).padStart(2, '0');

/** Name einer Sicherungsversion in Ortszeit: `JJJJ-MM-TT HH-MM-SS.json` (Rust prüft genau dieses Muster). */
export function versionName(d: Date = new Date()): string {
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}-${two(d.getMinutes())}-${two(d.getSeconds())}.json`;
}

export type AutosaveOptions = {
  /** Länge einer Minute in ms (nur Tests). */
  minuteMs?: number;
  /** Uhr für die Namen (nur Tests). */
  now?: () => Date;
};

/**
 * Sicherungsversionen im Takt von `settings.autosaveMinutes`: Je Takt eine Version des offenen Projekts und eine des
 * App-Zustands, aber nur, wenn sich seit der letzten etwas geändert hat. Ein Fehler ist nicht fatal: Die Markierung
 * „geändert“ bleibt, im nächsten Takt gibt es einen neuen Versuch (`versionError` bzw. `saveError` zeigen es an).
 * Der Takt startet neu, wenn sich die Einstellung ändert. Gibt den Aufräumer zurück.
 */
export function attachAutosave(opts: AutosaveOptions = {}): () => void {
  const minuteMs = opts.minuteMs ?? MINUTE_MS;
  const now = opts.now ?? (() => new Date());
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const project = useProject.getState();
      if (project.dir && project.rev !== project.versionedRev) await project.saveVersion(versionName(now()));
      const app = useApp.getState();
      if (app.state && app.rev !== app.versionedRev) await app.saveVersion(versionName(now()));
    } finally {
      running = false;
    }
  };

  let interval: ReturnType<typeof setInterval> | null = null;
  const restart = () => {
    if (interval !== null) clearInterval(interval);
    const minutes = useApp.getState().state?.settings.autosaveMinutes ?? DEFAULT_AUTOSAVE_MINUTES;
    interval = setInterval(() => void tick(), minutes * minuteMs);
  };
  let minutes = useApp.getState().state?.settings.autosaveMinutes;
  restart();
  // Der Takt folgt der Einstellung (auch wenn der Zustand erst nach dem Start geladen wird).
  const offSetting = useApp.subscribe((s) => {
    const m = s.state?.settings.autosaveMinutes;
    if (m === minutes) return;
    minutes = m;
    restart();
  });

  return () => {
    if (interval !== null) clearInterval(interval);
    offSetting();
  };
}

let saveNowRun: Promise<void> | null = null;

/**
 * ⌘S: sofort speichern und eine Version anlegen. Mit offenem Projekt in der Werkstatt (`scope` „project“) das Projekt,
 * sonst den App-Zustand. Läuft gerade schon ein ⌘S, ist es dasselbe.
 */
export function saveNow(scope: 'project' | 'app', now: () => Date = () => new Date()): Promise<void> {
  if (saveNowRun) return saveNowRun;
  const run = (async () => {
    if (scope === 'project') {
      await Promise.all([useProject.getState().saveVersion(versionName(now())), useApp.getState().flush()]);
    } else {
      await useApp.getState().saveVersion(versionName(now()));
    }
  })().finally(() => {
    saveNowRun = null;
  });
  saveNowRun = run;
  return run;
}

/** Werkstatt mit offenem Projekt? Dann gilt ⌘S dem Projekt, sonst dem App-Zustand. */
function scopeForPath(pathname: string): 'project' | 'app' {
  return pathname === '/' && useProject.getState().status === 'ready' ? 'project' : 'app';
}

/** ⌘S überall abfangen (auch in Textfeldern und Blättern; die Browser-Vorgabe „Seite sichern“ entfällt). Gibt den Aufräumer zurück. */
export function attachSaveShortcut(): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.key.toLowerCase() !== 's' || !e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
    e.preventDefault();
    if (e.repeat) return;
    void saveNow(scopeForPath(window.location.pathname));
  };
  window.addEventListener('keydown', onKey, true);
  return () => window.removeEventListener('keydown', onKey, true);
}
