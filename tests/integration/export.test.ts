// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildExport } from '../../src/domain/render/filtergraph';
import { buildCubeLut } from '../../src/domain/render/lut';
import { getPreset } from '../../src/domain/render/presets';
import { newSequence } from '../../src/domain/timeline/sequence';
import { addTitle, addTransition, insertEdit, roll, setClipProps } from '../../src/domain/timeline/ops';
import type { MediaItem, Sequence } from '../../src/domain/timeline/types';

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
const ROOT = resolve(__dirname, '../..');
const FIX = join(ROOT, 'tests/fixtures/media');

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b: Buffer): number => {
  let c = 0xffffffff;
  for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer): Buffer => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
/** Kleiner PNG-Schreiber (RGBA 8 Bit): transparente Fläche mit einem halbtransparenten Balken im unteren Drittel. */
function titlePng(w: number, h: number): Buffer {
  const row = 1 + w * 4;
  const raw = Buffer.alloc(row * h);
  for (let y = 0; y < h; y++) {
    if (y < h * 0.75 || y > h * 0.85) continue;
    for (let x = Math.floor(w * 0.08); x < w * 0.5; x++) raw.set([255, 255, 255, 200], y * row + 1 + x * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const counter = () => {
  let n = 0;
  return () => `id${++n}`;
};
const mkMedia = (id: string, name: string, over: Partial<MediaItem> = {}): MediaItem => ({
  kind: 'video', durationSec: 5, width: 1920, height: 1080, fps: 25, hasAudio: true, hdr: false, videoCodec: 'h264', audioCodec: 'aac',
  rotation: 0, id, name, path: join(FIX, name), proxyPath: null, shotSize: null, ...over,
});

/** Schreibt die Argumente wie der Rust-Läufer (`run_ffmpeg`): Vorspann, Protokoll-Whitelist vor jedem `-i`. */
function runLikeRunner(args: string[]): { status: number | null; stderr: string } {
  const guarded = args.flatMap((a) => (a === '-i' ? ['-protocol_whitelist', 'file,pipe', a] : [a]));
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostdin', '-y', '-progress', 'pipe:1', '-nostats', ...guarded], { encoding: 'utf8' });
  return { status: r.status, stderr: r.stderr };
}
type Probe = { streams: { codec_type: string; width?: number; height?: number; r_frame_rate?: string; duration?: string }[]; format: { duration: string } };
function probe(file: string): Probe {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' });
  return JSON.parse(r.stdout) as Probe;
}

describe.skipIf(!hasFfmpeg)('Export mit echtem ffmpeg', () => {
  let dir: string;
  let m1: MediaItem;
  let m2: MediaItem;
  let lut: string;
  let png: string;

  beforeAll(() => {
    if (!existsSync(join(FIX, 'Bäckerei Clip 1.mov')) || !existsSync(join(FIX, 'clip-25p.mp4')) || !existsSync(join(FIX, 'stumm.mp4'))) {
      expect(spawnSync('bash', ['scripts/make-fixtures.sh'], { cwd: ROOT }).status).toBe(0);
    }
    // Arbeitsordner mit Leerzeichen, Umlaut und Filter-Sonderzeichen im Namen.
    dir = mkdtempSync(join(tmpdir(), "mw Bäckerei, [Cache]; 'x' "));
    const cache = join(dir, 'Cache: lut');
    mkdirSync(cache);
    lut = join(cache, 'Farbe b.cube');
    writeFileSync(lut, buildCubeLut({ exposure: 0.2, contrast: 10, highlights: 0, shadows: 0, temperature: 20, tint: 0, saturation: 10 }));
    png = join(dir, 'Titel Ä.png');
    writeFileSync(png, titlePng(1920, 1080));
    m1 = mkMedia('m1', 'clip-25p.mp4');
    m2 = mkMedia('m2', 'Bäckerei Clip 1.mov');
  });
  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  /** 2 Clips (je 2 s) + Überblendung + Bauchbinde + J-Cut (Ton des 2. Clips beginnt 10 Bilder früher). */
  function fixtureSeq(): { seq: Sequence; ids: { b: string; title: string } } {
    const idGen = counter();
    let s = newSequence({ width: 1920, height: 1080, fps: 25, name: 'Test' }, idGen);
    s = insertEdit(s, m1, 0, 2, 0, { video: 'V1', audio: 'A1' }, 'overwrite', { idGen });
    s = insertEdit(s, m2, 1, 3, 50, { video: 'V1', audio: 'A1' }, 'overwrite', { idGen });
    const v = s.clips.filter((c) => c.trackId === 'V1').sort((a, b) => a.start - b.start);
    const a = s.clips.filter((c) => c.trackId === 'A1').sort((x, y) => x.start - y.start);
    s = addTransition(s, [m1, m2], v[0].id, v[1].id, 10, { idGen }).seq;
    s = roll(s, [m1, m2], a[0].id, a[1].id, -10, { idGen, ignoreLinks: true });
    s = setClipProps(s, v[1].id, { color: { exposure: 0.2, contrast: 10, highlights: 0, shadows: 0, temperature: 20, tint: 0, saturation: 10 } });
    s = addTitle(s, 20, 'V2', 'bauchbinde', { idGen });
    const title = s.clips.find((c) => c.kind === 'title')!;
    return { seq: s, ids: { b: v[1].id, title: title.id } };
  }

  it('Fixture-Sequenz: Länge = Sequenzlänge ±1 Bild, 1920×1080, 25 fps, eine Tonspur', () => {
    const { seq, ids } = fixtureSeq();
    expect(seq.transitions).toHaveLength(1);
    const out = join(dir, 'ausgabe ä.mp4');
    const { args, durationSec } = buildExport(
      seq, [m1, m2], getPreset('social169'),
      { lutPathByClipId: { [ids.b]: lut }, titlePngByClipId: { [ids.title]: png } }, out, { h264Encoder: 'libx264' },
    );
    const seqSec = Math.max(...seq.clips.map((c) => c.start + c.duration)) / 25;
    expect(seqSec).toBeCloseTo(4.8);
    expect(durationSec).toBeCloseTo(seqSec);
    const r = runLikeRunner(args);
    expect(r.stderr.split('\n').filter((l) => /error|invalid|no such/i.test(l))).toEqual([]);
    expect(r.status).toBe(0);
    const p = probe(out);
    const v = p.streams.filter((s) => s.codec_type === 'video');
    const a = p.streams.filter((s) => s.codec_type === 'audio');
    expect(v).toHaveLength(1);
    expect(a).toHaveLength(1);
    expect([v[0].width, v[0].height]).toEqual([1920, 1080]);
    expect(v[0].r_frame_rate).toBe('25/1');
    expect(Math.abs(Number(p.format.duration) - durationSec)).toBeLessThanOrEqual(1 / 25 + 1e-6);
  }, 120_000);

  it('Sequenz ohne Ton: Ausgabe hat trotzdem eine Tonspur in voller Länge', () => {
    const idGen = counter();
    const silent = mkMedia('m3', 'stumm.mp4', { hasAudio: false, audioCodec: null });
    let s = newSequence({ width: 1920, height: 1080, fps: 25, name: 'Stumm' }, idGen);
    s = insertEdit(s, silent, 0, 3, 0, { video: 'V1' }, 'overwrite', { idGen });
    const out = join(dir, 'stumm.mp4');
    const { args, durationSec } = buildExport(s, [silent], getPreset('social169'), { lutPathByClipId: {}, titlePngByClipId: {} }, out, { h264Encoder: 'libx264' });
    expect(runLikeRunner(args).status).toBe(0);
    const p = probe(out);
    expect(p.streams.filter((x) => x.codec_type === 'audio')).toHaveLength(1);
    expect(Math.abs(Number(p.format.duration) - durationSec)).toBeLessThanOrEqual(1 / 25 + 1e-6);
  }, 120_000);

  it('In/Out-Bereich und 9:16-Preset', () => {
    const { seq, ids } = fixtureSeq();
    const out = join(dir, 'hoch.mp4');
    const { args, durationSec } = buildExport(
      { ...seq, inPoint: 25, outPoint: 75 }, [m1, m2], getPreset('social916'),
      { lutPathByClipId: { [ids.b]: lut }, titlePngByClipId: {} }, out, { h264Encoder: 'libx264' },
    );
    expect(durationSec).toBeCloseTo(2);
    expect(runLikeRunner(args).status).toBe(0);
    const p = probe(out);
    const v = p.streams.find((s) => s.codec_type === 'video')!;
    expect([v.width, v.height]).toEqual([1080, 1920]);
    expect(p.streams.filter((s) => s.codec_type === 'audio')).toHaveLength(1);
    expect(Math.abs(Number(p.format.duration) - 2)).toBeLessThanOrEqual(1 / 25 + 1e-6);
  }, 120_000);
  it('Sicherheits-Limiter: +24 dB Gain bleibt unter −1 dBTP, Länge unverändert; ohne Limiter darüber', () => {
    const idGen = counter();
    let s = newSequence({ width: 1920, height: 1080, fps: 25, name: 'Laut' }, idGen);
    s = insertEdit(s, m1, 0, 2, 0, { video: 'V1', audio: 'A1' }, 'overwrite', { idGen });
    const a = s.clips.find((c) => c.trackId === 'A1')!;
    s = setClipProps(s, a.id, { gainDb: 24 });
    const peak = (file: string): number => {
      const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' });
      const m = [...r.stderr.matchAll(/Peak:\s+(-?[\d.]+|-inf) dBFS/g)].at(-1);
      return m ? Number(m[1]) : NaN;
    };
    const run = (limiter: boolean, name: string) => {
      const out = join(dir, name);
      const { args, durationSec } = buildExport(s, [m1], getPreset('social169'), { lutPathByClipId: {}, titlePngByClipId: {} }, out, { h264Encoder: 'libx264', limiter });
      const r = runLikeRunner(args);
      expect(r.stderr.split('\n').filter((l) => /error|invalid|no such/i.test(l))).toEqual([]);
      expect(r.status).toBe(0);
      expect(Math.abs(Number(probe(out).format.duration) - durationSec)).toBeLessThanOrEqual(1 / 25 + 1e-6);
      return peak(out);
    };
    expect(run(false, 'laut-ohne.mp4')).toBeGreaterThan(-1);
    expect(run(true, 'laut-mit.mp4')).toBeLessThanOrEqual(-1);
  }, 120_000);
  it('HDR-Quelle (Tonemapping) mit ProRes-Preset', () => {
    const idGen = counter();
    const hdr = mkMedia('m4', 'hdr-hlg.mov', { hdr: true, fps: 30000 / 1001 });
    let s = newSequence({ width: 1920, height: 1080, fps: 25, name: 'HDR' }, idGen);
    s = insertEdit(s, hdr, 0, 2, 0, { video: 'V1', audio: 'A1' }, 'overwrite', { idGen });
    const out = join(dir, 'hdr.mov');
    const { args, durationSec } = buildExport(s, [hdr], getPreset('prores'), { lutPathByClipId: {}, titlePngByClipId: {} }, out, { h264Encoder: 'libx264' });
    const r = runLikeRunner(args);
    expect(r.stderr.split('\n').filter((l) => /error|invalid|no such/i.test(l))).toEqual([]);
    expect(r.status).toBe(0);
    const p = probe(out);
    expect(p.streams.filter((x) => x.codec_type === 'audio')).toHaveLength(1);
    expect(Math.abs(Number(p.format.duration) - durationSec)).toBeLessThanOrEqual(1 / 25 + 1e-6);
  }, 120_000);
});
