import { describe, expect, it } from 'vitest';
import { newSequence } from '../../src/domain/timeline/sequence';
import type { Clip, Sequence } from '../../src/domain/timeline/types';
import {
  DEFAULT_PX_PER_SEC,
  EDGE_PX,
  ROW_H,
  RULER_H,
  editPointNear,
  fitZoom,
  frameToX,
  hitTest,
  layoutRows,
  rowAtY,
  rulerStep,
  snapDelta,
  snapThreshold,
  viewOf,
  xToFrame,
  zoomAround,
} from '../../src/features/werkstatt/timelineCanvas';

const clip = (id: string, trackId: string, start: number, duration: number, o: Partial<Clip> = {}): Clip => ({
  id, trackId, kind: 'media', mediaId: 'm', start, duration, sourceIn: 0, linkId: null, gainDb: 0, fadeIn: 0, fadeOut: 0, color: null, title: null, ...o,
});
const seqWith = (clips: Clip[]): Sequence => ({ ...newSequence({ width: 1920, height: 1080, fps: 25, name: 't' }, () => 's'), clips });

describe('Zeilen (Spuren V2, V1, A1–A4 von oben nach unten)', () => {
  const rows = layoutRows(seqWith([]).tracks);
  it('Reihenfolge und Höhen', () => {
    expect(rows.map((r) => r.name)).toEqual(['V2', 'V1', 'A1', 'A2', 'A3', 'A4']);
    expect(rows[0].y).toBe(RULER_H);
    expect(rows[1].y).toBe(RULER_H + ROW_H.video);
    expect(rows[2].y).toBe(RULER_H + 2 * ROW_H.video);
    expect(rows[2].h).toBe(ROW_H.audio);
  });
  it('rowAtY', () => {
    expect(rowAtY(rows, RULER_H - 1)).toBeNull();
    expect(rowAtY(rows, RULER_H + 1)?.name).toBe('V2');
    expect(rowAtY(rows, RULER_H + ROW_H.video + 5)?.name).toBe('V1');
    expect(rowAtY(rows, RULER_H + 2 * ROW_H.video + ROW_H.audio + 1)?.name).toBe('A2');
    expect(rowAtY(rows, 10_000)).toBeNull();
  });
});

describe('Bild ↔ x', () => {
  it('Standard-Zoom 80 px/s, Verschiebung in Bildern', () => {
    const v = viewOf(DEFAULT_PX_PER_SEC, 25, 0);
    expect(v.pxPerFrame).toBeCloseTo(3.2);
    expect(frameToX(50, v)).toBeCloseTo(160);
    expect(xToFrame(160, v)).toBeCloseTo(50);
    const scrolled = viewOf(DEFAULT_PX_PER_SEC, 25, 25);
    expect(frameToX(25, scrolled)).toBe(0);
    expect(xToFrame(0, scrolled)).toBe(25);
  });
  it('fitZoom zeigt die ganze Sequenz, zoomAround hält das Bild unter dem Zeiger', () => {
    const z = fitZoom(250, 25, 1000);
    expect(frameToX(250, viewOf(z, 25, 0))).toBeLessThanOrEqual(1000);
    expect(frameToX(250, viewOf(z, 25, 0))).toBeGreaterThan(900);
    const v = viewOf(80, 25, 10);
    const under = xToFrame(300, v);
    const next = zoomAround(80, 10, 2, 300, 25);
    expect(xToFrame(300, viewOf(next.pxPerSec, 25, next.scroll))).toBeCloseTo(under);
    expect(next.pxPerSec).toBe(160);
    expect(fitZoom(0, 25, 1000)).toBe(DEFAULT_PX_PER_SEC);
  });
  it('rulerStep: Beschriftung mindestens ~80 px auseinander', () => {
    expect(rulerStep(3.2, 25)).toBe(25); // 80 px je Sekunde
    expect(rulerStep(0.32, 25)).toBe(250);
    expect(rulerStep(40, 25)).toBeLessThan(25);
    for (const ppf of [0.05, 0.5, 3, 20, 80]) expect(rulerStep(ppf, 25) * ppf).toBeGreaterThanOrEqual(70);
  });
});

describe('hitTest', () => {
  const s = seqWith([clip('a', 'V1', 0, 50), clip('b', 'V1', 50, 50), clip('x', 'A1', 0, 100)]);
  const rows = layoutRows(s.tracks);
  const v = viewOf(DEFAULT_PX_PER_SEC, 25, 0); // 3,2 px je Bild
  const yV1 = RULER_H + ROW_H.video + 10;
  const yA1 = RULER_H + 2 * ROW_H.video + 10;

  it('Lineal', () => {
    expect(hitTest(s, rows, v, 160, 5)).toEqual({ area: 'ruler', frame: 50 });
  });
  it('Clip-Körper und Ränder; am Schnitt links = Ende von a, rechts = Anfang von b', () => {
    expect(hitTest(s, rows, v, 80, yV1)).toMatchObject({ area: 'clip', clipId: 'a', zone: 'body', trackId: 'V1' });
    expect(hitTest(s, rows, v, 158, yV1)).toMatchObject({ area: 'clip', clipId: 'a', zone: 'out' });
    expect(hitTest(s, rows, v, 162, yV1)).toMatchObject({ area: 'clip', clipId: 'b', zone: 'in' });
    expect(hitTest(s, rows, v, 2, yV1)).toMatchObject({ area: 'clip', clipId: 'a', zone: 'in' });
    expect(hitTest(s, rows, v, 200, yA1)).toMatchObject({ area: 'clip', clipId: 'x', zone: 'body', trackId: 'A1' });
  });
  it('leere Spur und außerhalb', () => {
    expect(hitTest(s, rows, v, 500, yV1)).toMatchObject({ area: 'track', trackId: 'V1' });
    expect(hitTest(s, rows, v, 80, RULER_H + 5)).toMatchObject({ area: 'track', trackId: 'V2' });
    expect(hitTest(s, rows, v, 80, 10_000)).toEqual({ area: 'none' });
  });
  it('kurze Clips behalten einen Körper (Rand höchstens ein Drittel)', () => {
    const tiny = seqWith([clip('t', 'V1', 100, 3)]); // 9,6 px breit
    const h = hitTest(tiny, rows, v, frameToX(101.5, v), yV1);
    expect(h).toMatchObject({ clipId: 't', zone: 'body' });
    expect(EDGE_PX).toBeGreaterThan(3);
  });
  it('Überblendung ist anklickbar; direkt am Schnitt bleibt der Trimm-Griff', () => {
    const t = { ...s, transitions: [{ id: 'tr', trackId: 'V1', leftClipId: 'a', rightClipId: 'b', duration: 20, kind: 'dissolve' as const }] };
    // Überblendung 40–60 → x 128–192, Schnitt bei x 160
    expect(hitTest(t, rows, v, 140, yV1)).toEqual({ area: 'transition', transitionId: 'tr', trackId: 'V1' });
    expect(hitTest(t, rows, v, 185, yV1)).toEqual({ area: 'transition', transitionId: 'tr', trackId: 'V1' });
    expect(hitTest(t, rows, v, 158, yV1)).toMatchObject({ area: 'clip', clipId: 'a', zone: 'out' });
    expect(hitTest(t, rows, v, 120, yV1)).toMatchObject({ area: 'clip', clipId: 'a', zone: 'body' });
  });
  it('editPointNear findet den Schnitt zwischen zwei Clips (Rollen)', () => {
    expect(editPointNear(s, 'V1', 158, v)).toEqual({ leftId: 'a', rightId: 'b', frame: 50 });
    expect(editPointNear(s, 'V1', 100, v)).toBeNull();
    expect(editPointNear(s, 'A1', 158, v)).toBeNull();
  });
});

describe('Einrasten', () => {
  it('snapDelta rastet die nächste Kante ein und meldet das Ziel', () => {
    // Clip 10–40 wird um +18 gezogen → Anfang 28, Ende 58; Ziel 60 liegt 2 Bilder neben dem Ende
    expect(snapDelta([10, 40], 18, [0, 60, 100], 3)).toEqual({ delta: 20, at: 60 });
    expect(snapDelta([10, 40], 18, [0, 100], 3)).toEqual({ delta: 18, at: null });
    expect(snapDelta([10, 40], -9, [0, 100], 3)).toEqual({ delta: -10, at: 0 });
  });
  it('Schwelle 8 px in Bildern', () => {
    expect(snapThreshold(viewOf(80, 25, 0))).toBeCloseTo(2.5);
    expect(snapThreshold(viewOf(800, 25, 0))).toBeCloseTo(0.25);
  });
});
