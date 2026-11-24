import { create } from 'zustand';
import type { Panel } from '../../domain/chef/types';
import type { TrackId } from '../../domain/timeline/types';
import { DEFAULT_PX_PER_SEC, MAX_PX_PER_SEC, MIN_PX_PER_SEC } from './timelineCanvas';

export type Tool = 'select' | 'razor' | 'ripple' | 'roll' | 'hand';
export type InspectorTab = 'clip' | 'farbe' | 'titel' | 'sequenz';
export type MonitorId = 'source' | 'program';
export type { Panel };

/** Welcher Inspektor-Reiter zu einem Werkzeug-Bereich des Chefs gehört (`tool.panel`). */
const TAB_FOR_PANEL: Partial<Record<Panel, InspectorTab>> = { audio: 'clip', farbe: 'farbe', export: 'sequenz' };

/** Bedienzustand der Werkstatt (nicht gespeichert, kein Verlauf). */
export interface WerkstattUi {
  tool: Tool;
  snapping: boolean;
  selection: string[];
  targets: { video: TrackId; audio: TrackId };
  /** Zoom in Pixeln je Sekunde, Verschiebung in Bildern. */
  pxPerSec: number;
  scroll: number;
  timelineWidth: number;
  activeMonitor: MonitorId;
  sourceMarks: { in: number | null; out: number | null };
  inspectorTab: InspectorTab;
  /** Vorher/Nachher: Farbkorrektur des gewählten Clips in der Vorschau aus. */
  colorBypass: boolean;
  shortcutsOpen: boolean;
  /** Sprungziel (z. B. „So behebst du es“ aus dem Protokoll); `n` zählt hoch, damit gleiche Ziele erneut wirken. */
  focusRequest: { panel: Panel; n: number } | null;
  notice: string | null;

  setTool(t: Tool): void;
  toggleSnapping(): void;
  select(ids: string[], mode?: 'replace' | 'add'): void;
  clearSelection(): void;
  setTarget(kind: 'video' | 'audio', id: TrackId): void;
  setZoom(pxPerSec: number, scroll?: number): void;
  setScroll(scroll: number): void;
  setTimelineWidth(w: number): void;
  setActiveMonitor(m: MonitorId): void;
  setSourceMarks(m: { in: number | null; out: number | null }): void;
  setInspectorTab(t: InspectorTab): void;
  setColorBypass(on: boolean): void;
  setShortcutsOpen(open: boolean): void;
  /** Springt zum Bereich `panel` ('audio' | 'farbe' | 'export' | 'timeline' | 'medien'). */
  focusPanel(panel: Panel): void;
  showNotice(text: string | null): void;
  reset(): void;
}

const initial = () => ({
  tool: 'select' as Tool,
  snapping: true,
  selection: [] as string[],
  targets: { video: 'V1', audio: 'A1' },
  pxPerSec: DEFAULT_PX_PER_SEC,
  scroll: 0,
  timelineWidth: 0,
  activeMonitor: 'program' as MonitorId,
  sourceMarks: { in: null, out: null },
  inspectorTab: 'clip' as InspectorTab,
  colorBypass: false,
  shortcutsOpen: false,
  focusRequest: null,
  notice: null,
});

export const useWerkstatt = create<WerkstattUi>()((set, get) => ({
  ...initial(),
  setTool: (tool) => set({ tool }),
  toggleSnapping: () => set({ snapping: !get().snapping }),
  select: (ids, mode = 'replace') => {
    if (mode === 'replace') return set({ selection: [...new Set(ids)] });
    const cur = new Set(get().selection);
    // ⇧: hinzufügen; sind alle schon gewählt, abwählen
    if (ids.length && ids.every((id) => cur.has(id))) for (const id of ids) cur.delete(id);
    else for (const id of ids) cur.add(id);
    set({ selection: [...cur] });
  },
  clearSelection: () => (get().selection.length ? set({ selection: [] }) : undefined),
  setTarget: (kind, id) => set({ targets: { ...get().targets, [kind]: id } }),
  setZoom: (pxPerSec, scroll) =>
    set({ pxPerSec: Math.min(MAX_PX_PER_SEC, Math.max(MIN_PX_PER_SEC, pxPerSec)), ...(scroll !== undefined ? { scroll: Math.max(0, scroll) } : {}) }),
  setScroll: (scroll) => set({ scroll: Math.max(0, scroll) }),
  setTimelineWidth: (timelineWidth) => (timelineWidth !== get().timelineWidth ? set({ timelineWidth }) : undefined),
  setActiveMonitor: (activeMonitor) => (activeMonitor !== get().activeMonitor ? set({ activeMonitor }) : undefined),
  setSourceMarks: (sourceMarks) => set({ sourceMarks }),
  setInspectorTab: (inspectorTab) => set({ inspectorTab, colorBypass: inspectorTab === 'farbe' ? get().colorBypass : false }),
  setColorBypass: (colorBypass) => set({ colorBypass }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  focusPanel: (panel) => {
    const tab = TAB_FOR_PANEL[panel];
    set({ focusRequest: { panel, n: (get().focusRequest?.n ?? 0) + 1 }, ...(tab ? { inspectorTab: tab } : {}) });
  },
  showNotice: (notice) => set({ notice }),
  reset: () => set(initial()),
}));

/** Nur für Tests. */
export function resetWerkstattForTests(): void {
  useWerkstatt.getState().reset();
}
