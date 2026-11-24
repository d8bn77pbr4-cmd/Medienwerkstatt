import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { newSequence } from '../../src/domain/timeline/sequence';
import type { Clip, ColorParams, ExportPresetId, MediaItem, Sequence, TitleParams } from '../../src/domain/timeline/types';
import { applyColor } from '../../src/domain/render/color';
import { buildCubeLut } from '../../src/domain/render/lut';
import { renderTitle, type TitleCtx } from '../../src/domain/render/titles';
import { buildExport, escapeFilterPath } from '../../src/domain/render/filtergraph';
import { EXPORT_PRESETS, getPreset } from '../../src/domain/render/presets';

const NEUTRAL: ColorParams = { exposure: 0, contrast: 0, highlights: 0, shadows: 0, temperature: 0, tint: 0, saturation: 0 };
const color = (o: Partial<ColorParams>): ColorParams => ({ ...NEUTRAL, ...o });
const near = (a: number[], b: number[], eps = 1e-9) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], -Math.log10(eps)));

describe('applyColor', () => {
  it('neutral ist die Identität', () => {
    for (const rgb of [[0, 0, 0], [1, 1, 1], [0.2, 0.5, 0.9], [0.73, 0.1, 0.33]] as [number, number, number][]) {
      near(applyColor(NEUTRAL, rgb), rgb);
    }
  });
  it('exposure 1 verdoppelt linear und klemmt', () => {
    near(applyColor(color({ exposure: 1 }), [0.2, 0.3, 0.8]), [0.4, 0.6, 1]);
    near(applyColor(color({ exposure: -1 }), [0.2, 0.4, 0.8]), [0.1, 0.2, 0.4]);
  });
  it('Kontrast dreht um 0,5', () => {
    const [r, g, b] = applyColor(color({ contrast: 50 }), [0.5, 0.7, 0.3]);
    expect(r).toBeCloseTo(0.5);
    expect(g).toBeCloseTo(0.8);
    expect(b).toBeCloseTo(0.2);
  });
  it('Wärme: Rot rauf, Blau runter; Tönung: Grün runter', () => {
    const w = applyColor(color({ temperature: 100 }), [0.5, 0.5, 0.5]);
    expect(w[0]).toBeCloseTo(0.6);
    expect(w[2]).toBeCloseTo(0.4);
    expect(applyColor(color({ tint: 100 }), [0.5, 0.5, 0.5])[1]).toBeCloseTo(0.425);
  });
  it('Lichter wirken nur über 0,5, Tiefen nur unter 0,5 (±0,25 bei ±100)', () => {
    near(applyColor(color({ highlights: 100 }), [0.5, 0.25, 0]), [0.5, 0.25, 0]);
    expect(applyColor(color({ highlights: 100 }), [0.75, 0.75, 0.75])[0]).toBeGreaterThan(0.75);
    expect(applyColor(color({ highlights: -100 }), [1, 1, 1])[0]).toBeCloseTo(0.75);
    near(applyColor(color({ shadows: 100 }), [0.5, 0.75, 1]), [0.5, 0.75, 1]);
    expect(applyColor(color({ shadows: 100 }), [0.25, 0.25, 0.25])[0]).toBeGreaterThan(0.25);
    expect(applyColor(color({ shadows: -100 }), [0, 0, 0])[0]).toBeCloseTo(0, 6);
    expect(applyColor(color({ shadows: 100 }), [0, 0, 0])[0]).toBeCloseTo(0.25, 6);
  });
  it('Sättigung −100 ergibt Rec.709-Luma, +100 verdoppelt den Abstand', () => {
    const luma = 0.2126 * 0.8 + 0.7152 * 0.4 + 0.0722 * 0.2;
    near(applyColor(color({ saturation: -100 }), [0.8, 0.4, 0.2]), [luma, luma, luma]);
    const [r] = applyColor(color({ saturation: 100 }), [0.8, 0.4, 0.2]);
    expect(r).toBeCloseTo(Math.min(1, luma + 2 * (0.8 - luma)));
  });
  it('Reihenfolge: Weißabgleich vor Belichtung, Ergebnis geklemmt', () => {
    const out = applyColor(color({ temperature: 100, exposure: 2 }), [0.9, 0.9, 0.9]);
    out.forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    });
  });
});

describe('buildCubeLut', () => {
  const lut = buildCubeLut(color({ exposure: 0.5 }));
  const lines = lut.trimEnd().split('\n');
  it('Kopf und 33³ Datenzeilen', () => {
    expect(lines.slice(0, 4)).toEqual(['TITLE "Medienwerkstatt"', 'LUT_3D_SIZE 33', 'DOMAIN_MIN 0 0 0', 'DOMAIN_MAX 1 1 1']);
    const data = lines.slice(4);
    expect(data).toHaveLength(33 ** 3);
    expect(data.every((l) => /^\d\.\d{6} \d\.\d{6} \d\.\d{6}$/.test(l))).toBe(true);
  });
  it('R läuft am schnellsten, neutral ist die Identität', () => {
    const id = buildCubeLut(NEUTRAL).trimEnd().split('\n').slice(4);
    expect(id[0]).toBe('0.000000 0.000000 0.000000');
    expect(id[1]).toBe('0.031250 0.000000 0.000000');
    expect(id[33]).toBe('0.000000 0.031250 0.000000');
    expect(id[33 * 33]).toBe('0.000000 0.000000 0.031250');
    expect(id[id.length - 1]).toBe('1.000000 1.000000 1.000000');
  });
  it('Eintrag stimmt mit applyColor überein (Vorschau = Export)', () => {
    const p = color({ exposure: 0.5, contrast: 20, temperature: 30 });
    const data = buildCubeLut(p).trimEnd().split('\n').slice(4);
    const [r, g, b] = [7, 11, 19];
    const got = data[r + 33 * g + 33 * 33 * b].split(' ').map(Number);
    const want = applyColor(p, [r / 32, g / 32, b / 32]);
    near(got, want, 1e-6);
  });
  it('andere Größe', () => {
    expect(buildCubeLut(NEUTRAL, 5).trimEnd().split('\n')).toHaveLength(4 + 125);
  });
});

function fakeCtx() {
  const calls: { op: string; args: unknown[]; fillStyle: unknown; font: string; textAlign: string }[] = [];
  const ctx: TitleCtx = {
    fillStyle: '#000',
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    save() {},
    restore() {},
    clearRect: (...a: number[]) => calls.push({ op: 'clearRect', args: a, fillStyle: ctx.fillStyle, font: ctx.font, textAlign: ctx.textAlign }),
    fillRect: (...a: number[]) => calls.push({ op: 'fillRect', args: a, fillStyle: ctx.fillStyle, font: ctx.font, textAlign: ctx.textAlign }),
    fillText: (...a: unknown[]) => calls.push({ op: 'fillText', args: a, fillStyle: ctx.fillStyle, font: ctx.font, textAlign: ctx.textAlign }),
    measureText: (s: string) => ({ width: s.length * 20 }) as TextMetrics,
  };
  return { ctx, calls };
}
const tp = (o: Partial<TitleParams>): TitleParams => ({
  style: 'bauchbinde', line1: 'Anna Beispiel', line2: 'Bäckerin', font: 'Helvetica Neue', size: 36, color: '#ffffff', x: 0.08, y: 0.78, fadeIn: 8, fadeOut: 8, ...o,
});

describe('renderTitle', () => {
  const W = 1920, H = 1080;
  it('Bauchbinde: Balken + zwei Zeilen im unteren Drittel, im 90-%-Bereich', () => {
    const { ctx, calls } = fakeCtx();
    renderTitle(tp({}), W, H, ctx);
    expect(calls[0].op).toBe('clearRect');
    const bars = calls.filter((c) => c.op === 'fillRect');
    const texts = calls.filter((c) => c.op === 'fillText');
    expect(bars.length).toBeGreaterThanOrEqual(1);
    expect(texts.map((t) => t.args[0])).toEqual(['Anna Beispiel', 'Bäckerin']);
    const safeL = W * 0.05, safeR = W * 0.95, safeT = H * 0.05, safeB = H * 0.95;
    for (const b of bars) {
      const [x, y, w, h] = b.args as number[];
      expect(x).toBeGreaterThanOrEqual(safeL - 1e-6);
      expect(x + w).toBeLessThanOrEqual(safeR + 1e-6);
      expect(y).toBeGreaterThanOrEqual(H * (2 / 3));
      expect(y + h).toBeLessThanOrEqual(safeB + 1e-6);
      expect(y).toBeGreaterThanOrEqual(safeT);
    }
    for (const t of texts) {
      const [, x, y] = t.args as [string, number, number];
      expect(x).toBeGreaterThanOrEqual(safeL);
      expect(y).toBeGreaterThanOrEqual(H * (2 / 3));
      expect(y).toBeLessThanOrEqual(safeB);
    }
    expect(texts[0].font).toContain('Helvetica Neue');
    expect(texts[0].fillStyle).toBe('#ffffff');
  });
  it('Schriftgröße relativ zur Höhe', () => {
    const a = fakeCtx(), b = fakeCtx();
    renderTitle(tp({ size: 36 }), 1920, 1080, a.ctx);
    renderTitle(tp({ size: 36 }), 1080, 1920, b.ctx);
    const px = (c: { font: string }) => Number(/(\d+(?:\.\d+)?)px/.exec(c.font)![1]);
    const fa = px(a.calls.find((c) => c.op === 'fillText')!);
    const fb = px(b.calls.find((c) => c.op === 'fillText')!);
    expect(fa).toBeCloseTo(36);
    expect(fb).toBeCloseTo(36 * 1920 / 1080);
  });
  it('zu lange Bauchbinde bleibt im sicheren Bereich', () => {
    const { ctx, calls } = fakeCtx();
    renderTitle(tp({ line1: 'x'.repeat(200) }), W, H, ctx);
    for (const b of calls.filter((c) => c.op === 'fillRect')) {
      const [x, , w] = b.args as number[];
      expect(x + w).toBeLessThanOrEqual(W * 0.95 + 1e-6);
    }
  });
  it('Titel: mittig zentriert; Abspann: zentrierte Zeilen', () => {
    const t = fakeCtx();
    renderTitle(tp({ style: 'titel', line1: 'Titel', line2: '', size: 72, x: 0.5, y: 0.5 }), W, H, t.ctx);
    const txt = t.calls.filter((c) => c.op === 'fillText');
    expect(txt).toHaveLength(1);
    expect(txt[0].textAlign).toBe('center');
    expect(txt[0].args[1]).toBeCloseTo(W / 2);
    const a = fakeCtx();
    renderTitle(tp({ style: 'abspann', line1: 'Regie\nAnna\nBen', line2: 'Danke', size: 48, x: 0.5, y: 0.5 }), W, H, a.ctx);
    const lines = a.calls.filter((c) => c.op === 'fillText');
    expect(lines.map((l) => l.args[0])).toEqual(['Regie', 'Anna', 'Ben', 'Danke']);
    expect(lines.every((l) => l.textAlign === 'center' && Math.abs((l.args[1] as number) - W / 2) < 1e-6)).toBe(true);
    const ys = lines.map((l) => l.args[2] as number);
    expect([...ys].sort((p, q) => p - q)).toEqual(ys);
  });
});

describe('escapeFilterPath', () => {
  it('lässt Umlaute und Leerzeichen unverändert', () => {
    expect(escapeFilterPath('/Users/me/Movies/Bäckerei Clip 1/lut.cube')).toBe('/Users/me/Movies/Bäckerei Clip 1/lut.cube');
  });
  it('maskiert Sonderzeichen zweistufig (Option, dann Filtergraph)', () => {
    expect(escapeFilterPath('a:b')).toBe('a\\\\:b');
    expect(escapeFilterPath("a'b")).toBe("a\\\\\\'b");
    expect(escapeFilterPath('a\\b')).toBe('a\\\\\\\\b');
    expect(escapeFilterPath('a,b;c[d]')).toBe('a\\,b\\;c\\[d\\]');
  });
});

describe('Presets', () => {
  it('vier Presets nach Spec', () => {
    expect(EXPORT_PRESETS.map((p) => p.id)).toEqual(['social169', 'social916', 'rundfunk', 'prores']);
    const p = (id: Parameters<typeof getPreset>[0]) => getPreset(id);
    expect(p('social169')).toMatchObject({ container: 'mp4', video: { codec: 'h264', bitrateMbps: 16 }, audio: { codec: 'aac', rateHz: 48000 }, loudnessHint: -14, size: { width: 1920, height: 1080 } });
    expect(p('social916')).toMatchObject({ video: { bitrateMbps: 12 }, loudnessHint: -14, size: { width: 1080, height: 1920 } });
    expect(p('rundfunk')).toMatchObject({ video: { bitrateMbps: 25 }, loudnessHint: -23, size: { width: 1920, height: 1080 } });
    expect(p('prores')).toMatchObject({ container: 'mov', video: { codec: 'prores' }, audio: { codec: 'pcm_s24le' }, loudnessHint: -23, size: null });
    expect(EXPORT_PRESETS.every((x) => x.label.length > 0)).toBe(true);
  });
});

// ---- buildExport ----

const mkMedia = (id: string, o: Partial<MediaItem> = {}): MediaItem => ({
  kind: 'video', durationSec: 10, width: 1920, height: 1080, fps: 25, hasAudio: true, hdr: false, videoCodec: 'h264', audioCodec: 'aac',
  rotation: 0, id, name: id, path: `/Users/me/Movies/Bäckerei Korn/Medien/${id}.mov`, proxyPath: null, shotSize: null, ...o,
});
const mkClip = (id: string, trackId: string, start: number, duration: number, o: Partial<Clip> = {}): Clip => ({
  id, trackId, kind: 'media', mediaId: 'm', start, duration, sourceIn: 2, linkId: null, gainDb: 0, fadeIn: 0, fadeOut: 0, color: null, title: null, ...o,
});
const seqOf = (clips: Clip[], o: Partial<Sequence> = {}): Sequence => ({
  ...newSequence({ width: 1920, height: 1080, fps: 25, name: 't' }, () => 's'), clips, ...o,
});
const TITLE = tp({});
/** 2 Clips (0–50, 50–100) + Überblendung 10 Bilder + Bauchbinde + J-Cut (Ton 2. Clip beginnt 10 Bilder früher). */
function fixtureSeq(): Sequence {
  return seqOf(
    [
      mkClip('a', 'V1', 0, 50),
      mkClip('b', 'V1', 50, 50, { color: { ...NEUTRAL, exposure: 0.3 } }),
      mkClip('t', 'V2', 20, 50, { kind: 'title', mediaId: undefined, title: TITLE }),
      mkClip('aa', 'A1', 0, 40, { gainDb: -3 }),
      mkClip('ab', 'A1', 40, 60, { sourceIn: 1.6, fadeOut: 10 }),
    ],
    { transitions: [{ id: 'x', trackId: 'V1', leftClipId: 'a', rightClipId: 'b', duration: 10, kind: 'dissolve' }] },
  );
}
const ASSETS = { lutPathByClipId: { b: '/tmp/Cache/lut b.cube' }, titlePngByClipId: { t: '/tmp/Cache/Titel ä.png' } };
const OUT = '/Users/me/Movies/Bäckerei Korn/Export/out.mp4';
const build = (s: Sequence, m: MediaItem[] = [mkMedia('m')], preset: ExportPresetId = 'social169', o?: Parameters<typeof buildExport>[5]) =>
  buildExport(s, m, getPreset(preset), ASSETS, OUT, o ?? { h264Encoder: 'libx264' });
const graphOf = (args: string[]) => args[args.indexOf('-filter_complex') + 1];
const inputsOf = (args: string[]) => args.flatMap((a, i) => (args[i - 1] === '-i' ? [a] : []));

describe('buildExport', () => {
  const r = build(fixtureSeq());
  const g = graphOf(r.args);
  it('enthält overlay, lut3d, amix, -r 25, -s 1920x1080; Ausgabe zuletzt', () => {
    expect(g).toContain('overlay');
    expect(g).toContain('lut3d=file=/tmp/Cache/lut b.cube');
    expect(g).toContain('amix=inputs=2:normalize=0:duration=longest');
    const s = r.args.join(' ');
    expect(s).toContain('-r 25');
    expect(s).toContain('-s 1920x1080');
    expect(r.args[r.args.length - 1]).toBe(OUT);
    expect(r.durationSec).toBeCloseTo(4);
  });
  it('Eingaben: Grundfläche, ein Eingang je Clip, Titel als Schleife, Pfade unmaskiert', () => {
    const ins = inputsOf(r.args);
    expect(ins[0]).toBe('color=black:s=1920x1080:r=25:d=4');
    expect(ins).toContain('/Users/me/Movies/Bäckerei Korn/Medien/m.mov');
    expect(ins).toContain('/tmp/Cache/Titel ä.png');
    expect(ins).toHaveLength(1 + 2 + 1 + 2);
    const ti = r.args.indexOf('/tmp/Cache/Titel ä.png');
    expect(r.args.slice(ti - 7, ti)).toEqual(['-loop', '1', '-framerate', '25', '-t', '2', '-i']);
  });
  it('Überblendung zentriert: links d/2 länger, rechts d/2 früher mit Alpha-Fade', () => {
    const hits = r.args.flatMap((a, i) => (a === '/Users/me/Movies/Bäckerei Korn/Medien/m.mov' ? [i] : []));
    const [ia, ib] = hits;
    expect(r.args.slice(ia - 5, ia)).toEqual(['-ss', '2', '-t', '2.2', '-i']);
    const right = r.args.slice(ib - 5, ib);
    expect(right[1]).toBe('1.8');
    expect(Number(right[3])).toBeCloseTo(2.2);
    expect(g).toContain('format=yuva420p,fade=t=in:st=0:d=0.4:alpha=1');
    expect(g).toContain('setpts=PTS-STARTPTS+1.8/TB');
  });
  it('Titel: rgba, Fade ein/aus als Alpha, Überlagerung zuletzt', () => {
    expect(g).toContain('format=rgba,fade=t=in:st=0:d=0.32:alpha=1,fade=t=out:st=1.68:d=0.32:alpha=1');
    expect(g).toContain('setpts=PTS-STARTPTS+0.8/TB');
    const ov = [...g.matchAll(/overlay=eof_action=pass/g)].length;
    expect(ov).toBe(3);
  });
  it('Ton: J-Cut, Gain, Fade, adelay, amix, apad+atrim', () => {
    expect(g).toContain('volume=-3dB');
    expect(g).toContain('adelay=delays=1600:all=1');
    expect(g).toMatch(/aresample=48000,aformat=channel_layouts=stereo/);
    expect(g).toContain('afade=t=out:st=2:d=0.4');
    expect(g).toMatch(/amix=[^;]*;\[[a-z0-9]+\]apad,atrim=start=0:end=4,asetpts=PTS-STARTPTS\[aout\]/);
  });
  it('h264 libx264 / videotoolbox / prores', () => {
    const x = r.args.join(' ');
    expect(x).toContain('-c:v libx264 -b:v 16M -pix_fmt yuv420p');
    expect(x).toContain('-preset medium');
    expect(x).not.toContain('-allow_sw');
    expect(x).toContain('-c:a aac -b:a 320k -ar 48000 -ac 2');
    expect(x).toContain('-movflags +faststart');
    const vt = build(fixtureSeq(), [mkMedia('m')], 'social169', { h264Encoder: 'h264_videotoolbox' }).args.join(' ');
    expect(vt).toContain('-c:v h264_videotoolbox -b:v 16M -pix_fmt yuv420p -allow_sw 1');
    expect(vt).not.toContain('-preset');
    const p = build(fixtureSeq(), [mkMedia('m')], 'prores').args.join(' ');
    expect(p).toContain('-c:v prores_ks -profile:v 2 -pix_fmt yuv422p10le');
    expect(p).toContain('-c:a pcm_s24le -ar 48000 -ac 2');
    expect(p).not.toContain('faststart');
    expect(p).toContain('-s 1920x1080');
  });
  it('social916 skaliert und padded auf 1080x1920', () => {
    const v = build(fixtureSeq(), [mkMedia('m')], 'social916');
    expect(inputsOf(v.args)[0]).toBe('color=black:s=1080x1920:r=25:d=4');
    expect(graphOf(v.args)).toContain('scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1');
    expect(v.args.join(' ')).toContain('-s 1080x1920');
  });
  it('HDR-Quelle: Tonemapping-Kette vor fps/scale', () => {
    const v = build(fixtureSeq(), [mkMedia('m', { hdr: true })]);
    const chain = 'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p,fps=25,scale=1920:1080';
    expect(graphOf(v.args)).toContain(chain);
    expect(g).not.toContain('tonemap');
  });
  it('In/Out: Video und Ton auf den Bereich zugeschnitten, Länge = Bereich', () => {
    const v = build({ ...fixtureSeq(), inPoint: 25, outPoint: 75 });
    const gg = graphOf(v.args);
    expect(v.durationSec).toBeCloseTo(2);
    expect(gg).toContain('trim=start=1:end=3,setpts=PTS-STARTPTS[vout]');
    expect(gg).toContain('atrim=start=1:end=3,asetpts=PTS-STARTPTS[aout]');
  });
  it('ohne Ton-Clips: stille Spur aus anullsrc in Sequenzlänge', () => {
    const s = seqOf([mkClip('a', 'V1', 0, 50)]);
    const v = build(s, [mkMedia('m', { hasAudio: false })]);
    const ins = inputsOf(v.args);
    expect(ins).toContain('anullsrc=r=48000:cl=stereo');
    expect(v.args.join(' ')).toContain('-t 2 -i anullsrc=r=48000:cl=stereo');
    expect(graphOf(v.args)).not.toContain('amix');
    expect(graphOf(v.args)).toMatch(/atrim=start=0:end=2,asetpts=PTS-STARTPTS\[aout\]/);
    expect(v.args).toContain('-map');
  });
  it('Ton-Clip einer stummen Quelle zählt nicht (stille Spur)', () => {
    const s = seqOf([mkClip('a', 'V1', 0, 50), mkClip('x', 'A1', 0, 50)]);
    const v = build(s, [mkMedia('m', { hasAudio: false })]);
    expect(graphOf(v.args)).not.toContain('amix');
    expect(inputsOf(v.args)).toContain('anullsrc=r=48000:cl=stereo');
  });
  it('stumme Videospur: Clips und Titel fehlen im Export', () => {
    const s = seqOf([mkClip('a', 'V1', 0, 50), mkClip('b', 'V2', 0, 50), mkClip('t', 'V2', 0, 50, { kind: 'title', mediaId: undefined, title: TITLE })]);
    s.tracks = s.tracks.map((t) => (t.id === 'V2' ? { ...t, muted: true } : t));
    const r = build(s);
    expect(inputsOf(r.args).filter((i) => i.includes('m.mov'))).toHaveLength(1);
    expect(inputsOf(r.args).some((i) => i.includes('Titel'))).toBe(false);
    expect(graphOf(r.args).match(/overlay/g)).toHaveLength(1);
  });
  it('stumme Ton-Spur (muted) → stille Spur', () => {
    const s = seqOf([mkClip('a', 'V1', 0, 50), mkClip('x', 'A1', 0, 50)]);
    s.tracks = s.tracks.map((t) => (t.id === 'A1' ? { ...t, muted: true } : t));
    expect(graphOf(build(s).args)).not.toContain('amix');
  });
  it('audioFade-Überblendung: links blendet aus, rechts ein, beide um d/2 verlängert', () => {
    const s = seqOf(
      [mkClip('v', 'V1', 0, 100), mkClip('l', 'A1', 0, 50), mkClip('r', 'A1', 50, 50)],
      { transitions: [{ id: 'x', trackId: 'A1', leftClipId: 'l', rightClipId: 'r', duration: 10, kind: 'audioFade' }] },
    );
    const gg = graphOf(build(s).args);
    expect(gg).toContain('afade=t=out:st=1.8:d=0.4');
    expect(gg).toContain('afade=t=in:st=0:d=0.4');
    expect(gg).toContain('adelay=delays=1800:all=1');
  });
  it('Überblendung ohne Vorlauf in der Quelle: kein Vorverschieben, Fade nur über den linken Überstand', () => {
    const s = seqOf(
      [mkClip('a', 'V1', 0, 50), mkClip('b', 'V1', 50, 50, { sourceIn: 0 })],
      { transitions: [{ id: 'x', trackId: 'V1', leftClipId: 'a', rightClipId: 'b', duration: 10, kind: 'dissolve' }] },
    );
    const v = build(s);
    const gg = graphOf(v.args);
    expect(gg).toContain('fade=t=in:st=0:d=0.2:alpha=1');
    expect(gg).toContain('setpts=PTS-STARTPTS+2/TB');
    expect(gg).not.toContain('+1.8/TB');
    const hits = v.args.flatMap((a, i) => (a.endsWith('/m.mov') ? [i] : []));
    expect(v.args.slice(hits[1] - 5, hits[1])).toEqual(['-ss', '0', '-t', '2', '-i']);
  });
  it('linker Überstand wird durch das Quellenende begrenzt', () => {
    const s = seqOf(
      [mkClip('a', 'V1', 0, 50, { sourceIn: 8 }), mkClip('b', 'V1', 50, 50)],
      { transitions: [{ id: 'x', trackId: 'V1', leftClipId: 'a', rightClipId: 'b', duration: 10, kind: 'dissolve' }] },
    );
    const gg = graphOf(build(s).args);
    expect(gg).toContain('fade=t=in:st=0:d=0.2:alpha=1');
    expect(gg).toContain('setpts=PTS-STARTPTS+1.8/TB');
  });
  it('audioFade ohne Vorlauf: Start unverändert, Fades über den linken Überstand', () => {
    const s = seqOf(
      [mkClip('v', 'V1', 0, 100), mkClip('l', 'A1', 0, 50), mkClip('r', 'A1', 50, 50, { sourceIn: 0 })],
      { transitions: [{ id: 'x', trackId: 'A1', leftClipId: 'l', rightClipId: 'r', duration: 10, kind: 'audioFade' }] },
    );
    const gg = graphOf(build(s).args);
    expect(gg).toContain('afade=t=in:st=0:d=0.2');
    expect(gg).toContain('afade=t=out:st=2:d=0.2');
    expect(gg).toContain('adelay=delays=2000:all=1');
  });
  it('lut3d läuft vor scale/pad (Balken bleiben ungegradet)', () => {
    const gg = graphOf(build(fixtureSeq(), [mkMedia('m')], 'social916', { h264Encoder: 'libx264' }).args);
    const chain = gg.split(';').find((c) => c.includes('lut3d'))!;
    expect(chain.indexOf('fps=')).toBeLessThan(chain.indexOf('lut3d'));
    expect(chain.indexOf('lut3d')).toBeLessThan(chain.indexOf('scale='));
    expect(chain.indexOf('scale=')).toBeLessThan(chain.indexOf('pad='));
  });
  it('leere Sequenz wird abgelehnt', () => {
    expect(() => build(seqOf([]))).toThrow();
  });
  it('Farbe ohne LUT-Pfad wird ignoriert, Bild-Medien laufen als Schleife', () => {
    const s = seqOf([mkClip('i', 'V1', 0, 25, { mediaId: 'img', sourceIn: 0, color: { ...NEUTRAL, exposure: 1 } })]);
    const v = build(s, [mkMedia('img', { kind: 'image', hasAudio: false, durationSec: 0 })]);
    expect(graphOf(v.args)).not.toContain('lut3d');
    expect(v.args.join(' ')).toContain('-loop 1 -framerate 25 -t 1 -i');
  });
});

// ---- Allowlist-Gang wie im Rust-Validator ----

const allow = JSON.parse(readFileSync('src-tauri/ffmpeg-options.json', 'utf8')) as { flags: string[]; valueOptions: string[] };
const PROTOS = ['http', 'https', 'rtmp', 'rtmps', 'rtsp', 'tcp', 'udp', 'ftp', 'srt', 'tls', 'crypto', 'cache', 'async', 'subfile', 'concat', 'gopher', 'unix', 'data'];
function isNetworkArg(arg: string): boolean {
  const a = arg.toLowerCase();
  if (a.includes('://') || a.includes('movie=')) return true;
  for (let i = 0; i < a.length; i++) {
    const boundary = i === 0 || '|,;:='.includes(a[i - 1]);
    if (boundary && PROTOS.some((p) => a.startsWith(`${p}:`, i))) return true;
  }
  return false;
}
/** Spiegel von `validate_ffmpeg_args`: gibt die Ausgaben (Positionsargumente) zurück, wirft bei Verstößen. */
function walk(args: string[]): string[] {
  const outs: string[] = [];
  const bad = args.find(isNetworkArg);
  if (bad) throw new Error(`Netzwerk: ${bad}`);
  for (let i = 0; i < args.length; ) {
    const a = args[i];
    if (a.length > 1 && a.startsWith('-')) {
      const name = a.toLowerCase();
      if (allow.flags.includes(name)) { i += 1; continue; }
      const base = name.slice(1).split(':')[0];
      if (name.startsWith('--') || !allow.valueOptions.includes(base)) throw new Error(`Option nicht erlaubt: ${a}`);
      if (base === 'f' && ['tee', 'segment', 'stream_segment', 'ssegment', 'hls', 'dash', 'image2'].includes(args[i + 1]?.toLowerCase())) throw new Error('Format');
      i += 2;
    } else {
      outs.push(a);
      i += 1;
    }
  }
  return outs;
}

describe('Export-Argumente gegen die gemeinsame Positivliste', () => {
  const cases: [string, Sequence, MediaItem[], Parameters<typeof getPreset>[0], Parameters<typeof buildExport>[5]][] = [
    ['Fixture h264', fixtureSeq(), [mkMedia('m')], 'social169', { h264Encoder: 'libx264' }],
    ['Fixture videotoolbox', fixtureSeq(), [mkMedia('m')], 'rundfunk', { h264Encoder: 'h264_videotoolbox' }],
    ['Fixture prores', fixtureSeq(), [mkMedia('m', { hdr: true })], 'prores', { h264Encoder: 'libx264' }],
    ['ohne Ton', seqOf([mkClip('a', 'V1', 0, 50)]), [mkMedia('m')], 'social916', undefined],
  ];
  for (const [name, s, m, p, o] of cases) {
    it(name, () => {
      const { args } = build(s, m, p, o);
      const outs = walk(args);
      expect(outs).toEqual([OUT]);
      expect(args[args.length - 1]).toBe(OUT);
      for (const forbidden of ['-hide_banner', '-nostdin', '-progress', '-protocol_whitelist']) expect(args).not.toContain(forbidden);
      const g = graphOf(args);
      for (const bad of ['drawtext', 'subtitles', 'movie=', 'metadata=print', 'psnr', 'file=/etc']) expect(g).not.toContain(bad);
    });
  }
  it('Validator-Spiegel erkennt Verstöße', () => {
    expect(() => walk(['-foo', '1', '/x'])).toThrow();
    expect(() => walk(['-i', 'http://x', '/x'])).toThrow();
    expect(walk(['-i', 'a', '/out'])).toEqual(['/out']);
  });
});
