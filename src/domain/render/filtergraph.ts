import type { Clip, MediaItem, Sequence } from '../timeline/types';
import { NO_OVERHANG as NO_EXT, transitionOverhangs } from '../timeline/transitions';
import type { ExportPreset } from './presets';

export type ExportAssets = {
  /** Pfad der `.cube`-Datei je Clip (nur Clips mit Farbkorrektur; fehlt der Eintrag, bleibt der Clip unverändert). */
  lutPathByClipId: Record<string, string>;
  /** Titel-PNG je Titel-Clip, in Ausgabegröße (`exportSize`) gerendert, mit Transparenz. */
  titlePngByClipId: Record<string, string>;
};

export type ExportOpts = { h264Encoder: 'h264_videotoolbox' | 'libx264' };

const AUDIO_RATE = 48000;
/** Tonemapping HDR (PQ/HLG, BT.2020) → SDR BT.709. */
const HDR_TO_SDR =
  'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p';

/** Zahl für ffmpeg: höchstens 6 Nachkommastellen, ohne Exponent und ohne `-0`. */
const num = (x: number): string => String(Math.round(x * 1e6) / 1e6);

/**
 * Maskiert einen Dateipfad für den Wert einer Filteroption innerhalb von `-filter_complex`
 * (zweistufig, siehe ffmpeg „Notes on filtergraph escaping“): erst die Option (`\`, `'`, `:`),
 * dann den Filtergraphen (`\`, `'`, `,`, `;`, `[`, `]`). Umlaute und Leerzeichen bleiben unverändert.
 * Pfade als eigene `-i`-Argumente brauchen keine Maskierung.
 */
export function escapeFilterPath(p: string): string {
  return p.replace(/[\\':]/g, '\\$&').replace(/[\\',;[\]]/g, '\\$&');
}

/** Ausgabegröße: Größe des Presets, sonst die der Sequenz. */
export function exportSize(seq: Sequence, preset: ExportPreset): { width: number; height: number } {
  return preset.size ?? { width: seq.width, height: seq.height };
}

/** Exportbereich in Bildern: In/Out der Sequenz, sonst die ganze Sequenz (leerer/umgekehrter Bereich = ganz). */
export function exportRange(seq: Sequence): { inF: number; outF: number; ranged: boolean } {
  const seqEnd = Math.max(0, ...seq.clips.map((c) => c.start + c.duration));
  const inF = Math.max(0, seq.inPoint ?? 0);
  const outF = seq.outPoint ?? seqEnd;
  if (outF <= inF) return { inF: 0, outF: seqEnd, ranged: false };
  return { inF, outF, ranged: seq.inPoint !== null || seq.outPoint !== null };
}

type Graph = { inputs: string[][]; chains: string[] };

/** Fügt einen Eingang hinzu und gibt seinen Index zurück. */
const addInput = (g: Graph, args: string[]): number => g.inputs.push(args) - 1;

function videoClips(seq: Sequence, media: Map<string, MediaItem>): { clip: Clip; media: MediaItem }[] {
  const out: { clip: Clip; media: MediaItem }[] = [];
  for (const t of seq.tracks.filter((x) => x.kind === 'video' && !x.muted)) {
    for (const c of seq.clips.filter((x) => x.trackId === t.id && x.kind === 'media').sort((a, b) => a.start - b.start)) {
      const m = c.mediaId ? media.get(c.mediaId) : undefined;
      if (m && m.kind !== 'audio') out.push({ clip: c, media: m });
    }
  }
  return out;
}

function encodingArgs(preset: ExportPreset, opts: ExportOpts): string[] {
  const v: string[] =
    preset.video.codec === 'h264'
      ? ['-c:v', opts.h264Encoder, '-b:v', `${preset.video.bitrateMbps ?? 16}M`, '-pix_fmt', 'yuv420p',
         ...(opts.h264Encoder === 'h264_videotoolbox' ? ['-allow_sw', '1'] : ['-preset', 'medium'])]
      : ['-c:v', 'prores_ks', '-profile:v', '2', '-pix_fmt', 'yuv422p10le'];
  const a: string[] =
    preset.audio.codec === 'aac'
      ? ['-c:a', 'aac', '-b:a', '320k', '-ar', String(preset.audio.rateHz), '-ac', '2']
      : ['-c:a', 'pcm_s24le', '-ar', String(preset.audio.rateHz), '-ac', '2'];
  return [...v, ...a, ...(preset.container === 'mp4' ? ['-movflags', '+faststart'] : [])];
}

/**
 * Baut die ffmpeg-Argumente (ohne Programmname, ohne die vom Rust-Läufer vorangestellten
 * Optionen) für den Export einer Sequenz. Der Ausgabepfad steht zuletzt.
 *
 * Bild: schwarze Grundfläche, darauf per `overlay` erst V1, dann V2, zuletzt die Titel (je Clip ein
 * Eingang mit Eingangs-Suche `-ss`). Ton: je Ton-Clip eine Kette, dann `amix`; ohne Ton-Clips eine
 * stille Spur. Das Ergebnis ist genau so lang wie der In/Out-Bereich (sonst die Sequenz).
 */
export function buildExport(
  seq: Sequence,
  media: MediaItem[],
  preset: ExportPreset,
  assets: ExportAssets,
  output: string,
  opts: ExportOpts = { h264Encoder: 'h264_videotoolbox' },
): { args: string[]; durationSec: number } {
  const fps = seq.fps;
  const byId = new Map(media.map((m) => [m.id, m]));
  const { width: W, height: H } = exportSize(seq, preset);
  const seqEnd = Math.max(0, ...seq.clips.map((c) => c.start + c.duration));
  const { inF, outF, ranged } = exportRange(seq);
  const durationSec = (outF - inF) / fps;
  if (durationSec <= 0) throw new Error('Die Sequenz ist leer – es gibt nichts zu exportieren.');
  const baseSec = Math.max(seqEnd, outF) / fps;
  const [inSec, outSec] = [inF / fps, outF / fps];

  const g: Graph = { inputs: [], chains: [] };
  addInput(g, ['-f', 'lavfi', '-i', `color=black:s=${W}x${H}:r=${num(fps)}:d=${num(baseSec)}`]);

  // ---- Bild ----
  let cur = '[0:v]';
  let n = 0;
  const overlay = (label: string, startSec: number, chain: string): void => {
    const next = `[o${++n}]`;
    const shift = startSec === 0 ? '' : `+${num(startSec)}/TB`;
    g.chains.push(`${label}${chain},setpts=PTS-STARTPTS${shift}[p${n}]`);
    g.chains.push(`${cur}[p${n}]overlay=eof_action=pass${next}`);
    cur = next;
  };
  const vext = transitionOverhangs(seq, 'dissolve', byId);
  const fit = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1`;
  for (const { clip: c, media: m } of videoClips(seq, byId)) {
    const e = vext.get(c.id) ?? NO_EXT;
    const start = c.start / fps - e.head;
    const len = c.duration / fps + e.head + e.tail;
    const path = m.path;
    const k = addInput(
      g,
      m.kind === 'image'
        ? ['-loop', '1', '-framerate', num(fps), '-t', num(len), '-i', path]
        : ['-ss', num(Math.max(0, c.sourceIn - e.head)), '-t', num(len), '-i', path],
    );
    const lut = c.color ? assets.lutPathByClipId[c.id] : undefined;
    // lut3d vor scale/pad, damit die Letterbox-Balken nicht mitgegradet werden.
    const parts = [...(m.hdr ? [HDR_TO_SDR] : []), `fps=${num(fps)}`, ...(lut ? [`lut3d=file=${escapeFilterPath(lut)}`] : []), fit];
    if (e.fadeIn > 0) parts.push('format=yuva420p', `fade=t=in:st=0:d=${num(e.fadeIn)}:alpha=1`);
    overlay(`[${k}:v]`, start, parts.join(','));
  }
  for (const t of seq.tracks.filter((x) => x.kind === 'video' && !x.muted)) {
    for (const c of seq.clips.filter((x) => x.trackId === t.id && x.kind === 'title').sort((a, b) => a.start - b.start)) {
      const png = assets.titlePngByClipId[c.id];
      if (!png || !c.title) continue;
      const dur = c.duration / fps;
      const k = addInput(g, ['-loop', '1', '-framerate', num(fps), '-t', num(dur), '-i', png]);
      const fin = c.title.fadeIn / fps;
      const fout = c.title.fadeOut / fps;
      const parts = ['format=rgba'];
      if (fin > 0) parts.push(`fade=t=in:st=0:d=${num(fin)}:alpha=1`);
      if (fout > 0) parts.push(`fade=t=out:st=${num(dur - fout)}:d=${num(fout)}:alpha=1`);
      overlay(`[${k}:v]`, c.start / fps, parts.join(','));
    }
  }
  g.chains.push(ranged ? `${cur}trim=start=${num(inSec)}:end=${num(outSec)},setpts=PTS-STARTPTS[vout]` : `${cur}null[vout]`);

  // ---- Ton ----
  const aext = transitionOverhangs(seq, 'audioFade', byId);
  const mixed: string[] = [];
  for (const t of seq.tracks.filter((x) => x.kind === 'audio' && !x.muted)) {
    for (const c of seq.clips.filter((x) => x.trackId === t.id && x.kind === 'media').sort((a, b) => a.start - b.start)) {
      const m = c.mediaId ? byId.get(c.mediaId) : undefined;
      if (!m || !m.hasAudio || m.kind === 'image') continue;
      const e = aext.get(c.id) ?? NO_EXT;
      const start = c.start / fps - e.head;
      const len = c.duration / fps + e.head + e.tail;
      const k = addInput(g, ['-ss', num(Math.max(0, c.sourceIn - e.head)), '-t', num(len), '-i', m.path]);
      const parts = ['asetpts=PTS-STARTPTS', `aresample=${AUDIO_RATE}`, 'aformat=channel_layouts=stereo'];
      if (c.gainDb !== 0) parts.push(`volume=${num(c.gainDb)}dB`);
      const own = { in: c.fadeIn / fps, out: c.fadeOut / fps };
      if (own.in > 0) parts.push(`afade=t=in:st=${num(e.head)}:d=${num(own.in)}`);
      if (own.out > 0) parts.push(`afade=t=out:st=${num(len - e.tail - own.out)}:d=${num(own.out)}`);
      if (e.fadeIn > 0) parts.push(`afade=t=in:st=0:d=${num(e.fadeIn)}`);
      if (e.fadeOut > 0) parts.push(`afade=t=out:st=${num(len - e.fadeOut)}:d=${num(e.fadeOut)}`);
      const ms = Math.round(start * 1000);
      if (ms > 0) parts.push(`adelay=delays=${ms}:all=1`);
      g.chains.push(`[${k}:a]${parts.join(',')}[a${mixed.length}]`);
      mixed.push(`[a${mixed.length}]`);
    }
  }
  const trimA = `atrim=start=${num(inSec)}:end=${num(outSec)},asetpts=PTS-STARTPTS[aout]`;
  if (mixed.length > 0) {
    g.chains.push(`${mixed.join('')}amix=inputs=${mixed.length}:normalize=0:duration=longest[mix]`);
    g.chains.push(`[mix]apad,${trimA}`);
  } else {
    // Keine Ton-Clips: stille Spur in Sequenzlänge (Rundfunk-/Social-Dateien brauchen immer Ton).
    const k = addInput(g, ['-f', 'lavfi', '-t', num(baseSec), '-i', `anullsrc=r=${AUDIO_RATE}:cl=stereo`]);
    g.chains.push(`[${k}:a]${trimA}`);
  }

  const args = [
    ...g.inputs.flat(),
    '-filter_complex', g.chains.join(';'),
    '-map', '[vout]',
    '-map', '[aout]',
    '-r', num(fps),
    '-s', `${W}x${H}`,
    ...encodingArgs(preset, opts),
    output,
  ];
  return { args, durationSec };
}
