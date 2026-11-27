import { describe, expect, it } from 'vitest';
import { newSequence } from '../../src/domain/timeline/sequence';
import type { Clip, ColorParams, MediaItem, Sequence, TitleParams } from '../../src/domain/timeline/types';
import { resolveFrame } from '../../src/domain/timeline/resolve';
import { transitionOverhangs } from '../../src/domain/timeline/transitions';
import { assignSlots } from '../../src/features/werkstatt/pool';
import { lutData } from '../../src/domain/render/lut';
import { applyColor } from '../../src/domain/render/color';

const NEUTRAL: ColorParams = { exposure: 0, contrast: 0, highlights: 0, shadows: 0, temperature: 0, tint: 0, saturation: 0 };
const TITLE: TitleParams = {
  style: 'bauchbinde', line1: 'A', line2: 'B', font: 'Helvetica Neue', size: 36, color: '#fff', x: 0.08, y: 0.78, fadeIn: 10, fadeOut: 10,
};
const mkMedia = (id: string, o: Partial<MediaItem> = {}): MediaItem => ({
  kind: 'video', durationSec: 10, width: 1280, height: 720, fps: 25, hasAudio: true, hdr: false, videoCodec: 'vp9', audioCodec: 'opus',
  rotation: 0, id, name: id, path: `/fixtures/${id}.webm`, proxyPath: null, shotSize: null, ...o,
});
const mkClip = (id: string, trackId: string, start: number, duration: number, o: Partial<Clip> = {}): Clip => ({
  id, trackId, kind: 'media', mediaId: 'm', start, duration, sourceIn: 2, linkId: null, gainDb: 0, fadeIn: 0, fadeOut: 0, color: null, title: null, ...o,
});
const seqOf = (clips: Clip[], o: Partial<Sequence> = {}): Sequence => ({
  ...newSequence({ width: 1280, height: 720, fps: 25, name: 't' }, () => 's'), clips, ...o,
});
const MEDIA = [mkMedia('m')];
const dissolve = { id: 'x', trackId: 'V1', leftClipId: 'a', rightClipId: 'b', duration: 10, kind: 'dissolve' as const };

describe('resolveFrame – Bild', () => {
  it('ein Clip: Quellzeit = sourceIn + Abstand zum Start', () => {
    const s = seqOf([mkClip('a', 'V1', 10, 50, { sourceIn: 2 })]);
    const r = resolveFrame(s, MEDIA, 35);
    expect(r.layers).toEqual([{ clipId: 'a', mediaId: 'm', sourceTime: 3, alpha: 1, lutKey: 'none' }]);
    expect(resolveFrame(s, MEDIA, 9).layers).toEqual([]);
    expect(resolveFrame(s, MEDIA, 60).layers).toEqual([]);
  });

  it('Überblendung 10 Bilder auf dem Schnitt bei 50: Bild 50 zeigt beide Ebenen, rechte mit alpha 0,5', () => {
    const s = seqOf([mkClip('a', 'V1', 0, 50), mkClip('b', 'V1', 50, 50)], { transitions: [dissolve] });
    const r = resolveFrame(s, MEDIA, 50);
    expect(r.layers.map((l) => l.clipId)).toEqual(['a', 'b']);
    expect(r.layers[0].alpha).toBe(1);
    expect(r.layers[1].alpha).toBeCloseTo(0.5);
    // Quellzeiten laufen über den Schnitt hinaus weiter
    expect(r.layers[0].sourceTime).toBeCloseTo(2 + 50 / 25);
    expect(r.layers[1].sourceTime).toBeCloseTo(2);
  });

  it('Überblendung entspricht dem Exportfenster: linear von Bild 45 (0) bis Bild 55 (1)', () => {
    const s = seqOf([mkClip('a', 'V1', 0, 50), mkClip('b', 'V1', 50, 50)], { transitions: [dissolve] });
    const alphaB = (f: number) => resolveFrame(s, MEDIA, f).layers.find((l) => l.clipId === 'b')?.alpha;
    expect(resolveFrame(s, MEDIA, 44).layers.map((l) => l.clipId)).toEqual(['a']);
    expect(alphaB(45)).toBeCloseTo(0);
    expect(alphaB(47)).toBeCloseTo(0.2);
    expect(alphaB(50)).toBeCloseTo(0.5);
    expect(alphaB(54)).toBeCloseTo(0.9);
    expect(alphaB(55)).toBe(1);
    expect(resolveFrame(s, MEDIA, 55).layers.map((l) => l.clipId)).toEqual(['b']);
    // rechter Clip beginnt in der Quelle 5 Bilder früher: sourceIn − 0,2 s
    expect(resolveFrame(s, MEDIA, 45).layers.find((l) => l.clipId === 'b')?.sourceTime).toBeCloseTo(2 - 0.2);
  });

  it('Überstand ist durch die Quelle begrenzt (kein Material vor sourceIn 0)', () => {
    const s = seqOf([mkClip('a', 'V1', 0, 50), mkClip('b', 'V1', 50, 50, { sourceIn: 0 })], { transitions: [dissolve] });
    // links 5 Bilder Überstand, rechts 0: Fenster 50…55, Länge 5
    expect(resolveFrame(s, MEDIA, 49).layers.map((l) => l.clipId)).toEqual(['a']);
    expect(resolveFrame(s, MEDIA, 50).layers.find((l) => l.clipId === 'b')?.alpha).toBeCloseTo(0);
    expect(resolveFrame(s, MEDIA, 52).layers.find((l) => l.clipId === 'b')?.alpha).toBeCloseTo(0.4);
    expect(resolveFrame(s, MEDIA, 55).layers.map((l) => l.clipId)).toEqual(['b']);
  });

  it('oberste Spur (V2) liegt über V1', () => {
    const s = seqOf([mkClip('lo', 'V1', 0, 50), mkClip('hi', 'V2', 0, 50)]);
    expect(resolveFrame(s, MEDIA, 10).layers.map((l) => l.clipId)).toEqual(['lo', 'hi']);
  });

  it('lutKey: „none“ ohne Farbe, sonst stabil und von den Werten abhängig', () => {
    const c1 = mkClip('a', 'V1', 0, 50, { color: { ...NEUTRAL, exposure: 0.5 } });
    const c2 = mkClip('b', 'V1', 0, 50, { color: { ...NEUTRAL, exposure: 0.5 } });
    const c3 = mkClip('c', 'V1', 0, 50, { color: { ...NEUTRAL, exposure: 0.6 } });
    const key = (c: Clip) => resolveFrame(seqOf([c]), MEDIA, 5).layers[0].lutKey;
    expect(key(c1)).toBe(key(c2));
    expect(key(c1)).not.toBe(key(c3));
    expect(key(c1)).not.toBe('none');
  });

  it('Bilder und Titel verschwinden bei Medien ohne Eintrag nicht fehlerhaft', () => {
    const s = seqOf([mkClip('a', 'V1', 0, 50, { mediaId: 'fehlt' })]);
    expect(resolveFrame(s, MEDIA, 5).layers).toEqual([]);
  });
});

describe('resolveFrame – Titel', () => {
  const tclip = (o: Partial<Clip> = {}) => mkClip('t', 'V2', 20, 50, { kind: 'title', mediaId: undefined, title: TITLE, ...o });
  it('Ein-/Ausblenden linear, dazwischen 1', () => {
    const s = seqOf([tclip()]);
    const a = (f: number) => resolveFrame(s, MEDIA, f).titles[0]?.alpha;
    expect(resolveFrame(s, MEDIA, 19).titles).toEqual([]);
    expect(a(20)).toBeCloseTo(0);
    expect(a(25)).toBeCloseTo(0.5);
    expect(a(30)).toBe(1);
    expect(a(45)).toBe(1);
    expect(a(65)).toBeCloseTo(0.5);
    expect(a(69)).toBeCloseTo(0.1);
    expect(resolveFrame(s, MEDIA, 70).titles).toEqual([]);
    expect(resolveFrame(s, MEDIA, 25).titles[0].clipId).toBe('t');
  });
  it('ohne Überblendzeiten sofort voll sichtbar', () => {
    const s = seqOf([tclip({ title: { ...TITLE, fadeIn: 0, fadeOut: 0 } })]);
    expect(resolveFrame(s, MEDIA, 20).titles[0].alpha).toBe(1);
    expect(resolveFrame(s, MEDIA, 69).titles[0].alpha).toBe(1);
  });
  it('Titel erscheinen nicht als Bildebene', () => {
    expect(resolveFrame(seqOf([tclip()]), MEDIA, 30).layers).toEqual([]);
  });
});

describe('resolveFrame – Ton', () => {
  it('Gain: 10^(dB/20)', () => {
    const s = seqOf([mkClip('a', 'A1', 0, 50, { gainDb: -6 })]);
    const g = resolveFrame(s, MEDIA, 10).audio;
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ clipId: 'a', mediaId: 'm' });
    expect(g[0].gain).toBeCloseTo(10 ** (-6 / 20));
    expect(g[0].sourceTime).toBeCloseTo(2 + 10 / 25);
  });
  it('fadeIn 10: bei Bild 5 etwa 0,5 × Gain', () => {
    const s = seqOf([mkClip('a', 'A1', 0, 50, { gainDb: -3, fadeIn: 10 })]);
    expect(resolveFrame(s, MEDIA, 5).audio[0].gain).toBeCloseTo(0.5 * 10 ** (-3 / 20));
    expect(resolveFrame(s, MEDIA, 10).audio[0].gain).toBeCloseTo(10 ** (-3 / 20));
  });
  it('fadeOut: linear zum Ende hin', () => {
    const s = seqOf([mkClip('a', 'A1', 0, 50, { fadeOut: 10 })]);
    expect(resolveFrame(s, MEDIA, 40).audio[0].gain).toBeCloseTo(1);
    expect(resolveFrame(s, MEDIA, 45).audio[0].gain).toBeCloseTo(0.5);
  });
  it('audioFade: beide Clips überlappen, Pegel kreuzen sich linear (Summe 1)', () => {
    const s = seqOf([mkClip('a', 'A1', 0, 50), mkClip('b', 'A1', 50, 50)], {
      transitions: [{ id: 'y', trackId: 'A1', leftClipId: 'a', rightClipId: 'b', duration: 10, kind: 'audioFade' }],
    });
    const at = (f: number) => Object.fromEntries(resolveFrame(s, MEDIA, f).audio.map((x) => [x.clipId, x.gain]));
    expect(at(44)).toEqual({ a: 1 });
    const mid = at(50);
    expect(mid.a).toBeCloseTo(0.5);
    expect(mid.b).toBeCloseTo(0.5);
    const q = at(47);
    expect(q.a + q.b).toBeCloseTo(1);
    expect(q.b).toBeCloseTo(0.2);
    expect(at(55)).toEqual({ b: 1 });
  });
  it('stumme Spur liefert nichts; Medium ohne Ton und Bild-Medien auch nicht', () => {
    const s = seqOf([mkClip('a', 'A1', 0, 50), mkClip('b', 'A2', 0, 50)]);
    s.tracks.find((t) => t.id === 'A1')!.muted = true;
    expect(resolveFrame(s, MEDIA, 10).audio.map((x) => x.clipId)).toEqual(['b']);
    const stumm = [mkMedia('m', { hasAudio: false })];
    expect(resolveFrame(s, stumm, 10).audio).toEqual([]);
  });
  it('Videoclips auf V1 liefern keinen Ton', () => {
    expect(resolveFrame(seqOf([mkClip('a', 'V1', 0, 50)]), MEDIA, 10).audio).toEqual([]);
  });
});

describe('resolveFrame – Überblendungen wirken als Produkt (ffmpeg verkettet fade/afade)', () => {
  it('Titel: sich überlappende Ein-/Ausblendung multipliziert', () => {
    const s = seqOf([mkClip('t', 'V2', 0, 10, { kind: 'title', mediaId: undefined, title: { ...TITLE, fadeIn: 10, fadeOut: 10 } })]);
    expect(resolveFrame(s, MEDIA, 5).titles[0].alpha).toBeCloseTo(0.25);
    expect(resolveFrame(s, MEDIA, 2).titles[0].alpha).toBeCloseTo(0.2 * 0.8);
  });
  it('Ton: kurzer Clip mit fadeIn + fadeOut über die ganze Länge', () => {
    const s = seqOf([mkClip('a', 'A1', 0, 10, { fadeIn: 10, fadeOut: 10 })]);
    expect(resolveFrame(s, MEDIA, 5).audio[0].gain).toBeCloseTo(0.25);
  });
  it('Ton: Clip-Einblendung innerhalb einer Tonblende (Kreuzblende) multipliziert', () => {
    const s = seqOf([mkClip('a', 'A1', 0, 50), mkClip('b', 'A1', 50, 50, { fadeIn: 10 })], {
      transitions: [{ id: 'y', trackId: 'A1', leftClipId: 'a', rightClipId: 'b', duration: 10, kind: 'audioFade' }],
    });
    const b = resolveFrame(s, MEDIA, 52).audio.find((x) => x.clipId === 'b')!;
    expect(b.gain).toBeCloseTo(0.2 * 0.7);
  });
});

describe('resolveFrame – stumme Videospuren', () => {
  it('Clips und Titel auf stummer Videospur sind unsichtbar', () => {
    const s = seqOf([
      mkClip('lo', 'V1', 0, 50),
      mkClip('hi', 'V2', 0, 50),
      mkClip('t', 'V2', 0, 50, { kind: 'title', mediaId: undefined, title: TITLE }),
    ]);
    s.tracks.find((t) => t.id === 'V2')!.muted = true;
    const r = resolveFrame(s, MEDIA, 20);
    expect(r.layers.map((l) => l.clipId)).toEqual(['lo']);
    expect(r.titles).toEqual([]);
  });
});

describe('assignSlots (gleiches Medium gleichzeitig sichtbar)', () => {
  const L = (clipId: string, mediaId = 'm') => ({ clipId, mediaId });
  it('zwei Clips desselben Mediums bekommen verschiedene Plätze', () => {
    const s = seqOf([mkClip('a', 'V1', 0, 50), mkClip('b', 'V1', 50, 50)], { transitions: [dissolve] });
    const layers = resolveFrame(s, MEDIA, 50).layers;
    expect(layers.map((l) => l.mediaId)).toEqual(['m', 'm']);
    const slots = assignSlots(layers, new Map());
    expect(slots.get('a')).not.toBe(slots.get('b'));
  });
  it('bleibt danach stabil und vergibt Plätze neu, wenn frei', () => {
    const first = assignSlots([L('a'), L('b')], new Map());
    const prev = new Map([...first].map(([id, slot]) => [id, { mediaId: 'm', slot }]));
    const after = assignSlots([L('b')], prev);
    expect(after.get('b')).toBe(first.get('b'));
    expect(assignSlots([L('x', 'n'), L('y', 'm')], new Map()).get('y')).toBe(0);
  });
  it('mehr als zwei gleichzeitig: teilt sich den letzten Platz', () => {
    const slots = assignSlots([L('a'), L('b'), L('c')], new Map());
    expect([...slots.values()].every((v) => v === 0 || v === 1)).toBe(true);
  });
});

describe('transitionOverhangs (gemeinsam für Vorschau und Export)', () => {
  it('mittig, durch die Quelle begrenzt', () => {
    const s = seqOf([mkClip('a', 'V1', 0, 50), mkClip('b', 'V1', 50, 50, { sourceIn: 0.1 })], { transitions: [dissolve] });
    const e = transitionOverhangs(s, 'dissolve', new Map(MEDIA.map((m) => [m.id, m])));
    expect(e.get('a')).toMatchObject({ head: 0, tail: 0.2 });
    expect(e.get('b')!.head).toBeCloseTo(0.1);
    expect(e.get('b')!.fadeIn).toBeCloseTo(0.3);
    expect(transitionOverhangs(s, 'audioFade', new Map()).size).toBe(0);
  });
});

describe('lutData', () => {
  it('neutral: Identität (RGBA8, R läuft am schnellsten)', () => {
    const n = 5;
    const d = lutData(NEUTRAL, n);
    expect(d).toBeInstanceOf(Uint8Array);
    expect(d.length).toBe(n * n * n * 4);
    for (const [r, g, b] of [[0, 0, 0], [4, 0, 0], [0, 3, 0], [1, 2, 4], [4, 4, 4]]) {
      const i = ((b * n + g) * n + r) * 4;
      expect([d[i], d[i + 1], d[i + 2], d[i + 3]]).toEqual([
        Math.round((r / 4) * 255), Math.round((g / 4) * 255), Math.round((b / 4) * 255), 255,
      ]);
    }
  });
  it('Standardgröße 33; Werte folgen applyColor', () => {
    const p = { ...NEUTRAL, exposure: 0.5, saturation: 30 };
    const d = lutData(p);
    expect(d.length).toBe(33 * 33 * 33 * 4);
    const i = ((10 * 33 + 20) * 33 + 5) * 4;
    const [x, y, z] = applyColor(p, [5 / 32, 20 / 32, 10 / 32]);
    expect([d[i], d[i + 1], d[i + 2]]).toEqual([Math.round(x * 255), Math.round(y * 255), Math.round(z * 255)]);
  });
});
