import { beforeEach, describe, expect, it } from 'vitest';
import { resetWerkstattForTests, useWerkstatt } from '../../src/features/werkstatt/uiStore';

const ui = () => useWerkstatt.getState();
beforeEach(() => resetWerkstattForTests());

describe('Werkstatt-Bedienzustand', () => {
  it('focusPanel springt zu den Bereichen des Chefs (tool.panel)', () => {
    ui().focusPanel('farbe');
    expect(ui().inspectorTab).toBe('farbe');
    expect(ui().focusRequest).toEqual({ panel: 'farbe', n: 1 });
    ui().focusPanel('audio');
    expect(ui().inspectorTab).toBe('clip');
    ui().focusPanel('export');
    expect(ui().inspectorTab).toBe('sequenz');
    ui().focusPanel('timeline');
    expect(ui().inspectorTab).toBe('sequenz'); // Timeline/Medien: kein Reiterwechsel, nur Fokus
    ui().focusPanel('timeline');
    expect(ui().focusRequest).toEqual({ panel: 'timeline', n: 5 });
  });

  it('Auswahl: ersetzen, mit ⇧ hinzufügen, erneut ⇧ wählt ab', () => {
    ui().select(['a', 'b']);
    expect(ui().selection).toEqual(['a', 'b']);
    ui().select(['c'], 'add');
    expect(ui().selection).toEqual(['a', 'b', 'c']);
    ui().select(['a', 'b'], 'add');
    expect(ui().selection).toEqual(['c']);
    ui().clearSelection();
    expect(ui().selection).toEqual([]);
  });

  it('Zoom bleibt in Grenzen, Verschiebung nie negativ; Vorher/Nachher endet beim Reiterwechsel', () => {
    ui().setZoom(1e9, -5);
    expect(ui().pxPerSec).toBeLessThanOrEqual(2000);
    expect(ui().scroll).toBe(0);
    ui().setInspectorTab('farbe');
    ui().setColorBypass(true);
    ui().setInspectorTab('clip');
    expect(ui().colorBypass).toBe(false);
  });
});

describe('Projektwechsel', () => {
  it('resetForProject behält Werkzeug, Einrasten und ein offenes Sprungziel', () => {
    ui().setTool('razor');
    ui().select(['x']);
    ui().focusPanel('farbe');
    ui().resetForProject();
    expect(ui().tool).toBe('razor');
    expect(ui().selection).toEqual([]);
    expect(ui().focusRequest?.panel).toBe('farbe');
    expect(ui().inspectorTab).toBe('farbe');
    ui().clearFocusRequest();
    expect(ui().focusRequest).toBeNull();
  });
});
