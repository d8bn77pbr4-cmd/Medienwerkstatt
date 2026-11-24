import type { Clip, Frames, MediaItem, Sequence, TitleParams, TitleStyle, TrackId } from '../types';
import { clearRange, clipEnd, edit, gen, groupOf, isLocked, shiftAfter, splitAtOnTracks, unlockedIds, type OpOpts } from './common';

const trackKind = (s: Sequence, id: string | undefined) => s.tracks.find((t) => t.id === id)?.kind;

function baseClip(over: Partial<Clip> & Pick<Clip, 'id' | 'trackId' | 'start' | 'duration'>): Clip {
  return {
    kind: 'media',
    sourceIn: 0,
    linkId: null,
    gainDb: 0,
    fadeIn: 0,
    fadeOut: 0,
    color: null,
    title: null,
    ...over,
  };
}

/**
 * Fügt [srcIn, srcOut) der Quelle bei `at` ein. Bild und Ton entstehen als verknüpftes Paar.
 * 'insert' schiebt alles ab `at` auf allen nicht gesperrten Spuren nach rechts, 'overwrite' ersetzt.
 */
export function insertEdit(
  seq: Sequence,
  media: MediaItem,
  srcIn: number,
  srcOut: number,
  at: Frames,
  targets: { video?: TrackId; audio?: TrackId },
  mode: 'insert' | 'overwrite',
  opts: OpOpts = {},
): Sequence {
  const idGen = gen(opts);
  const len = Math.max(1, Math.round((srcOut - srcIn) * seq.fps));
  const ok = (id: TrackId | undefined, kind: 'video' | 'audio') =>
    id !== undefined && trackKind(seq, id) === kind && !isLocked(seq, id) ? id : undefined;
  const v = media.kind === 'audio' ? undefined : ok(targets.video, 'video');
  const a = media.kind === 'image' || (media.kind === 'video' && !media.hasAudio) ? undefined : ok(targets.audio, 'audio');
  const used = [v, a].filter((x): x is TrackId => x !== undefined);
  if (!used.length || at < 0) return seq;
  return edit(seq, (d) => {
    if (mode === 'insert') {
      splitAtOnTracks(d, at, unlockedIds(d), idGen);
      shiftAfter(d, at, len, new Set());
    } else {
      for (const t of used) clearRange(d, t, at, at + len, idGen);
    }
    const linkId = used.length === 2 ? idGen() : null;
    for (const trackId of used) {
      d.clips.push(baseClip({ id: idGen(), trackId, mediaId: media.id, start: at, duration: len, sourceIn: srcIn, linkId }));
    }
  });
}

const TITLE_DEFAULTS: Record<TitleStyle, { sec: number; params: Omit<TitleParams, 'style'> }> = {
  bauchbinde: { sec: 4, params: { line1: 'Name', line2: 'Funktion', font: 'Helvetica Neue', size: 36, color: '#ffffff', x: 0.08, y: 0.78, fadeIn: 8, fadeOut: 8 } },
  titel: { sec: 5, params: { line1: 'Titel', line2: '', font: 'Helvetica Neue', size: 72, color: '#ffffff', x: 0.5, y: 0.5, fadeIn: 12, fadeOut: 12 } },
  abspann: { sec: 8, params: { line1: 'Abspann', line2: '', font: 'Helvetica Neue', size: 48, color: '#ffffff', x: 0.5, y: 0.5, fadeIn: 12, fadeOut: 12 } },
};

/** Legt einen Titel auf eine Videospur (überschreibt Darunterliegendes auf dieser Spur). */
export function addTitle(seq: Sequence, at: Frames, trackId: TrackId, style: TitleStyle, opts: OpOpts = {}): Sequence {
  if (trackKind(seq, trackId) !== 'video' || isLocked(seq, trackId) || at < 0) return seq;
  const idGen = gen(opts);
  const def = TITLE_DEFAULTS[style];
  const len = Math.max(1, Math.round(def.sec * seq.fps));
  return edit(seq, (d) => {
    clearRange(d, trackId, at, at + len, idGen);
    d.clips.push(baseClip({ id: idGen(), trackId, kind: 'title', start: at, duration: len, title: { style, ...def.params } }));
  });
}

/** Rasierklinge (Razor): teilt Clips bei `at` auf den Spuren samt verknüpften Partnern. */
export function razor(seq: Sequence, at: Frames, trackIds: TrackId[], opts: OpOpts = {}): Sequence {
  const idGen = gen(opts);
  if (!seq.clips.some((c) => c.start < at && clipEnd(c) > at)) return seq;
  return edit(seq, (d) => splitAtOnTracks(d, at, trackIds, idGen));
}

/** Alle Spuren schneiden (⌘K). */
export function addEditAll(seq: Sequence, at: Frames, opts: OpOpts = {}): Sequence {
  return razor(seq, at, unlockedIds(seq), opts);
}

/** Verknüpfen bzw. lösen: sind alle verknüpft, wird gelöst, sonst gemeinsam neu verknüpft. */
export function toggleLink(seq: Sequence, clipIds: string[], opts: OpOpts = {}): Sequence {
  const sel = groupOf(seq, clipIds, true);
  if (sel.length < 2) return seq;
  const ids = new Set(sel.map((c) => c.id));
  const allLinked = sel.every((c) => c.linkId !== null);
  const link = gen(opts)();
  return edit(seq, (d) => {
    for (const c of d.clips) if (ids.has(c.id)) c.linkId = allLinked ? null : link;
  });
}

const CLIP_PATCH_KEYS = ['gainDb', 'fadeIn', 'fadeOut', 'color', 'title'] as const;
export type ClipPatch = Partial<Pick<Clip, (typeof CLIP_PATCH_KEYS)[number]>>;

export function setClipProps(seq: Sequence, clipId: string, patch: ClipPatch): Sequence {
  const c = seq.clips.find((x) => x.id === clipId);
  if (!c || isLocked(seq, c.trackId)) return seq;
  return edit(seq, (d) => {
    const t = d.clips.find((x) => x.id === clipId)!;
    for (const k of CLIP_PATCH_KEYS) if (k in patch) Object.assign(t, { [k]: patch[k] });
    t.fadeIn = Math.max(0, Math.min(t.fadeIn, t.duration));
    t.fadeOut = Math.max(0, Math.min(t.fadeOut, t.duration));
  });
}
