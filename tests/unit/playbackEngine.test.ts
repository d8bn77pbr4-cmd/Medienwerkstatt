import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newSequence } from '../../src/domain/timeline/sequence';
import type { Clip } from '../../src/domain/timeline/types';

vi.mock('../../src/features/werkstatt/glPreview', () => ({
  IDLE_MS: 1000,
  CanvasPreview: class {},
  createPreview: () => ({ colorSupported: true, blocked: false, onUnrecoverable: null, onRestored: null, draw() {}, prune() {}, dispose() {} }),
}));

const { PlaybackEngine } = await import('../../src/features/werkstatt/playback');

const FPS = 25;
let now = 0;
let rafCb: ((t: number) => void) | null = null;

/** Eine Sequenz von 10 s ohne Medien: genügt für den Zeitgeber. */
function makeEngine() {
  const seq = newSequence({ width: 1280, height: 720, fps: FPS, name: 't' }, () => 't');
  const clip: Clip = { id: 'c', trackId: 'V1', kind: 'title', start: 0, duration: 250, sourceIn: 0, linkId: null, gainDb: 0, fadeIn: 0, fadeOut: 0, color: null, title: null };
  seq.clips = [clip];
  return new PlaybackEngine({ mediaUrl: (p: string) => p } as never, () => seq, () => [], document.createElement('canvas'));
}
/** Ein Takt des Browsers (Bildschirmwiederholung) zum Zeitpunkt `t`. */
function frameAt(t: number) {
  now = t;
  const cb = rafCb;
  rafCb = null;
  cb?.(t);
}

beforeEach(() => {
  now = 0;
  rafCb = null;
  vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => ((rafCb = cb), 1));
  vi.stubGlobal('cancelAnimationFrame', () => (rafCb = null));
  vi.spyOn(performance, 'now').mockImplementation(() => now);
});
afterEach(() => vi.unstubAllGlobals());

describe('PlaybackEngine Zeitgeber', () => {
  it('K rechnet die Zeit seit dem letzten Takt mit ein (langsamer Takt verliert keine Bilder)', () => {
    const e = makeEngine();
    e.play(1);
    frameAt(100); // 2,5 Bilder
    now = 600; // 600 ms nach Start, der nächste Takt käme erst später
    e.pause();
    expect(e.frame).toBe(15); // ohne Nachrechnen stünde hier 2
  });

  it('zweites L rechnet die Zeit bis dahin mit 1× und danach mit 2×', () => {
    const e = makeEngine();
    e.play(1);
    now = 400; // 10 Bilder bei 1×, kein Takt dazwischen
    e.play(1);
    expect(e.rate).toBe(2);
    frameAt(900); // 500 ms bei 2× = 25 Bilder
    expect(e.frame).toBe(35);
  });

  it('zwei L hintereinander ergeben sofort 2×, nicht erst nach dem nächsten Takt', () => {
    const e = makeEngine();
    e.play(1);
    e.play(1);
    expect(e.rate).toBe(2);
    now = 1000;
    e.pause();
    expect(e.frame).toBe(50);
  });
});
