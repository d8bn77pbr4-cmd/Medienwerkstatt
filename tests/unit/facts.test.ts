import { describe, expect, it } from 'vitest';
import { newSequence } from '../../src/domain/timeline/sequence';
import type { Clip, MediaItem, Sequence } from '../../src/domain/timeline/types';
import { projectFacts } from '../../src/domain/timeline/facts';
import { addTransition, razor, rippleDelete } from '../../src/domain/timeline/ops';

const mkMedia = (id: string, over: Partial<MediaItem> = {}): MediaItem => ({
  kind: 'video', durationSec: 60, width: 1920, height: 1080, fps: 25, hasAudio: true, hdr: false,
  videoCodec: 'h264', audioCodec: 'aac', rotation: 0, id, name: id, path: `/${id}.mov`, proxyPath: null, shotSize: null, ...over,
});
const mkClip = (id: string, trackId: string, start: number, duration: number, over: Partial<Clip> = {}): Clip => ({
  id, trackId, kind: 'media', mediaId: 'm', start, duration, sourceIn: 1, linkId: null, gainDb: 0,
  fadeIn: 0, fadeOut: 0, color: null, title: null, ...over,
});
const base = (clips: Clip[]): Sequence => ({ ...newSequence({ width: 1920, height: 1080, fps: 25, name: 't' }, () => 's'), clips });
const media = [mkMedia('m', { shotSize: 'nah' }), mkMedia('n', { shotSize: 'totale' }), mkMedia('p30', { fps: 30 })];

describe('projectFacts', () => {
  it('Einstellungen in Sekunden, Größe aus dem Medium, Lücken zählen nicht', () => {
    const f = projectFacts(base([mkClip('a', 'V1', 0, 50), mkClip('b', 'V1', 100, 25, { mediaId: 'n' })]), media);
    expect(f.shots).toEqual([
      { start: 0, end: 2, mediaId: 'm', shotSize: 'nah' },
      { start: 4, end: 5, mediaId: 'n', shotSize: 'totale' },
    ]);
    expect(f.longestShotSec).toBe(2);
  });
  it('V2 liegt über V1; V1 wird davor und danach wieder sichtbar', () => {
    const f = projectFacts(base([mkClip('a', 'V1', 0, 100), mkClip('o', 'V2', 25, 25, { mediaId: 'n' })]), media);
    expect(f.shots.map((s) => [s.mediaId, s.start, s.end])).toEqual([['m', 0, 1], ['n', 1, 2], ['m', 2, 4]]);
  });
  it('stummgeschaltete V2 und Titel zählen nicht', () => {
    let s = base([mkClip('a', 'V1', 0, 100), mkClip('o', 'V2', 25, 25, { mediaId: 'n' }), mkClip('t', 'V2', 0, 100, { kind: 'title', mediaId: undefined, title: { style: 'bauchbinde', line1: '', line2: '', font: '', size: 1, color: '', x: 0, y: 0, fadeIn: 0, fadeOut: 0 } })]);
    s = { ...s, tracks: s.tracks.map((t) => (t.id === 'V2' ? { ...t, muted: true } : t)) };
    const f = projectFacts(s, media);
    expect(f.shots).toHaveLength(1);
    expect(f.lowerThirds).toBe(1);
    const open = projectFacts({ ...s, tracks: s.tracks.map((t) => ({ ...t, muted: false })) }, media);
    expect(open.shots.map((x) => x.mediaId)).toEqual(['m', 'n', 'm']);
  });
  it('Ausnahmen für Schwarz/Standbild: Titel über leerer V1 und Bild-Clips, zusammengefasst', () => {
    const tp = { style: 'titel' as const, line1: 'Hallo', line2: '', font: '', size: 1, color: '', x: 0, y: 0, fadeIn: 0, fadeOut: 0 };
    const img = mkMedia('img', { kind: 'image', fps: null, hasAudio: false });
    const f = projectFacts(
      base([
        mkClip('t', 'V2', 0, 50, { kind: 'title', mediaId: undefined, title: tp }),
        mkClip('a', 'V1', 50, 50),
        mkClip('i', 'V1', 100, 25, { mediaId: 'img' }),
        mkClip('j', 'V1', 125, 25, { mediaId: 'img' }),
        // Bauchbinde über Film: keine Ausnahme
        mkClip('t2', 'V2', 60, 20, { kind: 'title', mediaId: undefined, title: tp }),
      ]),
      [...media, img],
    );
    expect(f.exemptIntervals).toEqual([{ start: 0, end: 2 }, { start: 4, end: 6 }]);
    // Leere Lücke ohne Titel ist keine Ausnahme
    expect(projectFacts(base([mkClip('a', 'V1', 50, 50)]), media).exemptIntervals).toEqual([]);
  });
  it('leere Sequenz', () => {
    expect(projectFacts(base([]), media)).toMatchObject({ shots: [], longestShotSec: 0, fpsMismatch: false, hasJOrLCut: false, transitions: 0 });
  });
  it('30-fps-Clip in 25-fps-Sequenz → fpsMismatch, Bild nicht', () => {
    expect(projectFacts(base([mkClip('a', 'V1', 0, 50, { mediaId: 'p30' })]), media).fpsMismatch).toBe(true);
    const img = [mkMedia('i', { kind: 'image', fps: null, hasAudio: false })];
    expect(projectFacts(base([mkClip('a', 'V1', 0, 50, { mediaId: 'i' })]), img).fpsMismatch).toBe(false);
  });
  it('Tonschnitte ohne Blende', () => {
    const mk = (over: Partial<Clip> = {}, over2: Partial<Clip> = {}) => base([mkClip('a', 'A1', 0, 50, over), mkClip('b', 'A1', 50, 50, over2), mkClip('c', 'A2', 0, 10), mkClip('d', 'A2', 20, 10)]);
    expect(projectFacts(mk(), media).audioCutsWithoutFade).toBe(1);
    expect(projectFacts(mk({ fadeOut: 2 }), media).audioCutsWithoutFade).toBe(0);
    expect(projectFacts(mk({}, { fadeIn: 1 }), media).audioCutsWithoutFade).toBe(1);
    expect(projectFacts(mk({}, { fadeIn: 2 }), media).audioCutsWithoutFade).toBe(0);
    const t = addTransition(mk(), media, 'a', 'b', 6).seq;
    expect(projectFacts(t, media).audioCutsWithoutFade).toBe(0);
  });
  it('Überblendungen und J-Cut-Schwelle (3 Bilder)', () => {
    let s = base([mkClip('a', 'V1', 0, 50), mkClip('b', 'V1', 50, 50)]);
    s = addTransition(s, media, 'a', 'b', 10).seq;
    expect(projectFacts(s, media).transitions).toBe(1);
    const near = base([mkClip('v', 'V1', 0, 50, { linkId: 'L' }), mkClip('a', 'A1', 2, 48, { linkId: 'L' })]);
    expect(projectFacts(near, media).hasJOrLCut).toBe(false);
    const far = base([mkClip('v', 'V1', 0, 50, { linkId: 'L' }), mkClip('a', 'A1', 0, 53, { linkId: 'L' })]);
    expect(projectFacts(far, media).hasJOrLCut).toBe(true);
  });
  it('Durchschnitte (Razor ohne Änderung) erzeugen keine neue Einstellung', () => {
    let n = 0;
    const idGen = () => `r${++n}`;
    let s = base([mkClip('a', 'V1', 0, 500)]);
    for (const at of [125, 250, 375]) s = razor(s, at, ['V1'], { idGen });
    expect(s.clips).toHaveLength(4);
    const f = projectFacts(s, media);
    expect(f.shots).toEqual([{ start: 0, end: 20, mediaId: 'm', shotSize: 'nah' }]);
    expect(f.longestShotSec).toBe(20);
  });
  it('Razor mit entfernter Sekunde ergibt zwei Einstellungen', () => {
    let n = 0;
    const idGen = () => `r${++n}`;
    let s = razor(razor(base([mkClip('a', 'V1', 0, 500)]), 200, ['V1'], { idGen }), 225, ['V1'], { idGen });
    const mid = s.clips.find((c) => c.start === 200)!;
    s = rippleDelete(s, [mid.id]);
    expect(projectFacts(s, media).shots).toHaveLength(2);
  });
});
