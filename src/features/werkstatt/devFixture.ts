import { newSequence } from '../../domain/timeline/sequence';
import type { Clip, MediaItem, Sequence } from '../../domain/timeline/types';

const media = (id: string, name: string): MediaItem => ({
  kind: 'video', durationSec: 5, width: 1280, height: 720, fps: 25, hasAudio: true, hdr: false, videoCodec: 'vp9', audioCodec: 'opus',
  rotation: 0, id, name, path: `/fixtures/${name}`, proxyPath: null, shotSize: null,
});

const clip = (id: string, trackId: string, start: number, duration: number, o: Partial<Clip> = {}): Clip => ({
  id, trackId, kind: 'media', mediaId: 'm1', start, duration, sourceIn: 0, linkId: null, gainDb: 0, fadeIn: 0, fadeOut: 0, color: null, title: null, ...o,
});

/**
 * Entwicklungs-Sequenz für `/_dev/wiedergabe`: zwei Clips auf V1 mit 10-Bilder-Überblendung,
 * Bauchbinde auf V2, Ton auf A1 mit Tonblende. 6 s bei 25 Bildern/s.
 */
export function devFixture(): { seq: Sequence; media: MediaItem[] } {
  const seq: Sequence = {
    ...newSequence({ width: 1280, height: 720, fps: 25, name: 'Entwicklung' }, () => 'dev'),
    clips: [
      clip('v-a', 'V1', 0, 75, { mediaId: 'm1' }),
      clip('v-b', 'V1', 75, 75, { mediaId: 'm2', sourceIn: 1, color: { exposure: 0.3, contrast: 10, highlights: 0, shadows: 0, temperature: 15, tint: 0, saturation: 20 } }),
      clip('t-1', 'V2', 10, 50, {
        kind: 'title', mediaId: undefined,
        title: { style: 'bauchbinde', line1: 'Anna Beispiel', line2: 'Bäckerin', font: 'Helvetica Neue', size: 36, color: '#ffffff', x: 0.08, y: 0.78, fadeIn: 8, fadeOut: 8 },
      }),
      clip('a-a', 'A1', 0, 75, { mediaId: 'm1' }),
      clip('a-b', 'A1', 75, 75, { mediaId: 'm2', sourceIn: 1 }),
    ],
    transitions: [
      { id: 'tr-v', trackId: 'V1', leftClipId: 'v-a', rightClipId: 'v-b', duration: 10, kind: 'dissolve' },
      { id: 'tr-a', trackId: 'A1', leftClipId: 'a-a', rightClipId: 'a-b', duration: 10, kind: 'audioFade' },
    ],
  };
  return { seq, media: [media('m1', 'e2e-clip.webm'), media('m2', 'e2e-clip2.webm')] };
}
