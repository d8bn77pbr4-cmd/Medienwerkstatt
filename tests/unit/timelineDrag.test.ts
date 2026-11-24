import { describe, expect, it } from 'vitest';
import { newSequence } from '../../src/domain/timeline/sequence';
import type { Clip, Sequence } from '../../src/domain/timeline/types';
import { moveSnap, rollSnap, trimSnap } from '../../src/features/werkstatt/timelineDrag';

const clip = (id: string, trackId: string, start: number, duration: number, o: Partial<Clip> = {}): Clip => ({
  id, trackId, kind: 'media', mediaId: 'm', start, duration, sourceIn: 0, linkId: null, gainDb: 0, fadeIn: 0, fadeOut: 0, color: null, title: null, ...o,
});
const seqWith = (clips: Clip[]): Sequence => ({ ...newSequence({ width: 1920, height: 1080, fps: 25, name: 't' }, () => 's'), clips });
const FAR = 1000; // Abspielkopf weit weg
const THR = 2.5; // 8 px bei 3,2 px je Bild

// V1 a 0–50 ↔ A1 x 0–50 (verknüpft), V1 b 50–100 ↔ A1 y 50–100 (verknüpft)
const s = seqWith([
  clip('a', 'V1', 0, 50, { linkId: 'L1' }),
  clip('x', 'A1', 0, 50, { linkId: 'L1' }),
  clip('b', 'V1', 50, 50, { linkId: 'L2' }),
  clip('y', 'A1', 50, 50, { linkId: 'L2' }),
]);
const solo = seqWith([clip('a', 'V1', 0, 50, { linkId: 'L1' }), clip('x', 'A1', 0, 50, { linkId: 'L1' })]);

describe('Einrasten beim Trimmen', () => {
  it('verknüpfter Partner bewegt sich mit: seine alte Kante ist kein Ziel (2 Bilder bleiben 2)', () => {
    expect(trimSnap(solo, { clipId: 'a', edge: 'out', mode: 'normal', ignoreLinks: false }, 2, FAR, THR)).toEqual({ delta: 2, at: null });
    expect(trimSnap(solo, { clipId: 'a', edge: 'out', mode: 'normal', ignoreLinks: false }, -1, FAR, THR)).toEqual({ delta: -1, at: null });
  });
  it('mit ⌥ (ohne Verknüpfung) ist die Kante des Partners ein gültiges Ziel', () => {
    expect(trimSnap(solo, { clipId: 'a', edge: 'out', mode: 'normal', ignoreLinks: true }, 2, FAR, THR)).toEqual({ delta: 0, at: 50 });
  });
  it('Ripple: alles dahinter rückt nach, dessen Kanten sind keine Ziele', () => {
    const t = seqWith([clip('a', 'V1', 0, 50), clip('c', 'V2', 52, 10)]);
    // ohne Ripple rastet das Ende von a (50 → 51) auf c (52) ein …
    expect(trimSnap(t, { clipId: 'a', edge: 'out', mode: 'normal', ignoreLinks: false }, 1, FAR, THR)).toEqual({ delta: 2, at: 52 });
    // … mit Ripple wandert c mit und ist kein Ziel
    expect(trimSnap(t, { clipId: 'a', edge: 'out', mode: 'ripple', ignoreLinks: false }, 1, FAR, THR)).toEqual({ delta: 1, at: null });
  });
  it('Abspielkopf bleibt Ziel', () => {
    expect(trimSnap(solo, { clipId: 'a', edge: 'out', mode: 'normal', ignoreLinks: false }, 2, 53, THR)).toEqual({ delta: 3, at: 53 });
  });
});

describe('Einrasten beim Rollen', () => {
  it('Partnerschnitt rollt mit und ist kein Ziel', () => {
    expect(rollSnap(s, { leftId: 'a', rightId: 'b', cut: 50, ignoreLinks: false }, 2, FAR, THR)).toEqual({ delta: 2, at: null });
  });
  it('mit ⌥ rollt nur die eine Spur: der Partnerschnitt ist ein Ziel', () => {
    expect(rollSnap(s, { leftId: 'x', rightId: 'y', cut: 50, ignoreLinks: true }, 2, FAR, THR)).toEqual({ delta: 0, at: 50 });
  });
});

describe('Einrasten beim Verschieben', () => {
  it('die ganze bewegte Gruppe (samt Partnern) ist ausgenommen', () => {
    const m = seqWith([clip('a', 'V1', 20, 50, { linkId: 'L1' }), clip('x', 'A1', 20, 50, { linkId: 'L1' }), clip('z', 'V2', 200, 10)]);
    expect(moveSnap(m, { ids: ['a'], primaryId: 'a', ignoreLinks: false }, 2, FAR, THR)).toEqual({ delta: 2, at: null });
    expect(moveSnap(m, { ids: ['a'], primaryId: 'a', ignoreLinks: true }, 2, FAR, THR)).toEqual({ delta: 0, at: 20 });
  });
});
