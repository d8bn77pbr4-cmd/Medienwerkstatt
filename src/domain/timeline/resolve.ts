import type { Clip, ColorParams, MediaItem, Sequence } from './types';
import { NO_OVERHANG, transitionOverhangs } from './transitions';

export type ResolvedLayer = { clipId: string; mediaId: string; sourceTime: number; alpha: number; lutKey: string };
export type ResolvedTitle = { clipId: string; alpha: number };
export type ResolvedAudio = { clipId: string; mediaId: string; sourceTime: number; gain: number };
export type ResolvedFrame = { layers: ResolvedLayer[]; titles: ResolvedTitle[]; audio: ResolvedAudio[] };

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const EPS = 1e-9;

/** Stabiler Schlüssel einer Farbkorrektur (Zwischenspeicher der 3D-LUT in der Vorschau). */
export function lutKeyOf(c: ColorParams | null): string {
  if (!c) return 'none';
  return [c.exposure, c.contrast, c.highlights, c.shadows, c.temperature, c.tint, c.saturation].join('|');
}

/**
 * Was bei Bild `frame` zu sehen und zu hören ist. Reine Funktion, Grundlage der Vorschau.
 * Überblendungen und Tonblenden benutzen dieselben Überstände wie der Export
 * (`transitionOverhangs`): Der rechte Clip beginnt `head` früher und blendet linear über
 * `fadeIn` ein, der linke läuft `tail` über seinen Schnitt hinaus.
 * Bildebenen von unten (V1) nach oben (V2); Titel liegen über allen Bildebenen.
 * Stumme Spuren (Bild wie Ton) liefern nichts, genau wie im Export.
 */
export function resolveFrame(seq: Sequence, media: Map<string, MediaItem> | MediaItem[], frame: number): ResolvedFrame {
  const byId = Array.isArray(media) ? new Map(media.map((m) => [m.id, m])) : media;
  const fps = seq.fps;
  const vext = transitionOverhangs(seq, 'dissolve', byId);
  const aext = transitionOverhangs(seq, 'audioFade', byId);
  const out: ResolvedFrame = { layers: [], titles: [], audio: [] };

  const clipsOn = (trackId: string): Clip[] => seq.clips.filter((c) => c.trackId === trackId).sort((a, b) => a.start - b.start);
  const sourceTime = (c: Clip): number => Math.max(0, c.sourceIn + (frame - c.start) / fps);

  for (const t of seq.tracks.filter((x) => x.kind === 'video' && !x.muted)) {
    for (const c of clipsOn(t.id)) {
      if (c.kind === 'title') {
        if (!c.title || frame < c.start || frame >= c.start + c.duration) continue;
        const local = frame - c.start;
        const fin = c.title.fadeIn > 0 ? local / c.title.fadeIn : 1;
        const fout = c.title.fadeOut > 0 ? (c.duration - local) / c.title.fadeOut : 1;
        out.titles.push({ clipId: c.id, alpha: clamp01(fin) * clamp01(fout) });
        continue;
      }
      const m = c.mediaId ? byId.get(c.mediaId) : undefined;
      if (!m || m.kind === 'audio') continue;
      const e = vext.get(c.id) ?? NO_OVERHANG;
      const from = c.start - e.head * fps;
      if (frame < from - EPS || frame >= c.start + c.duration + e.tail * fps - EPS) continue;
      const alpha = e.fadeIn > 0 ? clamp01((frame - from) / (e.fadeIn * fps)) : 1;
      out.layers.push({ clipId: c.id, mediaId: m.id, sourceTime: m.kind === 'image' ? 0 : sourceTime(c), alpha, lutKey: lutKeyOf(c.color) });
    }
  }

  for (const t of seq.tracks.filter((x) => x.kind === 'audio' && !x.muted)) {
    for (const c of clipsOn(t.id)) {
      const m = c.kind === 'media' && c.mediaId ? byId.get(c.mediaId) : undefined;
      if (!m || !m.hasAudio || m.kind === 'image') continue;
      const e = aext.get(c.id) ?? NO_OVERHANG;
      const end = c.start + c.duration;
      const from = c.start - e.head * fps;
      if (frame < from - EPS || frame >= end + e.tail * fps - EPS) continue;
      // ffmpeg verkettet die afade-Filter: die Hüllkurven multiplizieren sich.
      let env = 1;
      if (c.fadeIn > 0) env *= clamp01((frame - c.start) / c.fadeIn);
      if (c.fadeOut > 0) env *= clamp01((end - frame) / c.fadeOut);
      if (e.fadeIn > 0) env *= clamp01((frame - from) / (e.fadeIn * fps));
      if (e.fadeOut > 0) env *= clamp01((end + e.tail * fps - frame) / (e.fadeOut * fps));
      out.audio.push({ clipId: c.id, mediaId: m.id, sourceTime: sourceTime(c), gain: 10 ** (c.gainDb / 20) * env });
    }
  }
  return out;
}
