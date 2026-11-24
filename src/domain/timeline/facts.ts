import type { ProjectFacts } from '../chef/types';
import type { Clip, MediaItem, Sequence } from './types';

const end = (c: Clip) => c.start + c.duration;

/** Gleicher Clip oder Durchschnitt: gleiche Spur und Quelle, Quellzeit läuft (≤ 1 Bild Abweichung) weiter. */
function continues(run: { clip: Clip; to: number }, next: Clip, at: number, fps: number): boolean {
  if (run.clip.id === next.id) return true;
  if (run.clip.trackId !== next.trackId || run.clip.mediaId !== next.mediaId) return false;
  const prevSrc = run.clip.sourceIn + (run.to - run.clip.start) / fps;
  const nextSrc = next.sourceIn + (at - next.start) / fps;
  return Math.abs(nextSrc - prevSrc) <= 1 / fps + 1e-6;
}

/** Einstellungen: maximale Läufe desselben sichtbaren Clips auf der obersten nicht stummen Videospur (Titel zählen nicht). */
function shotsOf(seq: Sequence, media: MediaItem[]): ProjectFacts['shots'] {
  const videoTracks = seq.tracks.filter((t) => t.kind === 'video' && !t.muted).map((t) => t.id);
  const clips = seq.clips.filter((c) => c.kind === 'media' && videoTracks.includes(c.trackId));
  const points = [...new Set(clips.flatMap((c) => [c.start, end(c)]))].sort((a, b) => a - b);
  const runs: { clip: Clip; from: number; to: number }[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const [from, to] = [points[i], points[i + 1]];
    let visible: Clip | null = null;
    for (const id of videoTracks) {
      const hit = clips.find((c) => c.trackId === id && c.start <= from && end(c) >= to);
      if (hit) visible = hit; // spätere Spur liegt oben
    }
    if (!visible) continue;
    const last = runs[runs.length - 1];
    if (last && last.to === from && continues(last, visible, from, seq.fps)) {
      last.to = to;
      last.clip = visible;
    } else runs.push({ clip: visible, from, to });
  }
  return runs.map((r) => {
    const mediaId = r.clip.mediaId ?? '';
    return {
      start: r.from / seq.fps,
      end: r.to / seq.fps,
      mediaId,
      shotSize: media.find((m) => m.id === mediaId)?.shotSize ?? null,
    };
  });
}

function audioCutsWithoutFade(seq: Sequence): number {
  let n = 0;
  for (const t of seq.tracks.filter((x) => x.kind === 'audio')) {
    const clips = seq.clips.filter((c) => c.trackId === t.id && c.kind === 'media').sort((a, b) => a.start - b.start);
    for (let i = 0; i + 1 < clips.length; i++) {
      const [a, b] = [clips[i], clips[i + 1]];
      if (end(a) !== b.start) continue;
      const faded = a.fadeOut >= 2 || b.fadeIn >= 2 || seq.transitions.some((x) => x.kind === 'audioFade' && x.leftClipId === a.id && x.rightClipId === b.id);
      if (!faded) n++;
    }
  }
  return n;
}

function hasJOrLCut(seq: Sequence): boolean {
  const kindOf = (c: Clip) => seq.tracks.find((t) => t.id === c.trackId)?.kind;
  return seq.clips.some(
    (a) =>
      kindOf(a) === 'audio' &&
      a.linkId !== null &&
      seq.clips.some((v) => v.linkId === a.linkId && kindOf(v) === 'video' && (Math.abs(a.start - v.start) >= 3 || Math.abs(end(a) - end(v)) >= 3)),
  );
}

/** Projekt-Fakten für den Regel-Chef; Einstellungen in Sekunden. */
export function projectFacts(seq: Sequence, media: MediaItem[]): ProjectFacts {
  const shots = shotsOf(seq, media);
  const used = seq.clips.filter((c) => c.kind === 'media').map((c) => media.find((m) => m.id === c.mediaId));
  return {
    shots,
    hasJOrLCut: hasJOrLCut(seq),
    lowerThirds: seq.clips.filter((c) => c.kind === 'title' && c.title?.style === 'bauchbinde').length,
    transitions: seq.transitions.filter((t) => t.kind === 'dissolve').length,
    audioCutsWithoutFade: audioCutsWithoutFade(seq),
    fpsMismatch: used.some((m) => !!m && m.kind !== 'image' && m.fps !== null && Math.abs(m.fps - seq.fps) > 0.01),
    longestShotSec: shots.reduce((mx, s) => Math.max(mx, s.end - s.start), 0),
  };
}
