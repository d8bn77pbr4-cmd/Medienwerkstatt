import { describe, expect, it } from 'vitest';
import { newSequence, withFormat } from '../../src/domain/timeline/sequence';
import type { Clip, MediaItem, Sequence } from '../../src/domain/timeline/types';
import {
  addEditAll, addTitle, addTransition, insertEdit, liftDelete, moveClips, razor, rippleDelete,
  rippleTrimToPlayhead, roll, setClipProps, toggleLink, trim,
} from '../../src/domain/timeline/ops';
import { History } from '../../src/domain/timeline/history';
import { snap, snapTargets } from '../../src/domain/timeline/snap';
import { projectFacts } from '../../src/domain/timeline/facts';

const counter = () => {
  let n = 0;
  return () => `id${++n}`;
};
const mkMedia = (id: string, over: Partial<MediaItem> = {}): MediaItem => ({
  kind: 'video', durationSec: 10, width: 1920, height: 1080, fps: 25, hasAudio: true, hdr: false,
  videoCodec: 'h264', audioCodec: 'aac', rotation: 0, id, name: id, path: `/${id}.mov`, proxyPath: null, shotSize: null, ...over,
});
const mkClip = (id: string, trackId: string, start: number, duration: number, over: Partial<Clip> = {}): Clip => ({
  id, trackId, kind: 'media', mediaId: 'm', start, duration, sourceIn: 0, linkId: null, gainDb: 0,
  fadeIn: 0, fadeOut: 0, color: null, title: null, ...over,
});
const base = (clips: Clip[]): Sequence => ({ ...newSequence({ width: 1920, height: 1080, fps: 25, name: 't' }, () => 's'), clips });
const on = (s: Sequence, t: string) => s.clips.filter((c) => c.trackId === t).sort((a, b) => a.start - b.start);
const span = (c: Clip) => [c.start, c.start + c.duration];
const M = [mkMedia('m')];

describe('newSequence', () => {
  it('legt V1, V2, A1–A4 an', () => {
    expect(newSequence({ width: 1, height: 1, fps: 25, name: 'x' }).tracks.map((t) => t.id)).toEqual(['V1', 'V2', 'A1', 'A2', 'A3', 'A4']);
  });
  it('withFormat: Auflösung allein ändert keine Bilder, neue Bildrate rechnet um und behält Stöße', () => {
    const s = { ...base([mkClip('a', 'V1', 0, 50), mkClip('b', 'V1', 50, 37)]), markers: [{ frame: 25, label: '' }], inPoint: 10, outPoint: null };
    expect(withFormat(s, { width: 1920, height: 1080, fps: 25 })).toBe(s);
    const r = withFormat(s, { width: 1080, height: 1920, fps: 25 });
    expect([r.width, r.height, r.clips]).toEqual([1080, 1920, s.clips]);
    const f = withFormat(s, { width: 1920, height: 1080, fps: 50 });
    expect(on(f, 'V1').map(span)).toEqual([[0, 100], [100, 174]]);
    expect([f.fps, f.markers[0].frame, f.inPoint, f.outPoint]).toEqual([50, 50, 20, null]);
    const g = withFormat(s, { width: 1920, height: 1080, fps: 30 });
    expect(on(g, 'V1')[0].start + on(g, 'V1')[0].duration).toBe(on(g, 'V1')[1].start);
  });
});

describe('insertEdit', () => {
  const two = base([mkClip('a', 'V1', 0, 50), mkClip('b', 'V1', 50, 50)]);
  it('Überschreiben ersetzt, Länge bleibt', () => {
    const s = insertEdit(two, M[0], 0, 2, 25, { video: 'V1' }, 'overwrite', { idGen: counter() });
    expect(on(s, 'V1').map(span)).toEqual([[0, 25], [25, 75], [75, 100]]);
  });
  it('Einfügen schiebt nach rechts, Länge 150', () => {
    const s = insertEdit(two, M[0], 0, 2, 25, { video: 'V1' }, 'insert', { idGen: counter() });
    const v1 = on(s, 'V1');
    expect(Math.max(...v1.map((c) => c.start + c.duration))).toBe(150);
    expect(v1.map(span)).toEqual([[0, 25], [25, 75], [75, 100], [100, 150]]);
  });
  it('Einfügen schiebt alle nicht gesperrten Spuren, gesperrte nicht', () => {
    let s = base([mkClip('v', 'V1', 0, 100), mkClip('t', 'V2', 60, 20), mkClip('a', 'A1', 60, 20), mkClip('l', 'A2', 60, 20)]);
    s = { ...s, tracks: s.tracks.map((t) => (t.id === 'A2' ? { ...t, locked: true } : t)) };
    const r = insertEdit(s, mkMedia('m', { hasAudio: false }), 0, 1, 10, { video: 'V1' }, 'insert', { idGen: counter() });
    expect(on(r, 'V2')[0].start).toBe(85);
    expect(on(r, 'A1')[0].start).toBe(85);
    expect(on(r, 'A2')[0].start).toBe(60);
  });
  it('erzeugt verknüpftes Bild/Ton-Paar, Bild allein ohne Link', () => {
    const s = insertEdit(base([]), M[0], 1, 3, 0, { video: 'V1', audio: 'A1' }, 'overwrite', { idGen: counter() });
    const [v, a] = [on(s, 'V1')[0], on(s, 'A1')[0]];
    expect(v.linkId).not.toBeNull();
    expect(a.linkId).toBe(v.linkId);
    expect([v.duration, v.sourceIn]).toEqual([50, 1]);
    const img = insertEdit(base([]), mkMedia('i', { kind: 'image', hasAudio: false, fps: null }), 0, 4, 0, { video: 'V1', audio: 'A1' }, 'overwrite');
    expect(img.clips).toHaveLength(1);
    expect(img.clips[0].linkId).toBeNull();
  });
  it('gesperrte Spur bleibt unverändert', () => {
    const s = { ...two, tracks: two.tracks.map((t) => (t.id === 'V1' ? { ...t, locked: true } : t)) };
    expect(insertEdit(s, M[0], 0, 2, 25, { video: 'V1' }, 'overwrite')).toBe(s);
    expect(razor(s, 25, ['V1'])).toBe(s);
    expect(trim(s, M, 'a', 'out', -10)).toBe(s);
    expect(rippleDelete(s, ['a'])).toBe(s);
  });
});

describe('razor', () => {
  it('Verknüpfungen bleiben paarweise', () => {
    const s = base([mkClip('v', 'V1', 0, 100, { linkId: 'L' }), mkClip('a', 'A1', 0, 100, { linkId: 'L' })]);
    const r = razor(s, 40, ['V1'], { idGen: counter() });
    expect(r.clips).toHaveLength(4);
    const links = new Map<string, number>();
    for (const c of r.clips) links.set(c.linkId!, (links.get(c.linkId!) ?? 0) + 1);
    expect([...links.values()]).toEqual([2, 2]);
    expect(r.clips.find((c) => c.id === 'v')!.linkId).toBe(r.clips.find((c) => c.id === 'a')!.linkId);
    const right = on(r, 'V1')[1];
    expect([right.start, right.duration, right.sourceIn]).toEqual([40, 60, 1.6]);
  });
  it('addEditAll schneidet alle nicht gesperrten Spuren', () => {
    let s = base([mkClip('v', 'V1', 0, 100), mkClip('a', 'A1', 0, 100), mkClip('l', 'A2', 0, 100)]);
    s = { ...s, tracks: s.tracks.map((t) => (t.id === 'A2' ? { ...t, locked: true } : t)) };
    const r = addEditAll(s, 50, { idGen: counter() });
    expect(on(r, 'V1')).toHaveLength(2);
    expect(on(r, 'A1')).toHaveLength(2);
    expect(on(r, 'A2')).toHaveLength(1);
  });
  it('Schnitt auf Clipgrenze ändert nichts', () => {
    const s = base([mkClip('v', 'V1', 0, 100)]);
    expect(razor(s, 100, ['V1'])).toBe(s);
  });
});

describe('Löschen', () => {
  it('Rasierklinge + Ripple-Löschen schließt die Lücke auf allen Spuren', () => {
    const s = base([mkClip('v', 'V1', 0, 100, { linkId: 'L' }), mkClip('a', 'A1', 0, 100, { linkId: 'L' })]);
    const idGen = counter();
    const cut = razor(addEditAll(s, 30, { idGen }), 60, ['V1', 'A1'], { idGen });
    const mid = on(cut, 'V1')[1];
    const r = rippleDelete(cut, [mid.id]);
    expect(on(r, 'V1').map(span)).toEqual([[0, 30], [30, 70]]);
    expect(on(r, 'A1').map(span)).toEqual([[0, 30], [30, 70]]);
  });
  it('stoppt am ersten Hindernis', () => {
    // a[0,50) wird gelöscht; ein V2-Clip ab 20 ist das erste Hindernis → nur 20 Bilder frei
    const s = base([mkClip('a', 'V1', 0, 50), mkClip('b', 'V1', 50, 50), mkClip('c', 'V2', 20, 60)]);
    const r = rippleDelete(s, ['a']);
    expect(on(r, 'V1')[0].start).toBe(30);
    expect(on(r, 'V2')[0].start).toBe(20);
    // ein Clip, der den Anfang der Lücke berührt, blockiert ganz
    const s2 = base([mkClip('a', 'V1', 0, 50), mkClip('b', 'V1', 50, 50), mkClip('c', 'V2', 0, 30)]);
    expect(on(rippleDelete(s2, ['a']), 'V1')[0].start).toBe(50);
  });
  it('liftDelete lässt die Lücke, löscht Partner mit', () => {
    const s = base([mkClip('v', 'V1', 0, 50, { linkId: 'L' }), mkClip('a', 'A1', 0, 50, { linkId: 'L' }), mkClip('w', 'V1', 50, 50)]);
    const r = liftDelete(s, ['v']);
    expect(r.clips.map((c) => c.id)).toEqual(['w']);
    expect(r.clips[0].start).toBe(50);
  });
  it('Überblendungen gelöschter Clips verschwinden', () => {
    let s = base([mkClip('a', 'V1', 0, 50, { sourceIn: 1 }), mkClip('b', 'V1', 50, 50, { sourceIn: 1 })]);
    s = addTransition(s, M, 'a', 'b', 10, { idGen: counter() }).seq;
    expect(s.transitions).toHaveLength(1);
    expect(liftDelete(s, ['a']).transitions).toHaveLength(0);
  });
});

describe('trim / roll', () => {
  it('Trimmen über Quell-Ende hinaus wird begrenzt (5-s-Quelle)', () => {
    const m = [mkMedia('m', { durationSec: 5 })];
    const s = base([mkClip('a', 'V1', 0, 100, { sourceIn: 2 })]);
    expect(on(trim(s, m, 'a', 'out', 500), 'V1')[0].duration).toBe(75);
    const early = base([mkClip('a', 'V1', 100, 50, { sourceIn: 2 })]);
    const t = trim(early, m, 'a', 'in', -500).clips[0];
    expect([t.start, t.sourceIn, t.duration]).toEqual([50, 0, 100]);
  });
  it('normales Trimmen stoppt am Nachbarn, Mindestdauer 1 Bild', () => {
    const s = base([mkClip('a', 'V1', 0, 50), mkClip('b', 'V1', 60, 40)]);
    expect(trim(s, M, 'a', 'out', 100).clips.find((c) => c.id === 'a')!.duration).toBe(60);
    expect(trim(s, M, 'a', 'out', -100).clips.find((c) => c.id === 'a')!.duration).toBe(1);
  });
  it('Ripple-Trimmen rückt Folgendes nach', () => {
    const s = base([mkClip('a', 'V1', 0, 50), mkClip('b', 'V1', 50, 50)]);
    const r = trim(s, M, 'a', 'out', -20, 'ripple');
    expect(on(r, 'V1').map(span)).toEqual([[0, 30], [30, 80]]);
  });
  it('verknüpfte Clips trimmen gemeinsam', () => {
    const s = base([mkClip('v', 'V1', 0, 100, { linkId: 'L' }), mkClip('a', 'A1', 0, 100, { linkId: 'L' })]);
    const r = trim(s, M, 'v', 'out', -10);
    expect(r.clips.map((c) => c.duration)).toEqual([90, 90]);
  });
  it('⌥-Trim des Tons erzeugt J-Cut, hasJOrLCut = true', () => {
    const s = base([
      mkClip('v1', 'V1', 0, 100, { linkId: 'L1' }), mkClip('a1', 'A1', 0, 100, { linkId: 'L1' }),
      mkClip('v2', 'V1', 100, 100, { linkId: 'L2', sourceIn: 2 }), mkClip('a2', 'A2', 100, 100, { linkId: 'L2', sourceIn: 2 }),
    ]);
    expect(projectFacts(s, M).hasJOrLCut).toBe(false);
    const j = trim(s, M, 'a2', 'in', -25, 'normal', { ignoreLinks: true });
    const a2 = j.clips.find((c) => c.id === 'a2')!;
    expect([a2.start, j.clips.find((c) => c.id === 'v2')!.start]).toEqual([75, 100]);
    expect(projectFacts(j, M).hasJOrLCut).toBe(true);
  });
  it('Roll verschiebt den Schnitt', () => {
    const s = base([mkClip('a', 'V1', 0, 50), mkClip('b', 'V1', 50, 50, { sourceIn: 2 })]);
    const r = roll(s, M, 'a', 'b', 10);
    expect(on(r, 'V1').map(span)).toEqual([[0, 60], [60, 100]]);
    expect(on(r, 'V1')[1].sourceIn).toBeCloseTo(2.4);
  });
  it('Q trimmt den Kopf bis zur Abspielposition und rückt nach, W das Ende', () => {
    const s = base([mkClip('a', 'V1', 0, 50, { linkId: 'L' }), mkClip('x', 'A1', 0, 50, { linkId: 'L' }), mkClip('b', 'V1', 50, 50), mkClip('y', 'A1', 50, 50)]);
    const q = rippleTrimToPlayhead(s, M, 20, 'prev', ['V1', 'A1']);
    expect(on(q, 'V1').map(span)).toEqual([[0, 30], [30, 80]]);
    expect(on(q, 'A1').map(span)).toEqual([[0, 30], [30, 80]]);
    expect(on(q, 'V1')[0].sourceIn).toBeCloseTo(0.8);
    const w = rippleTrimToPlayhead(s, M, 20, 'next', ['V1', 'A1']);
    expect(on(w, 'V1').map(span)).toEqual([[0, 20], [20, 70]]);
  });
});

describe('Fix-Runde 1', () => {
  it('Roll mit verknüpftem Ton bleibt synchron, Ton wird mitgerollt', () => {
    const s = base([
      mkClip('v1', 'V1', 0, 50, { linkId: 'L1' }), mkClip('a1', 'A1', 0, 50, { linkId: 'L1' }),
      mkClip('v2', 'V1', 50, 50, { linkId: 'L2', sourceIn: 2 }), mkClip('a2', 'A1', 50, 50, { linkId: 'L2', sourceIn: 2 }),
    ]);
    const r = roll(s, M, 'v1', 'v2', 10);
    expect(on(r, 'V1').map(span)).toEqual([[0, 60], [60, 100]]);
    expect(on(r, 'A1').map(span)).toEqual([[0, 60], [60, 100]]);
    expect(projectFacts(r, M).hasJOrLCut).toBe(false);
  });
  it('Roll mit ignoreLinks auf dem Ton erzeugt J-Cut auf einer einzigen Tonspur', () => {
    const s = base([
      mkClip('v1', 'V1', 0, 100, { linkId: 'L1' }), mkClip('a1', 'A1', 0, 100, { linkId: 'L1' }),
      mkClip('v2', 'V1', 100, 100, { linkId: 'L2', sourceIn: 2 }), mkClip('a2', 'A1', 100, 100, { linkId: 'L2', sourceIn: 2 }),
    ]);
    const r = roll(s, M, 'a1', 'a2', -25, { ignoreLinks: true });
    expect(on(r, 'A1').map(span)).toEqual([[0, 75], [75, 200]]);
    expect(on(r, 'V1').map(span)).toEqual([[0, 100], [100, 200]]);
    expect(projectFacts(r, M).hasJOrLCut).toBe(true);
  });
  const tr = () => {
    const s = base([mkClip('a', 'V1', 0, 50), mkClip('b', 'V1', 50, 50, { sourceIn: 0.4 })]);
    const t = addTransition(s, M, 'a', 'b', 20);
    expect(t.seq.transitions[0].duration).toBe(20);
    return t.seq;
  };
  it('Ripple-Trimmen, das den Überhang frisst, kürzt die Überblendung', () => {
    const r = trim(tr(), M, 'b', 'in', -5, 'ripple');
    expect(r.transitions[0].duration).toBe(10);
  });
  it('Roll, der den Überhang entfernt, löscht die Überblendung', () => {
    expect(roll(tr(), M, 'a', 'b', -10).transitions).toHaveLength(0);
  });
  it('Razor mit Partner auf gesperrter Spur: Verknüpfung nur mit der linken Hälfte', () => {
    let s = base([mkClip('v', 'V1', 0, 100, { linkId: 'L' }), mkClip('a', 'A1', 0, 100, { linkId: 'L' })]);
    s = { ...s, tracks: s.tracks.map((t) => (t.id === 'A1' ? { ...t, locked: true } : t)) };
    const r = razor(s, 40, ['V1'], { idGen: counter() });
    expect(r.clips).toHaveLength(3);
    const counts = new Map<string, number>();
    for (const c of r.clips) if (c.linkId) counts.set(c.linkId, (counts.get(c.linkId) ?? 0) + 1);
    expect([...counts.values()].every((n) => n === 2)).toBe(true);
    expect(on(r, 'V1')[1].linkId).toBeNull();
    expect(on(r, 'V1')[0].linkId).toBe('L');
  });
  it('insertEdit begrenzt den Quellbereich', () => {
    const empty = base([]);
    const past = insertEdit(empty, M[0], 8, 15, 0, { video: 'V1' }, 'overwrite', { idGen: counter() });
    expect(past.clips[0].duration).toBe(50);
    expect(insertEdit(empty, M[0], 11, 15, 0, { video: 'V1' }, 'overwrite')).toBe(empty);
    expect(insertEdit(empty, M[0], 5, 3, 0, { video: 'V1' }, 'overwrite')).toBe(empty);
    const neg = insertEdit(empty, M[0], -2, 1, 0, { video: 'V1' }, 'overwrite', { idGen: counter() });
    expect([neg.clips[0].sourceIn, neg.clips[0].duration]).toEqual([0, 25]);
    const img = mkMedia('i', { kind: 'image', durationSec: 0, fps: null, hasAudio: false });
    expect(insertEdit(empty, img, 0, 4, 0, { video: 'V1' }, 'overwrite', { idGen: counter() }).clips[0].duration).toBe(100);
  });
});

describe('moveClips', () => {
  it('überschreibt das Ziel, Partner folgen', () => {
    const s = base([mkClip('a', 'V1', 0, 50, { linkId: 'L' }), mkClip('x', 'A1', 0, 50, { linkId: 'L' }), mkClip('b', 'V1', 60, 50)]);
    const r = moveClips(s, ['a'], 40, 0, { idGen: counter() });
    expect(on(r, 'V1').map(span)).toEqual([[40, 90], [90, 110]]);
    expect(on(r, 'A1')[0].start).toBe(40);
  });
  it('Spurwechsel innerhalb der Art, mit ignoreLinks ohne Partner', () => {
    const s = base([mkClip('a', 'V1', 0, 50, { linkId: 'L' }), mkClip('x', 'A1', 0, 50, { linkId: 'L' })]);
    const r = moveClips(s, ['a'], 10, 1);
    expect(r.clips.find((c) => c.id === 'a')!.trackId).toBe('V2');
    expect(r.clips.find((c) => c.id === 'x')!.trackId).toBe('A1');
    const r2 = moveClips(s, ['a'], 10, 0, { ignoreLinks: true });
    expect(r2.clips.find((c) => c.id === 'x')!.start).toBe(0);
    expect(moveClips(s, ['a'], 0, 1 + 5)).toBe(s);
  });
});

describe('addTransition', () => {
  const s = base([mkClip('a', 'V1', 0, 50, { sourceIn: 0 }), mkClip('b', 'V1', 50, 50, { sourceIn: 5 })]);
  it('Überblendung ohne Überhang wird gekürzt', () => {
    // a: Quelle 10 s, a endet bei 2 s → Überhang 8 s; b startet bei 5 s → Überhang 5 s; knapp machen
    const m = [mkMedia('m', { durationSec: 2.2 })];
    const tight = base([mkClip('a', 'V1', 0, 50), mkClip('b', 'V1', 50, 50, { sourceIn: 0.2 })]);
    const r = addTransition(tight, m, 'a', 'b', 25);
    expect(r.shortenedTo).toBe(10);
    expect(r.seq.transitions[0]).toMatchObject({ duration: 10, kind: 'dissolve', trackId: 'V1' });
  });
  it('mit genug Überhang unverkürzt, Audio = audioFade', () => {
    const r = addTransition(s, M, 'a', 'b', 25);
    expect(r.shortenedTo).toBeUndefined();
    expect(r.seq.transitions[0].duration).toBe(25);
    const au = base([mkClip('a', 'A1', 0, 50, { sourceIn: 1 }), mkClip('b', 'A1', 50, 50, { sourceIn: 1 })]);
    expect(addTransition(au, M, 'a', 'b', 5).seq.transitions[0].kind).toBe('audioFade');
  });
  it('ohne Überhang: unverändert, shortenedTo 0; nicht benachbart: unverändert', () => {
    const none = base([mkClip('a', 'V1', 0, 50), mkClip('b', 'V1', 50, 50)]);
    const r = addTransition(none, [mkMedia('m', { durationSec: 4 })], 'a', 'b', 10);
    expect(r.seq).toBe(none);
    expect(r.shortenedTo).toBe(0);
    const gap = base([mkClip('a', 'V1', 0, 50), mkClip('b', 'V1', 60, 50)]);
    expect(addTransition(gap, M, 'a', 'b', 10).seq).toBe(gap);
  });
  it('Trimmen zerstört die Überblendung (nicht mehr benachbart)', () => {
    const t = addTransition(s, M, 'a', 'b', 10).seq;
    expect(trim(t, M, 'a', 'out', -5).transitions).toHaveLength(0);
  });
});

describe('Titel, Props, Link', () => {
  it('addTitle legt Bauchbinde an', () => {
    const r = addTitle(base([]), 25, 'V2', 'bauchbinde', { idGen: counter() });
    expect(r.clips[0]).toMatchObject({ kind: 'title', trackId: 'V2', start: 25, duration: 100 });
    expect(r.clips[0].title!.style).toBe('bauchbinde');
    expect(addTitle(base([]), 0, 'A1', 'titel').clips).toHaveLength(0);
  });
  it('setClipProps begrenzt Blenden auf Clipdauer', () => {
    const r = setClipProps(base([mkClip('a', 'A1', 0, 10)]), 'a', { gainDb: -3, fadeIn: 50 });
    expect(r.clips[0]).toMatchObject({ gainDb: -3, fadeIn: 10 });
  });
  it('toggleLink verknüpft und löst', () => {
    const s = base([mkClip('v', 'V1', 0, 10), mkClip('a', 'A1', 0, 10)]);
    const l = toggleLink(s, ['v', 'a'], { idGen: counter() });
    expect(l.clips[0].linkId).toBe(l.clips[1].linkId);
    expect(l.clips[0].linkId).not.toBeNull();
    expect(toggleLink(l, ['v', 'a']).clips.every((c) => c.linkId === null)).toBe(true);
  });
  it('Operationen verändern die Eingabe nicht und teilen Struktur', () => {
    const s = base([mkClip('a', 'V1', 0, 50), mkClip('b', 'V2', 0, 50)]);
    const r = setClipProps(s, 'a', { gainDb: 3 });
    expect(s.clips[0].gainDb).toBe(0);
    expect(r.clips.find((c) => c.id === 'b')).toBe(s.clips.find((c) => c.id === 'b'));
  });
});

describe('History', () => {
  it('push/undo/redo', () => {
    const h = new History(0);
    h.push(1);
    h.push(2);
    expect([h.present, h.canUndo, h.canRedo]).toEqual([2, true, false]);
    expect(h.undo()).toBe(1);
    expect(h.canRedo).toBe(true);
    h.push(9);
    expect(h.canRedo).toBe(false);
    expect(h.undo()).toBe(1);
    expect(h.undo()).toBe(0);
    expect(h.undo()).toBe(0);
    expect(h.redo()).toBe(1);
  });
  it('replace ersetzt den aktuellen Stand ohne neuen Schritt und verwirft Wiederholen', () => {
    const h = new History(0);
    h.push(1);
    h.push(2);
    h.undo();
    h.replace(5);
    expect([h.present, h.canRedo]).toEqual([5, false]);
    expect(h.undo()).toBe(0);
  });
  it('100 Schritte rückgängig, der 101. fällt raus', () => {
    const h = new History(0);
    for (let i = 1; i <= 101; i++) h.push(i);
    let n = 0;
    while (h.canUndo) {
      h.undo();
      n++;
    }
    expect(n).toBe(100);
    expect(h.present).toBe(1);
  });
});

describe('snap', () => {
  it('sammelt Ziele und rastet innerhalb der Schwelle ein', () => {
    const s = { ...base([mkClip('a', 'V1', 10, 40), mkClip('b', 'A1', 30, 40)]), markers: [{ frame: 90, label: 'm' }], inPoint: 5, outPoint: 95 };
    const t = snapTargets(s, 60);
    expect(t).toEqual([0, 5, 10, 30, 50, 60, 70, 90, 95]);
    expect(snap(12, t, 3)).toBe(10);
    expect(snap(20, t, 3)).toBe(20);
    expect(snap(8, t, 3)).toBe(10);
  });
});
