import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockBackend } from '../../src/backend/MockBackend';
import { isValidState } from '../../src/backend/schema';
import type { Assignment } from '../../src/backend/types';
import { insertEdit } from '../../src/domain/timeline/ops';
import { resetAppForTests, useApp } from '../../src/state/appStore';
import { attachAutosave, attachSaveShortcut, saveNow, versionName } from '../../src/state/autosave';
import { PROJECT_SAVE_DEBOUNCE_MS, resetProjectForTests, useProject } from '../../src/state/projectStore';

const MIN = 60_000;
const NAME = /^\d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2}\.json$/;
const t0 = Date.parse('2026-11-23T10:00:00+01:00');
const DIR = '/mock/Medienwerkstatt/A03_Cafe-Muehle';

const assignment = (): Assignment =>
  ({
    id: 'A03',
    number: 3,
    issuedAt: 0,
    deadline: 1,
    expiresAt: 2,
    level: 1,
    type: 'video',
    client: { name: 'Café Mühle', branche: 'Gastro' },
    occasion: 'Eröffnung',
    title: 'Reel',
    briefing: '',
    hook: { id: 'h', text: '', verify: 'self' },
    deliverables: [
      {
        id: 'film',
        kind: 'video',
        label: 'Reel',
        videoSpec: { aspect: '9:16', width: 1080, height: 1920, fps: 30, durationSec: 30, toleranceSec: 3, loudnessLufs: -14, truePeakMax: -1, codec: 'h264', fileName: 'x.mp4', minShots: 5, requiredShotSizes: [], requireJCut: false, requireLowerThird: false },
      },
    ],
    shootingNotes: [],
    status: 'open',
    submissions: [],
  }) as unknown as Assignment;

let backend: MockBackend;
let detach: (() => void) | null = null;
let clockMs = Date.parse('2026-11-23T10:00:00');
const now = () => new Date(clockMs);
const proj = () => useProject.getState();
const names = async () => (await backend.listProjectVersions(DIR)).map((v) => v.name);
/** Eine Änderung am Projekt (Marke in der Sequenz) und das Speichern nach der Entprellzeit abwarten. */
async function edit(frame = 10) {
  proj().apply((s) => ({ ...s, inPoint: frame }));
  await vi.advanceTimersByTimeAsync(PROJECT_SAVE_DEBOUNCE_MS + 10);
}

beforeEach(async () => {
  vi.useFakeTimers();
  localStorage.clear();
  resetAppForTests();
  resetProjectForTests();
  clockMs = Date.parse('2026-11-23T10:00:00');
  backend = new MockBackend();
  await useApp.getState().init(backend, { now: () => t0 }, { installId: 'x' });
  await proj().open({ kind: 'assignment', assignment: assignment() }, backend);
});
afterEach(() => {
  detach?.();
  detach = null;
  vi.useRealTimers();
  resetAppForTests();
  resetProjectForTests();
});

describe('versionName', () => {
  it('Ortszeit, zweistellig, passt zum Muster der Rust-Prüfung', () => {
    expect(versionName(new Date(2026, 0, 5, 3, 4, 9))).toBe('2026-01-05 03-04-09.json');
    expect(versionName(new Date(2026, 10, 24, 18, 42, 7))).toMatch(NAME);
  });
});

describe('Takt', () => {
  it('legt nur dann eine Version an, wenn sich das Projekt seit der letzten geändert hat', async () => {
    detach = attachAutosave({ now });
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(await names()).toEqual([]); // nichts geändert
    await edit();
    clockMs += 1000;
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(await names()).toEqual(['2026-11-23 10-00-01.json']);
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(await names()).toHaveLength(1); // seither nichts geändert
    await edit(20);
    clockMs += 1000;
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(await names()).toEqual(['2026-11-23 10-00-02.json', '2026-11-23 10-00-01.json']);
  });

  it('die Version enthält den Stand der Platte (vorher geflusht, auch vor Ablauf der Entprellzeit)', async () => {
    detach = attachAutosave({ now });
    proj().apply((s) => ({ ...s, inPoint: 77 }));
    await vi.advanceTimersByTimeAsync(10 * MIN - 1); // Entprellzeit längst vorbei, trotzdem gespeichert
    await vi.advanceTimersByTimeAsync(1);
    const v = await backend.restoreProjectVersion(DIR, (await names())[0]);
    expect(v.sequences[0].inPoint).toBe(77);
  });

  it('der Takt folgt der Einstellung und startet bei einer Änderung neu', async () => {
    detach = attachAutosave({ now });
    await edit();
    useApp.getState().setAutosaveMinutes(5);
    await vi.advanceTimersByTimeAsync(5 * MIN - 100);
    expect(await names()).toEqual([]);
    await vi.advanceTimersByTimeAsync(200);
    expect(await names()).toHaveLength(1);
    // 30 Minuten: nach 10 min noch nichts Neues, nach 30 schon
    useApp.getState().setAutosaveMinutes(30);
    clockMs += 1000;
    await edit(30);
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(await names()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(20 * MIN);
    expect(await names()).toHaveLength(2);
  });

  it('Fehler sind nicht fatal: Markierung bleibt, nächster Takt versucht es erneut, versionError zeigt es an', async () => {
    detach = attachAutosave({ now });
    const spy = vi.spyOn(backend, 'saveProjectVersion').mockRejectedValueOnce(new Error('Platte voll'));
    await edit();
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(proj().versionError).toBe(true);
    expect(proj().saveError).toBe(false);
    expect(await names()).toEqual([]);
    clockMs += 5000;
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(proj().versionError).toBe(false);
    expect(await names()).toHaveLength(1);
  });

  it('schlägt das Speichern selbst fehl, gibt es keine Version vom alten Stand; nach dem Retry schon', async () => {
    detach = attachAutosave({ now });
    vi.spyOn(backend, 'saveProject').mockRejectedValueOnce(new Error('weg'));
    proj().apply((s) => ({ ...s, inPoint: 5 }));
    await vi.advanceTimersByTimeAsync(PROJECT_SAVE_DEBOUNCE_MS + 10);
    expect(proj().saveError).toBe(true);
    // Der Retry der Entprellzeit läuft vor dem Takt: danach gibt es die Version mit dem neuen Stand.
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(proj().saveError).toBe(false);
    const v = await backend.restoreProjectVersion(DIR, (await names())[0]);
    expect(v.sequences[0].inPoint).toBe(5);
  });

  it('bleibt es beim Takt beim Speicherfehler, wird nichts versioniert und die Markierung bleibt', async () => {
    detach = attachAutosave({ now });
    vi.spyOn(backend, 'saveProject').mockRejectedValue(new Error('weg'));
    proj().apply((s) => ({ ...s, inPoint: 5 }));
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(proj().saveError).toBe(true);
    expect(await names()).toEqual([]);
    vi.mocked(backend.saveProject).mockRestore();
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(proj().saveError).toBe(false);
    expect(await names()).toHaveLength(1);
  });

  it('legt auch vom App-Zustand eine Version an, aber nur nach einer Änderung', async () => {
    detach = attachAutosave({ now });
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(backend.listStateVersions()).toEqual([]);
    useApp.getState().toggleChecklist('A03', 'x');
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(backend.listStateVersions()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(backend.listStateVersions()).toHaveLength(1);
  });

  it('Fehler bei der Zustandsversion: versionError, neuer Versuch im nächsten Takt', async () => {
    detach = attachAutosave({ now });
    const spy = vi.spyOn(backend, 'saveStateVersion').mockRejectedValueOnce(new Error('x'));
    useApp.getState().toggleChecklist('A03', 'x');
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(useApp.getState().versionError).toBe(true);
    expect(useApp.getState().saveError).toBe(false);
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(useApp.getState().versionError).toBe(false);
    expect(backend.listStateVersions()).toHaveLength(1);
  });

  it('Aufräumen stoppt den Takt', async () => {
    detach = attachAutosave({ now });
    await edit();
    detach();
    detach = null;
    await vi.advanceTimersByTimeAsync(60 * MIN);
    expect(await names()).toEqual([]);
  });

  it('Wechsel auf ein anderes Projekt zählt nicht als Änderung', async () => {
    detach = attachAutosave({ now });
    const other = { ...assignment(), id: 'A04', number: 4 };
    await proj().open({ kind: 'assignment', assignment: other }, backend);
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(await backend.listProjectVersions('/mock/Medienwerkstatt/A04_Cafe-Muehle')).toEqual([]);
  });
});

describe('⌘S', () => {
  it('im Projekt: sofort speichern und Version anlegen, danach kein doppelter Takt', async () => {
    detach = attachAutosave({ now });
    proj().apply((s) => ({ ...s, inPoint: 9 }));
    expect(proj().savePending).toBe(true);
    await saveNow('project', now);
    expect(proj().savePending).toBe(false);
    expect(await names()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(await names()).toHaveLength(1);
  });

  it('ohne Projekt/außerhalb der Werkstatt: App-Zustand speichern und Version anlegen', async () => {
    useApp.getState().toggleChecklist('A03', 'x');
    await saveNow('app', now);
    expect(backend.listStateVersions()).toHaveLength(1);
    expect(await names()).toEqual([]);
  });

  it('Tastendruck ⌘S wird abgefangen (Browser-Vorgabe entfällt); Strg+S und S nicht', async () => {
    const off = attachSaveShortcut();
    try {
      useApp.getState().toggleChecklist('A03', 'x');
      const press = (init: KeyboardEventInit) => {
        const e = new KeyboardEvent('keydown', { key: 's', cancelable: true, bubbles: true, ...init });
        window.dispatchEvent(e);
        return e;
      };
      expect(press({ ctrlKey: true }).defaultPrevented).toBe(false);
      expect(press({}).defaultPrevented).toBe(false);
      expect(press({ metaKey: true }).defaultPrevented).toBe(true);
      await vi.advanceTimersByTimeAsync(10);
      // jsdom-Pfad ist „/“ und ein Projekt ist offen: Projektversion
      expect(await names()).toHaveLength(1);
    } finally {
      off();
    }
  });
});

describe('Wiederherstellen', () => {
  async function withClip() {
    await proj().import(['/fixtures/e2e-clip.webm']);
    proj().apply((s, media) => insertEdit(s, media[0], 0, 2, 0, { video: 'V1', audio: 'A1' }, 'insert'));
    await proj().flush();
  }

  it('sichert den aktuellen Stand, lädt die Version, setzt den Verlauf zurück und speichert', async () => {
    await withClip();
    const before = proj().seq!.clips.length;
    expect(before).toBeGreaterThan(0);
    await proj().saveVersion('2026-11-23 09-00-00.json');
    // weiter schneiden: noch ein Clip
    proj().apply((s, media) => insertEdit(s, media[0], 0, 2, 100, { video: 'V1', audio: 'A1' }, 'insert'));
    expect(proj().seq!.clips.length).toBeGreaterThan(before);
    expect(proj().canUndo).toBe(true);

    await proj().restoreVersion('2026-11-23 09-00-00.json', '2026-11-23 09-30-00.json');

    expect(proj().seq!.clips.length).toBe(before);
    expect(proj().canUndo).toBe(false);
    expect(proj().canRedo).toBe(false);
    expect(proj().status).toBe('ready');
    // gespeichert als aktueller Stand
    const onDisk = (await backend.loadProject(DIR)).value!;
    expect(onDisk.sequences[0].clips.length).toBe(before);
    // Der Stand davor ist als Version gesichert: das Zurückholen lässt sich umkehren.
    const backup = await backend.restoreProjectVersion(DIR, '2026-11-23 09-30-00.json');
    expect(backup.sequences[0].clips.length).toBeGreaterThan(before);
    expect(await names()).toEqual(['2026-11-23 09-30-00.json', '2026-11-23 09-00-00.json']);
    await proj().restoreVersion('2026-11-23 09-30-00.json', '2026-11-23 09-45-00.json');
    expect(proj().seq!.clips.length).toBeGreaterThan(before);
  });

  it('scheitert das Sichern des Stands, bleibt alles wie es ist', async () => {
    await withClip();
    await proj().saveVersion('2026-11-23 09-00-00.json');
    proj().apply((s) => ({ ...s, inPoint: 3 }));
    vi.spyOn(backend, 'saveProjectVersion').mockRejectedValue(new Error('voll'));
    await expect(proj().restoreVersion('2026-11-23 09-00-00.json', '2026-11-23 09-30-00.json')).rejects.toThrow(/nichts verändert/);
    expect(proj().seq!.inPoint).toBe(3);
    expect(proj().canUndo).toBe(true);
  });

  it('unlesbare oder unbekannte Version: Fehler, Projekt unverändert', async () => {
    await withClip();
    proj().apply((s) => ({ ...s, inPoint: 3 }));
    await expect(proj().restoreVersion('2026-11-23 01-00-00.json', '2026-11-23 09-30-00.json')).rejects.toThrow(/nichts verändert/);
    expect(proj().seq!.inPoint).toBe(3);
    vi.spyOn(backend, 'restoreProjectVersion').mockResolvedValue({ version: 1 } as never);
    await expect(proj().restoreVersion('2026-11-23 09-30-00.json', '2026-11-23 09-31-00.json')).rejects.toThrow(/beschädigt/);
    expect(proj().seq!.inPoint).toBe(3);
  });

  it('listVersions: neueste zuerst; ohne Projekt leer', async () => {
    await proj().saveVersion('2026-11-23 09-00-00.json');
    await proj().saveVersion('2026-11-23 10-00-00.json');
    expect((await proj().listVersions()).map((v) => v.name)).toEqual(['2026-11-23 10-00-00.json', '2026-11-23 09-00-00.json']);
    resetProjectForTests();
    expect(await proj().listVersions()).toEqual([]);
  });

  it('MockBackend: strenge Namen, höchstens 20 Versionen', async () => {
    await expect(backend.saveProjectVersion(DIR, '../x.json')).rejects.toMatchObject({ code: 'invalid_path' });
    await expect(backend.restoreProjectVersion(DIR, 'x')).rejects.toMatchObject({ code: 'invalid_path' });
    for (let i = 0; i < 25; i++) await backend.saveProjectVersion(DIR, `2026-11-23 10-00-${String(i).padStart(2, '0')}.json`);
    const list = await backend.listProjectVersions(DIR);
    expect(list).toHaveLength(20);
    expect(list[0].name).toBe('2026-11-23 10-00-24.json');
  });
});

describe('Einstellung autosaveMinutes', () => {
  const base = { version: 1, installId: 'i', createdAt: 1, schedule: { nextIssueAt: 1, nextNumber: 1, vacations: [] }, assignments: [], evaluations: [] };
  it('ältere Stände ohne das Feld sind gültig und laden mit 10', async () => {
    expect(isValidState({ ...base, settings: { theme: 'dark', gemini: { enabled: false, model: null }, devTimeOffsetMs: 0 } })).toBe(true);
    localStorage.clear();
    resetAppForTests();
    localStorage.setItem('mw-state', JSON.stringify({ ...base, showreel: [], checklist: {}, research: {}, settings: { theme: 'dark', gemini: { enabled: false, model: null }, devTimeOffsetMs: 0 } }));
    await useApp.getState().init(new MockBackend(), { now: () => t0 });
    expect(useApp.getState().state!.settings.autosaveMinutes).toBe(10);
    expect(useApp.getState().state!.settings.theme).toBe('dark');
  });

  it('ein unbekannter Wert macht den Stand nicht unlesbar, er fällt auf 10 zurück', async () => {
    expect(isValidState({ ...base, settings: { autosaveMinutes: 7 } })).toBe(true);
    resetAppForTests();
    localStorage.clear();
    localStorage.setItem('mw-state', JSON.stringify({ ...base, showreel: [], checklist: {}, research: {}, settings: { autosaveMinutes: 7 } }));
    await useApp.getState().init(new MockBackend(), { now: () => t0 });
    expect(useApp.getState().state!.installId).toBe('i');
    expect(useApp.getState().state!.settings.autosaveMinutes).toBe(10);
  });

  it('gültige Werte bleiben, setAutosaveMinutes speichert', async () => {
    useApp.getState().setAutosaveMinutes(30);
    await useApp.getState().flush();
    resetAppForTests();
    await useApp.getState().init(backend, { now: () => t0 });
    expect(useApp.getState().state!.settings.autosaveMinutes).toBe(30);
  });
});

describe('Wiederherstellen bei gleichem Namen', () => {
  it('trägt die Sicherung des aktuellen Standes denselben Namen wie die Version, wird trotzdem die gewählte geladen', async () => {
    await proj().import(['/fixtures/e2e-clip.webm']);
    proj().apply((s, media) => insertEdit(s, media[0], 0, 2, 0, { video: 'V1', audio: 'A1' }, 'insert'));
    const before = proj().seq!.clips.length;
    await proj().saveVersion('2026-11-23 09-00-00.json');
    proj().apply((s, media) => insertEdit(s, media[0], 0, 2, 100, { video: 'V1', audio: 'A1' }, 'insert'));
    await proj().restoreVersion('2026-11-23 09-00-00.json', '2026-11-23 09-00-00.json');
    expect(proj().seq!.clips.length).toBe(before);
  });
});
