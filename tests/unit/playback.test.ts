import { describe, expect, it } from 'vitest';
import { formatTimecode } from '../../src/features/werkstatt/timecode';
import { nextRate } from '../../src/features/werkstatt/playback';
import { Pool } from '../../src/features/werkstatt/pool';
import { lumaScopes } from '../../src/features/werkstatt/scopesMath';

describe('formatTimecode', () => {
  it('HH:MM:SS:FF', () => {
    expect(formatTimecode(0, 25)).toBe('00:00:00:00');
    expect(formatTimecode(26, 25)).toBe('00:00:01:01');
    expect(formatTimecode(25 * 3661 + 7, 25)).toBe('01:01:01:07');
    expect(formatTimecode(-3, 25)).toBe('00:00:00:00');
  });
  it('nominale Bildrate bei 29,97', () => {
    expect(formatTimecode(30, 30000 / 1001)).toBe('00:00:01:00');
  });
});

describe('nextRate (J/K/L)', () => {
  it('L: 1, 2, 4, 8, bleibt bei 8', () => {
    let r = 0;
    const seen: number[] = [];
    for (let i = 0; i < 5; i++) seen.push((r = nextRate(r, 1)));
    expect(seen).toEqual([1, 2, 4, 8, 8]);
  });
  it('J: −1 … −8; Richtungswechsel beginnt neu bei ±1', () => {
    expect(nextRate(0, -1)).toBe(-1);
    expect(nextRate(-4, -1)).toBe(-8);
    expect(nextRate(4, -1)).toBe(-1);
    expect(nextRate(-2, 1)).toBe(1);
  });
});

describe('lumaScopes', () => {
  it('Histogramm und Waveform einer Fläche mit Luma 255 und 0', () => {
    const w = 2, h = 2;
    const px = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255]);
    const s = lumaScopes(px, w, h);
    expect(s.histogram[255]).toBe(2);
    expect(s.histogram[0]).toBe(2);
    expect(s.columns[0 * 256 + 255]).toBe(2);
    expect(s.columns[1 * 256 + 0]).toBe(2);
    expect(s.maxColumn).toBe(2);
  });
  it('Rec.709: reines Grün ≈ 182', () => {
    const s = lumaScopes(new Uint8ClampedArray([0, 255, 0, 255]), 1, 1);
    expect(s.histogram[Math.round(0.7152 * 255)]).toBe(1);
  });
});

describe('MockBackend.mediaUrl', () => {
  it('lässt /fixtures/-Pfade unverändert', async () => {
    const { MockBackend } = await import('../../src/backend/MockBackend');
    expect(new MockBackend().mediaUrl('/fixtures/e2e-clip.webm')).toBe('/fixtures/e2e-clip.webm');
  });
});

describe('Pool (Elemente freigeben und aufräumen)', () => {
  type Fake = { id: number; released: boolean };
  const make = () => {
    let n = 0;
    return new Pool<Fake>(() => ({ id: ++n, released: false }), (f) => { f.released = true; });
  };
  it('liefert denselben Eintrag solange die URL gleich bleibt', () => {
    const p = make();
    expect(p.get('k', 'u1', 0)).toBe(p.get('k', 'u1', 1));
  });
  it('gibt den alten Eintrag frei, wenn sich die URL ändert (Proxy wird verfügbar)', () => {
    const p = make();
    const old = p.get('k', 'orig', 0);
    const neu = p.get('k', 'proxy', 1);
    expect(neu).not.toBe(old);
    expect(old.released).toBe(true);
    expect(neu.released).toBe(false);
  });
  it('prune: entfernt nicht mehr lebende und länger als 30 s ungenutzte Einträge, gibt sie frei', () => {
    const p = make();
    const a = p.get('a', 'u', 0);
    const b = p.get('b', 'u', 0);
    const c = p.get('c', 'u', 0);
    p.get('c', 'u', 40_000); // c zuletzt benutzt
    const removed = p.prune((k) => k !== 'a', 41_000, 30_000);
    expect(removed.sort()).toEqual(['a', 'b']);
    expect(a.released && b.released).toBe(true);
    expect(c.released).toBe(false);
    expect([...p.keys()]).toEqual(['c']);
  });
  it('clear gibt alles frei', () => {
    const p = make();
    const a = p.get('a', 'u', 0);
    p.clear();
    expect(a.released).toBe(true);
    expect(p.size).toBe(0);
  });
});
