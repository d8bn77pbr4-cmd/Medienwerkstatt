import { produce, type Draft } from 'immer';
import { defaultIdGen, type IdGen } from '../sequence';
import type { Clip, Frames, Sequence } from '../types';

export type OpOpts = { idGen?: IdGen; ignoreLinks?: boolean };
export const EPS = 1e-6;

export const clipEnd = (c: Clip): Frames => c.start + c.duration;
export const gen = (o: OpOpts): IdGen => o.idGen ?? defaultIdGen;
export const isLocked = (s: Sequence, trackId: string): boolean => s.tracks.find((t) => t.id === trackId)?.locked ?? true;
export const unlockedIds = (s: Sequence): string[] => s.tracks.filter((t) => !t.locked).map((t) => t.id);

/** Wendet `recipe` auf einen Entwurf an und räumt danach Überblendungen und Verknüpfungen auf. */
export function edit(seq: Sequence, recipe: (d: Draft<Sequence>) => void): Sequence {
  return produce(seq, (d) => {
    recipe(d);
    tidy(d);
  });
}

export function tidy(d: Draft<Sequence>): void {
  const byId = new Map(d.clips.map((c) => [c.id, c]));
  const keep = d.transitions.filter((t) => {
    const l = byId.get(t.leftClipId);
    const r = byId.get(t.rightClipId);
    return !!l && !!r && l.trackId === r.trackId && clipEnd(l) === r.start;
  });
  if (keep.length !== d.transitions.length) d.transitions = keep;
  for (const t of d.transitions) {
    const tid = byId.get(t.leftClipId)!.trackId;
    if (t.trackId !== tid) t.trackId = tid;
  }
  const counts = new Map<string, number>();
  for (const c of d.clips) if (c.linkId) counts.set(c.linkId, (counts.get(c.linkId) ?? 0) + 1);
  for (const c of d.clips) if (c.linkId && (counts.get(c.linkId) ?? 0) < 2) c.linkId = null;
  for (const c of d.clips) {
    if (c.fadeIn > c.duration) c.fadeIn = c.duration;
    if (c.fadeOut > c.duration) c.fadeOut = c.duration;
  }
  const order = new Map(d.tracks.map((t, i) => [t.id, i]));
  const cmp = (a: Clip, b: Clip) => a.start - b.start || (order.get(a.trackId) ?? 0) - (order.get(b.trackId) ?? 0);
  let sorted = true;
  for (let i = 1; i < d.clips.length && sorted; i++) if (cmp(d.clips[i - 1], d.clips[i]) > 0) sorted = false;
  if (!sorted) d.clips.sort(cmp);
}

/** Auswahl samt verknüpften Partnern (außer bei ignoreLinks); Clips auf gesperrten Spuren fallen weg. */
export function groupOf(seq: Sequence, ids: string[], ignoreLinks: boolean): Clip[] {
  const out = new Map<string, Clip>();
  for (const id of ids) {
    const c = seq.clips.find((x) => x.id === id);
    if (!c) continue;
    out.set(c.id, c);
    if (!ignoreLinks && c.linkId) for (const p of seq.clips) if (p.linkId === c.linkId) out.set(p.id, p);
  }
  return [...out.values()].filter((c) => !isLocked(seq, c.trackId));
}

/** Teilt `c` bei `at`; die linke Hälfte behält die Id. Gibt die rechte Hälfte zurück. */
export function splitClip(d: Draft<Sequence>, c: Draft<Clip>, at: Frames, idGen: IdGen): Draft<Clip> {
  const right: Clip = {
    ...c,
    id: idGen(),
    start: at,
    duration: clipEnd(c) - at,
    sourceIn: c.kind === 'title' ? c.sourceIn : c.sourceIn + (at - c.start) / d.fps,
    fadeIn: 0,
  };
  c.duration = at - c.start;
  c.fadeOut = 0;
  for (const t of d.transitions) if (t.leftClipId === c.id) t.leftClipId = right.id;
  d.clips.push(right);
  return d.clips[d.clips.length - 1];
}

/** Rasierklinge: teilt alles bei `at` auf den Spuren samt verknüpften Partnern; Verknüpfungen bleiben paarweise. */
export function splitAtOnTracks(d: Draft<Sequence>, at: Frames, trackIds: string[], idGen: IdGen): void {
  const ids = new Set(trackIds.filter((t) => !isLocked(d, t)));
  const crosses = (c: Clip) => c.start < at && clipEnd(c) > at && !isLocked(d, c.trackId);
  const set = new Set<string>();
  for (const c of d.clips) if (crosses(c) && ids.has(c.trackId)) set.add(c.id);
  for (const c of d.clips) {
    if (!set.has(c.id) || !c.linkId) continue;
    for (const p of d.clips) if (p.linkId === c.linkId && crosses(p)) set.add(p.id);
  }
  const newLinks = new Map<string, string>();
  for (const c of d.clips) {
    if (!set.has(c.id) || !c.linkId || newLinks.has(c.linkId)) continue;
    if (d.clips.filter((m) => m.linkId === c.linkId).every((m) => set.has(m.id))) newLinks.set(c.linkId, idGen());
  }
  for (const id of [...set]) {
    const c = d.clips.find((x) => x.id === id)!;
    const link = c.linkId;
    const right = splitClip(d, c, at, idGen);
    if (link) right.linkId = newLinks.get(link) ?? link;
  }
}

/** Macht [from,to) auf der Spur frei (entfernt, kürzt oder teilt Überlappendes). */
export function clearRange(d: Draft<Sequence>, trackId: string, from: Frames, to: Frames, idGen: IdGen): void {
  const remove = new Set<string>();
  for (const c of [...d.clips]) {
    if (c.trackId !== trackId || c.start >= to || clipEnd(c) <= from) continue;
    if (c.start >= from && clipEnd(c) <= to) remove.add(c.id);
    else if (c.start < from && clipEnd(c) > to) {
      const right = splitClip(d, c, to, idGen);
      right.linkId = null;
      c.duration = from - c.start;
    } else if (c.start < from) {
      c.duration = from - c.start;
      c.fadeOut = 0;
    } else {
      if (c.kind === 'media') c.sourceIn += (to - c.start) / d.fps;
      c.duration = clipEnd(c) - to;
      c.start = to;
      c.fadeIn = 0;
    }
  }
  if (remove.size) d.clips = d.clips.filter((c) => !remove.has(c.id));
}

/**
 * Verschiebt alle Clips ab `boundary` auf nicht gesperrten Spuren um `amount` Bilder.
 * Nach links nie weiter, als der Platz reicht (kein Überlappen) und höchstens `maxLeft`.
 * Gibt die tatsächliche Verschiebung zurück.
 */
export function shiftAfter(d: Draft<Sequence>, boundary: Frames, amount: Frames, exclude: Set<string>, maxLeft = Infinity): Frames {
  let shift = amount;
  const movers = (c: Clip) => !exclude.has(c.id) && c.start >= boundary && !isLocked(d, c.trackId);
  if (amount < 0) {
    let allowed = Math.min(-amount, maxLeft);
    for (const t of d.tracks) {
      if (t.locked) continue;
      const mine = d.clips.filter((c) => c.trackId === t.id);
      const moving = mine.filter(movers);
      if (!moving.length) continue;
      const first = Math.min(...moving.map((c) => c.start));
      const stay = mine.filter((c) => !movers(c));
      const stayEnd = stay.length ? Math.max(...stay.map(clipEnd)) : 0;
      allowed = Math.min(allowed, Math.max(0, first - stayEnd));
    }
    shift = -allowed;
  }
  if (shift === 0) return 0;
  for (const c of d.clips) if (movers(c)) c.start += shift;
  return shift;
}
